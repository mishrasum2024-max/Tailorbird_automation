const { execFileSync } = require("child_process");
const fs = require("fs");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * DERIVE BUG CASE (single-case mode)
 * ============================================================
 *
 * In single mode the bug itself is the test case, so Claude is not
 * asked to write any test-case file. After the automation step this
 * script derives the run record from facts instead, and writes
 * runtime/bug-testcases.json itself, so the later steps
 * (check-append-only.js, record-bug-regression.js,
 * record-bug-testcase-generation.js) keep working unchanged:
 *
 *   case ID      always <BUG-ID>-TC01
 *   target spec  the spec under tests/ this run changed — the one
 *                containing the case ID when several changed
 *   live status  Claude's final "Live status: <value>" line
 *                (unverified when missing)
 *   title        the Notion bug title (runtime/current-bug-context.json)
 *
 * No spec changed = no test was added. Then has_test=false and
 * no_test_reason holds Claude's own "## Result" text, so Slack says
 * why instead of a missing-file error.
 *
 * Env: BUG_ID, CLAUDE_LOG_PATH (default /tmp/claude-test-generation.log)
 * Outputs: has_test, target_spec, case_id, live_status, no_test_reason
 * Never exits non-zero; the workflow decides what has_test=false means.
 * ============================================================
 */

const BUG_ID = String(process.env.BUG_ID || "").toUpperCase();
const CASE_ID = `${BUG_ID}-TC01`;
const CLAUDE_LOG =
  process.env.CLAUDE_LOG_PATH || "/tmp/claude-test-generation.log";

const BUG_ID_PATTERN = /^BUG-\d+$/;
const SPEC_PATTERN = /^tests\/[A-Za-z0-9_./-]+\.spec\.js$/;
const LIVE_STATUS_PATTERN =
  /^\W*live status\W*\s*(fixed|still_reproduces|not_reproducible|unverified)\b/i;
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const MAX_REASON_LENGTH = 600;

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    // `git grep` exits 1 when nothing matches.
    return String(error.stdout || "").trim();
  }
}

function lines(text) {
  return String(text || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function isSpec(file) {
  return SPEC_PATTERN.test(file) && !file.split("/").includes("..");
}

// Tracked specs changed + new specs (the append-only check rejects
// new ones, but they still count as "a test was added").
function changedSpecs() {
  return [
    ...new Set([
      ...lines(
        git(["diff", "--name-only", "--relative", "HEAD", "--", "tests"])
      ),
      ...lines(
        git(["ls-files", "--others", "--exclude-standard", "--", "tests"])
      ),
    ]),
  ].filter(isSpec);
}

function specsContainingCase() {
  return lines(
    git(["grep", "-l", "--untracked", "-F", "-e", CASE_ID, "--", "tests"])
  ).filter(isSpec);
}

function readLog() {
  try {
    return fs.readFileSync(CLAUDE_LOG, "utf8");
  } catch (error) {
    return "";
  }
}

function liveStatusFrom(log) {
  const found = log
    .split("\n")
    .map(line => line.match(LIVE_STATUS_PATTERN))
    .filter(Boolean)
    .pop();

  return found ? found[1].toLowerCase() : "unverified";
}

// Claude's "## Result" section (it ends every run with one), else
// the last few lines of its report.
function reasonFrom(log) {
  const all = log.split("\n");
  const start = all.map(line => line.trim()).lastIndexOf("## Result");
  const picked = start >= 0 ? all.slice(start + 1) : all.slice(-8);
  const text = picked
    .map(line => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return (text || "Claude did not report a reason; see the run logs.").slice(
    0,
    MAX_REASON_LENGTH
  );
}

function stepsFrom(context) {
  return lines(context.sections?.stepsToReproduce).slice(0, 20);
}

function writeOutputs(values) {
  const text = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n]+/g, " ")}`)
    .join("\n");

  console.log(text);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${text}\n`, "utf8");
  }
}

function main() {
  if (!BUG_ID_PATTERN.test(BUG_ID)) {
    throw new Error(`BUG_ID "${BUG_ID}" must look like BUG-1458.`);
  }

  const context = JSON.parse(fs.readFileSync(paths.BUG_CONTEXT, "utf8"));
  const log = readLog();
  const changed = changedSpecs();
  const withCase = specsContainingCase().filter(file => changed.includes(file));
  const targetSpec = withCase[0] || changed[0] || "";
  const liveStatus = liveStatusFrom(log);

  console.log("======================================");
  console.log(`DERIVING THE BUG CASE FOR ${BUG_ID}`);
  console.log("======================================");
  console.log(`Changed specs: ${changed.join(", ") || "none"}`);
  console.log(`Specs containing ${CASE_ID}: ${withCase.join(", ") || "none"}`);

  if (!targetSpec) {
    const reason = reasonFrom(log);

    console.log(`No test was added. Claude reported: ${reason}`);
    writeOutputs({
      has_test: false,
      target_spec: "",
      case_id: CASE_ID,
      live_status: liveStatus,
      no_test_reason: reason,
    });
    return;
  }

  const record = {
    bugId: BUG_ID,
    derived: true,
    rootCauseHypothesis: "",
    targetSpec,
    targetSpecReason: "The spec this run appended the bug test to.",
    liveStatus,
    liveEvidence: "",
    testCases: [
      {
        id: CASE_ID,
        type: "Bug Reproduction",
        priority: PRIORITIES.includes(context.priority)
          ? context.priority
          : "P2",
        title: context.title || BUG_ID,
        preconditions: [],
        steps: stepsFrom(context),
        expectedResult:
          "The correct (fixed) behaviour described in the bug report.",
        coversRootCause: "Follows the bug report's own reproduction steps.",
      },
    ],
  };

  fs.mkdirSync(paths.RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(
    paths.TESTCASES_JSON,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8"
  );

  writeOutputs({
    has_test: true,
    target_spec: targetSpec,
    case_id: CASE_ID,
    live_status: liveStatus,
    no_test_reason: "",
  });
}

try {
  main();
} catch (error) {
  console.error(`Could not derive the bug case: ${error.message}`);
  writeOutputs({
    has_test: false,
    target_spec: "",
    case_id: CASE_ID,
    live_status: "unverified",
    no_test_reason: `Could not derive the bug case: ${error.message}`,
  });
}
