const fs = require("fs");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * PREPARE BUG AUTOMATION (regression-set mode, Phase 3)
 * ============================================================
 *
 * First step of ai-bug-automate.yml, after the generation run's
 * `bug-generated-testcases` artifact has been downloaded into
 * ai-bug-agent/runtime/.
 *
 *   1. Validates the selection from Slack: every ID belongs to this
 *      bug and exists in the generated set.
 *   2. Keeps the full generated set as bug-testcases.all.json and
 *      rewrites bug-testcases.json with ONLY the selected cases, so
 *      Claude, check-append-only.js and record-bug-regression.js all
 *      see exactly what is being automated.
 *   3. Writes the compat copy of the bug context to
 *      data/current-ticket-context.json so the shared
 *      build-memory-digest.js works unchanged (see bugPaths.js).
 *   4. Exposes target_spec, case_ids, grep_pattern, case_count and
 *      live_status as $GITHUB_OUTPUT values.
 *
 * Env: BUG_ID, TEST_CASE_IDS (comma-separated)
 * ============================================================
 */

const BUG_ID = String(process.env.BUG_ID || "").toUpperCase();
const SELECTED = String(process.env.TEST_CASE_IDS || "")
  .split(",")
  .map((id) => id.trim().toUpperCase())
  .filter(Boolean);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function writeOutput(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);

  lines.forEach((line) => console.log(line));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  console.log("======================================");
  console.log("PREPARING SELECTED BUG TEST CASES");
  console.log("======================================");

  if (!/^BUG-\d+$/.test(BUG_ID)) fail(`BUG_ID "${BUG_ID}" must look like BUG-1458.`);
  if (!SELECTED.length) fail("TEST_CASE_IDS is empty: nothing was selected in Slack.");

  for (const file of [paths.TESTCASES_JSON, paths.BUG_CONTEXT]) {
    if (!fs.existsSync(file)) fail(`${file} not found. Was the bug-generated-testcases artifact downloaded?`);
  }

  // A retried run already has the full set saved; never filter a filtered file.
  const source = fs.existsSync(paths.TESTCASES_ALL) ? paths.TESTCASES_ALL : paths.TESTCASES_JSON;
  const data = JSON.parse(fs.readFileSync(source, "utf8"));
  const context = JSON.parse(fs.readFileSync(paths.BUG_CONTEXT, "utf8"));

  if (String(data.bugId).toUpperCase() !== BUG_ID) fail(`Artifact is for ${data.bugId}, not ${BUG_ID}.`);

  const known = new Set(data.testCases.map((testCase) => testCase.id));
  const foreign = SELECTED.filter((id) => !id.startsWith(`${BUG_ID}-TC`));
  const missing = SELECTED.filter((id) => !known.has(id));

  if (foreign.length) fail(`Selected IDs do not belong to ${BUG_ID}: ${foreign.join(", ")}`);
  if (missing.length) fail(`Selected IDs are not in the generated set: ${missing.join(", ")}`);

  const selected = data.testCases.filter((testCase) => SELECTED.includes(testCase.id));

  fs.writeFileSync(paths.TESTCASES_ALL, JSON.stringify(data, null, 2), "utf8");
  fs.writeFileSync(
    paths.TESTCASES_JSON,
    JSON.stringify({ ...data, testCases: selected, selectedFrom: data.testCases.length }, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    paths.COMPAT_TICKET_CONTEXT,
    JSON.stringify(
      {
        id: context.id,
        title: context.title,
        status: context.status,
        issueType: "Bug",
        priority: context.priority,
        url: context.notionUrl,
        notionPageId: context.notionPageId,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Bug:         ${BUG_ID}`);
  console.log(`Target spec: ${data.targetSpec}`);
  console.log(`Live status: ${data.liveStatus}`);
  console.log(`Selected:    ${selected.length} of ${data.testCases.length}`);
  selected.forEach((testCase) => console.log(`  ${testCase.id} [${testCase.type}] ${testCase.title}`));

  const caseIds = selected.map((testCase) => testCase.id);

  writeOutput({
    target_spec: data.targetSpec,
    case_ids: caseIds.join(","),
    grep_pattern: caseIds.join("|"),
    case_count: caseIds.length,
    live_status: data.liveStatus,
  });
}

main();
