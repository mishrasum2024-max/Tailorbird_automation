const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * BUILD RESUME BUNDLE
 * ============================================================
 *
 * GitHub Actions runners are ephemeral: if an AI workflow fails,
 * times out or is cancelled before its "commit + PR" step, the
 * code Claude generated, the records the tests created in the app
 * and the authenticated sessions all disappear with the runner.
 *
 * This script snapshots everything worth keeping into
 * .resume-bundle/ so the workflow can upload it as the
 * `resume-bundle` artifact (called with `if: always()`, and also
 * as mid-run checkpoints). A later run started from Slack with
 * "Retry with previous data" restores it via
 * restore-resume-bundle.js; the same artifact is what the Slack
 * "Download data" button links to.
 *
 * Layout:
 *   manifest.json            what's inside + run/ticket metadata
 *   code/generated-code.patch  git diff of code dirs vs BASE_SHA
 *   code/untracked/<path>    new, not-yet-committed code files
 *   records/<path>           changed/new data/ files (created records,
 *                            generated test cases, investigation notes)
 *   sessions/<file>          storageState files (auth cookies — the
 *                            artifact is access-controlled; never post
 *                            these anywhere else)
 *   logs/<file>              run logs passed via RESUME_EXTRA_FILES
 *
 * Env vars (all optional):
 *   RESUME_STAGE         Workflow that produced it, e.g.
 *                        "ai-approved-ticket.yml"
 *   RESUME_CHECKPOINT    Label for where in the run this was taken
 *                        ("after-generation", "final", ...)
 *   BASE_SHA             Commit the job checked out (github.sha).
 *                        Diffing against it (not HEAD) keeps working
 *                        after the PR step commits onto a branch.
 *   TICKET_ID, SELECTED_TEST_CASES, GENERATION_RUN_ID,
 *   JOB_STATUS, TEST_STATUS, PASSED_TEST_CASES, FAILED_TEST_CASES
 *   RESUME_EXTRA_FILES   Newline/comma separated absolute paths
 *                        (globs not supported) copied into logs/.
 *
 * Never exits non-zero — a snapshot failure must not turn a
 * passing run into a failing one.
 *
 * Output ($GITHUB_OUTPUT): has_code, has_records, has_sessions
 * ============================================================
 */

const AUTOMATION_ROOT = path.join(__dirname, "..", "..");
const BUNDLE_DIR = path.join(AUTOMATION_ROOT, ".resume-bundle");

const CODE_PATHS = ["tests", "pages", "locators", "utils", "fixture"];
const CODE_FILES = ["playwright.config.js", "package.json"];
const RECORD_PATHS = ["data"];

// Scratch folders the workflows download other artifacts into.
const RECORD_EXCLUDE_PREFIXES = [
  "data/generated-testcases-artifact/",
  "data/session-bundle-artifact/",
  "data/resume-bundle-artifact/",
];

const SESSION_FILES = [
  "sessionState.json",
  "OtherSessionState.json",
  "OneOrganizationUserSessionState.json",
  "vendorsession.json",
];

function git(args) {
  return execFileSync("git", args, {
    cwd: AUTOMATION_ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function lines(text) {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

// relativePath always comes from `git diff --name-only` /
// `git ls-files` (or the fixed SESSION_FILES list) — still reject
// anything absolute or containing `..` before touching the disk.
function assertRepoRelative(relativePath) {
  const normalized = path.posix.normalize(String(relativePath));

  if (
    !normalized ||
    normalized.includes("\0") ||
    path.isAbsolute(relativePath) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Refusing unsafe path: ${relativePath}`);
  }

  return normalized;
}

function copyInto(relativePath, targetRoot) {
  const safeRelative = assertRepoRelative(relativePath);

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- safeRelative is a git-reported repo path validated by assertRepoRelative (no absolute path, no `..`), joined onto this script's own fixed AUTOMATION_ROOT.
  const source = path.join(AUTOMATION_ROOT, safeRelative);

  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    return false;
  }

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- targetRoot is always a hardcoded subfolder of BUNDLE_DIR (code/untracked, records, sessions) and safeRelative is validated by assertRepoRelative above.
  const target = path.join(targetRoot, safeRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function resolveBaseSha() {
  const fromEnv = (process.env.BASE_SHA || "").trim();

  if (fromEnv) {
    return fromEnv;
  }

  return git(["rev-parse", "HEAD"]).trim();
}

function snapshotCode(baseSha) {
  const codeDir = path.join(BUNDLE_DIR, "code");
  fs.mkdirSync(codeDir, { recursive: true });

  const pathspec = [...CODE_PATHS, ...CODE_FILES];

  // Diff base commit -> working tree: covers both uncommitted edits
  // and anything the PR step already committed onto its branch.
  const patch = git(["diff", "--binary", baseSha, "--", ...pathspec]);
  const changedFiles = lines(
    git(["diff", "--relative", "--name-only", baseSha, "--", ...pathspec])
  );

  if (patch.trim()) {
    fs.writeFileSync(path.join(codeDir, "generated-code.patch"), patch);
  }

  const untrackedFiles = lines(
    git(["ls-files", "--others", "--exclude-standard", "--", ...pathspec])
  ).filter(file => copyInto(file, path.join(codeDir, "untracked")));

  return {
    changedFiles,
    untrackedFiles,
    hasPatch: Boolean(patch.trim()),
  };
}

function snapshotRecords(baseSha) {
  const recordsDir = path.join(BUNDLE_DIR, "records");

  const candidates = [
    ...lines(
      git(["diff", "--relative", "--name-only", baseSha, "--", ...RECORD_PATHS])
    ),
    ...lines(
      git(["ls-files", "--others", "--exclude-standard", "--", ...RECORD_PATHS])
    ),
  ];

  const files = [...new Set(candidates)]
    .filter(
      file => !RECORD_EXCLUDE_PREFIXES.some(prefix => file.startsWith(prefix))
    )
    .filter(file => copyInto(file, recordsDir));

  return files;
}

function snapshotSessions() {
  return SESSION_FILES.filter(file =>
    copyInto(file, path.join(BUNDLE_DIR, "sessions"))
  ).map(file => path.basename(file));
}

function snapshotLogs() {
  const logsDir = path.join(BUNDLE_DIR, "logs");

  const requested = (process.env.RESUME_EXTRA_FILES || "")
    .split(/[\n,]/)
    .map(entry => entry.trim())
    .filter(Boolean);

  const copied = [];

  for (const file of requested) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      continue;
    }

    fs.mkdirSync(logsDir, { recursive: true });
    fs.copyFileSync(file, path.join(logsDir, path.basename(file)));
    copied.push(path.basename(file));
  }

  return copied;
}

function splitIds(value) {
  return (value || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
}

function writeOutputs(outputs) {
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  console.log(text);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${text}\n`);
  }
}

function main() {
  fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });

  const baseSha = resolveBaseSha();

  const code = snapshotCode(baseSha);
  const records = snapshotRecords(baseSha);
  const sessions = snapshotSessions();
  const logs = snapshotLogs();

  const runId = process.env.GITHUB_RUN_ID || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const server = process.env.GITHUB_SERVER_URL || "https://github.com";

  const manifest = {
    version: 1,
    stage: process.env.RESUME_STAGE || "unknown",
    checkpoint: process.env.RESUME_CHECKPOINT || "final",
    createdAt: new Date().toISOString(),
    ticketId: process.env.TICKET_ID || "",
    selectedTestCases: splitIds(process.env.SELECTED_TEST_CASES),
    generationRunId: process.env.GENERATION_RUN_ID || "",
    runId,
    runUrl: runId && repo ? `${server}/${repo}/actions/runs/${runId}` : "",
    baseSha,
    jobStatus: process.env.JOB_STATUS || "",
    testStatus: process.env.TEST_STATUS || "",
    passedTestCases: splitIds(process.env.PASSED_TEST_CASES),
    failedTestCases: splitIds(process.env.FAILED_TEST_CASES),
    contents: {
      hasPatch: code.hasPatch,
      codeFiles: [...new Set([...code.changedFiles, ...code.untrackedFiles])],
      untrackedCodeFiles: code.untrackedFiles,
      recordFiles: records,
      sessionFiles: sessions,
      logFiles: logs,
    },
  };

  fs.writeFileSync(
    path.join(BUNDLE_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log("======================================");
  console.log(`RESUME BUNDLE (${manifest.checkpoint})`);
  console.log("======================================");
  console.log(`Base commit:   ${baseSha}`);
  console.log(`Code files:    ${manifest.contents.codeFiles.length}`);
  manifest.contents.codeFiles.forEach(file => console.log(`  - ${file}`));
  console.log(`Record files:  ${records.length}`);
  console.log(`Session files: ${sessions.length}`);
  console.log(`Log files:     ${logs.length}`);

  writeOutputs({
    has_code: manifest.contents.codeFiles.length > 0,
    has_records: records.length > 0,
    has_sessions: sessions.length > 0,
  });
}

try {
  main();
} catch (error) {
  console.error("⚠️ Failed to build resume bundle (continuing):");
  console.error(error.message);
  writeOutputs({ has_code: false, has_records: false, has_sessions: false });
}
