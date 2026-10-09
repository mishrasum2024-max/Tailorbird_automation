const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * PREPARE REPAIR PROMPT
 * ============================================================
 *
 * Builds a targeted repair prompt for only the test case(s) that
 * are currently failing — not the whole approved batch. This
 * avoids Claude re-touching test cases that already pass while
 * trying to fix the ones that don't.
 *
 * Env vars expected:
 *   TICKET_ID
 *   FAILED_TEST_CASES      Comma-separated IDs currently failing
 *   PASSED_TEST_CASES      Comma-separated IDs currently passing
 *                          (may be empty)
 *   ATTEMPT
 *   MAX_REPAIR_ATTEMPTS
 *
 * Reads:
 *   data/test-failure-details.json — { [id]: errorMessage },
 *   written by summarize-test-results.js
 *
 * Writes:
 *   data/claude-repair-prompt.md
 * ============================================================
 */

const TICKET_ID = process.env.TICKET_ID || "UNKNOWN";
const FAILED_TEST_CASES = process.env.FAILED_TEST_CASES || "";
const PASSED_TEST_CASES = process.env.PASSED_TEST_CASES || "";
const ATTEMPT = process.env.ATTEMPT || "1";
const MAX_REPAIR_ATTEMPTS = process.env.MAX_REPAIR_ATTEMPTS || "2";

const FAILURE_DETAILS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "test-failure-details.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "claude-repair-prompt.md"
);

const MEMORY_DIGEST_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "memory-digest.md"
);

const ATTEMPT_HISTORY_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "repair-attempt-history.json"
);

/*
 * Written by record-repair-attempt-history.js after EVERY repair
 * attempt this run (not just confirmed fixes) — so a later attempt
 * can be told exactly what an earlier attempt already tried for the
 * SAME test case and whether it actually worked, instead of starting
 * from a blank slate each time and risking a repeat of an approach
 * that already failed.
 *
 * Distinct from readMemoryDigest(): that's cross-ticket persistent
 * memory (memory/fixHistory.json); this is scratch, in-run-only
 * history that means nothing outside the current workflow run.
 */
function readAttemptHistory(failedIds) {
  if (!fs.existsSync(ATTEMPT_HISTORY_FILE)) {
    return "";
  }

  let history;

  try {
    history = JSON.parse(fs.readFileSync(ATTEMPT_HISTORY_FILE, "utf8"));
  } catch (error) {
    return "";
  }

  if (!Array.isArray(history) || !history.length) {
    return "";
  }

  const failedIdSet = new Set(failedIds);

  const relevant = history.filter((entry) => failedIdSet.has(entry.testCaseId));

  if (!relevant.length) {
    return "";
  }

  const byTestCase = {};

  relevant.forEach((entry) => {
    byTestCase[entry.testCaseId] = byTestCase[entry.testCaseId] || [];
    byTestCase[entry.testCaseId].push(entry);
  });

  const sections = Object.entries(byTestCase)
    .map(([id, entries]) => {
      const attemptLines = entries
        .map(
          (entry) =>
            `- Attempt ${entry.attempt}: tried "${entry.fixApplied}" ` +
            `(root cause: ${entry.rootCause}) — ` +
            `${entry.outcome === "fixed" ? "WORKED" : "did NOT fix it, still failing"}`
        )
        .join("\n");

      return `### ${id}\n\n${attemptLines}`;
    })
    .join("\n\n");

  return (
    "## What Was Already Tried This Run\n\n" +
    "These are the SAME test case(s), from EARLIER attempts in THIS " +
    "repair run (not a different ticket). Do not repeat an approach " +
    "already marked \"did NOT fix it\" below — it demonstrably didn't " +
    "work; try something different this time.\n\n" +
    sections +
    "\n"
  );
}

function readMemoryDigest() {
  if (!fs.existsSync(MEMORY_DIGEST_FILE)) {
    return "## Known Prior Issues (persistent AI-agent memory)\n\n(No digest was built for this run.)\n";
  }

  try {
    return fs.readFileSync(MEMORY_DIGEST_FILE, "utf8");
  } catch (error) {
    return "## Known Prior Issues (persistent AI-agent memory)\n\n(Digest unavailable this run.)\n";
  }
}

function readFailureDetails() {
  if (!fs.existsSync(FAILURE_DETAILS_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(FAILURE_DETAILS_FILE, "utf8"));
  } catch (error) {
    return {};
  }
}

function main() {
  const failedIds = FAILED_TEST_CASES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const passedIds = PASSED_TEST_CASES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const failureDetails = readFailureDetails();

  const failureSections = failedIds
    .map((id) => {
      const detail = failureDetails[id] || "(no specific error captured)";
      return `### ${id}\n\n${detail}`;
    })
    .join("\n\n---\n\n");

  const passedSection =
    passedIds.length > 0
      ? `\nThe following test case(s) are ALREADY PASSING — do NOT modify, ` +
        `touch, or "improve" their code. Any change here could cause a ` +
        `working test to break:\n\n` +
        passedIds.map((id) => `- ${id}`).join("\n") +
        "\n"
      : "";

  const attemptHistoryText = readAttemptHistory(failedIds);

  const prompt = `
# REPAIR FAILING TEST CASE(S)

The following test case(s) for ticket ${TICKET_ID} FAILED when run
against the live application:

${failedIds.map((id) => `- ${id}`).join("\n")}

--- FAILURE DETAILS (per test case) ---

${failureSections}

--- END FAILURE DETAILS ---
${passedSection}
---
${attemptHistoryText ? `\n${attemptHistoryText}---\n` : ""}
${readMemoryDigest()}
---

Your job now is to FIX ONLY the failing test case(s) listed above,
using the live application to verify your fix — not by guessing
again.

Follow \`.claude/skills/tailorbird-playwright/SKILL.md\` for this
repository's framework patterns (locators/pages/tests separation,
multi-locator rules, healing locators, existing conventions) — do
not improvise a different approach.

0. First check the "Known Prior Issues" section above. If one of its
   entries matches the failure(s) above (same/similar error, same
   component), start by applying that known-good fix and verifying
   it against the live app — don't rediscover it from scratch.
1. If a "What Was Already Tried This Run" section appears above, it
   covers the SAME test case(s) from EARLIER attempts in this exact
   repair run — not a different ticket. Do NOT repeat an approach
   already marked "did NOT fix it" there; it demonstrably didn't
   work, so try a genuinely different root cause or fix this attempt.
2. Use the Playwright MCP browser tools to navigate to the actual
   live page/modal involved in EACH failing test case (you are
   pre-authenticated, do not attempt to log in again).
3. For each failing test case, compare the real DOM/roles/attributes
   you observe against the locators currently defined in
   locators/*.js for this feature.
4. Fix any incorrect locators, timing issues, or logic errors in the
   locators/pages/tests files — following the same strict
   locators/pages/tests separation and multi-locator rules from the
   original task.
5. Do not change the intent of any approved test case.
6. Do not touch unrelated tests or files.
7. Do NOT modify the test case(s) listed above as already passing.
8. A daily data-cleanup job removes test data from this environment —
   if a failure is because a hardcoded property/job/project no longer
   exists, do not "fix" it by hardcoding a different one that merely
   happens to exist right now (it will break again the same way). Only
   these properties (and jobs/projects already belonging to them) are
   permanent and safe to hardcode: Test Property 1_Cottages on Elm,
   Test Property 2_The Westerham, Test Property3 Automation Retainage
   flow, Test Property4_Multiapprover_automation, Test
   Property5_Reassigning_Automation, Test Property 6_Draw reporting,
   Test_property7_CM_Fee_Automation. For anything else, create the
   data fresh using this repo's existing creation page-object methods.
9. When you believe your fix is correct, stop — you do not need to
   run the tests yourself, they will be re-run automatically after
   you finish.

This is attempt ${ATTEMPT} of ${MAX_REPAIR_ATTEMPTS}.

---

# REQUIRED: REPORT YOUR FIX FOR PERSISTENT MEMORY

For EACH test case you actually fixed this attempt, end your final
response with a fenced JSON block (in addition to your normal
explanation) shaped exactly like this:

\`\`\`json
{
  "fixes": [
    {
      "testCaseId": "TC004",
      "rootCause": "One sentence: what was actually wrong.",
      "fixApplied": "One sentence: what change fixed it.",
      "filesChanged": ["locators/example.js", "pages/example.js"]
    }
  ]
}
\`\`\`

This gets recorded into this project's persistent cross-run memory,
so the same root cause is recognized instantly next time instead of
being rediscovered via the live browser again. Only include test
cases you are confident you actually fixed. If you fixed nothing,
omit the block entirely.
`.trim();

  fs.writeFileSync(OUTPUT_FILE, prompt, "utf8");

  console.log(
    `Repair prompt (attempt ${ATTEMPT}) saved to: ${OUTPUT_FILE}`
  );
  console.log(`Targeting: ${failedIds.join(", ") || "(none)"}`);
}

main();
