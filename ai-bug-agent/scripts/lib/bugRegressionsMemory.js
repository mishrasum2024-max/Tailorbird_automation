const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * BUG REGRESSIONS MEMORY
 * ============================================================
 *
 * Bug-only memory: which bugs already have regression tests.
 * Lives in ai-bug-agent/memory/bugRegressions.json, separate from
 * the shared memory/ folder. Written by the automation phase
 * (record-bug-regression.js); read here so the fetch step can
 * skip bugs that are already covered.
 *
 * Shape: { "BUG-1458": { specFile, testIds, prUrl, recordedAt, ... } }
 * ============================================================
 */

const BUG_REGRESSIONS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "memory",
  "bugRegressions.json"
);

function readBugRegressions() {
  try {
    if (fs.existsSync(BUG_REGRESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(BUG_REGRESSIONS_FILE, "utf8")) || {};
    }
  } catch (error) {
    console.warn(`Could not read ${BUG_REGRESSIONS_FILE}: ${error.message}`);
  }

  return {};
}

// A bug counts as covered once a regression PR exists for it.
function isBugCovered(bugId, regressions = readBugRegressions()) {
  return Boolean(regressions[bugId]?.prUrl);
}

module.exports = {
  BUG_REGRESSIONS_FILE,
  readBugRegressions,
  isBugCovered,
};
