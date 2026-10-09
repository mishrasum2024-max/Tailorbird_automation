const fs = require("fs");
const path = require("path");
const playwrightMemory = require("../../utils/playwrightMemory");
const { extractFixesFromLog } = require("./lib/fixLogParser");

/*
 * ============================================================
 * RECORD FIX HISTORY
 * ============================================================
 *
 * Called after a repair attempt to record which test case(s)
 * transitioned from FAILING to PASSING this attempt, together with
 * the root cause / fix Claude reported for them, into the
 * persistent memory/fixHistory.json store (see
 * utils/playwrightMemory.js#recordFix). That file is committed to
 * `main` forever by scripts/ai-agent/persist-memory.js, so future
 * runs — via the memory digest built by
 * scripts/ai-agent/build-memory-digest.js — can recognize the same
 * class of failure and reuse the known-good fix instead of
 * rediscovering it via the live Playwright MCP browser again.
 *
 * A test case only counts as "fixed" here if it was in
 * FAILED_IDS_BEFORE and is now in PASSED_IDS_AFTER — i.e. this
 * specific attempt is what turned it green.
 *
 * Env vars:
 *   TICKET_ID
 *   REPAIR_LOG              Path to this attempt's `claude -p` log
 *   FAILURE_DETAILS_BEFORE  Path to a snapshot of
 *                           data/test-failure-details.json taken
 *                           BEFORE this attempt ran
 *   FAILED_IDS_BEFORE       Comma-separated IDs failing before this
 *                           attempt
 *   PASSED_IDS_AFTER        Comma-separated IDs passing after this
 *                           attempt
 *
 * Claude is asked (see prepare-repair-prompt.js) to end its repair
 * response with a fenced ```json block shaped like:
 *   { "fixes": [ { "testCaseId": "TC004", "rootCause": "...",
 *                   "fixApplied": "...", "filesChanged": [...] } ] }
 * If that block is missing or doesn't cover a fixed test case, the
 * fix is still recorded with a fallback note — a partial record
 * (at minimum: which error signature got fixed, and how often) is
 * more useful to future runs than silently losing it.
 * ============================================================
 */

const TICKET_FILE = path.join(__dirname, "..", "..", "data", "current-ticket-context.json");

const TICKET_ID = process.env.TICKET_ID || "UNKNOWN";
const REPAIR_LOG = process.env.REPAIR_LOG;
const FAILURE_DETAILS_BEFORE = process.env.FAILURE_DETAILS_BEFORE;
const FAILED_IDS_BEFORE = (process.env.FAILED_IDS_BEFORE || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const PASSED_IDS_AFTER = (process.env.PASSED_IDS_AFTER || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function readJsonSafe(file) {
  try {
    if (file && fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (error) {
    console.warn(`Could not parse ${file}: ${error.message}`);
  }
  return {};
}

function readTicketComponent() {
  const ticket = readJsonSafe(TICKET_FILE);
  return ticket.title || null;
}

function main() {
  const newlyFixed = FAILED_IDS_BEFORE.filter(id => PASSED_IDS_AFTER.includes(id));

  console.log("======================================");
  console.log("RECORDING FIX HISTORY");
  console.log("======================================");

  if (!newlyFixed.length) {
    console.log("No test case transitioned from failing to passing this attempt — nothing to record.");
    return;
  }

  const failureDetailsBefore = readJsonSafe(FAILURE_DETAILS_BEFORE);
  const reportedFixes = extractFixesFromLog(REPAIR_LOG);
  const component = readTicketComponent();

  newlyFixed.forEach(testCaseId => {
    const reported = reportedFixes.find(fix => fix.testCaseId === testCaseId) || {};

    const entry = playwrightMemory.recordFix({
      ticketId: TICKET_ID,
      testCaseId,
      component,
      errorSignature: failureDetailsBefore[testCaseId] || `${TICKET_ID}::${testCaseId}`,
      rootCause: reported.rootCause || "(Claude did not report a structured root cause for this fix)",
      fixApplied: reported.fixApplied || "(see the repair log for this attempt for details)",
      filesChanged: Array.isArray(reported.filesChanged) ? reported.filesChanged : [],
    });

    console.log(`${testCaseId} -> recorded in fixHistory (seen ${entry.occurrences} time(s) total)`);
  });

  console.log("======================================");
}

try {
  main();
} catch (error) {
  console.error("Failed to record fix history (non-fatal):", error.message);
  // Memory bookkeeping must never fail the workflow.
  process.exit(0);
}
