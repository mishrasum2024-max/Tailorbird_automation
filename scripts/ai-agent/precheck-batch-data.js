const fs = require("fs");
const {
  REQUIRED_DATA,
  cleanupConfig,
  lastCleanupEndKey,
  isAfterLastCleanup,
  readJsonFile,
  readPlan,
  writeOutputs,
  writeWorkFile,
} = require("./lib/ticketBatch");

/*
 * ============================================================
 * PRE-CHECK BATCH TEST DATA
 * ============================================================
 *
 * Runs in ai-approved-ticket.yml BEFORE Claude and the MCP browser
 * start, so they only ever see test data that still exists.
 *
 * The core chain (property → project → job) is handed from test to
 * test through data/propertyData.json, projectData.json and
 * lastCreatedJob.json. On a fresh runner those are empty `{}`
 * placeholders, and the daily cleanup deletes the records they
 * point to.
 *
 * Default mode:
 *   1. Fills any EMPTY file from the batch record's data snapshot
 *      (the names an earlier batch of this ticket used). Never
 *      overwrites a file that already has data (e.g. restored by
 *      "Retry with previous data").
 *   2. Data counts as ready only when every file has its name AND
 *      was created after the end of the most recent cleanup window
 *      (the cleanup deletes everything older). Otherwise
 *      regenerate=true: the workflow then runs the @mandatory suite,
 *      which creates a new property/project/job and rewrites these
 *      files.
 *
 * --after-regeneration: confirms the files now hold names.
 *
 * Writes .ai-batch/precheck.md for Claude's prompt.
 *
 * Env: AI_PRECHECK_DATA ("false" disables), AI_CLEANUP_WINDOW,
 *      AI_CLEANUP_TZ
 * Outputs: data_ready, regenerate
 * Never exits non-zero; the workflow decides what a failure means.
 * ============================================================
 */

const AFTER_REGENERATION = process.argv.includes("--after-regeneration");

function readCurrent() {
  return REQUIRED_DATA.map(spec => ({
    spec,
    data: readJsonFile(spec.abs, {}) || {},
  }));
}

function restoreFromSnapshot(snapshot) {
  const restored = [];

  if (!snapshot?.files) return restored;

  readCurrent().forEach(({ spec, data }) => {
    const saved = snapshot.files[spec.file];

    if (data[spec.key] || !saved || !saved[spec.key]) return;

    fs.writeFileSync(spec.abs, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
    restored.push(spec.label);
  });

  return restored;
}

function describe(rows) {
  return rows
    .map(
      row =>
        `- ${row.spec.label}: ${row.name ? `"${row.name}"` : "(none)"} — ${row.status}`
    )
    .join("\n");
}

function runDefault() {
  if (process.env.AI_PRECHECK_DATA === "false") {
    writeWorkFile("precheck.md", "");
    writeOutputs({ data_ready: true, regenerate: false });
    return;
  }

  const config = cleanupConfig();
  const plan = readPlan();
  const snapshot = plan?.dataSnapshot || null;
  const restored = restoreFromSnapshot(snapshot);
  const cleanupEnd = config ? lastCleanupEndKey(config) : null;

  const rows = readCurrent().map(({ spec, data }) => {
    const name = data[spec.key] || "";
    const saved = snapshot?.files?.[spec.file] || {};
    const seenAt =
      data.createdAt ||
      (saved[spec.key] === name ? saved._seenAt : "") ||
      (saved[spec.key] === name ? snapshot?.capturedAt : "");

    let status = "missing";

    if (name && !config) status = "age unknown (cleanup window not configured)";
    else if (name && isAfterLastCleanup(seenAt, config)) status = "reused";
    else if (name) status = "stale (created before the last cleanup)";

    return { spec, name, status };
  });

  const ready = rows.every(row => row.status === "reused");

  console.log(`Last cleanup ended: ${cleanupEnd || "unknown"}`);
  console.log(
    `Restored from the batch record: ${restored.join(", ") || "none"}`
  );
  console.log(describe(rows));

  writeWorkFile(
    "precheck.md",
    ready
      ? [
          "",
          "## TEST DATA (verified before this run)",
          "",
          "Created after the last daily cleanup, so it still exists:",
          describe(rows),
          "",
          "Read these names from data/*.json in code; do not hardcode them.",
          "",
        ].join("\n")
      : ""
  );

  writeOutputs({ data_ready: ready, regenerate: !ready });
}

function runAfterRegeneration() {
  const rows = readCurrent().map(({ spec, data }) => ({
    spec,
    name: data[spec.key] || "",
    status: data[spec.key]
      ? "created today by the @mandatory suite"
      : "missing",
  }));
  const ready = rows.every(row => row.name);

  console.log(describe(rows));

  writeWorkFile(
    "precheck.md",
    [
      "",
      "## TEST DATA (regenerated before this run)",
      "",
      "The earlier data was missing or older than the last daily cleanup, " +
        "so the @mandatory suite created fresh records:",
      describe(rows),
      "",
      "Read these names from data/*.json in code; do not hardcode them. " +
        "Records other than these (invoices, change orders, bids, ...) are " +
        "NOT pre-created: create them in the test with the existing " +
        "page-object methods.",
      "",
    ].join("\n")
  );

  writeOutputs({ data_ready: ready, regenerate: false });
}

try {
  if (AFTER_REGENERATION) runAfterRegeneration();
  else runDefault();
} catch (error) {
  console.warn(`Data pre-check failed (${error.message}); will regenerate.`);
  writeOutputs({ data_ready: false, regenerate: true });
}
