const path = require("path");

/*
 * ============================================================
 * BUG AGENT FILE PATHS
 * ============================================================
 *
 * Every per-run file the bug agent reads/writes, in one place.
 * RUNTIME files are gitignored scratch (ai-bug-agent/runtime/).
 *
 * COMPAT_TICKET_CONTEXT is the feature agent's context path. The
 * bug agent writes a copy there ONLY so shared scripts such as
 * scripts/ai-agent/build-memory-digest.js work unchanged. It is
 * written on the ephemeral CI runner only and is already excluded
 * from commits by scripts/ai-agent/stage-generated-files.js.
 * ============================================================
 */

const AUTOMATION_ROOT = path.join(__dirname, "..", "..", "..");
const RUNTIME_DIR = path.join(__dirname, "..", "..", "runtime");

module.exports = {
  AUTOMATION_ROOT,
  RUNTIME_DIR,
  BUG_CONTEXT: path.join(RUNTIME_DIR, "current-bug-context.json"),
  ATTACHMENTS_DIR: path.join(RUNTIME_DIR, "attachments"),
  TESTCASES_JSON: path.join(RUNTIME_DIR, "bug-testcases.json"),
  TESTCASES_MD: path.join(RUNTIME_DIR, "bug-testcases.md"),
  TESTCASES_ALL: path.join(RUNTIME_DIR, "bug-testcases.all.json"),
  TESTCASES_PRE_INVESTIGATION: path.join(RUNTIME_DIR, "bug-testcases.pre-investigation.json"),
  DROPPED_TESTCASES: path.join(RUNTIME_DIR, "bug-dropped-testcases.json"),
  INVESTIGATION_NOTES: path.join(RUNTIME_DIR, "bug-testcase-investigation-notes.json"),
  INVESTIGATION_STATUS: path.join(RUNTIME_DIR, "bug-investigation-status.json"),
  COMPAT_TICKET_CONTEXT: path.join(AUTOMATION_ROOT, "data", "current-ticket-context.json"),
};
