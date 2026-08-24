const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "generated-testcases.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "selected-testcases.json"
);

const selectedInput =
  process.env.SELECTED_TEST_CASES || "";

if (!selectedInput) {
  throw new Error(
    "SELECTED_TEST_CASES environment variable is missing."
  );
}

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(
    `Generated test cases file not found: ${INPUT_FILE}`
  );
}

const selectedIds = selectedInput
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const data = JSON.parse(
  fs.readFileSync(INPUT_FILE, "utf8")
);

const testCases = Array.isArray(data.testCases)
  ? data.testCases
  : [];

const selectedTestCases = testCases.filter(testCase =>
  selectedIds.includes(testCase.id)
);

if (!selectedTestCases.length) {
  throw new Error(
    `None of the selected test cases were found.\n` +
    `Selected: ${selectedIds.join(", ")}\n` +
    `Available: ${testCases.map(tc => tc.id).join(", ")}`
  );
}

const output = {
  ticketId: data.ticketId,
  ticketTitle: data.ticketTitle,
  selectedTestCases
};

fs.writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log("======================================");
console.log("SELECTED TEST CASES");
console.log("======================================");
console.log(`Ticket: ${data.ticketId}`);
console.log(`Selected: ${selectedTestCases.length}`);

selectedTestCases.forEach(testCase => {
  console.log(
    `- ${testCase.id} | ${testCase.title}`
  );
});

console.log("======================================");
console.log(
  `Saved selected test cases to: ${OUTPUT_FILE}`
);