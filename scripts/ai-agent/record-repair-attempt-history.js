const fs = require("fs");
const path = require("path");
const { extractFixesFromLog } = require("./lib/fixLogParser");

/*
 * ============================================================
 * RECORD REPAIR ATTEMPT HISTORY
 * ============================================================
 *
 * Called after EVERY repair attempt in the loop (whether it fixed
 * the target test case(s) or not), so the NEXT attempt's prompt
 * (see prepare-repair-prompt.js) can tell Claude what was already
 * tried this run and whether it worked — instead of each attempt
 * being a stateless retry that might blindly repeat the same failed
 * approach.
 *
 * This is deliberately separate from record-fix-history.js, which
 * only records a CONFIRMED fix (failing -> passing) into the
 * cross-ticket persistent memory/fixHistory.json. This script
 * records EVERY reported attempt — including ones that did NOT fix
 * the test case — into a per-run, in-repo-only scratch file
 * (data/repair-attempt-history.json) that is never persisted to
 * cross-ticket memory and is meaningless outside this one workflow
 * run.
 *
 * Env vars:
 *   ATTEMPT             Current attempt number (1-based)
 *   REPAIR_LOG          Path to this attempt's `claude -p` log
 *   FAILED_IDS_AFTER    Comma-separated IDs still failing AFTER this
 *                       attempt (used to determine outcome per fix)
 *
 * Reads:
 *   REPAIR_LOG — parsed via lib/fixLogParser.js for a
 *   ```json {"fixes": [...]}``` block, exactly like
 *   record-fix-history.js does.
 *
 * Writes:
 *   data/repair-attempt-history.json — appended to, never trimmed
 *   within a single run (it's deleted/recreated fresh each new
 *   workflow run since it's scratch data, not persistent memory).
 * ============================================================
 */

const ATTEMPT = process.env.ATTEMPT || "1";
const REPAIR_LOG = process.env.REPAIR_LOG;
const FAILED_IDS_AFTER = (process.env.FAILED_IDS_AFTER || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const HISTORY_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "repair-attempt-history.json"
);

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function main() {
  const reportedFixes = extractFixesFromLog(REPAIR_LOG);

  console.log("======================================");
  console.log("RECORDING REPAIR ATTEMPT HISTORY");
  console.log("======================================");

  if (!reportedFixes.length) {
    console.log(
      "Claude did not report a structured fixes block for this " +
      "attempt — nothing to add to the in-run attempt history."
    );
    return;
  }

  const history = loadHistory();

  reportedFixes.forEach(fix => {
    if (!fix.testCaseId) {
      return;
    }

    const outcome = FAILED_IDS_AFTER.includes(fix.testCaseId)
      ? "still-failing"
      : "fixed";

    history.push({
      attempt: Number(ATTEMPT),
      testCaseId: fix.testCaseId,
      rootCause: fix.rootCause || "(not reported)",
      fixApplied: fix.fixApplied || "(not reported)",
      filesChanged: Array.isArray(fix.filesChanged) ? fix.filesChanged : [],
      outcome,
    });

    console.log(
      `Attempt ${ATTEMPT}: ${fix.testCaseId} -> ${outcome}`
    );
  });

  fs.writeFileSync(
    HISTORY_FILE,
    JSON.stringify(history, null, 2),
    "utf8"
  );

  console.log("======================================");
}

try {
  main();
} catch (error) {
  console.error(
    "Failed to record repair attempt history (non-fatal):",
    error.message
  );
  // In-run attempt history is a nice-to-have, never a workflow blocker.
  process.exit(0);
}
