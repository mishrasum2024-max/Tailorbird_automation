const fs = require("fs");
const path = require("path");
const bugConfig = require("./lib/bugConfig");
const { createNotionClient, fetchTargetBugs } = require("./lib/bugSource");
const { readBugRegressions, isBugCovered } = require("./lib/bugRegressionsMemory");

/*
 * ============================================================
 * GET NOTION BUGS (Phase 1)
 * ============================================================
 *
 * Bug-agent counterpart of scripts/ai-agent/get-notion-tickets.js.
 *
 * Pulls up to BUG_MAX_TICKETS newest bugs from the bug database
 * with Status "Complete" or "Release Ready" (any priority) whose
 * "URL" is on beta.tailorbird.com (with or without https://),
 * skipping bugs that already have a regression PR recorded
 * in ai-bug-agent/memory/bugRegressions.json.
 *
 * Writes:
 *   ai-bug-agent/runtime/notion-bug-tickets.json  (array; [] = none)
 *
 * No bugs is not an error — the workflow finishes successfully and
 * send-bug-approval.js decides whether to say so in Slack.
 * ============================================================
 */

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "runtime",
  "notion-bug-tickets.json"
);

async function main() {
  console.log("\n======================================");
  console.log("AI BUG SELECTION");
  console.log("======================================");
  console.log(
    `🔎 Looking for up to ${bugConfig.maxTickets} newest bugs with status ` +
      `"${bugConfig.targetStatuses.join('" or "')}" (any priority) on ${bugConfig.targetHost}...`
  );

  const regressions = readBugRegressions();
  const skipped = [];

  const bugs = await fetchTargetBugs(createNotionClient(), {
    limit: bugConfig.maxTickets,
    skip: (bug) => {
      if (!isBugCovered(bug.id, regressions)) return false;

      skipped.push(bug.id);
      return true;
    },
  });

  if (skipped.length) {
    console.log(`⏭️ Already covered (skipped): ${skipped.join(", ")}`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(bugs, null, 2), "utf8");

  if (!bugs.length) {
    console.log("\nNo bug found.");
    console.log(`\n📁 Saved to: ${OUTPUT_FILE}`);
    return;
  }

  console.log(`\nAVAILABLE BUGS (${bugs.length})`);
  console.log("======================================");

  bugs.forEach((bug, index) => {
    console.log(`\n[${index + 1}] ID:       ${bug.id}`);
    console.log(`    Title:    ${bug.title}`);
    console.log(`    Status:   ${bug.status}`);
    console.log(`    Priority: ${bug.priority || "N/A"}`);
    console.log(`    Tags:     ${bug.tags.join(", ") || "N/A"}`);
    console.log(`    Created:  ${bug.createdTime}`);
    console.log(`    Notion:   ${bug.notionUrl}`);
    console.log(`    App URL:  ${bug.appUrl || "N/A"}`);
  });

  console.log(`\n📁 Saved to: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("\n❌ Failed to fetch Notion bugs.");
  console.error(error.body ? JSON.stringify(error.body, null, 2) : error.message);
  process.exit(1);
});
