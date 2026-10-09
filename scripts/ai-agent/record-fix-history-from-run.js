const fs = require("fs");
const path = require("path");
const playwrightMemory = require("../../utils/playwrightMemory");
const { extractFixesFromLog } = require("./lib/fixLogParser");

/*
 * ============================================================
 * RECORD FIX HISTORY FROM A SINGLE-SHOT REPAIR RUN
 * ============================================================
 *
 * Variant of record-fix-history.js for workflows (currently
 * ai-automate-selected-testcases.yml) that run a single repair
 * attempt rather than a multi-attempt loop with per-test-case JSON
 * results, so there's no clean "failed before / passed after" ID
 * diff available.
 *
 * Trust model: only record a fix when BOTH are true —
 *   1. The overall Playwright run after repair actually passed
 *      (caller only invokes this script in that case).
 *   2. Claude explicitly reported fixing that specific test case ID
 *      in its required fenced ```json fixes block.
 *
 * The error signature is best-effort: a short snippet grepped out
 * of the PRE-repair Playwright log around the first line mentioning
 * that test case ID. This is fuzzier than the JSON-reporter-based
 * matching record-fix-history.js does, but a rough signature is
 * still useful for the memory digest — and far better than
 * recording nothing at all.
 *
 * Env vars:
 *   TICKET_ID
 *   INITIAL_LOG   Path to the PRE-repair Playwright run log (plain text)
 *   REPAIR_LOG    Path to this attempt's `claude -p` repair log
 * ============================================================
 */

const TICKET_FILE = path.join(__dirname, "..", "..", "data", "current-ticket-context.json");

const TICKET_ID = process.env.TICKET_ID || "UNKNOWN";
const INITIAL_LOG = process.env.INITIAL_LOG;
const REPAIR_LOG = process.env.REPAIR_LOG;

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

function extractErrorSnippet(logPath, testCaseId) {
  if (!logPath || !fs.existsSync(logPath)) {
    return null;
  }

  const lines = fs.readFileSync(logPath, "utf8").split("\n");
  const index = lines.findIndex(line => line.includes(testCaseId));

  if (index === -1) {
    return null;
  }

  return lines.slice(index, index + 15).join("\n").slice(0, 500);
}

function main() {
  const reportedFixes = extractFixesFromLog(REPAIR_LOG);

  console.log("======================================");
  console.log("RECORDING FIX HISTORY (single-shot run)");
  console.log("======================================");

  if (!reportedFixes.length) {
    console.log("Claude did not report a structured fixes block for this run — nothing to record.");
    return;
  }

  const component = readTicketComponent();

  reportedFixes.forEach(fix => {
    if (!fix.testCaseId) {
      return;
    }

    const errorSignature =
      extractErrorSnippet(INITIAL_LOG, fix.testCaseId) || `${TICKET_ID}::${fix.testCaseId}`;

    const entry = playwrightMemory.recordFix({
      ticketId: TICKET_ID,
      testCaseId: fix.testCaseId,
      component,
      errorSignature,
      rootCause: fix.rootCause || "(not reported)",
      fixApplied: fix.fixApplied || "(not reported)",
      filesChanged: Array.isArray(fix.filesChanged) ? fix.filesChanged : [],
    });

    console.log(`${fix.testCaseId} -> recorded in fixHistory (seen ${entry.occurrences} time(s) total)`);
  });

  console.log("======================================");
}

try {
  main();
} catch (error) {
  console.error("Failed to record fix history (non-fatal):", error.message);
  process.exit(0);
}
