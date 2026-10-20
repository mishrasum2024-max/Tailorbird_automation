const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  AUTOMATION_ROOT,
  AUTOMATION_SUBPATH,
  WORK_DIR,
  SPEC_PATH_PATTERN,
  BATCH_SUFFIX_PATTERN,
  readTicketId,
  splitIds,
  isSafeRelativePath,
  git,
  gh,
  writeOutputs,
  readJsonFile,
  readPlan,
} = require("./lib/ticketBatch");
const { parkFailingTests, hasTestCalls, pruneUnusedNewMethods } = require("./lib/parkTests");

/*
 * ============================================================
 * PUBLISH TICKET PR (single-PR mode)
 * ============================================================
 *
 * Called by ai-approved-ticket.yml's PR step, right after
 * stage-generated-files.js, when plan-ticket-batch.js chose
 * single-PR mode (one living branch ai/<TICKET>, one PR to main).
 *
 *   1. Failing tests of THIS batch are taken out of the commit
 *      (lib/parkTests.js). Before that, a snapshot with every
 *      attempted test is pushed to ai/<TICKET>-wip, so nothing is
 *      lost; the next batch is pointed at it. If that push fails,
 *      nothing is parked (the PR is marked for review instead).
 *   2. Allowed paths: only tests/ pages/ locators/ utils/ fixture/
 *      data/ ai-batches/ under the automation folder may be
 *      committed. Anything else is unstaged and reported.
 *   3. If no case of this batch passed, nothing is committed to the
 *      ticket branch (the wip snapshot still exists).
 *   4. Batch record, one commit, push (never forced), backup tag
 *      ai-batch/<TICKET>/<N>.
 *   5. Creates the ticket PR, or updates its title/body/draft state
 *      and comments this batch's summary with a "review only this
 *      batch" link (one commit).
 *   6. Closes this ticket's open ai/<TICKET>-batch<N> PRs as
 *      superseded (their branches are kept as backups).
 *
 * The working tree gets every attempted test back at the end, so the
 * resume bundle built after this step still holds them.
 *
 * Env: TICKET_ID, GH_REPO, GH_TOKEN, SELECTED_TEST_CASES,
 *   GENERATION_RUN_ID, TEST_STATUS, REPAIR_ATTEMPTS,
 *   PASSED_TEST_CASES, FAILED_TEST_CASES, ARCHITECTURE_STATUS,
 *   PREVIOUS_CASE_IDS, EARLIER_STATUS, EARLIER_FAILED_IDS,
 *   EARLIER_FLAKY_IDS, EARLIER_CODE_INTACT, EARLIER_CHANGED_FILES,
 *   RETRIED_FAILING_IDS, AI_FLOWS_V2, GITHUB_SERVER_URL
 * Outputs: pr_status, pr_url, parked_ids, blocked_paths, batch_commit
 * ============================================================
 */

const TICKET_ID = readTicketId();
const GH_REPO = String(process.env.GH_REPO || "").trim();
const SERVER_URL = String(process.env.GITHUB_SERVER_URL || "https://github.com").trim();
const PREFIX = `${AUTOMATION_SUBPATH}/`;
const ALLOWED_PATH_PATTERN = /^(tests|pages|locators|utils|fixture|data|ai-batches)\//;
const PARKED_FILE = path.join(WORK_DIR, "parked.json");
const BODY_FILE = path.join(WORK_DIR, "pr-body.md");
const COMMENT_FILE = path.join(WORK_DIR, "pr-comment.md");
const AGENT_REPORT_FILE = path.join(AUTOMATION_ROOT, ".ai-run", "agent-report.md");
const GENERATED_FILE = path.join(AUTOMATION_ROOT, "data", "generated-testcases.json");
const LEDGER_FILE = path.join(AUTOMATION_ROOT, "ai-batches", `${TICKET_ID}.json`);
const MAX_BODY = 60000;
const MAX_LISTED = 30;

function list(ids) {
  if (!ids.length) return "none";

  const shown = ids.slice(0, MAX_LISTED).join(", ");

  return ids.length > MAX_LISTED ? `${shown} … (+${ids.length - MAX_LISTED} more)` : shown;
}

// git runs in the automation folder (lib/ticketBatch.js), but these
// paths are repo-root relative (from `git diff --name-only`): anchor
// them to the repository root.
function top(repoPath) {
  return `:(top)${repoPath}`;
}

function stagedFiles() {
  return git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
}

// Spec path (relative to the automation folder, validated) -> absolute.
function specAbs(file) {
  if (!isSafeRelativePath(file, SPEC_PATH_PATTERN)) throw new Error(`Unexpected spec path: ${file}`);

  return path.join(AUTOMATION_ROOT, file); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- file comes from this job's own `git diff --cached` output and is checked against SPEC_PATH_PATTERN (tests/…\.spec\.js, no "..") just above.
}

function fileAtBase(baseSha, file) {
  try {
    return git(["show", `${baseSha}:${PREFIX}${file}`]);
  } catch (error) {
    return "";
  }
}

function syntaxOk(abs) {
  try {
    execFileSync(process.execPath, ["--check", abs], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (error) {
    return false;
  }
}

function existingPr(branch) {
  try {
    const found = JSON.parse(
      gh(["pr", "list", "--repo", GH_REPO, "--head", branch, "--state", "open", "--json", "url,isDraft", "--limit", "1"]) ||
        "[]"
    );

    return found[0] || null;
  } catch (error) {
    console.warn(`Could not look up the ticket PR: ${error.message}`);
    return null;
  }
}

// ------------------------------------------------------------
// 1. Park this batch's failing tests
// ------------------------------------------------------------

function parkFailing(plan, passed, failing) {
  const result = { parked: [], unsure: [], originals: new Map(), wipOk: false, leftOutFiles: [] };

  if (!failing.length) return result;

  const specs = stagedFiles()
    .filter(file => file.startsWith(PREFIX))
    .map(file => file.slice(PREFIX.length))
    .filter(file => isSafeRelativePath(file, SPEC_PATH_PATTERN) && fs.existsSync(specAbs(file)));

  const candidates = specs
    .map(file => {
      const abs = specAbs(file);
      const text = fs.readFileSync(abs, "utf8");
      const baseText = fileAtBase(plan.baseSha, file);
      const parked = parkFailingTests({ text, baseText, ticketId: TICKET_ID, failingIds: failing, passingIds: passed });

      result.unsure.push(...parked.unsure.map(item => ({ ...item, file })));
      return { file, abs, text, baseText, parked };
    })
    .filter(candidate => candidate.parked.parked.length);

  if (!candidates.length) return result;

  // Snapshot of everything attempted, before anything is removed.
  try {
    const wipMessage = `WIP ${TICKET_ID} batch ${plan.batchNumber}: every attempted test (failing ones are not in the PR)`;

    git(["commit", "-m", wipMessage]);
    try {
      // Same rule as the ticket branch: what is pushed holds only the
      // agent's files on top of the ticket's remote tip.
      const wipSha = pushableCommit(plan, "HEAD~1", "HEAD", wipMessage);

      push(["--force", "origin", `${wipSha}:refs/heads/${plan.wipBranch}`]);
      result.wipOk = true;
      console.log(`📦 Every attempted test saved on ${plan.wipBranch}.`);

      // The wip branch only holds the LATEST attempt (it is re-pushed by
      // every batch that parks something); a per-batch tag keeps this
      // batch's attempt reachable for whichever later batch re-selects it.
      const wipTag = `ai-wip/${TICKET_ID}/${plan.batchNumber}`;

      try {
        git(["tag", "-f", wipTag, wipSha]);
        push(["--force", "origin", `refs/tags/${wipTag}`]);
        result.wipRef = wipTag;
      } catch (tagError) {
        console.warn(`Could not push ${wipTag}: ${tagError.message} (only ${plan.wipBranch} has the attempt).`);
      }
    } finally {
      git(["reset", "--soft", "HEAD~1"]);
    }
  } catch (error) {
    console.warn(`⚠️ Could not save the attempt on ${plan.wipBranch} (${error.message}); failing tests stay in the PR.`);
    candidates.forEach(candidate =>
      candidate.parked.parked.forEach(item =>
        result.unsure.push({ id: item.id, file: candidate.file, reason: "wip branch could not be saved" })
      )
    );
    return result;
  }

  candidates.forEach(candidate => {
    const isNew = candidate.baseText === "";

    result.originals.set(candidate.abs, candidate.text);

    if (isNew && !hasTestCalls(candidate.parked.text)) {
      // A new spec holding only failing tests: leave the whole file out.
      git(["reset", "-q", "--", top(`${PREFIX}${candidate.file}`)]);
      result.leftOutFiles.push(candidate.abs);
    } else {
      fs.writeFileSync(candidate.abs, candidate.parked.text, "utf8");

      if (!syntaxOk(candidate.abs)) {
        fs.writeFileSync(candidate.abs, candidate.text, "utf8");
        result.originals.delete(candidate.abs);
        candidate.parked.parked.forEach(item =>
          result.unsure.push({ id: item.id, file: candidate.file, reason: "spec would not parse after removing the test" })
        );
        return;
      }

      git(["add", "--", top(`${PREFIX}${candidate.file}`)]);
    }

    candidate.parked.parked.forEach(item => result.parked.push({ id: item.id, file: candidate.file }));
  });

  return result;
}

// ------------------------------------------------------------
// What gets pushed
// ------------------------------------------------------------
//
// Locally the run sits on "latest main + ticket branch" (a merge).
// Pushing that merge onto the existing ticket branch would carry main's
// own changes — and GitHub refuses a github.token push that updates
// .github/workflows files. So once the ticket branch exists, the pushed
// commit is rebuilt on top of its remote tip with ONLY the files the
// local commit changed (full content), using a temporary index — the
// working tree and local branch are not touched. First push (no remote
// tip yet): the local commit itself, built on main exactly like the
// batch mode's branches.

// Every push goes through here (plain `git push` with the checkout's
// credentials).
function push(args) {
  return git(["push", ...args]);
}

function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]);
}

function pushableCommit(plan, fromRef, toRef, message) {
  if (!plan.remoteTip) return git(["rev-parse", toRef]);

  const root = repoRoot();
  const indexFile = path.join(WORK_DIR, "push-index");
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  const files = git(["diff", "--name-only", fromRef, toRef], { cwd: root }).split("\n").filter(Boolean);

  fs.rmSync(indexFile, { force: true });
  git(["read-tree", plan.remoteTip], { cwd: root, env });

  files.forEach(file => {
    const entry = git(["ls-tree", toRef, "--", file], { cwd: root });

    if (entry) {
      const [meta] = entry.split("\t");
      const [mode, , blob] = meta.split(" ");

      git(["update-index", "--add", "--cacheinfo", `${mode},${blob},${file}`], { cwd: root, env });
    } else {
      git(["update-index", "--force-remove", "--", file], { cwd: root, env });
    }
  });

  const tree = git(["write-tree"], { cwd: root, env });

  fs.rmSync(indexFile, { force: true });

  return git(["commit-tree", tree, "-p", plan.remoteTip, "-m", message], { cwd: root });
}

// ------------------------------------------------------------
// 1b. Page-object methods only the parked tests used
// ------------------------------------------------------------

const PAGE_PATH_PATTERN = /^pages\/[A-Za-z0-9_./-]+\.js$/;
// Absolute paths built from literals only (semgrep
// path-join-resolve-traversal: no path.join on a variable).
const CORPUS_DIRS = [
  { dir: "tests", root: path.join(AUTOMATION_ROOT, "tests") },
  { dir: "pages", root: path.join(AUTOMATION_ROOT, "pages") },
  { dir: "utils", root: path.join(AUTOMATION_ROOT, "utils") },
  { dir: "locators", root: path.join(AUTOMATION_ROOT, "locators") },
  { dir: "fixture", root: path.join(AUTOMATION_ROOT, "fixture") },
];

// Every .js file a call could live in, keyed by its automation-relative
// path. Paths come only from listing these fixed folders.
function readCorpus(skipAbs) {
  const corpus = {};

  CORPUS_DIRS.forEach(({ dir, root }) => {
    if (!fs.existsSync(root)) return;

    fs.readdirSync(root, { recursive: true })
      .map(entry => String(entry))
      .filter(entry => entry.endsWith(".js") && !entry.split(/[\\/]/).includes("node_modules"))
      .forEach(entry => {
        const abs = path.join(root, entry); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- entry comes from fs.readdirSync of a fixed folder of this checkout, never from user input.

        if (!skipAbs.has(abs)) corpus[`${dir}/${entry.replace(/\\/g, "/")}`] = fs.readFileSync(abs, "utf8");
      });
  });

  return corpus;
}

function pruneParkedHelpers(plan, parking) {
  if (!parking.parked.length || !parking.wipOk) return [];

  const pages = stagedFiles()
    .filter(file => file.startsWith(PREFIX))
    .map(file => file.slice(PREFIX.length))
    .filter(file => PAGE_PATH_PATTERN.test(file) && !file.split("/").includes(".."));

  if (!pages.length) return [];

  const files = pages.map(file => {
    const abs = path.join(AUTOMATION_ROOT, file); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- file comes from this job's own `git diff --cached` output and is checked against PAGE_PATH_PATTERN (pages/…\.js, no "..") just above.

    return { key: file, abs, text: fs.readFileSync(abs, "utf8"), baseText: fileAtBase(plan.baseSha, file) };
  });
  // Specs left out entirely still sit in the working tree; their calls
  // must not keep a helper alive. The page files are passed separately.
  const skip = new Set([...parking.leftOutFiles, ...files.map(file => file.abs)]);
  const { texts, removed } = pruneUnusedNewMethods({ files, corpus: readCorpus(skip) });
  const kept = [];

  files.forEach(file => {
    if (texts[file.key] === file.text) return;

    fs.writeFileSync(file.abs, texts[file.key], "utf8");

    if (!syntaxOk(file.abs)) {
      fs.writeFileSync(file.abs, file.text, "utf8");
      return;
    }

    if (!parking.originals.has(file.abs)) parking.originals.set(file.abs, file.text);
    git(["add", "--", top(`${PREFIX}${file.key}`)]);
    kept.push(...removed.filter(item => item.key === file.key));
  });

  if (kept.length) {
    console.log(`🧹 Left out unused helper(s) only the parked tests needed: ${kept.map(item => `${item.key}#${item.name}`).join(", ")}`);
  }

  return kept;
}

function restoreOriginals(originals) {
  originals.forEach((text, abs) => {
    try {
      fs.writeFileSync(abs, text, "utf8");
    } catch (error) {
      console.warn(`Could not restore ${abs}: ${error.message}`);
    }
  });
}

// ------------------------------------------------------------
// 2. Allowed paths
// ------------------------------------------------------------

function enforceAllowedPaths() {
  const blocked = stagedFiles().filter(
    file => !(file.startsWith(PREFIX) && ALLOWED_PATH_PATTERN.test(file.slice(PREFIX.length)))
  );

  blocked.forEach(file => git(["reset", "-q", "--", top(file)]));
  if (blocked.length) console.warn(`⛔ Not committed (outside the allowed paths): ${blocked.join(", ")}`);

  return blocked;
}

// ------------------------------------------------------------
// PR text
// ------------------------------------------------------------

function testLine(passed, failing, parkedIds) {
  const status = process.env.TEST_STATUS;
  const repairs = Number(process.env.REPAIR_ATTEMPTS || 0);

  if (status === "passed") {
    return repairs > 0
      ? `✅ Mandatory tests passed. New test case(s) passed after ${repairs} live-browser repair attempt(s).`
      : "✅ Mandatory tests + new test case(s) PASSED against the live app.";
  }

  if (status === "mandatory_failed") return "🚨 MANDATORY (regression) tests FAILED. This change may have broken existing functionality.";

  if (status === "failed") {
    return (
      `✅ ${passed.length} new case(s) passed and are in this PR. ` +
      `❌ ${failing.length} failed${repairs > 0 ? ` after ${repairs} repair attempt(s)` : ""}` +
      (parkedIds.length ? " and are NOT in this PR (kept on the wip branch)." : ".")
    );
  }

  return "⚠️ Tests were not run (skipped).";
}

function archLine() {
  switch (process.env.ARCHITECTURE_STATUS) {
    case "clean":
      return "✅ No raw locator/page usage found in spec files.";
    case "violations":
      return "🧹 Cleanup note: spec file(s) contain raw locator/page usage that should move into locators/pages. Does not block the PR.";
    default:
      return "⚠️ Architecture check did not run or was inconclusive.";
  }
}

function earlierLines() {
  const lines = [];
  const previous = splitIds(process.env.PREVIOUS_CASE_IDS);

  if (previous.length) {
    if (process.env.EARLIER_STATUS === "passed") {
      const flaky = splitIds(process.env.EARLIER_FLAKY_IDS);

      lines.push(
        `✅ Earlier batches' cases still pass: ${list(previous)}` + (flaky.length ? ` (flaky on the first try: ${list(flaky)})` : "")
      );
    } else if (process.env.EARLIER_STATUS === "failed") {
      lines.push(
        `❌ Earlier batches' cases now FAIL: ${list(splitIds(process.env.EARLIER_FAILED_IDS))} — the previous \`ai-batch/${TICKET_ID}/<N>\` tag has the working version.`
      );
    } else {
      lines.push("⚠️ Earlier batches' cases were not re-run.");
    }
  }

  if (process.env.EARLIER_CODE_INTACT === "false") {
    lines.push(`⚠️ Existing lines of earlier batches' code were changed in: ${process.env.EARLIER_CHANGED_FILES || "earlier files"}`);
  } else if (process.env.EARLIER_CODE_INTACT === "expected") {
    lines.push(
      `ℹ️ Earlier batch files changed to fix re-selected failing cases in place (${process.env.RETRIED_FAILING_IDS || ""}): ${process.env.EARLIER_CHANGED_FILES || ""}`
    );
  }

  return lines;
}

function needsReview(blocked, unsure) {
  const previous = splitIds(process.env.PREVIOUS_CASE_IDS);

  return Boolean(
    !["passed", "failed"].includes(process.env.TEST_STATUS) ||
      (previous.length && process.env.EARLIER_STATUS !== "passed") ||
      process.env.EARLIER_CODE_INTACT === "false" ||
      blocked.length ||
      unsure.length
  );
}

function batchLines({ parkedIds, unsure, blocked, wipBranch, pruned = [] }) {
  return [
    ...earlierLines(),
    parkedIds.length ? `📦 Not in this PR (failing, kept on \`${wipBranch}\` for the next batch): ${list(parkedIds)}` : null,
    unsure.length
      ? `⚠️ Failing test(s) still IN this PR (could not be taken out safely): ${unsure
          .map(item => `${item.id} (${item.reason})`)
          .join("; ")}`
      : null,
    blocked.length ? `⛔ Not committed — outside the allowed paths: ${blocked.join(", ")}` : null,
    pruned.length
      ? `🧹 Left out unused helper(s) that only the parked tests used (still in the wip attempt): ${pruned
          .map(item => `${item.key}#${item.name}`)
          .join(", ")}`
      : null,
  ].filter(Boolean);
}

// The agent report (build-agent-report.js) is built before this step and
// still lists a parked case's spec as if its test were in the PR. Mark
// those cases (JSON for Slack, markdown for the PR) as kept on the wip ref.
const AGENT_REPORT_JSON = path.join(AUTOMATION_ROOT, ".ai-run", "agent-report.json");

function annotateAgentReport(parking, plan) {
  if (!parking.parked.length) return;

  const report = readJsonFile(AGENT_REPORT_JSON, null);

  if (!report || !Array.isArray(report.cases)) return;

  const ref = parking.wipRef || (parking.wipOk ? plan.wipBranch : "the run's resume bundle");
  const parkedIds = new Set(parking.parked.map(item => item.id));

  report.cases.forEach(item => {
    if (!parkedIds.has(String(item.id).toUpperCase())) return;
    item.parkedRef = ref;
    item.specs = [];
    item.label = `${item.label} — not in the PR`;
  });

  try {
    fs.writeFileSync(AGENT_REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(AGENT_REPORT_FILE, require("./build-agent-report").toMarkdown(report), "utf8");
  } catch (error) {
    console.warn(`Could not mark parked cases in the agent report: ${error.message}`);
  }
}

function readAgentReport() {
  if (process.env.AI_FLOWS_V2 !== "true") return "";

  try {
    return fs.readFileSync(AGENT_REPORT_FILE, "utf8").trim();
  } catch (error) {
    return "";
  }
}

function historyTable() {
  const ledger = readJsonFile(LEDGER_FILE, { batches: [] }) || { batches: [] };
  const batches = (Array.isArray(ledger.batches) ? ledger.batches : []).filter(batch => Number.isInteger(batch?.number));
  const everPassed = new Set(batches.flatMap(batch => batch.passedIds || []));
  const rows = batches
    .sort((a, b) => a.number - b.number)
    .map(batch => {
      const notPassing = (batch.failedIds || []).filter(id => !everPassed.has(id));

      return `| ${batch.number} | ${list(batch.passedIds || [])} | ${list(notPassing)} |`;
    });
  const generated = ((readJsonFile(GENERATED_FILE, {}) || {}).testCases || []).map(testCase => testCase.id).filter(Boolean);
  const remaining = generated.filter(id => !everPassed.has(id));

  return [
    "### All batches",
    "",
    "| Batch | Passing (in this PR) | Not passing yet (not in this PR) |",
    "|---|---|---|",
    ...rows,
    "",
    generated.length
      ? `**Progress:** ${generated.filter(id => everPassed.has(id)).length}/${generated.length} generated cases automated and passing. Remaining: ${list(remaining)}`
      : "",
  ].join("\n");
}

function buildBody({ plan, commitUrl, lines, passed, failing, parkedIds, summary }) {
  const report = readAgentReport();
  const body = [
    `Ticket: ${TICKET_ID}`,
    "",
    `🧩 **One PR for this ticket.** Every batch adds ONE commit to \`${plan.batchBranch}\` holding only the agent's files, ` +
      "so this diff only shows the agent's own work. Only PASSING tests are committed; failing attempts are kept on " +
      `\`${plan.wipBranch}\` (not part of this PR). Each batch is tagged \`ai-batch/${TICKET_ID}/<N>\` as a backup.`,
    plan.migratedFrom
      ? `Started from \`${plan.migratedFrom}\`. The old per-batch PRs are closed as superseded; their branches are kept.`
      : null,
    "",
    `### Latest: batch ${plan.batchNumber} — [review only this batch](${commitUrl})`,
    "",
    testLine(passed, failing, parkedIds),
    archLine(),
    ...lines,
    "",
    `Selected in this batch: ${process.env.SELECTED_TEST_CASES || list(plan.selectedIds || [])}`,
    "",
    historyTable(),
    "",
    `Generation run ID: ${process.env.GENERATION_RUN_ID || ""}`,
    "",
    "<details><summary>Files in this batch's commit</summary>",
    "",
    "```",
    summary,
    "```",
    "",
    "</details>",
    report ? `\n${report}` : null,
  ]
    .filter(line => line !== null)
    .join("\n");

  return body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n\n… (truncated)` : body;
}

function buildComment({ plan, commitUrl, lines, passed, failing, parkedIds }) {
  const report = readAgentReport();
  const text = [
    `### Batch ${plan.batchNumber} — [review only this batch](${commitUrl})`,
    "",
    testLine(passed, failing, parkedIds),
    ...lines,
    report ? `\n${report}` : null,
  ]
    .filter(line => line !== null)
    .join("\n");

  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n\n… (truncated)` : text;
}

// ------------------------------------------------------------
// 6. Close superseded per-batch PRs
// ------------------------------------------------------------

function closeSupersededBatchPrs(prUrl) {
  let open = [];

  try {
    open = JSON.parse(
      gh(["pr", "list", "--repo", GH_REPO, "--state", "open", "--json", "url,headRefName", "--limit", "100"]) || "[]"
    );
  } catch (error) {
    console.warn(`Could not list open PRs: ${error.message}`);
    return;
  }

  open
    .filter(pr => {
      const match = String(pr.headRefName || "").match(BATCH_SUFFIX_PATTERN);

      return match && pr.headRefName === `ai/${TICKET_ID}-batch${match[1]}`;
    })
    .forEach(pr => {
      try {
        gh([
          "pr",
          "close",
          pr.url,
          "--comment",
          `Superseded by ${prUrl}: this ticket now has one PR that holds every batch's passing tests. ` +
            `The branch \`${pr.headRefName}\` is kept as a backup.`,
        ]);
        console.log(`Closed superseded ${pr.url}`);
      } catch (error) {
        console.warn(`Could not close ${pr.url}: ${error.message}`);
      }
    });
}

// ------------------------------------------------------------

function main() {
  const plan = readPlan();

  if (!plan || plan.mode !== "single-pr" || plan.ticketId !== TICKET_ID) {
    throw new Error("No single-PR batch plan for this ticket (.ai-batch/plan.json).");
  }

  const passed = splitIds(process.env.PASSED_TEST_CASES).map(id => id.toUpperCase());
  const failing = splitIds(process.env.FAILED_TEST_CASES)
    .map(id => id.toUpperCase())
    .filter(id => !passed.includes(id));

  const parking = parkFailing(plan, passed, failing);

  // Whatever happens next (a failed push, gh error), give the working
  // tree every attempted test back before the process ends, so the
  // resume bundle built after this step still holds them.
  process.on("exit", () => restoreOriginals(parking.originals));

  const pruned = pruneParkedHelpers(plan, parking);
  const blocked = enforceAllowedPaths();
  const parkedIds = [...new Set(parking.parked.map(item => item.id))];

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(
    PARKED_FILE,
    `${JSON.stringify(
      {
        wipBranch: parking.wipOk ? plan.wipBranch : null,
        wipRef: parking.wipRef || null,
        parked: parking.parked,
        unsure: parking.unsure,
        blockedPaths: blocked,
        prunedMethods: pruned.map(item => `${item.key}#${item.name}`),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  annotateAgentReport(parking, plan);

  const existing = existingPr(plan.batchBranch);

  if (!passed.length || !stagedFiles().length) {
    git(["reset", "-q"]);
    restoreOriginals(parking.originals);
    console.log(
      `No case of batch ${plan.batchNumber} passed — nothing committed to ${plan.batchBranch}` +
        (parking.wipOk ? ` (the attempt is on ${plan.wipBranch}).` : ".")
    );
    // Not "skipped": Slack reads that as "Claude produced no test
    // changes". Any other value gets the generic message + retry buttons.
    writeOutputs({
      pr_status: "nothing_passed",
      pr_url: existing?.url || "",
      parked_ids: parkedIds.join(","),
      blocked_paths: blocked.join(","),
      batch_commit: "",
    });
    return;
  }

  // 4. Batch record, commit, push, tag.
  try {
    execFileSync(process.execPath, [path.join(__dirname, "record-ticket-batch.js")], { cwd: AUTOMATION_ROOT, stdio: "inherit" });
  } catch (error) {
    console.warn("WARNING: batch record not written; the next batch will not know about this one.");
  }

  if (fs.existsSync(LEDGER_FILE)) {
    try {
      execFileSync("npx", ["--yes", "prettier@3.8.3", "--write", LEDGER_FILE], { cwd: AUTOMATION_ROOT, stdio: "inherit" });
    } catch (error) {
      console.warn("Prettier unavailable; keeping JSON as written.");
    }
    git(["add", "--", LEDGER_FILE]);
  }

  const summary = git(["diff", "--cached", "--stat"]);
  const message = [
    `${TICKET_ID} batch ${plan.batchNumber}: ${passed.length} passed` + (failing.length ? `, ${failing.length} not passing` : ""),
    "",
    `Passed (in this commit): ${list(passed)}`,
    failing.length ? `Not passing (not in this commit): ${list(failing)}` : null,
    parkedIds.length && parking.wipOk ? `Failing attempts kept on ${plan.wipBranch}` : null,
  ]
    .filter(line => line !== null)
    .join("\n");

  git(["commit", "-m", message]);

  // Local commit (on latest main): the resume bundle diffs against it.
  // Pushed commit (on the ticket's remote tip, agent files only): links,
  // tag and PR. The same commit when the ticket branch is new.
  const localSha = git(["rev-parse", "HEAD"]);
  const sha = pushableCommit(plan, "HEAD~1", "HEAD", message);

  push(["origin", `${sha}:refs/heads/${plan.batchBranch}`]);
  writeOutputs({ local_commit: localSha });
  const tag = `ai-batch/${TICKET_ID}/${plan.batchNumber}`;

  try {
    git(["tag", "-f", tag, sha]);
    push(["--force", "origin", `refs/tags/${tag}`]);
  } catch (error) {
    console.warn(`Could not push the backup tag ${tag}: ${error.message}`);
  }

  restoreOriginals(parking.originals);

  // 5. PR.
  const commitUrl = `${SERVER_URL}/${GH_REPO}/commit/${sha}`;
  const lines = batchLines({ parkedIds, unsure: parking.unsure, blocked, wipBranch: plan.wipBranch, pruned });
  const review = needsReview(blocked, parking.unsure);
  const prefix = review ? "[NEEDS REVIEW]" : process.env.ARCHITECTURE_STATUS === "violations" ? "[Verified - cleanup pending]" : "[Verified]";
  const title = `${prefix} AI-generated tests for ${TICKET_ID}`;

  fs.writeFileSync(BODY_FILE, buildBody({ plan, commitUrl, lines, passed, failing, parkedIds, summary }), "utf8");

  let prUrl = existing?.url || "";
  let prStatus = "updated";

  if (existing) {
    gh(["pr", "edit", prUrl, "--title", title, "--body-file", BODY_FILE]);
    try {
      gh(review ? ["pr", "ready", prUrl, "--undo"] : ["pr", "ready", prUrl]);
    } catch (error) {
      // Already in that state.
    }
    fs.writeFileSync(COMMENT_FILE, buildComment({ plan, commitUrl, lines, passed, failing, parkedIds }), "utf8");
    try {
      gh(["pr", "comment", prUrl, "--body-file", COMMENT_FILE]);
    } catch (error) {
      console.warn(`Could not comment the batch summary: ${error.message}`);
    }
  } else {
    prUrl = gh([
      "pr",
      "create",
      "--repo",
      GH_REPO,
      "--title",
      title,
      "--body-file",
      BODY_FILE,
      "--base",
      "main",
      "--head",
      plan.batchBranch,
      ...(review ? ["--draft"] : []),
    ])
      .split("\n")
      .pop();
    prStatus = "created";
  }

  console.log(`✅ ${prStatus === "created" ? "Created" : "Updated"} ${prUrl}`);
  console.log(`🔎 This batch only: ${commitUrl}`);

  // 6. Old per-batch PRs.
  if (prUrl) closeSupersededBatchPrs(prUrl);

  writeOutputs({
    pr_status: prStatus,
    pr_url: prUrl,
    parked_ids: parkedIds.join(","),
    blocked_paths: blocked.join(","),
    batch_commit: sha,
  });
}

main();
