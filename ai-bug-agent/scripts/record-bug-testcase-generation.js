const fs = require("fs");
const playwrightMemory = require("../../utils/playwrightMemory");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * RECORD BUG TEST-CASE GENERATION IN SHARED MEMORY (Phase 2)
 * ============================================================
 *
 * Bug-agent counterpart of scripts/ai-agent/record-testcase-generation.js.
 * Records each generated case in the SHARED agent memory
 * (memory/testCases.json via utils/playwrightMemory.js) under its
 * BUG-<n> ticket ID, so both agents' later steps can correlate
 * selection/execution back to it. BUG-<n> IDs cannot collide with
 * feature ticket IDs.
 * ============================================================
 */

function main() {
  const data = JSON.parse(fs.readFileSync(paths.TESTCASES_JSON, "utf8"));
  const testCases = Array.isArray(data.testCases) ? data.testCases : [];

  testCases.forEach((testCase) => {
    playwrightMemory.recordTestCaseGeneration(
      data.bugId,
      testCase.id,
      testCase.title,
      `Bug Regression: ${testCase.type}`
    );
  });

  console.log(`Bug: ${data.bugId}`);
  console.log(`Recorded ${testCases.length} bug test case(s) in shared memory.`);
}

main();
