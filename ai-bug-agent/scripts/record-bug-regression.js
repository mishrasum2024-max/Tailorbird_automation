const fs = require("fs");
const path = require("path");
const paths = require("./lib/bugPaths");
const { BUG_REGRESSIONS_FILE, readBugRegressions } = require("./lib/bugRegressionsMemory");

/*
 * ============================================================
 * RECORD BUG REGRESSION (after the PR, both modes)
 * ============================================================
 *
 * Writes this bug's entry to ai-bug-agent/memory/bugRegressions.json
 * (read by bugRegressionsMemory.js, so the fetch step skips bugs
 * that already have a regression PR). The workflow commits the file
 * onto the PR branch, so it reaches main when the PR is merged.
 *
 * Env: PR_URL (required), TEST_STATUS, BUG_AGENT_MODE
 * ============================================================
 */

function main() {
  const prUrl = process.env.PR_URL;

  if (!prUrl) {
    console.log("No PR_URL: nothing to record.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(paths.TESTCASES_JSON, "utf8"));
  const regressions = readBugRegressions();

  regressions[data.bugId] = {
    specFile: data.targetSpec,
    testIds: data.testCases.map((testCase) => testCase.id),
    prUrl,
    liveStatus: data.liveStatus,
    testStatus: process.env.TEST_STATUS || "unknown",
    mode: process.env.BUG_AGENT_MODE || "single",
    recordedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(BUG_REGRESSIONS_FILE), { recursive: true });
  fs.writeFileSync(BUG_REGRESSIONS_FILE, `${JSON.stringify(regressions, null, 2)}\n`, "utf8");

  console.log(`Recorded ${data.bugId} → ${data.targetSpec} (${prUrl}).`);
}

main();
