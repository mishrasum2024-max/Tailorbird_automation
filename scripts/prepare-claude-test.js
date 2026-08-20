require("dotenv").config();

const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "current-ticket-context.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "claude-test-generation-prompt.md"
);

function main() {
  console.log("🤖 Preparing Claude test-generation prompt...");

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(
      "current-ticket-context.json not found. Run process-approved-ticket.js first."
    );
  }

  const ticket = JSON.parse(
    fs.readFileSync(INPUT_FILE, "utf8")
  );

  const prompt = `
# AI TEST AUTOMATION TASK

You are an AI QA Automation Engineer working inside the existing
Tailorbird Playwright automation repository.

Your job is to analyze the approved Notion ticket below and create
appropriate Playwright regression test cases using the existing
framework.

## APPROVED TICKET

Ticket ID: ${ticket.id}

Title: ${ticket.title}

Issue Type: ${ticket.issueType || "N/A"}

Priority: ${ticket.priority || "N/A"}

Status: ${ticket.status}

Notion URL:
${ticket.url}

---

## NOTION TICKET CONTENT

${ticket.pageContent}

---

# YOUR TASK

Analyze the ticket carefully.

1. Identify the actual functionality that needs to be tested.
2. Extract all acceptance criteria.
3. Identify positive, negative, edge-case and regression scenarios.
4. Determine which scenarios are suitable for UI automation.
5. Inspect the existing Playwright framework before creating tests.
6. Reuse existing page objects, helpers, fixtures, utilities and test patterns wherever possible.
7. Do NOT create duplicate tests if an existing test already covers the scenario.
8. Follow the existing naming and folder conventions.
9. Use Playwright locators and the existing framework's locator style.
10. Do not use arbitrary hardcoded waits.
11. Do not use regex locators.
12. Use proper Playwright waiting/assertion strategies.
13. Do not modify unrelated existing tests.
14. Do not change framework configuration unless absolutely required.
15. Keep the implementation maintainable and consistent with the repository.

---

# IMPORTANT

Before writing the test:

- Inspect the existing tests.
- Search for related Invoice / Retainage functionality.
- Identify existing login/session helpers.
- Identify existing test data and fixtures.
- Identify existing invoice creation utilities.
- Identify existing selectors/page objects.
- Determine whether this ticket should extend an existing spec or create a new spec.

Do not guess selectors when existing framework patterns can be reused.

---

# EXPECTED TEST COVERAGE

At minimum, evaluate these acceptance criteria from the ticket:

1. Release amount <= outstanding balance is accepted.
2. Release amount > outstanding balance is blocked.
3. Clearing invoice-level retainage % and saving results in 0%.
4. Non-zero invoice-level retainage override works.
5. Outstanding Retainage ($) column is visible and read-only.
6. Outstanding retainage equals cumulative withheld - cumulative released.
7. Outstanding retainage never becomes negative.
8. After releasing $5 from $10 outstanding, the next invoice shows $5 outstanding.
9. Retainage history remains correct across a 3+ invoice sequence.

Do not blindly automate every item if the repository does not currently provide
the required setup/data. Explain which scenarios can be automated and why.

---

# OUTPUT REQUIREMENT

Create the appropriate Playwright test file(s) in the existing repository.

Before modifying files:

- inspect the repository structure
- inspect related tests
- inspect available helpers and fixtures

After implementation:

1. Run the new/updated test.
2. Fix failures caused by the implementation.
3. Do not modify unrelated tests.
4. Report:
   - files created/modified
   - test cases created
   - test command used
   - test result
   - any scenarios that could not be automated and why
`;

  fs.writeFileSync(
    OUTPUT_FILE,
    prompt.trim(),
    "utf8"
  );

  console.log("\n✅ Claude prompt prepared.");
  console.log(`📁 Saved to: ${OUTPUT_FILE}`);
  console.log(`🎯 Ticket: ${ticket.id} | ${ticket.title}`);
}

try {
  main();
} catch (error) {
  console.error("\n❌ Failed to prepare Claude prompt.");
  console.error(error.message);
  process.exit(1);
}