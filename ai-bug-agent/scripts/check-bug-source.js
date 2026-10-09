const bugConfig = require("./lib/bugConfig");
const { PROPERTIES } = require("./lib/notionBugMapper");
const { createNotionClient, fetchTargetBugs } = require("./lib/bugSource");

/*
 * ============================================================
 * CHECK BUG SOURCE (Phase 0 doctor — read-only)
 * ============================================================
 *
 * Verifies the bug agent can read its Notion source before any
 * workflow depends on it:
 *
 *   1. bug-agent config resolves (no fallback to feature vars)
 *   2. the bug data source is reachable with the Notion key
 *   3. every property in notionBugMapper.PROPERTIES still exists
 *      with the expected type (catches Notion schema renames)
 *   4. every target status is a real Status option
 *   5. lists the bugs currently matching the filter
 *
 * Exits 1 on any problem. Never writes to Notion or Slack.
 *
 * Usage: node ai-bug-agent/scripts/check-bug-source.js
 * ============================================================
 */

async function main() {
  const problems = [];

  const notion = createNotionClient();
  const dataSourceId = bugConfig.notionDataSourceId;
  const targetStatuses = bugConfig.targetStatuses;

  console.log("======================================");
  console.log("BUG AGENT — SOURCE CHECK");
  console.log("======================================");
  console.log(`Data source: ${dataSourceId}`);
  console.log(`Status:      ${targetStatuses.join(" | ")}`);
  console.log(`URL host:    ${bugConfig.targetHost}`);

  const dataSource = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  });

  console.log(
    `Database:    ${(dataSource.title || []).map((t) => t.plain_text).join("")}`
  );

  for (const [key, expected] of Object.entries(PROPERTIES)) {
    const actual = dataSource.properties[expected.name];

    if (!actual) {
      problems.push(`Property "${expected.name}" (${key}) not found.`);
    } else if (actual.type !== expected.type) {
      problems.push(
        `Property "${expected.name}" is "${actual.type}", expected "${expected.type}".`
      );
    }
  }

  const statusOptions = (
    dataSource.properties[PROPERTIES.status.name]?.status?.options || []
  ).map((option) => option.name);

  targetStatuses
    .filter((status) => !statusOptions.includes(status))
    .forEach((status) =>
      problems.push(
        `Status "${status}" is not an option. Options: ${statusOptions.join(" | ")}`
      )
    );

  const bugs = await fetchTargetBugs(notion, { limit: bugConfig.maxTickets });

  console.log(`\nMatching bugs (showing up to ${bugConfig.maxTickets}): ${bugs.length}`);

  bugs.forEach((bug) => {
    console.log(
      `  ${bug.id.padEnd(9)} ${(bug.priority || "--").padEnd(3)} ${bug.title}`
    );
  });

  if (problems.length) {
    console.error("\n❌ Problems found:");
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }

  console.log("\n✅ Bug source is ready.");
}

main().catch((error) => {
  console.error(`\n❌ ${error.code || ""} ${error.message}`);
  process.exit(1);
});
