const fs = require("fs");
const path = require("path");
const playwrightMemory = require("../../utils/playwrightMemory");

/*
 * ============================================================
 * RECORD TEST-CASE GENERATION IN MEMORY
 * ============================================================
 *
 * Reads data/generated-testcases.json (already validated by the
 * "Verify JSON structure" step) and records each generated test
 * case in the agent's persistent memory, so later steps/runs can
 * correlate selection and execution results back to it.
 * ============================================================
 */

const GENERATED_TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "generated-testcases.json"
);

function main() {
  console.log("======================================");
  console.log("RECORDING TEST-CASE GENERATION IN MEMORY");
  console.log("======================================");

  if (!fs.existsSync(GENERATED_TESTCASES_FILE)) {
    throw new Error(
      `Generated test cases file not found: ${GENERATED_TESTCASES_FILE}`
    );
  }

  const data = JSON.parse(
    fs.readFileSync(GENERATED_TESTCASES_FILE, "utf8")
  );

  const ticketId = data.ticketId || "UNKNOWN";
  const testCases = Array.isArray(data.testCases) ? data.testCases : [];

  testCases.forEach(testCase => {
    playwrightMemory.recordTestCaseGeneration(
      ticketId,
      testCase.id,
      testCase.title,
      testCase.type
    );
  });

  console.log(`Ticket: ${ticketId}`);
  console.log(`Recorded ${testCases.length} test case(s) in memory.`);
  console.log("======================================");
}

main();
