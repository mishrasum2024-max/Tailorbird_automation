const fs = require("fs");
const path = require("path");
const {
  AUTOMATION_ROOT,
  AUTOMATION_SUBPATH,
  LEDGER_DIR,
  WORK_DIR,
  REQUIRED_DATA,
  SPEC_PATH_PATTERN,
  CODE_PATH_PATTERN,
  readTicketId,
  splitIds,
  isSafeRelativePath,
  git,
  readJsonFile,
  readPlan,
  normalizeLedger,
} = require("./lib/ticketBatch");

/*
 * ============================================================
 * RECORD TICKET BATCH
 * ============================================================
 *
 * Called by ai-approved-ticket.yml's PR step AFTER the generated
 * files are staged and BEFORE the commit. Writes and stages
 * ai-batches/<TICKET>.json on the batch branch: every batch so far
 * (from .ai-batch/plan.json) plus this one, cumulative, so the next
 * batch knows which cases pass, which files they live in, which
 * page-object methods were added, Claude's notes and the test-data
 * snapshot (names + when they were first seen, never IDs).
 *
 * Env: TICKET_ID, GENERATION_RUN_ID, GITHUB_RUN_ID, TEST_STATUS,
 *   PASSED_TEST_CASES, FAILED_TEST_CASES, EARLIER_STATUS,
 *   EARLIER_FAILED_IDS, EARLIER_CODE_INTACT
 * ============================================================
 */

const TICKET_ID = readTicketId();
const LEDGER_FILE = path.join(LEDGER_DIR, `${TICKET_ID}.json`);
const NOTES_FILE = path.join(WORK_DIR, "notes.json");
const GENERATED_FILE = path.join(
  AUTOMATION_ROOT,
  "data",
  "generated-testcases.json"
);

const PAGE_METHOD_PATTERN =
  /^\+\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;
const LOCATOR_NAME_PATTERN =
  /^\+\s*(?:const\s+|let\s+)?([A-Za-z_$][\w$]*)\s*(?::|=)\s*(?:\(|async\b|function\b|page\b)/;
const RESERVED_WORDS = new Set(["if", "for", "while", "switch", "catch"]);
const MAX_NAMES = 40;

function stagedCodeFiles() {
  return git(["diff", "--cached", "--name-only"])
    .split("\n")
    .filter(Boolean)
    .map(file => file.replace(`${AUTOMATION_SUBPATH}/`, ""))
    .filter(file => isSafeRelativePath(file, CODE_PATH_PATTERN));
}

function addedNames() {
  let diff = "";

  try {
    diff = git(["diff", "--cached", "-U0", "--", "pages", "locators"]);
  } catch (error) {
    return [];
  }

  const names = new Set();

  diff.split("\n").forEach(line => {
    const match =
      line.match(PAGE_METHOD_PATTERN) || line.match(LOCATOR_NAME_PATTERN);

    if (match && !RESERVED_WORDS.has(match[1])) names.add(match[1]);
  });

  return [...names].slice(0, MAX_NAMES);
}

function cleanList(value) {
  return (Array.isArray(value) ? value : [])
    .map(item => String(item).replace(/\s+/g, " ").trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 10);
}

function readNotes() {
  const notes = readJsonFile(NOTES_FILE, {}) || {};

  return { quirks: cleanList(notes.quirks), setup: cleanList(notes.setup) };
}

// Slack "Instruct & retry" instructions this batch followed (only the text
// between the markers written by fetch-user-instructions.js), so later
// batches of the ticket see them in their batch context. Empty when none.
const USER_INSTRUCTIONS_FILE = path.join(__dirname, "..", "..", ".ai-run", "user-instructions.md");
const MAX_USER_INSTRUCTIONS = 4000;

function readUserInstructions() {
  try {
    const text = fs.readFileSync(USER_INSTRUCTIONS_FILE, "utf8");
    const start = text.indexOf("----- instructions start -----");
    const end = text.indexOf("----- instructions end -----");

    if (start === -1 || end <= start) return "";

    return text
      .slice(start + "----- instructions start -----".length, end)
      .trim()
      .slice(0, MAX_USER_INSTRUCTIONS);
  } catch (error) {
    return "";
  }
}

// Single-PR mode (publish-ticket-pr.js): failing tests of this batch
// left out of the PR and kept on the wip branch, and paths the
// allowed-paths guard refused to commit. Absent in batch mode.
const PARKED_FILE = path.join(WORK_DIR, "parked.json");

function readParked() {
  const parked = readJsonFile(PARKED_FILE, null);

  if (!parked || typeof parked !== "object") return {};

  return {
    parked: (Array.isArray(parked.parked) ? parked.parked : [])
      .filter(item => item && typeof item.id === "string" && isSafeRelativePath(item.file, SPEC_PATH_PATTERN))
      .map(item => ({ id: item.id, file: item.file }))
      .slice(0, 50),
    ...(parked.wipBranch ? { wipBranch: String(parked.wipBranch) } : {}),
    ...(parked.wipRef ? { wipRef: String(parked.wipRef) } : {}),
    ...(Array.isArray(parked.prunedMethods) && parked.prunedMethods.length
      ? { prunedMethods: parked.prunedMethods.map(String).slice(0, 50) }
      : {}),
    ...(Array.isArray(parked.blockedPaths) && parked.blockedPaths.length
      ? { blockedPaths: parked.blockedPaths.map(String).slice(0, 50) }
      : {}),
  };
}

function dataSnapshot(previous) {
  const now = new Date().toISOString();
  const files = {};

  REQUIRED_DATA.forEach(spec => {
    const data = readJsonFile(spec.abs, {}) || {};
    const name = data[spec.key];

    if (!name) return;

    const earlier = previous?.files?.[spec.file];
    const seenAt =
      data.createdAt ||
      data._seenAt ||
      (earlier && earlier[spec.key] === name && earlier._seenAt) ||
      now;

    files[spec.file] = { ...data, _seenAt: seenAt };
  });

  return { capturedAt: now, files };
}

function main() {
  const plan = readPlan();

  if (!plan || plan.ticketId !== TICKET_ID || !plan.batchNumber) {
    console.log("No batch plan for this ticket; skipping the batch record.");
    return;
  }

  const codeFiles = stagedCodeFiles();
  const generated = readJsonFile(GENERATED_FILE, {}) || {};
  const previous = normalizeLedger(
    readJsonFile(LEDGER_FILE, { batches: [] }),
    TICKET_ID
  );

  const entry = {
    number: plan.batchNumber,
    branch: plan.batchBranch,
    baseRef: plan.baseRef,
    caseIds: plan.selectedIds,
    passedIds: splitIds(process.env.PASSED_TEST_CASES),
    failedIds: splitIds(process.env.FAILED_TEST_CASES),
    testStatus: process.env.TEST_STATUS || "unknown",
    earlierStatus: process.env.EARLIER_STATUS || "not_run",
    earlierFailedIds: splitIds(process.env.EARLIER_FAILED_IDS),
    earlierCodeIntact: process.env.EARLIER_CODE_INTACT !== "false",
    specFiles: codeFiles.filter(file =>
      isSafeRelativePath(file, SPEC_PATH_PATTERN)
    ),
    codeFiles,
    addedMethods: addedNames(),
    notes: readNotes(),
    ...(readUserInstructions() ? { userInstructions: readUserInstructions() } : {}),
    ...(plan.mode === "single-pr" ? { mode: "single-pr", ...readParked() } : {}),
    runId: process.env.GITHUB_RUN_ID || "",
    recordedAt: new Date().toISOString(),
  };

  const ledger = {
    ticketId: TICKET_ID,
    generationRunId: process.env.GENERATION_RUN_ID || previous.generationRunId,
    totalGeneratedCases:
      (Array.isArray(generated.testCases) && generated.testCases.length) ||
      previous.totalGeneratedCases,
    // Keep every earlier entry: the working-tree record (main + base
    // branch) plus the plan's view, then this batch.
    batches: [
      ...new Map(
        [...previous.batches, ...(plan.priorBatches || [])]
          .filter(batch => batch.number !== entry.number)
          .map(batch => [batch.number, batch])
      ).values(),
      entry,
    ].sort((a, b) => a.number - b.number),
    dataSnapshot: dataSnapshot(previous.dataSnapshot || plan.dataSnapshot),
  };

  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  fs.writeFileSync(LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  git(["add", "--", LEDGER_FILE]);

  console.log(
    `Recorded batch ${entry.number} for ${TICKET_ID}: ` +
      `${entry.passedIds.length} passed, ${entry.failedIds.length} failed, ` +
      `${codeFiles.length} code file(s).`
  );
}

main();
