const fs = require("fs");
const path = require("path");
const { AUTOMATION_ROOT, splitIds, findSpecsForCases } = require("./lib/caseSpecs");

/*
 * ============================================================
 * CASE SPECS CLI (AI_FLOWS_V2)
 * ============================================================
 *
 *   node case-specs.js specs [changed spec paths...]
 *     Prints (space-separated) the changed specs PLUS every spec
 *     that already holds a test for a selected case. A re-selected
 *     case whose passing test lives in a spec this batch did not
 *     touch (e.g. an earlier batch's TC008) is then still run,
 *     instead of being reported "missing" and sent to repair.
 *
 *   node case-specs.js blocked
 *     Prints (comma-separated) the selected cases the agent marked
 *     "blocked" / PRODUCT_BLOCKED / ENVIRONMENT_BLOCKED in
 *     .ai-run/report.json AND that have no test. The
 *     repair loop skips them: re-trying a case whose preconditions
 *     the app cannot provide only burns repair attempts. They stay
 *     failed in the results and ⛔ in the agent report.
 *
 * Env: TICKET_ID, SELECTED_TEST_CASES. Never exits non-zero; on any
 * error it prints the safe fallback (the given specs / nothing).
 * ============================================================
 */

const REPORT_FILE = path.join(AUTOMATION_ROOT, ".ai-run", "report.json");

function specs(changed) {
  const selected = splitIds(process.env.SELECTED_TEST_CASES);
  const found = findSpecsForCases(process.env.TICKET_ID, selected);
  const all = [...changed, ...Object.values(found).flat()];

  return [...new Set(all.filter(Boolean))].join(" ");
}

function blocked() {
  const selected = new Set(splitIds(process.env.SELECTED_TEST_CASES));
  let report;

  try {
    report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  } catch (error) {
    return "";
  }

  // Final "could not automate" statuses the repair loop must not retry: the
  // legacy "blocked" plus the blocker-resolution skill's PRODUCT_BLOCKED and
  // ENVIRONMENT_BLOCKED. UNKNOWN_BLOCKER, RESOLVABLE and REPAIRABLE stay in
  // the repair targets — a repair attempt is another resolution attempt.
  const skipStatuses = new Set(["blocked", "product_blocked", "environment_blocked"]);

  // UNKNOWN_BLOCKER gets ONE repair attempt (REPAIR_ATTEMPT=1). If the case is
  // still UNKNOWN_BLOCKER from attempt 2 on, the blocker most likely needs a
  // person (e.g. a missing test account): stop spending repair budget on it.
  // A case the agent moved to RESOLVABLE/REPAIRABLE keeps being repaired.
  if (Number(process.env.REPAIR_ATTEMPT || 0) >= 2) skipStatuses.add("unknown_blocker");
  const ids = (report.cases || [])
    .filter(entry => skipStatuses.has(String(entry?.status || "").toLowerCase()))
    .map(entry => String(entry.id || "").trim().toUpperCase())
    .filter(id => selected.has(id));
  const found = findSpecsForCases(process.env.TICKET_ID, ids);

  return ids.filter(id => !found[id].length).join(",");
}

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === "specs") console.log(specs(rest));
  else if (command === "blocked") console.log(blocked());
  else console.log("");
} catch (error) {
  console.error(`case-specs.js: ${error.message}`);
  console.log(command === "specs" ? rest.join(" ") : "");
}
