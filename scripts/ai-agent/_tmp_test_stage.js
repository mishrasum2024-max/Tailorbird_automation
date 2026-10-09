const { parseClaudeReportedFiles } = require("./stage-generated-files");

// Verbatim from the real FEAT-1170 CI run log.
const realClaudeReport = `
All 4 approved test cases pass against the live application. Here's the final report.

## Files Created
- \`tests/TC35_VendorChangeOrdersFeat1170.spec.js\` — the 4 approved FEAT-1170 tests.
- \`data/vendorChangeOrdersFeat1170Data.json\` — test data (two distinct contracts + their line items, per-scenario titles/descriptions).

## Files Modified
- \`pages/vendorChangeOrderPage.js\` — added 3 new methods reused by the new tests: \`submitWithoutLineItemSelection()\`, \`assertStatusRemainsPendingAfterElapsedTime()\`, \`assertExistingLineItemNotPresent()\`. No existing method altered.
- \`locators/vendorChangeOrderLocator.js\` — added one new multi-locator, \`noLineItemAmountErrorToastStrategies()\`, for the backend's rejection toast.

No existing tests, page objects, or locators were changed beyond these additions; \`VendorListingPage\`, \`VendorContractPage\`, and the rest of \`VendorChangeOrderPage\` were reused unmodified.

## Approved Test Cases Automated
- **TC014** – Automated (\`TC545\`).

## Test Command
\`\`\`
npx playwright test tests/TC35_VendorChangeOrdersFeat1170.spec.js --reporter=list
\`\`\`

## Test Result
**Passed** — 4/4 tests, 1.7 minutes total.

## Scenarios Not Automated
None — all 4 approved test cases were automated and pass.
`;

const files = parseClaudeReportedFiles(realClaudeReport);
console.log("Parsed files:", JSON.stringify(files, null, 2));

const expected = [
  "tests/TC35_VendorChangeOrdersFeat1170.spec.js",
  "data/vendorChangeOrdersFeat1170Data.json",
  "pages/vendorChangeOrderPage.js",
  "locators/vendorChangeOrderLocator.js",
];

const sortedFiles = [...files].sort();
const sortedExpected = [...expected].sort();
const pass = JSON.stringify(sortedFiles) === JSON.stringify(sortedExpected);
console.log("");
console.log(
  pass
    ? "✅ PASS — exactly the 4 real files parsed, no false positives from inline backtick method names"
    : "❌ FAIL"
);
if (!pass) {
  console.log("Expected:", sortedExpected);
  console.log("Got:     ", sortedFiles);
  process.exit(1);
}
