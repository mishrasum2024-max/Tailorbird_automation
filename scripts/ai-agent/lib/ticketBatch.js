const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * TICKET BATCH HELPERS (shared)
 * ============================================================
 *
 * Shared by the batch scripts used in ai-approved-ticket.yml:
 *
 *   check-cleanup-window.js    skip runs that would overlap the
 *                              daily test-data cleanup
 *   plan-ticket-batch.js       pick the batch branch + its base
 *   precheck-batch-data.js     reuse or regenerate test data
 *   check-earlier-batch-code.js  earlier batches' code unchanged?
 *   record-ticket-batch.js     write the batch record (ledger)
 *   notify-ticket-batch.js     batch progress message in Slack
 *
 * Batching model: a ticket's generated test cases can be automated
 * in several runs ("batches"). Each batch gets its own branch
 * ai/<TICKET>-batch<N>, built on the latest PASSING batch branch
 * (or main), so a later batch can never overwrite an earlier
 * batch's working code. The batch record lives in
 * ai-batches/<TICKET>.json on the batch branch itself.
 *
 * Node built-ins only (the cleanup-window job runs without
 * `npm ci`). Literal regexes only (semgrep
 * detect-non-literal-regexp); no path built from function
 * parameters (semgrep path-join-resolve-traversal).
 * ============================================================
 */

const AUTOMATION_ROOT = path.join(__dirname, "..", "..", "..");
const AUTOMATION_SUBPATH = "Playwright/Tailorbird_UI_Automation";
const LEDGER_DIR = path.join(AUTOMATION_ROOT, "ai-batches");
const LEDGER_SUBDIR = "ai-batches";
const WORK_DIR = path.join(AUTOMATION_ROOT, ".ai-batch");
const PLAN_FILE = path.join(WORK_DIR, "plan.json");
const DATA_DIR = path.join(AUTOMATION_ROOT, "data");

// Core chain the @mandatory suite (re)creates: TC49 property,
// TC71 project, TC81 job. Each file's required key must be set for
// the data to count as present.
const REQUIRED_DATA = [
  {
    file: "propertyData.json",
    key: "propertyName",
    label: "property",
    abs: path.join(DATA_DIR, "propertyData.json"),
  },
  {
    file: "projectData.json",
    key: "projectName",
    label: "project",
    abs: path.join(DATA_DIR, "projectData.json"),
  },
  {
    file: "lastCreatedJob.json",
    key: "jobName",
    label: "job",
    abs: path.join(DATA_DIR, "lastCreatedJob.json"),
  },
];

// Notion unique_id: "<prefix>-<number>", prefix may be empty.
const TICKET_ID_PATTERN = /^[A-Za-z0-9]{0,20}-\d{1,9}$/;
const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const BATCH_SUFFIX_PATTERN = /-batch(\d{1,4})$/;
const SPEC_PATH_PATTERN = /^tests\/[A-Za-z0-9_./-]+\.spec\.js$/;
const CODE_PATH_PATTERN =
  /^(tests|pages|locators|utils|fixture)\/[A-Za-z0-9_./-]+$/;
const WINDOW_PATTERN = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

function readTicketId() {
  const ticketId = String(process.env.TICKET_ID || "").trim();

  if (!TICKET_ID_PATTERN.test(ticketId)) {
    throw new Error(
      `TICKET_ID "${ticketId}" is not a valid ticket ID (e.g. FEAT-1170).`
    );
  }

  return ticketId;
}

function splitIds(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map(id => id.trim())
        .filter(id => CASE_ID_PATTERN.test(id))
    ),
  ];
}

function isSafeRelativePath(value, pattern) {
  const text = String(value || "");

  return pattern.test(text) && !text.split("/").includes("..");
}

// Runs git with an argument array (no shell), like the other
// ai-agent scripts.
function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: AUTOMATION_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  }).trim();
}

function gh(args) {
  return execFileSync("gh", args, {
    cwd: AUTOMATION_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeOutputs(values) {
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${String(value ?? "").replace(/[\r\n]+/g, " ")}`
  );

  lines.forEach(line => console.log(line));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeWorkFile(name, content) {
  fs.mkdirSync(WORK_DIR, { recursive: true });

  const target = {
    "plan.json": PLAN_FILE,
    "batch-context.md": path.join(WORK_DIR, "batch-context.md"),
    "repair-rules.md": path.join(WORK_DIR, "repair-rules.md"),
    "notes-instruction.md": path.join(WORK_DIR, "notes-instruction.md"),
    "precheck.md": path.join(WORK_DIR, "precheck.md"),
    "earlier-code.md": path.join(WORK_DIR, "earlier-code.md"),
  }[name];

  if (!target) throw new Error(`Unknown batch work file: ${name}`);

  fs.writeFileSync(target, content, "utf8");
}

function readPlan() {
  return readJsonFile(PLAN_FILE, null);
}

// The ledger as committed at a git ref (branch, HEAD, ...).
function readLedgerAt(ref, ticketId) {
  try {
    const text = git([
      "show",
      `${ref}:${AUTOMATION_SUBPATH}/${LEDGER_SUBDIR}/${ticketId}.json`,
    ]);

    return normalizeLedger(JSON.parse(text), ticketId);
  } catch (error) {
    return null;
  }
}

function normalizeLedger(ledger, ticketId) {
  const batches = Array.isArray(ledger?.batches) ? ledger.batches : [];

  return {
    ticketId,
    generationRunId: String(ledger?.generationRunId || ""),
    totalGeneratedCases: Number(ledger?.totalGeneratedCases) || 0,
    batches: batches
      .filter(batch => Number.isInteger(batch?.number) && batch.number > 0)
      .map(batch => ({
        ...batch,
        caseIds: splitIds((batch.caseIds || []).join(",")),
        passedIds: splitIds((batch.passedIds || []).join(",")),
        failedIds: splitIds((batch.failedIds || []).join(",")),
        specFiles: (batch.specFiles || []).filter(file =>
          isSafeRelativePath(file, SPEC_PATH_PATTERN)
        ),
        codeFiles: (batch.codeFiles || []).filter(file =>
          isSafeRelativePath(file, CODE_PATH_PATTERN)
        ),
      })),
    dataSnapshot:
      ledger?.dataSnapshot && typeof ledger.dataSnapshot === "object"
        ? ledger.dataSnapshot
        : null,
  };
}

// ------------------------------------------------------------
// Cleanup window (local time in AI_CLEANUP_TZ, no libraries)
// ------------------------------------------------------------

function cleanupConfig() {
  const windowText = String(
    process.env.AI_CLEANUP_WINDOW || "06:00-09:00"
  ).trim();
  const timeZone =
    String(process.env.AI_CLEANUP_TZ || "").trim() || "Asia/Kolkata";
  const guardMinutes = Number.parseInt(
    process.env.AI_CLEANUP_GUARD_MINUTES || "60",
    10
  );
  const match = windowText.match(WINDOW_PATTERN);

  if (!match) return null;

  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);

  if (!(start < end) || end > 24 * 60) return null;

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  } catch (error) {
    return null;
  }

  return {
    windowText,
    timeZone,
    start,
    end,
    guardMinutes:
      Number.isFinite(guardMinutes) && guardMinutes >= 0 ? guardMinutes : 60,
  };
}

function localParts(date, timeZone) {
  const parts = {};

  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .forEach(part => {
      parts[part.type] = part.value;
    });

  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);

  return { day, minutes, key: `${day} ${parts.hour}:${parts.minute}` };
}

function formatMinutes(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");

  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

// "YYYY-MM-DD HH:MM" (local) of the end of the most recent cleanup.
function lastCleanupEndKey(config, now = new Date()) {
  const today = localParts(now, config.timeZone);
  const day =
    today.minutes >= config.end
      ? today.day
      : localParts(
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
          config.timeZone
        ).day;

  return `${day} ${formatMinutes(config.end)}`;
}

function isAfterLastCleanup(isoTimestamp, config, now = new Date()) {
  const time = new Date(isoTimestamp);

  if (!isoTimestamp || Number.isNaN(time.getTime())) return false;
  if (time.getTime() > now.getTime() + 5 * 60 * 1000) return false;

  return (
    localParts(time, config.timeZone).key >= lastCleanupEndKey(config, now)
  );
}

module.exports = {
  AUTOMATION_ROOT,
  AUTOMATION_SUBPATH,
  LEDGER_DIR,
  LEDGER_SUBDIR,
  WORK_DIR,
  PLAN_FILE,
  REQUIRED_DATA,
  BATCH_SUFFIX_PATTERN,
  SPEC_PATH_PATTERN,
  CODE_PATH_PATTERN,
  readTicketId,
  splitIds,
  isSafeRelativePath,
  git,
  gh,
  writeOutputs,
  readJsonFile,
  writeWorkFile,
  readPlan,
  readLedgerAt,
  normalizeLedger,
  cleanupConfig,
  localParts,
  formatMinutes,
  lastCleanupEndKey,
  isAfterLastCleanup,
};
