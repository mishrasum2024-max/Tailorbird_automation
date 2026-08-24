const fs = require("fs");
const path = require("path");

const TICKET_FILE = path.join(
  __dirname,
  "..",
  "data",
  "current-ticket-context.json"
);

const SELECTED_TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "data",
  "selected-testcases.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "claude-test-generation-prompt.md"
);

function readJson(filePath, name) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `${name} not found: ${filePath}`
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (error) {
    throw new Error(
      `Failed to parse ${name}: ${error.message}`
    );
  }
}

function formatTestCase(testCase, index) {
  const steps = Array.isArray(testCase.steps)
    ? testCase.steps
        .map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
        .join("\n")
    : String(testCase.steps || "");

  return `
### ${index + 1}. ${testCase.id} - ${testCase.title}

**Type:** ${testCase.type || "N/A"}

**Priority:** ${testCase.priority || "N/A"}

**Preconditions:**
${testCase.preconditions || "N/A"}

**Steps:**
${steps || "N/A"}

**Expected Result:**
${testCase.expectedResult || "N/A"}
`.trim();
}

function main() {
  console.log("🤖 Preparing Claude test-generation prompt...");

  // --------------------------------------------------
  // Read ticket context
  // --------------------------------------------------

  const ticket = readJson(
    TICKET_FILE,
    "current-ticket-context.json"
  );

  // --------------------------------------------------
  // Read ONLY Slack-approved test cases
  // --------------------------------------------------

  const selectedData = readJson(
    SELECTED_TESTCASES_FILE,
    "selected-testcases.json"
  );

  const selectedTestCases =
    Array.isArray(selectedData.selectedTestCases)
      ? selectedData.selectedTestCases
      : [];

  if (!selectedTestCases.length) {
    throw new Error(
      "No selected test cases were found in selected-testcases.json."
    );
  }

  console.log("");
  console.log("======================================");
  console.log("SLACK-APPROVED TEST CASES");
  console.log("======================================");
  console.log(`Ticket: ${ticket.id}`);
  console.log(
    `Selected test cases: ${selectedTestCases.length}`
  );

  selectedTestCases.forEach(testCase => {
    console.log(
      `- ${testCase.id} | ${testCase.title}`
    );
  });

  console.log("======================================");

  // --------------------------------------------------
  // Build selected test-case documentation
  // --------------------------------------------------

  const selectedTestCaseText =
    selectedTestCases
      .map(formatTestCase)
      .join("\n\n---\n\n");

  // --------------------------------------------------
  // Claude prompt
  // --------------------------------------------------

  const prompt = `
# AI PLAYWRIGHT TEST AUTOMATION TASK

You are an AI QA Automation Engineer working inside the existing
Tailorbird Playwright automation repository.

Your task is to automate ONLY the test cases that were explicitly
selected and approved by a human through Slack.

You must not create, select, invent, or automate any additional
test cases beyond the approved list below.

---

# APPROVED TICKET

Ticket ID:
${ticket.id}

Title:
${ticket.title}

Issue Type:
${ticket.issueType || "N/A"}

Priority:
${ticket.priority || "N/A"}

Status:
${ticket.status || "N/A"}

Notion URL:
${ticket.url || "N/A"}

---

# NOTION TICKET CONTENT

${ticket.pageContent || "No additional ticket content available."}

---

# HUMAN-APPROVED TEST CASES

The following test cases were selected by a human from Slack.

These are the ONLY test cases you are authorized to automate.

${selectedTestCaseText}

---

# STRICT SCOPE RULE

IMPORTANT:

You MUST automate ONLY the test cases listed under
"HUMAN-APPROVED TEST CASES".

DO NOT:

- Create additional test cases.
- Add extra scenarios.
- Add unrelated regression coverage.
- Expand the scope based on your own assumptions.
- Automate test cases that were not selected in Slack.
- Replace an approved test case with a different scenario.
- Modify unrelated existing tests.
- Create generic tests outside the approved list.

If you discover that an approved test case cannot currently be automated,
do not silently replace it with another test case.

Instead, report why that specific approved test case could not be automated.

---

# BEFORE WRITING TESTS

Inspect the existing repository carefully.

You MUST:

1. Inspect the existing tests.
2. Search for related functionality.
3. Search for existing Invoice / Retainage tests.
4. Identify existing login/session helpers.
5. Identify existing fixtures.
6. Identify existing test data.
7. Identify existing invoice creation utilities.
8. Identify existing selectors and page objects.
9. Identify existing helper functions.
10. Determine whether an approved scenario should extend an existing spec
   or use a new spec.
11. Reuse existing framework patterns wherever possible.
12. Avoid creating duplicate coverage.

Do not guess selectors when existing selectors or framework patterns
are available.

---

# AUTOMATION RULES

Follow these rules strictly:

- Use Playwright.
- Follow the repository's existing coding style.
- Reuse existing page objects, fixtures and helpers.
- Use stable Playwright locators.
- Do not use arbitrary hardcoded waits.
- Do not use regex locators.
- Use proper Playwright assertions.
- Do not modify unrelated files.
- Do not change framework configuration unless absolutely necessary.
- Keep tests maintainable.
- Follow existing test naming conventions.
- Follow existing folder structure.
- Use existing authentication/session mechanisms.
- Use existing test data where possible.

---

# APPROVED TEST CASE IMPLEMENTATION

For EACH approved test case:

1. Locate the relevant functionality in the existing repository.
2. Determine the correct existing setup and test pattern.
3. Implement the scenario as a Playwright test.
4. Keep the implementation directly aligned with the approved test case.
5. Do not add extra scenarios.
6. Preserve the intent and expected result of the approved test case.

The test case ID should be traceable from the generated test.

For example:

TC001
TC004
TC007

should remain clearly identifiable in the test title or test metadata
according to the repository's existing conventions.

---

# TEST EXECUTION

After implementing the approved test cases:

1. Run the newly created or modified tests.
2. Investigate failures.
3. Fix failures caused by your implementation.
4. Re-run the relevant tests.
5. Do not modify unrelated tests just to make the workflow pass.

If a test cannot be executed because required application data,
environment setup, or functionality is unavailable, report that clearly.

---

# IMPORTANT SAFETY RULE

Do not modify unrelated existing tests.

Do not perform broad refactoring.

Do not change configuration unless absolutely required.

Do not create tests outside the approved Slack selection.

---

# FINAL REPORT

At the end of your work, report:

## Files Created

List every newly created file.

## Files Modified

List every existing file that was modified.

## Approved Test Cases Automated

List each approved test case ID and its implementation status.

Example:

- TC001 - Automated
- TC004 - Automated
- TC007 - Could not automate - reason

## Test Command

Provide the exact command used to execute the tests.

## Test Result

Provide:

- Passed
- Failed
- Blocked

and the relevant details.

## Scenarios Not Automated

If any approved test case could not be automated, explain exactly why.

Remember:

ONLY the human-approved test cases may be automated.
Do not expand the scope.
`.trim();

  // --------------------------------------------------
  // Write Claude prompt
  // --------------------------------------------------

  fs.writeFileSync(
    OUTPUT_FILE,
    prompt,
    "utf8"
  );

  console.log("");
  console.log("======================================");
  console.log("CLAUDE PROMPT READY");
  console.log("======================================");
  console.log(
    `📁 Saved to: ${OUTPUT_FILE}`
  );
  console.log(
    `🎯 Ticket: ${ticket.id} | ${ticket.title}`
  );
  console.log(
    `✅ Approved test cases: ${selectedTestCases.length}`
  );
  console.log("======================================");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "❌ Failed to prepare Claude prompt."
  );
  console.error(error.message);
  process.exit(1);
}