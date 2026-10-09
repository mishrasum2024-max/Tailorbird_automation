const fs = require("fs");
const path = require("path");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * VERIFY BUG TEST CASES (Phase 2)
 * ============================================================
 *
 * Deterministic gate after Claude's drafting/investigation steps,
 * the bug-agent counterpart of normalize-investigated-testcases.js
 * + the feature workflow's inline "Verify JSON structure" step.
 *
 *   1. Parses runtime/bug-testcases.json.
 *   2. Validates it against the skill's contract (§7):
 *      - bugId matches the approved bug
 *      - 1–8 cases (warns below 3), unique <BUG-ID>-TCnn IDs
 *      - only the three allowed types, all required fields
 *      - targetSpec is an existing tests/*.spec.js file
 *      - liveStatus is an allowed value
 *      - no case both kept and dropped
 *   3. Re-sorts cases by type order (LLM ordering is not trusted).
 *   4. Renders runtime/bug-testcases.md from the JSON, so the
 *      Markdown can never drift from what is automated.
 *
 * Env:
 *   BUG_ID                 approved bug (e.g. BUG-1458)
 *   BUG_LIVE_UNVERIFIED    "true" when live investigation failed and
 *                          the pre-investigation draft is used; forces
 *                          liveStatus = "unverified"
 *   BUG_AGENT_MODE         "single" = the bug itself is the only case:
 *                          exactly one "Bug Reproduction" case
 *                          (ai-bug-replicate-and-automate skill)
 *
 * Exits 1 with every problem listed if the contract is broken.
 * ============================================================
 */

const BUG_ID = String(process.env.BUG_ID || "").toUpperCase();
const LIVE_UNVERIFIED = process.env.BUG_LIVE_UNVERIFIED === "true";
const SINGLE_MODE = process.env.BUG_AGENT_MODE === "single";

const TYPE_ORDER = ["Bug Reproduction", "Variant", "Neighbouring Flow"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const LIVE_STATUSES = ["fixed", "still_reproduces", "not_reproducible", "unverified"];
const MAX_CASES = 8;
const MIN_RECOMMENDED_CASES = 3;

const LIVE_STATUS_LABELS = {
  fixed: "✅ Fixed — correct behavior observed on the live app",
  still_reproduces: "⚠️ Still reproduces — the bug is still present on the live app",
  not_reproducible: "❔ Not reproducible — the path/state could not be reached",
  unverified: "⏸️ Unverified — live check did not complete",
};

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String).filter((item) => item.trim());
  if (typeof value === "string" && value.trim()) return [value];

  return [];
}

function validate(data, dropped) {
  const problems = [];
  const warnings = [];

  if (!BUG_ID) problems.push("BUG_ID env var is missing.");
  if (String(data.bugId || "").toUpperCase() !== BUG_ID) {
    problems.push(`bugId "${data.bugId}" does not match approved bug "${BUG_ID}".`);
  }

  if (!String(data.rootCauseHypothesis || "").trim()) {
    problems.push("rootCauseHypothesis is empty.");
  }

  const targetSpec = String(data.targetSpec || "").replace(/\\/g, "/").replace(/^\.\//, "");

  if (!/^tests\/[^/]+\.spec\.js$/.test(targetSpec)) {
    problems.push(`targetSpec "${data.targetSpec}" must be a tests/<file>.spec.js path.`);
  } else if (!fs.existsSync(path.join(paths.AUTOMATION_ROOT, targetSpec))) {
    problems.push(`targetSpec "${targetSpec}" does not exist (bug tests are appended to an existing spec).`);
  }

  if (!String(data.targetSpecReason || "").trim()) {
    problems.push("targetSpecReason is empty.");
  }

  if (!LIVE_STATUSES.includes(data.liveStatus)) {
    problems.push(`liveStatus "${data.liveStatus}" must be one of: ${LIVE_STATUSES.join(", ")}.`);
  }

  const testCases = Array.isArray(data.testCases) ? data.testCases : [];

  if (!testCases.length) problems.push("No test cases.");
  if (SINGLE_MODE) {
    if (testCases.length > 1) problems.push(`${testCases.length} test cases; single mode allows exactly 1 (the bug itself).`);
    if (testCases.some((testCase) => testCase.type !== "Bug Reproduction")) {
      problems.push('Single mode allows only a "Bug Reproduction" case.');
    }
  } else {
    if (testCases.length > MAX_CASES) problems.push(`${testCases.length} test cases; the maximum is ${MAX_CASES}.`);
    if (testCases.length && testCases.length < MIN_RECOMMENDED_CASES) {
      warnings.push(`Only ${testCases.length} test case(s); ${MIN_RECOMMENDED_CASES}+ is typical.`);
    }
  }

  // Literal regex + prefix check (semgrep detect-non-literal-regexp).
  const isCaseOfBug = (id) => /^BUG-\d+-TC\d{2}$/.test(id) && id.startsWith(`${BUG_ID}-TC`);
  const seen = new Set();

  testCases.forEach((testCase, index) => {
    const label = testCase.id || `#${index + 1}`;

    if (!isCaseOfBug(testCase.id || "")) problems.push(`${label}: id must look like ${BUG_ID}-TC01.`);
    if (seen.has(testCase.id)) problems.push(`${label}: duplicate id.`);
    seen.add(testCase.id);

    if (!TYPE_ORDER.includes(testCase.type)) {
      problems.push(`${label}: type "${testCase.type}" must be one of: ${TYPE_ORDER.join(", ")}.`);
    }

    if (!PRIORITIES.includes(testCase.priority)) problems.push(`${label}: priority "${testCase.priority}" is invalid.`);
    if (!String(testCase.title || "").trim()) problems.push(`${label}: title is empty.`);
    if (!asList(testCase.steps).length) problems.push(`${label}: steps are empty.`);
    if (!String(testCase.expectedResult || "").trim()) problems.push(`${label}: expectedResult is empty.`);
    if (!String(testCase.coversRootCause || "").trim()) problems.push(`${label}: coversRootCause is empty.`);
  });

  if (!testCases.some((testCase) => testCase.type === "Bug Reproduction")) {
    problems.push('At least one "Bug Reproduction" case is required.');
  }

  const overlap = dropped.map((item) => item.id).filter((id) => seen.has(id));

  if (overlap.length) problems.push(`Cases both kept and dropped: ${overlap.join(", ")}.`);

  return { problems, warnings, targetSpec };
}

function normalize(data, targetSpec) {
  const testCases = [...data.testCases]
    .map((testCase) => ({
      ...testCase,
      preconditions: asList(testCase.preconditions),
      steps: asList(testCase.steps),
    }))
    .sort((a, b) => {
      const byType = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);

      return byType || a.id.localeCompare(b.id);
    });

  return {
    ...data,
    bugId: BUG_ID,
    targetSpec,
    alreadyCoveredBy: asList(data.alreadyCoveredBy),
    liveStatus: LIVE_UNVERIFIED ? "unverified" : data.liveStatus,
    liveEvidence: LIVE_UNVERIFIED
      ? "Live verification could not complete this run — these cases are unverified against the live app."
      : String(data.liveEvidence || ""),
    testCases,
  };
}

function renderMarkdown(data, dropped) {
  const lines = [
    `# ${data.bugId} — Regression Test Cases`,
    "",
    `**Bug:** ${data.bugTitle || ""}`,
    "",
    `**Live status:** ${LIVE_STATUS_LABELS[data.liveStatus]}`,
    data.liveEvidence ? `\n> ${data.liveEvidence}` : "",
    "",
    `**Root-cause hypothesis:** ${data.rootCauseHypothesis}`,
    "",
    `**Affected area:** ${data.affectedArea || "—"}`,
    "",
    `**Target spec (tests are appended):** \`${data.targetSpec}\` — ${data.targetSpecReason}`,
  ];

  if (data.alreadyCoveredBy.length) {
    lines.push("", "**Already covered (not duplicated):**", ...data.alreadyCoveredBy.map((item) => `- ${item}`));
  }

  for (const type of TYPE_ORDER) {
    const cases = data.testCases.filter((testCase) => testCase.type === type);

    if (!cases.length) continue;

    lines.push("", `## ${type}`);

    for (const testCase of cases) {
      lines.push(
        "",
        `### ${testCase.id} — ${testCase.title}`,
        "",
        `- Priority: ${testCase.priority}`,
        `- Covers root cause: ${testCase.coversRootCause}`
      );

      if (testCase.preconditions.length) {
        lines.push("- Preconditions:", ...testCase.preconditions.map((item) => `  - ${item}`));
      }

      lines.push("", "**Steps**", "", ...testCase.steps.map((step, index) => `${index + 1}. ${step}`));
      lines.push("", "**Expected result**", "", testCase.expectedResult);
    }
  }

  if (dropped.length) {
    lines.push("", "## Dropped after live verification", "");
    dropped.forEach((item) => lines.push(`- **${item.id}** ${item.title || ""} — ${item.reason || "no reason recorded"}`));
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  console.log("======================================");
  console.log("VERIFYING BUG TEST CASES");
  console.log("======================================");

  let data;

  try {
    data = readJson(paths.TESTCASES_JSON, null);
  } catch (error) {
    console.error(`❌ bug-testcases.json is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  if (!data) {
    console.error(`❌ ${paths.TESTCASES_JSON} was not created.`);
    process.exit(1);
  }

  let dropped = [];

  try {
    dropped = readJson(paths.DROPPED_TESTCASES, []);
    if (!Array.isArray(dropped)) dropped = [];
  } catch (error) {
    console.warn(`⚠️ Ignoring unreadable bug-dropped-testcases.json: ${error.message}`);
  }

  if (LIVE_UNVERIFIED) dropped = [];

  const { problems, warnings, targetSpec } = validate(data, dropped);

  warnings.forEach((warning) => console.warn(`⚠️ ${warning}`));

  if (problems.length) {
    console.error("❌ Bug test cases do not meet the contract:");
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }

  const normalized = normalize(data, targetSpec);

  fs.writeFileSync(paths.TESTCASES_JSON, JSON.stringify(normalized, null, 2), "utf8");
  fs.writeFileSync(paths.DROPPED_TESTCASES, JSON.stringify(dropped, null, 2), "utf8");
  fs.writeFileSync(paths.TESTCASES_MD, renderMarkdown(normalized, dropped), "utf8");

  console.log(`Bug:          ${normalized.bugId}`);
  console.log(`Live status:  ${normalized.liveStatus}`);
  console.log(`Target spec:  ${normalized.targetSpec}`);
  console.log(`Test cases:   ${normalized.testCases.length}`);
  normalized.testCases.forEach((testCase) =>
    console.log(`  ${testCase.id} [${testCase.type}] ${testCase.title}`)
  );
  console.log(`Dropped:      ${dropped.length}`);
  console.log("✅ Bug test cases are valid.");
}

main();
