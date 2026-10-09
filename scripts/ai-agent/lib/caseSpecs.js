const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * CASE SPECS — which spec files hold a ticket's case tests
 * ============================================================
 *
 * A case's test is identified by "<TICKET>-<CASE>" in its title
 * (e.g. FEAT-1170-TC008; titles must carry it, see
 * plan-ticket-batch.js TITLE_RULE). "TC01" never matches "TC010":
 * the ID must not be followed by another digit.
 *
 * Used by case-specs.js (which specs to run, which cases are
 * blocked) and build-agent-report.js.
 * ============================================================
 */

const AUTOMATION_ROOT = path.join(__dirname, "..", "..", "..");
const TESTS_DIR = path.join(AUTOMATION_ROOT, "tests");

function splitIds(value) {
  return String(value || "")
    .split(",")
    .map(id => id.trim().toUpperCase())
    .filter(Boolean);
}

// Every spec under tests/ with its text: [{ file: "tests/x.spec.js", text }].
// Paths only ever come from listing the fixed tests/ folder (semgrep
// path-join-resolve-traversal: no path.join on function arguments).
function readAllSpecs() {
  if (!fs.existsSync(TESTS_DIR)) return [];

  return fs
    .readdirSync(TESTS_DIR, { recursive: true })
    .map(entry => String(entry))
    .filter(entry => entry.endsWith(".spec.js"))
    .map(entry => {
      const abs = path.join(TESTS_DIR, entry); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- entry comes from fs.readdirSync of the fixed tests/ folder itself, never from user input.

      return {
        file: path.relative(AUTOMATION_ROOT, abs).replace(/\\/g, "/"),
        text: fs.readFileSync(abs, "utf8"),
      };
    });
}

function containsCase(text, needle) {
  let index = text.indexOf(needle);

  while (index !== -1) {
    if (!/\d/.test(text.charAt(index + needle.length))) return true;
    index = text.indexOf(needle, index + 1);
  }

  return false;
}

// { TC006: ["tests/TC34_x.spec.js"], TC013: [] } — paths relative to
// the automation root, forward slashes. Without a ticket ID nothing
// can be matched safely (bare TC IDs repeat across tickets).
function findSpecsForCases(ticketId, caseIds) {
  const ticket = String(ticketId || "").trim().toUpperCase();
  const result = Object.fromEntries(caseIds.map(id => [id, []]));

  if (!ticket) return result;

  const specs = readAllSpecs();

  caseIds.forEach(id => {
    result[id] = specs
      .filter(spec => containsCase(spec.text, `${ticket}-${id}`))
      .map(spec => spec.file);
  });

  return result;
}

// Fallback for tests written before the ticket-scoped title rule:
// the bare case ID ("TC006", not inside "TC0060" or "TC1006") in the
// given spec files (paths relative to the automation root). Only
// used on a ticket's own batch spec files.
function filesContainBareCase(files, caseId) {
  const id = String(caseId || "").toUpperCase();
  const wanted = new Set(files.map(file => String(file).replace(/\\/g, "/")));

  // Only specs that really exist under tests/ are read; the given
  // paths are matched against that listing, never opened directly.
  return readAllSpecs().some(({ file, text }) => {
    if (!wanted.has(file)) return false;

    let index = text.indexOf(id);

    while (index !== -1) {
      const before = text.charAt(index - 1);
      const after = text.charAt(index + id.length);

      if (!/[A-Za-z0-9]/.test(before) && !/\d/.test(after)) return true;
      index = text.indexOf(id, index + 1);
    }

    return false;
  });
}

module.exports = {
  AUTOMATION_ROOT,
  splitIds,
  findSpecsForCases,
  filesContainBareCase,
};
