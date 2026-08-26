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
const MAX_REPAIR_ATTEMPTS = process.env.MAX_REPAIR_ATTEMPTS || "4";

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

  const prompt = `
# REPAIR FAILING TEST CASE(S)

The following test case(s) for ticket ${TICKET_ID} FAILED when run
against the live application:

${failedIds.map((id) => `- ${id}`).join("\n")}

--- FAILURE DETAILS (per test case) ---

${failureSections}

--- END FAILURE DETAILS ---
${passedSection}
Your job now is to FIX ONLY the failing test case(s) listed above,
using the live application to verify your fix — not by guessing
again.

1. Use the Playwright MCP browser tools to navigate to the actual
   live page/modal involved in EACH failing test case (you are
   pre-authenticated, do not attempt to log in again).
2. For each failing test case, compare the real DOM/roles/attributes
   you observe against the locators currently defined in
   locators/*.js for this feature.
3. Fix any incorrect locators, timing issues, or logic errors in the
   locators/pages/tests files — following the same strict
   locators/pages/tests separation and multi-locator rules from the
   original task.
4. Do not change the intent of any approved test case.
5. Do not touch unrelated tests or files.
6. Do NOT modify the test case(s) listed above as already passing.
7. When you believe your fix is correct, stop — you do not need to
   run the tests yourself, they will be re-run automatically after
   you finish.

This is attempt ${ATTEMPT} of ${MAX_REPAIR_ATTEMPTS}.
`.trim();

  fs.writeFileSync(OUTPUT_FILE, prompt, "utf8");

  console.log(
    `Repair prompt (attempt ${ATTEMPT}) saved to: ${OUTPUT_FILE}`
  );
  console.log(`Targeting: ${failedIds.join(", ") || "(none)"}`);
}

main();
