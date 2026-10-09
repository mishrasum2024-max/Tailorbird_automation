const fs = require("fs");
const path = require("path");
const playwrightMemory = require("../../utils/playwrightMemory");

/*
 * ============================================================
 * BUILD MEMORY DIGEST
 * ============================================================
 *
 * Builds a short, token-budgeted markdown digest of relevant PAST
 * root-cause/fix history from the persistent AI-agent memory
 * (memory/fixHistory.json), so Claude can check "has this exact
 * class of failure happened before, and what fixed it" BEFORE
 * spending Playwright MCP browser turns rediscovering it from
 * scratch.
 *
 * The full history in memory/fixHistory.json is never deleted or
 * expired (see utils/playwrightMemory.js) and is committed to the
 * repo forever by scripts/ai-agent/persist-memory.js. This script
 * only decides which subset of that history is relevant enough to
 * spend prompt tokens on for the CURRENT ticket/failure — it never
 * removes anything from the underlying memory.
 *
 * Modes (env DIGEST_MODE):
 *   "generation" (default) — broad match by ticket title/component,
 *   used before Claude writes brand-new automation.
 *
 *   "repair" — narrow match against the ACTUAL failing error
 *   messages in data/test-failure-details.json, used before Claude
 *   attempts to fix a currently-failing test.
 *
 * Env vars:
 *   DIGEST_MODE     "generation" | "repair" (default "generation")
 *   DIGEST_LIMIT    Max entries to include (default 5)
 *
 * Writes:
 *   data/memory-digest.md
 * ============================================================
 */

const TICKET_FILE = path.join(__dirname, "..", "..", "data", "current-ticket-context.json");
const FAILURE_DETAILS_FILE = path.join(__dirname, "..", "..", "data", "test-failure-details.json");
const OUTPUT_FILE = path.join(__dirname, "..", "..", "data", "memory-digest.md");

const MODE = process.env.DIGEST_MODE || "generation";
const LIMIT = Number(process.env.DIGEST_LIMIT || 5);

function readJsonSafe(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (error) {
    console.warn(`Could not read ${file}: ${error.message}`);
  }
  return null;
}

function extractKeywords(ticket) {
  const text = `${ticket?.title || ""} ${ticket?.issueType || ""}`.toLowerCase();
  return text.split(/[^a-z0-9]+/).filter(word => word.length > 3);
}

function formatEntry(entry) {
  const lines = [
    `- **Root cause:** ${entry.rootCause || "(not recorded)"}`,
    `  **Fix that worked:** ${entry.fixApplied || "(not recorded)"}`,
  ];

  if (entry.filesChanged && entry.filesChanged.length) {
    lines.push(`  **Files typically involved:** ${entry.filesChanged.join(", ")}`);
  }

  lines.push(
    `  **Seen ${entry.occurrences} time(s)** across ticket(s) ${entry.tickets.join(", ")}, ` +
      `last fixed ${entry.lastFixedAt}.`
  );

  return lines.join("\n");
}

function main() {
  const ticket = readJsonSafe(TICKET_FILE) || {};
  const failureDetails = readJsonSafe(FAILURE_DETAILS_FILE) || {};

  const keywords = extractKeywords(ticket);
  const component = ticket.title || "";

  let relevant = [];

  if (MODE === "repair") {
    const messages = Object.values(failureDetails);
    const seen = new Set();

    messages.forEach(message => {
      playwrightMemory
        .findRelevantFixes({ component, errorMessage: message, keywords, limit: LIMIT })
        .forEach(entry => {
          if (!seen.has(entry.errorSignature)) {
            seen.add(entry.errorSignature);
            relevant.push(entry);
          }
        });
    });

    relevant = relevant.slice(0, LIMIT);
  } else {
    relevant = playwrightMemory.findRelevantFixes({ component, keywords, limit: LIMIT });
  }

  let markdown;

  if (!relevant.length) {
    markdown =
      "## Known Prior Issues (persistent AI-agent memory)\n\n" +
      "No matching prior root-cause/fix history found for this ticket/component yet.\n";
  } else {
    markdown =
      "## Known Prior Issues (persistent AI-agent memory)\n\n" +
      "These are REAL root causes and fixes recorded from earlier automation runs " +
      "against similar failures/components. Check whether the current situation " +
      "matches one of these BEFORE spending browser-exploration turns rediscovering " +
      "it from scratch. Treat this as a strong hint, not gospel — the app may have " +
      "changed since, so verify it still applies before reapplying it blindly.\n\n" +
      relevant.map(formatEntry).join("\n\n") +
      "\n";
  }

  fs.writeFileSync(OUTPUT_FILE, markdown, "utf8");

  console.log("======================================");
  console.log("MEMORY DIGEST");
  console.log("======================================");
  console.log(`Mode: ${MODE}`);
  console.log(`Matched entries: ${relevant.length}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log("======================================");
}

try {
  main();
} catch (error) {
  console.error("Failed to build memory digest (non-fatal):", error.message);

  // A missing/broken digest should never block the workflow — fall back
  // to an empty digest so downstream prompt-builders still find a file.
  fs.writeFileSync(
    OUTPUT_FILE,
    "## Known Prior Issues (persistent AI-agent memory)\n\n(Digest unavailable this run.)\n",
    "utf8"
  );
}
