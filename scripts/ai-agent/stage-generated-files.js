const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * STAGE GENERATED FILES
 * ============================================================
 *
 * CI-observed bug (FEAT-1170 run, 2026-09-22): the "Commit generated
 * tests and open a PR" workflow step only ever ran `git add tests/`,
 * so when Claude Code created/modified files outside tests/ — a new
 * data/*.json fixture, plus edits to pages/*.js and locators/*.js —
 * only the one spec file under tests/ was committed and pushed. The
 * other 3 files existed only in that CI runner's ephemeral filesystem
 * and were lost the moment the job ended (confirmed via `git diff
 * --stat` on the actual pushed commit: 1 file, 141 insertions, vs the
 * 4 files Claude's own end-of-run report said it created/modified).
 * The resulting PR was broken — the pushed spec file calls page-object
 * methods and reads a data fixture that were never committed.
 *
 * Explicit goal: every file the AI agent generates or modifies for a
 * run must be staged and pushed, full stop — not a hardcoded/fixed
 * list of paths, since every ticket produces differently-named files,
 * and not gated on Claude reliably self-reporting every file either
 * (the separate live-browser repair step, prepare-repair-prompt.js,
 * does NOT ask Claude for a Files Created/Modified report at all, so
 * a repair attempt's edits would never appear in one).
 *
 * PRIMARY mechanism (always runs, not a fallback): stage every file
 * `git status` reports as changed under the directories AI-generated
 * test code legitimately lives in — tests/, pages/, locators/,
 * fixture/ — in full, plus any NEWLY CREATED (untracked) file under
 * data/ that isn't one of this workflow's own known scratch files
 * (DATA_DIR_EXCLUDES below — ticket context, memory digest, the
 * Claude prompt itself, downloaded artifacts, mandatory-test-run
 * byproducts like projectData.json). A pre-existing tracked data/
 * file merely modified by the mandatory-test run is never staged
 * here, so that incidental side effect can't leak into the PR.
 *
 * `git status --porcelain` reports paths relative to the REPO ROOT
 * even when invoked from a subdirectory (confirmed empirically — this
 * differs from plain `git status --short`, which is CWD-relative, and
 * is also a latent bug already present in this same workflow's
 * verify-test-architecture.js, which does the CWD-relative comparison
 * this script does correctly). Every path is resolved to absolute
 * before any comparison, so this is correct regardless of which
 * directory it's invoked from.
 *
 * SECONDARY: if Claude's own "## Files Created" / "## Files Modified"
 * report is present in the given log file(s), it is parsed and cross-
 * logged (which reported files were/weren't actually staged) purely
 * for reviewer transparency — it is not required for staging to work.
 * ============================================================
 */

const ALWAYS_SAFE_DIRS = ["tests/", "pages/", "locators/", "fixture/"];

const DATA_DIR_EXCLUDES = [
  "data/current-ticket-context.json",
  "data/claude-test-generation-prompt.md",
  "data/claude-repair-prompt.md",
  "data/generated-testcases.json",
  "data/generated-testcases-artifact/",
  "data/investigation-status.json",
  "data/mandatory-test-cache.json",
  "data/memory-digest.md",
  "data/selected-testcases.json",
  "data/session-bundle-artifact/",
  "data/test-failure-details.json",
  "data/testcase-investigation-notes.json",
  "data/architecture-violations.json",
  // Per-run scratch files (record-repair-attempt-history.js: "meaningless
  // outside this one workflow run"; restore-resume-bundle.js: prompt context
  // of a resumed run) — they ended up in agent PRs as noise.
  "data/repair-attempt-history.json",
  "data/resume-context.md",
];

function getRepoRoot() {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
}

/** `git status --porcelain` entries as {statusCode, absPath}. */
function getChangedFiles(repoRoot) {
  let output;
  try {
    output = execSync("git status --porcelain", { encoding: "utf8" });
  } catch (error) {
    console.error("❌ Failed to run git status:", error.message);
    return [];
  }
  return output
    .split("\n")
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => ({
      statusCode: line.slice(0, 2).trim(),
      repoRelativePath: line.slice(3).trim().replace(/^"|"$/g, ""),
    }))
    .map(({ statusCode, repoRelativePath }) => ({
      statusCode,
      // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- repoRelativePath comes from this same CI job's own `git status --porcelain` output for the repository it just checked out, not external/attacker-controlled input; repoRoot is resolved via `git rev-parse --show-toplevel` on that same checkout, so the joined path can only ever land inside this job's own working copy.
      absPath: path.join(repoRoot, repoRelativePath),
    }));
}

function toCwdRelative(absPath, cwd) {
  return path.relative(cwd, absPath).split(path.sep).join("/");
}

function isUnderAnyDir(cwdRelativePath, dirs) {
  return dirs.some(
    dir =>
      cwdRelativePath === dir.replace(/\/$/, "") ||
      cwdRelativePath.startsWith(dir)
  );
}

function selectFilesToStage(changedFiles, cwd) {
  const staged = [];
  for (const { statusCode, absPath } of changedFiles) {
    const rel = toCwdRelative(absPath, cwd);
    if (rel.startsWith("..")) continue; // outside this job's working directory

    if (isUnderAnyDir(rel, ALWAYS_SAFE_DIRS)) {
      staged.push(absPath);
      continue;
    }
    if (rel.startsWith("data/")) {
      const isNew = statusCode === "??";
      const isExcluded = isUnderAnyDir(rel, DATA_DIR_EXCLUDES);
      if (isNew && !isExcluded) staged.push(absPath);
    }
  }
  return staged;
}

/**
 * Extracts every backtick-wrapped file path listed under a "## Files
 * Created" or "## Files Modified" heading, stopping each section at
 * the next heading. Only bullet-list lines count — a prose sentence
 * elsewhere in the section can itself contain a backtick-wrapped word
 * (verified against a real run's report) that is not a file path.
 */
function parseClaudeReportedFiles(logText) {
  const files = new Set();
  let inSection = false;
  for (const rawLine of logText.split("\n")) {
    const line = rawLine.trim();
    if (/^#{1,6}\s+Files\s+(Created|Modified)\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      inSection = false;
      continue;
    }
    if (inSection && /^[-*]\s/.test(line)) {
      const match = line.match(/`([^`]+)`/);
      if (match) files.add(match[1].trim());
    }
  }
  return [...files];
}

function readLogIfPresent(logPath) {
  try {
    return fs.readFileSync(logPath, "utf8");
  } catch {
    return null;
  }
}

/** Main log path plus any repair-attempt logs (glob-style, same /tmp dir). */
function findClaudeLogPaths(mainLogPath) {
  const paths = [];
  if (mainLogPath) paths.push(mainLogPath);
  const dir = mainLogPath ? path.dirname(mainLogPath) : "/tmp";
  try {
    for (const name of fs.readdirSync(dir)) {
      const safeName = path.basename(name);
      if (!/^repair-attempt-\d+\.log$/.test(safeName)) continue;
      paths.push(path.join(dir, safeName)); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- readdir + anchored filename regex; basename strips any path segments
    }
  } catch {
    // dir may not exist locally (e.g. outside CI) — fine, just skip.
  }
  return paths;
}

function main() {
  console.log("======================================");
  console.log("STAGING AI-GENERATED FILES");
  console.log("======================================");

  const repoRoot = getRepoRoot();
  const cwd = process.cwd();
  const changedFiles = getChangedFiles(repoRoot);
  const toStage = selectFilesToStage(changedFiles, cwd);
  const stagedRelSet = new Set(toStage.map(abs => toCwdRelative(abs, cwd)));

  // Informational only — logs what Claude itself claimed vs what was
  // actually staged, for reviewer transparency. Never gates staging.
  const logPaths = findClaudeLogPaths(
    process.env.CLAUDE_LOG_PATH || "/tmp/claude-test-generation.log"
  );
  const reportedFiles = new Set();
  for (const logPath of logPaths) {
    const text = readLogIfPresent(logPath);
    if (!text) continue;
    for (const f of parseClaudeReportedFiles(text)) reportedFiles.add(f);
  }
  if (reportedFiles.size) {
    console.log(
      `Claude reported ${reportedFiles.size} created/modified file(s) across ${logPaths.length} log(s):`
    );
    for (const f of reportedFiles) {
      console.log(
        `  - ${f}${stagedRelSet.has(f) ? "" : "  ⚠️  not staged (not under a tracked directory, or git shows no change)"}`
      );
    }
    console.log("");
  }

  if (!toStage.length) {
    console.log("No files to stage.");
    console.log("staged_file_count=0");
    return;
  }

  console.log(`Staging ${toStage.length} file(s):`);
  toStage.forEach(abs => console.log(`  - ${toCwdRelative(abs, cwd)}`));

  execSync(`git add -- ${toStage.map(f => JSON.stringify(f)).join(" ")}`, {
    stdio: "inherit",
  });

  console.log("");
  console.log(`staged_file_count=${toStage.length}`);
}

module.exports = {
  parseClaudeReportedFiles,
  selectFilesToStage,
  getChangedFiles,
  getRepoRoot,
  ALWAYS_SAFE_DIRS,
  DATA_DIR_EXCLUDES,
};

if (require.main === module) {
  main();
}
