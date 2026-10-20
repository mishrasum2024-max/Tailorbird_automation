const fs = require("fs");
const path = require("path");
const {
  AUTOMATION_SUBPATH,
  LEDGER_SUBDIR,
  BATCH_SUFFIX_PATTERN,
  readTicketId,
  splitIds,
  git,
  gh,
  writeOutputs,
  writeWorkFile,
  readLedgerAt,
  normalizeLedger,
  readJsonFile,
  LEDGER_DIR,
} = require("./lib/ticketBatch");
const { findSpecsForCases, filesContainBareCase } = require("./lib/caseSpecs");

// AI_FLOWS_V2 (set by the workflow): tell "test exists but fails"
// apart from "never written" using the spec files themselves.
const FLOWS_V2 = process.env.AI_FLOWS_V2 === "true";

/*
 * ============================================================
 * PLAN TICKET BATCH
 * ============================================================
 *
 * Runs first in ai-approved-ticket.yml (right after `npm ci`, while
 * the working tree is still a clean checkout of main). Decides which
 * branch this run works on, so a later batch of the same ticket can
 * never overwrite an earlier batch's working code:
 *
 *   branch   ai/<TICKET>-batch<N>, N = highest batch number seen
 *            (open, merged or closed branches + main's record) + 1.
 *            Exception: a RETRY of the latest batch (its PR is open,
 *            it did not pass, and the same cases are selected) reuses
 *            that batch's branch — it never held working code.
 *   base     the highest-numbered batch branch whose PR is OPEN and
 *            that PASSED (its own cases + earlier batches + earlier
 *            code intact), else main. Merged batches are already in
 *            main; closed ones were dropped on purpose.
 *
 * Then: `git checkout -B <branch>` from main and `git merge` the base
 * branch, so the working tree has main's latest scripts AND every
 * earlier batch's code. A merge conflict stops the run (never
 * silently drops earlier code); a conflict ONLY in this ticket's
 * batch record is resolved by taking the base branch's copy.
 *
 * Also retargets open batch PRs whose base batch was merged to main.
 *
 * AI_SINGLE_PR=true (default in the workflow) replaces the branch and
 * base above with ONE living branch ai/<TICKET> (PR to main): start
 * locally on the latest main with origin/ai/<TICKET> (or, the first time,
 * the latest usable batch branch) merged in. Batch numbers keep counting
 * in the batch record; publish-ticket-pr.js pushes ONE commit with only
 * the agent's passing files on top of the ticket branch's remote tip and
 * parks failing attempts on ai/<TICKET>-wip.
 *
 * Writes .ai-batch/plan.json, batch-context.md, repair-rules.md and
 * notes-instruction.md (untracked; never staged into the PR).
 *
 * Env: TICKET_ID, SELECTED_TEST_CASES, GH_REPO, GH_TOKEN
 * Outputs: batch_number, batch_branch, pr_base, base_sha,
 *   previous_case_ids, previous_specs, protected_branches,
 *   retry_of_batch
 * Exits 1 only when earlier batches' code cannot be merged in.
 * ============================================================
 */

let TICKET_ID = "";

try {
  TICKET_ID = readTicketId();
} catch (error) {
  // Unknown ID format: skip batching; the PR step then uses its
  // legacy branch name, exactly as before batching existed.
  console.warn(`⚠️ ${error.message} Batching skipped for this run.`);
  writeOutputs({ batch_branch: "" });
  process.exit(0);
}

const SELECTED_IDS = splitIds(process.env.SELECTED_TEST_CASES);
const GH_REPO = String(process.env.GH_REPO || "").trim();
const BRANCH_PREFIX = `ai/${TICKET_ID}-batch`;

// AI_SINGLE_PR (set by the workflow; on unless the repo variable
// AI_SINGLE_PR is "false"): ONE living branch ai/<TICKET> and ONE PR
// to main per ticket. Every batch runs on the latest main and pushes
// one commit holding only this batch's passing tests (failing
// attempts are parked on ai/<TICKET>-wip by publish-ticket-pr.js), so
// the PR diff only ever shows the agent's own files. The first run of
// a ticket that still has ai/<TICKET>-batch<N> branches starts from
// the latest usable one (migration); those branches stay as backups.
const SINGLE_PR = process.env.AI_SINGLE_PR === "true";
const REF_CLEANUP = process.env.AI_REF_CLEANUP !== "false";
const TICKET_BRANCH = `ai/${TICKET_ID}`;
const WIP_BRANCH = `ai/${TICKET_ID}-wip`;
const LEDGER_FILE = path.join(LEDGER_DIR, `${TICKET_ID}.json`);
const LEDGER_REPO_PATH = `${AUTOMATION_SUBPATH}/${LEDGER_SUBDIR}/${TICKET_ID}.json`;
const BOT_NAME = "tailorbird-ai-agent[bot]";
const BOT_EMAIL = "tailorbird-ai-agent[bot]@users.noreply.github.com";

function listBatchBranches() {
  let refs = "";

  try {
    refs = git([
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/remotes/origin/ai/",
    ]);
  } catch (error) {
    return [];
  }

  return refs
    .split("\n")
    .map(ref => ref.trim().replace(/^origin\//, ""))
    .map(name => {
      const match = name.match(BATCH_SUFFIX_PATTERN);

      return match && name === `${BRANCH_PREFIX}${match[1]}`
        ? { name, number: Number(match[1]) }
        : null;
    })
    .filter(Boolean);
}

// PR for a branch; `null` when unknown (gh unavailable/failed).
function findPr(branch) {
  if (!GH_REPO) return null;

  try {
    const list = JSON.parse(
      gh([
        "pr",
        "list",
        "--repo",
        GH_REPO,
        "--head",
        branch,
        "--state",
        "all",
        "--json",
        "number,state,url,baseRefName,createdAt",
        "--limit",
        "10",
      ]) || "[]"
    );

    return (
      list.find(pr => pr.state === "OPEN") ||
      list.sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      )[0] || { state: "NONE" }
    );
  } catch (error) {
    console.warn(`Could not read PRs for ${branch}: ${error.message}`);
    return null;
  }
}

function earlierIntact(entry) {
  return entry.earlierStatus !== "failed" && entry.earlierCodeIntact !== false;
}

// Every case of the batch passed (a fully passed batch is never
// retried on its own branch).
function batchPassed(entry) {
  return Boolean(
    entry && entry.testStatus === "passed" && earlierIntact(entry)
  );
}

// Safe to build on: at least one of its cases passes and it broke
// nothing earlier. A partial batch (9/10) is carried forward with its
// passing cases; its failing ones are listed as known failures. A
// mandatory-suite failure or a run without results is never built on.
function batchUsable(entry) {
  return Boolean(
    entry &&
    ["passed", "failed"].includes(entry.testStatus) &&
    entry.passedIds.length > 0 &&
    earlierIntact(entry)
  );
}

function sameIds(a, b) {
  const left = [...new Set(a)].sort().join(",");

  return left !== "" && left === [...new Set(b)].sort().join(",");
}

// Best-effort: an open batch PR whose base batch was merged (branch
// may still exist) would otherwise stay pointed at that old branch.
function retargetMergedBases(branches) {
  const merged = new Set(
    branches.filter(b => b.pr?.state === "MERGED").map(b => b.name)
  );

  branches
    .filter(b => b.pr?.state === "OPEN" && merged.has(b.pr.baseRefName))
    .forEach(b => {
      try {
        gh(["pr", "edit", b.pr.url, "--base", "main"]);
        console.log(`Retargeted ${b.pr.url} to main (its base was merged).`);
      } catch (error) {
        console.warn(`Could not retarget ${b.pr.url}: ${error.message}`);
      }
    });
}

function mergeBase(baseName) {
  try {
    git(["merge", "--no-edit", `origin/${baseName}`]);
    return;
  } catch (error) {
    let conflicted = [];

    try {
      conflicted = git(["diff", "--name-only", "--diff-filter=U"])
        .split("\n")
        .filter(Boolean);
    } catch (diffError) {
      conflicted = [];
    }

    if (conflicted.length === 1 && conflicted[0] === LEDGER_REPO_PATH) {
      git(["checkout", "--theirs", "--", LEDGER_FILE]);
      git(["add", "--", LEDGER_FILE]);
      git(["commit", "--no-edit"]);
      console.log("Resolved a batch-record-only conflict with the base copy.");
      return;
    }

    try {
      git(["merge", "--abort"]);
    } catch (abortError) {
      // Nothing to abort.
    }

    const conflict = new Error(
      `Merging ${baseName} into the latest main conflicts in: ` +
        `${conflicted.join(", ") || "unknown files"}. Resolve it on the ` +
        "batch branch (or merge the earlier batch PR) and run again."
    );

    conflict.isMergeConflict = true;
    throw conflict;
  }
}

function remoteBranchExists(name) {
  try {
    git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${name}`]);
    return true;
  } catch (error) {
    return false;
  }
}

function localTag(tag) {
  try {
    git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
    return tag;
  } catch (error) {
    return null;
  }
}

function deleteRemoteRef(ref, why) {
  try {
    git(["push", "origin", "--delete", ref]);
    console.log(`🧹 Deleted ${ref} (${why}).`);
  } catch (error) {
    console.warn(`Could not delete ${ref}: ${error.message}`);
  }
}

// Single-PR mode housekeeping (best-effort, never fails the run; repo
// variable AI_REF_CLEANUP=false turns it off):
//   - a per-batch wip tag once every case parked under it has passed;
//   - the wip branch once no parked case is still pending and no
//     unrecorded attempt exists;
//   - the old ai/<TICKET>-batch<N> branches (PR not open) once the
//     ticket PR was MERGED: their passing code is in main by then.
// ai-batch/<TICKET>/<N> tags (one per committed batch) are kept.
function cleanupTicketRefs({ branches, priorBatches, everPassed, unrecordedAttempt }) {
  const parkedBatches = priorBatches.filter(batch => Array.isArray(batch.parked) && batch.parked.length);
  const stillPending = parkedBatches.some(batch => batch.parked.some(item => !everPassed.has(item.id)));

  parkedBatches
    .filter(batch => typeof batch.wipRef === "string" && batch.wipRef === `ai-wip/${TICKET_ID}/${batch.number}`)
    .filter(batch => batch.parked.every(item => everPassed.has(item.id)))
    .filter(batch => localTag(batch.wipRef))
    .forEach(batch => {
      deleteRemoteRef(`refs/tags/${batch.wipRef}`, "its parked cases pass now");
      try {
        git(["tag", "-d", batch.wipRef]);
      } catch (error) {
        // Local copy already gone.
      }
    });

  if (parkedBatches.length && !stillPending && !unrecordedAttempt && remoteBranchExists(WIP_BRANCH)) {
    deleteRemoteRef(`refs/heads/${WIP_BRANCH}`, "no parked case is pending");
  }

  const ticketPr = findPr(TICKET_BRANCH);

  if (ticketPr?.state === "MERGED") {
    branches
      .filter(b => b.pr && b.pr.state !== "OPEN")
      .forEach(b => deleteRemoteRef(`refs/heads/${b.name}`, `${TICKET_BRANCH} was merged`));
  }
}

// Latest attempt of each re-selected case that was parked on the wip
// branch by an earlier batch (newest batch wins).
function parkedAttemptsFor(priorBatches, selectedIds) {
  const latest = new Map();

  priorBatches.forEach(batch =>
    (Array.isArray(batch.parked) ? batch.parked : []).forEach(item => {
      if (item && selectedIds.includes(item.id) && typeof item.file === "string") {
        // Per-batch tag (the wip branch itself only keeps the latest attempt).
        const ref = typeof batch.wipRef === "string" && batch.wipRef ? batch.wipRef : `origin/${WIP_BRANCH}`;

        latest.set(item.id, { id: item.id, file: item.file, batch: batch.number, ref });
      }
    })
  );

  return [...latest.values()];
}

function unionBatches(...lists) {
  const byNumber = new Map();

  lists.flat().forEach(batch => {
    if (batch) byNumber.set(batch.number, batch);
  });

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

function existingTrackedFiles(files) {
  if (!files.length) return [];

  try {
    return git(["ls-files", "--", ...files])
      .split("\n")
      .filter(Boolean)
      .map(file => file.replace(`${AUTOMATION_SUBPATH}/`, ""));
  } catch (error) {
    return [];
  }
}

function list(values) {
  return values.length ? values.join(", ") : "none";
}

function buildContext(plan) {
  const lines = [
    `# BATCH CONTEXT — ticket ${TICKET_ID}, batch ${plan.batchNumber}`,
    "",
    "This ticket's generated test cases are automated in batches. " +
      `This run is batch ${plan.batchNumber}` +
      (plan.retryOfBatch ? " (a retry of that batch)" : "") +
      ".",
    "",
    plan.mode === "single-pr"
      ? `- Branch: \`${plan.batchBranch}\` (this ticket's single PR to main); this working tree is the latest main plus that branch.`
      : `- Branch: \`${plan.batchBranch}\`, built on \`${plan.baseRef}\`.`,
    `- Cases in this batch: ${list(plan.selectedIds)}`,
    "",
  ];

  if (!plan.priorBatches.length) {
    lines.push("No earlier batch of this ticket is in the working tree.", "");

    if (plan.unrecordedAttempt) {
      lines.push(
        `A previous run of this batch had no passing case; its code is only on tag \`${plan.unrecordedAttempt}\` ` +
          `(\`git show --stat ${plan.unrecordedAttempt}\`, \`git show ${plan.unrecordedAttempt}\`). ` +
          "Reuse what is right and verify the rest live — it FAILED.",
        ""
      );
    }

    return lines.join("\n");
  }

  lines.push(
    "## Earlier batches already in this working tree — DO NOT BREAK THEM",
    ""
  );

  plan.priorBatches.forEach(batch => {
    const notes = batch.notes || {};

    lines.push(
      `### Batch ${batch.number}`,
      "",
      `- Passing cases: ${list(batch.passedIds)}`,
      `- Failing cases (tests exist but do NOT pass): ${list(
        batch.failedIds.filter(
          id =>
            plan.knownFailingIds.includes(id) &&
            !(plan.notWrittenIds || []).includes(id)
        )
      )}`,
      ...((plan.notWrittenIds || []).length
        ? [
            `- Selected but never automated (no test exists): ${list(
              batch.failedIds.filter(id => plan.notWrittenIds.includes(id))
            )}`,
          ]
        : []),
      `- Spec files: ${list(batch.specFiles)}`,
      `- Code files: ${list(batch.codeFiles)}`,
      `- Page-object methods / locators added: ${list(batch.addedMethods || [])}`
    );

    if ((notes.quirks || []).length) {
      lines.push("- Live-UI facts it relied on:");
      notes.quirks.forEach(item => lines.push(`  - ${item}`));
    }

    if ((notes.setup || []).length) {
      lines.push("- How it set up test data:");
      notes.setup.forEach(item => lines.push(`  - ${item}`));
    }

    // Slack "Instruct & retry" instructions that batch followed — still valid
    // guidance for re-selected cases unless this batch's own instructions differ.
    if (typeof batch.userInstructions === "string" && batch.userInstructions.trim()) {
      lines.push("- User instructions it was given (Slack):");
      batch.userInstructions
        .trim()
        .slice(0, 2000)
        .split("\n")
        .forEach(line => lines.push(`  > ${line}`));
    }

    lines.push("");
  });

  lines.push(
    "## Rules for this batch",
    "",
    "1. Read the earlier batches' spec files and page objects first, and " +
      "REUSE their methods and locators for the same UI instead of " +
      "writing new ones.",
    "2. Do NOT edit, rename, reorder or delete any existing line in the " +
      "earlier batches' tests, page-object methods or locators. If you " +
      "need different behaviour, ADD a new method or locator next to them.",
    "3. Do not change the earlier batches' test cases. They are re-run " +
      "after this batch, and any failure is reported as a regression.",
    "4. Treat the notes above as hints verified on an earlier day; the " +
      "case's own preconditions win, and verify UI facts with the MCP " +
      "browser before relying on them.",
    "5. Read property/project/job names from data/*.json (see TEST DATA " +
      "below); never hardcode a name from an earlier batch.",
    ""
  );

  if (plan.retriedFailingIds.length) {
    lines.push(
      "## Retried cases — fix the EXISTING tests",
      "",
      `${list(plan.retriedFailingIds)} were automated by an earlier batch ` +
        "but still fail. Their tests are already in the working tree. Fix " +
        "those existing tests IN PLACE (do not add a second test for them). " +
        "Rule 2 is relaxed for exactly those tests' own lines and methods " +
        "used only by them; every other earlier test stays untouched.",
      ""
    );
  }

  if ((plan.retriedNotWrittenIds || []).length) {
    lines.push(
      "## Re-selected cases with NO test yet — write new tests",
      "",
      `${list(plan.retriedNotWrittenIds)} were selected in an earlier batch ` +
        "but no test for them exists in the working tree (checked in the " +
        "spec files). Write a NEW test for each (ADD it; rule 2 applies " +
        "in full). The earlier batches' notes above may say why they were " +
        "not automated; make their preconditions true first.",
      ""
    );
  }

  if (plan.unrecordedAttempt) {
    lines.push(
      "## Previous attempt of this batch (nothing passed, nothing committed)",
      "",
      `The last run with batch number ${plan.batchNumber} had no passing case, so ` +
        `its code is only on tag \`${plan.unrecordedAttempt}\`. See what it tried with ` +
        `\`git show --stat ${plan.unrecordedAttempt}\` and \`git show ${plan.unrecordedAttempt}\`; ` +
        "reuse what is right and verify the rest live — it FAILED.",
      ""
    );
  }

  if ((plan.parkedAttempts || []).length) {
    lines.push(
      "## Earlier failing attempts (parked, NOT in this working tree)",
      "",
      "Only passing tests are committed to this ticket's PR. An earlier " +
        `batch's failing attempt is kept on branch \`${plan.wipBranch}\`. ` +
        "Read it before writing the test again, reuse what is right, and " +
        "verify the rest live (the attempt FAILED — do not copy it blindly):",
      "",
      ...plan.parkedAttempts.map(
        item =>
          `- ${item.id} (batch ${item.batch}): \`git show ${item.ref || `origin/${plan.wipBranch}`}:${AUTOMATION_SUBPATH}/${item.file}\``
      ),
      ""
    );
  }

  return lines.join("\n");
}

// T6: case IDs (TC001 …) repeat across tickets, so titles carry the
// ticket-scoped ID and every run greps on it.
const TITLE_RULE = [
  "",
  "## Test title (required)",
  "",
  `Every test you add or fix must contain \`${TICKET_ID}-<CASE_ID>\` in its ` +
    `title, e.g. \`'TC512 @regression @capex ${TICKET_ID}-TC001 : …'\`. ` +
    "The workflow runs this ticket's tests with --grep on exactly that text; " +
    "a title without it counts as not implemented. (Other tickets reuse " +
    "the same TC001-style IDs.)",
  "",
].join("\n");

function buildRepairRules(plan) {
  const lines = [TITLE_RULE];

  if (plan.priorBatches.length) {
    lines.push(
      "## Earlier batches of this ticket (do not break them)",
      "",
      `Earlier batches' passing cases: ${list(plan.previousPassedIds)}`,
      `Their files: ${list(plan.previousCodeFiles)}`,
      "",
      "Do NOT edit, rename, reorder or delete any existing line in those " +
        "files' earlier tests, page-object methods or locators. Fix this " +
        "batch's failures by ADDING code; never by changing earlier code" +
        (plan.retriedFailingIds.length
          ? ` — except the existing tests of the retried cases ${list(plan.retriedFailingIds)}, which you fix in place.`
          : "."),
      ""
    );
  }

  return lines.join("\n");
}

const NOTES_INSTRUCTION = [
  TITLE_RULE,
  "## Batch notes (required, last step)",
  "",
  "Before you finish, write `.ai-batch/notes.json` so the NEXT batch of " +
    "this ticket can reuse what you learned:",
  "",
  "```json",
  "{",
  '  "quirks": ["One-sentence facts about the live UI you relied on (waits, disabled states, where a control lives)."],',
  '  "setup": ["How test data is created: steps or page-object method names."]',
  "}",
  "```",
  "",
  "At most 10 items per list, one sentence each. Never include record " +
    "IDs, record names, emails, credentials or cookies.",
  "",
].join("\n");

function main() {
  console.log("======================================");
  console.log(`PLANNING BATCH FOR ${TICKET_ID}`);
  console.log("======================================");

  try {
    git(["fetch", "--prune", "origin"]);
  } catch (error) {
    console.warn(`git fetch failed (${error.message}); using local refs.`);
  }

  // Single-PR mode: per-batch wip tags (parked failing attempts) are
  // not reachable from any branch, so fetch them explicitly.
  if (SINGLE_PR) {
    try {
      git(["fetch", "--force", "origin", `refs/tags/ai-wip/${TICKET_ID}/*:refs/tags/ai-wip/${TICKET_ID}/*`]);
    } catch (error) {
      console.warn(`Could not fetch the wip tags (${error.message}).`);
    }
  }

  const mainSha = git(["rev-parse", "HEAD"]);
  const mainLedger = readLedgerAt(mainSha, TICKET_ID);

  const branches = listBatchBranches().map(branch => {
    const ledger = readLedgerAt(`origin/${branch.name}`, TICKET_ID);
    const entry =
      ledger?.batches.find(batch => batch.number === branch.number) || null;

    return { ...branch, ledger, entry, pr: findPr(branch.name) };
  });

  branches.forEach(b => {
    const state = batchPassed(b.entry)
      ? "passed"
      : batchUsable(b.entry)
        ? `partially passed (${b.entry.passedIds.length}/${b.entry.caseIds.length})`
        : "not usable";

    console.log(`Found ${b.name}: PR ${b.pr?.state || "unknown"}, ${state}`);
  });

  retargetMergedBases(branches);

  // Single-PR mode: the ticket branch (if it exists) carries the
  // newest batch record.
  const hasTicketBranch = SINGLE_PR && remoteBranchExists(TICKET_BRANCH);
  const ticketLedger = hasTicketBranch
    ? readLedgerAt(`origin/${TICKET_BRANCH}`, TICKET_ID)
    : null;

  const highest = Math.max(
    0,
    ...branches.map(b => b.number),
    ...(mainLedger?.batches || []).map(batch => batch.number),
    ...(ticketLedger?.batches || []).map(batch => batch.number)
  );
  const latest = branches.find(b => b.number === highest) || null;
  // Single-PR mode never re-uses a batch number: a batch whose cases
  // all failed commits nothing, so its number is simply taken again.
  const retry =
    !SINGLE_PR &&
    latest &&
    latest.pr?.state === "OPEN" &&
    !batchPassed(latest.entry) &&
    sameIds(latest.entry?.caseIds || [], SELECTED_IDS)
      ? latest
      : null;
  const batchNumber = retry ? retry.number : highest + 1;
  const batchBranch = SINGLE_PR ? TICKET_BRANCH : `${BRANCH_PREFIX}${batchNumber}`;

  // Unknown PR state (gh failed) still counts as open for picking a
  // base: building on it can only keep more working code. In
  // single-PR mode this is only used to migrate a ticket that has no
  // ticket branch yet.
  const base =
    hasTicketBranch
      ? null
      : branches
          .filter(
            b =>
              b.number < batchNumber &&
              (b.pr === null || b.pr.state === "OPEN") &&
              batchUsable(b.entry)
          )
          .sort((a, b) => b.number - a.number)[0] || null;

  const skipped = SINGLE_PR
    ? []
    : branches
        .filter(
          b =>
            b.number < batchNumber &&
            b.pr?.state === "OPEN" &&
            !batchUsable(b.entry) &&
            (!base || b.number > base.number)
        )
        .map(b => b.name);

  git(["config", "user.name", BOT_NAME]);
  git(["config", "user.email", BOT_EMAIL]);

  if (SINGLE_PR) {
    // Working tree = latest main + the ticket branch (or, the first
    // time, the latest usable batch branch): same "main first, then
    // merge" as the batch mode, so scripts/framework are main's.
    // This local merge is NEVER pushed onto an existing ticket branch:
    // publish-ticket-pr.js commits only the agent's files on top of
    // the remote tip (remoteTip), so no pushed commit carries main's
    // changes — GitHub refuses github.token pushes that update
    // .github/workflows files.
    git(["checkout", "-B", batchBranch]);

    if (hasTicketBranch) mergeBase(TICKET_BRANCH);
    else if (base) mergeBase(base.name);

    console.log(
      hasTicketBranch
        ? `Continuing ${TICKET_BRANCH} (on the latest main).`
        : base
          ? `Creating ${TICKET_BRANCH} from ${base.name} (migration; batch branches are kept as backups).`
          : `Creating ${TICKET_BRANCH} from main.`
    );
  } else {
    git(["checkout", "-B", batchBranch]);

    if (base) mergeBase(base.name);
  }

  const baseSha = git(["rev-parse", "HEAD"]);
  const headLedger = normalizeLedger(
    readJsonFile(LEDGER_FILE, { batches: [] }),
    TICKET_ID
  );
  const priorBatches = unionBatches(
    mainLedger?.batches || [],
    headLedger.batches
  ).filter(batch => batch.number < batchNumber);

  const selected = new Set(SELECTED_IDS);
  const everPassed = new Set(priorBatches.flatMap(batch => batch.passedIds));
  const previousPassedIds = [...everPassed].filter(id => !selected.has(id));
  // Automated by a partially passing earlier batch but still failing:
  // their tests are in the tree. If selected again, fix them in place.
  const knownFailingIds = [
    ...new Set(priorBatches.flatMap(batch => batch.failedIds)),
  ].filter(id => !everPassed.has(id));
  let retriedFailingIds = knownFailingIds.filter(id => selected.has(id));
  const previousSpecs = existingTrackedFiles([
    ...new Set(priorBatches.flatMap(batch => batch.specFiles)),
  ]);

  // AI_FLOWS_V2: a batch record lists a case as "failed" both when its
  // test fails and when no test was ever written (a selected case
  // with no test is counted failed). Check the merged working tree:
  // ticket-scoped title anywhere, else the bare ID in this ticket's
  // own batch specs (tests written before the title rule). Only a
  // case with neither is "not written"; anything ambiguous keeps the
  // previous "fix it in place" treatment.
  let notWrittenIds = [];

  // Single-PR mode never commits a failing test, so a failing case is
  // usually "not written" here — always check the tree.
  if ((FLOWS_V2 || SINGLE_PR) && knownFailingIds.length) {
    const specsByCase = findSpecsForCases(TICKET_ID, knownFailingIds);

    notWrittenIds = knownFailingIds.filter(
      id =>
        !specsByCase[id].length && !filesContainBareCase(previousSpecs, id)
    );
    retriedFailingIds = retriedFailingIds.filter(
      id => !notWrittenIds.includes(id)
    );
  }

  const retriedNotWrittenIds = notWrittenIds.filter(id => selected.has(id));
  const previousCodeFiles = [
    ...new Set(priorBatches.flatMap(batch => batch.codeFiles)),
  ];
  const protectedBranches = branches
    .map(b => b.name)
    .filter(name => name !== batchBranch);

  const unrecordedAttempt = SINGLE_PR ? localTag(`ai-wip/${TICKET_ID}/${batchNumber}`) : null;

  if (SINGLE_PR && REF_CLEANUP) {
    cleanupTicketRefs({ branches, priorBatches, everPassed, unrecordedAttempt });
  }

  const plan = {
    ticketId: TICKET_ID,
    ...(SINGLE_PR
      ? {
          mode: "single-pr",
          wipBranch: WIP_BRANCH,
          remoteTip: hasTicketBranch ? git(["rev-parse", `origin/${TICKET_BRANCH}`]) : null,
          migratedFrom: base ? base.name : null,
          parkedAttempts: parkedAttemptsFor(priorBatches, SELECTED_IDS),
          // A batch where nothing passed commits nothing (so it is not in
          // the batch record) and its number is reused — its attempt is
          // still under this number's wip tag.
          unrecordedAttempt,
        }
      : { mode: "batches" }),
    batchNumber,
    batchBranch,
    baseRef: SINGLE_PR
      ? hasTicketBranch
        ? TICKET_BRANCH
        : base
          ? base.name
          : "main"
      : base
        ? base.name
        : "main",
    prBase: SINGLE_PR ? "main" : base ? base.name : "main",
    mainSha,
    baseSha,
    retryOfBatch: retry ? retry.number : null,
    selectedIds: SELECTED_IDS,
    priorBatches,
    previousPassedIds,
    knownFailingIds,
    retriedFailingIds,
    notWrittenIds,
    retriedNotWrittenIds,
    previousSpecs,
    previousCodeFiles,
    protectedBranches,
    skippedFailingBranches: skipped,
    dataSnapshot: headLedger.dataSnapshot || mainLedger?.dataSnapshot || null,
  };

  writeWorkFile("plan.json", `${JSON.stringify(plan, null, 2)}\n`);
  writeWorkFile("batch-context.md", buildContext(plan));
  writeWorkFile("repair-rules.md", buildRepairRules(plan));
  writeWorkFile("notes-instruction.md", NOTES_INSTRUCTION);

  console.log("");
  console.log(`Batch ${batchNumber} on ${batchBranch}, base ${plan.baseRef}`);
  console.log(`Earlier passing cases: ${list(previousPassedIds)}`);

  if (skipped.length) {
    console.log(`Not built on (open but not passing): ${skipped.join(", ")}`);
  }

  writeOutputs({
    batch_number: batchNumber,
    batch_branch: batchBranch,
    pr_base: plan.prBase,
    base_sha: baseSha,
    previous_case_ids: previousPassedIds.join(","),
    previous_specs: previousSpecs.join(" "),
    protected_branches: protectedBranches.join(","),
    retry_of_batch: plan.retryOfBatch || "",
    retried_failing_ids: retriedFailingIds.join(","),
    not_written_ids: retriedNotWrittenIds.join(","),
    ticket_mode: plan.mode,
    wip_branch: SINGLE_PR ? WIP_BRANCH : "",
  });
}

// Unexpected failure (not a merge conflict): never block the run and
// never touch an existing branch — work on a fresh, run-unique branch
// from main instead, with no earlier batches assumed.
function fallback(error) {
  const runId = String(process.env.GITHUB_RUN_ID || Date.now()).replace(
    /\D/g,
    ""
  );
  const branch = `ai/${TICKET_ID}-run${runId}`;

  console.warn(`⚠️ Batch planning failed (${error.message}).`);
  console.warn(`Falling back to a fresh branch from main: ${branch}`);

  try {
    git(["merge", "--abort"]);
  } catch (abortError) {
    // No merge in progress.
  }

  git(["checkout", "-B", branch, process.env.GITHUB_SHA || "HEAD"]);

  const baseSha = git(["rev-parse", "HEAD"]);

  writeWorkFile(
    "plan.json",
    `${JSON.stringify(
      {
        ticketId: TICKET_ID,
        batchNumber: 0,
        batchBranch: branch,
        baseRef: "main",
        prBase: "main",
        mainSha: baseSha,
        baseSha,
        retryOfBatch: null,
        selectedIds: SELECTED_IDS,
        priorBatches: [],
        previousPassedIds: [],
        knownFailingIds: [],
        retriedFailingIds: [],
        previousSpecs: [],
        previousCodeFiles: [],
        protectedBranches: [],
        skippedFailingBranches: [],
        dataSnapshot: null,
        fallback: error.message,
      },
      null,
      2
    )}\n`
  );
  writeWorkFile("batch-context.md", "");
  writeWorkFile("repair-rules.md", TITLE_RULE);
  writeWorkFile("notes-instruction.md", NOTES_INSTRUCTION);
  writeOutputs({
    batch_number: 0,
    batch_branch: branch,
    pr_base: "main",
    base_sha: baseSha,
    previous_case_ids: "",
    previous_specs: "",
    protected_branches: "",
    retry_of_batch: "",
    retried_failing_ids: "",
  });
}

function failOnConflict(error) {
  console.error(`❌ Batch planning failed: ${error.message}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ❌ Batch planning failed\n\n${error.message}\n`
    );
  }

  process.exit(1);
}

try {
  main();
} catch (error) {
  if (error.isMergeConflict) {
    failOnConflict(error);
  } else {
    try {
      fallback(error);
    } catch (fallbackError) {
      console.warn(
        `⚠️ Fallback branch failed too (${fallbackError.message}); ` +
          "continuing without batching."
      );
      writeOutputs({ batch_branch: "" });
    }
  }
}
