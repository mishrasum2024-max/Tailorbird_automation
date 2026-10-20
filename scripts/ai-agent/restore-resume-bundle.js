const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * RESTORE RESUME BUNDLE
 * ============================================================
 *
 * Counterpart of build-resume-bundle.js. Used when a run was
 * started from Slack with "Retry with previous data"
 * (resume_mode=reuse): the workflow downloads the failed run's
 * `resume-bundle` artifact into BUNDLE_DIR and this script puts
 * its contents back into the working tree.
 *
 *   code      git apply --3way of generated-code.patch, then the
 *             untracked files. If the patch no longer applies
 *             (main moved on and conflicts), the code dirs are reset
 *             and code_restored=false — the run then just generates
 *             code from scratch.
 *   records   data/ files copied back (minus RESUME_SKIP_RECORDS —
 *             pipeline files the new run regenerates itself).
 *   sessions  storageState files copied back. The workflow still
 *             runs check-cached-session.js on them, so an expired
 *             session falls back to a fresh login.
 *
 * It also writes data/resume-context.md, which the workflows
 * prepend to Claude's prompt so it continues from the restored
 * code instead of starting over.
 *
 * Env vars:
 *   BUNDLE_DIR            Required. Where the artifact was downloaded.
 *   RESUME_SKIP_RECORDS   Comma separated data/ file names not to
 *                         restore.
 *
 * Never exits non-zero: anything that can't be restored just
 * reports false, and the run carries on as a fresh run for it.
 *
 * Output ($GITHUB_OUTPUT): bundle_found, code_restored,
 *   records_restored, sessions_restored, testcases_restored,
 *   resume_failed_ids, resume_passed_ids
 * ============================================================
 */

const AUTOMATION_ROOT = path.join(__dirname, "..", "..");
const CONTEXT_FILE = path.join(AUTOMATION_ROOT, "data", "resume-context.md");
const CODE_PATHS = [
  "tests",
  "pages",
  "locators",
  "utils",
  "fixture",
  "playwright.config.js",
  "package.json",
];

function writeOutputs(outputs) {
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  console.log(text);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${text}\n`);
  }
}

function git(args, cwd = AUTOMATION_ROOT) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Bundle contents come from an artifact — never let a crafted path
// escape the automation folder: reject absolute paths, `..` segments
// and NUL bytes up front, then re-check containment after resolving.
function safeTarget(relativePath) {
  const normalized = path.posix.normalize(String(relativePath));

  if (
    !normalized ||
    normalized.includes("\0") ||
    path.isAbsolute(relativePath) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Refusing unsafe path from bundle: ${relativePath}`);
  }

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- normalized has just been rejected if absolute or containing `..`, and the result is verified to stay inside AUTOMATION_ROOT right below.
  const target = path.resolve(AUTOMATION_ROOT, normalized);

  if (
    target !== AUTOMATION_ROOT &&
    !target.startsWith(AUTOMATION_ROOT + path.sep)
  ) {
    throw new Error(
      `Refusing to restore outside ${AUTOMATION_ROOT}: ${relativePath}`
    );
  }

  return target;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const found = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Symlinks in a downloaded bundle could point anywhere — skip them.
    if (entry.isSymbolicLink()) {
      continue;
    }

    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- entry.name is a single directory-entry name returned by fs.readdirSync (it cannot contain a path separator), and every file found is written only through safeTarget(), which enforces containment.
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...listFiles(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }

  return found;
}

// Always restores into AUTOMATION_ROOT (enforced by safeTarget).
function copyTree(sourceRoot, skip = () => false) {
  const restored = [];

  for (const file of listFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file).split(path.sep).join("/");

    if (skip(relative)) {
      continue;
    }

    const target = safeTarget(relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    restored.push(relative);
  }

  return restored;
}

// Per path: one pathspec missing from HEAD must not stop the rest.
function eachCodePath(args) {
  for (const codePath of CODE_PATHS) {
    try {
      git([...args, codePath]);
    } catch (error) {
      // Path not present / nothing to do — fine.
    }
  }
}

function resetCodePaths() {
  eachCodePath(["reset", "-q", "--"]);
  eachCodePath(["checkout", "HEAD", "--"]);
  eachCodePath(["clean", "-fdq", "--"]);
}

function restoreCode(bundleDir) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- bundleDir is BUNDLE_DIR, set by the workflow itself (runner.temp), joined with a fixed literal.
  const codeDir = path.join(bundleDir, "code");
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- codeDir derives from the workflow-controlled BUNDLE_DIR; joined with a fixed literal filename.
  const patchFile = path.join(codeDir, "generated-code.patch");
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- codeDir derives from the workflow-controlled BUNDLE_DIR; joined with a fixed literal folder name.
  const untrackedDir = path.join(codeDir, "untracked");

  if (!fs.existsSync(patchFile) && !fs.existsSync(untrackedDir)) {
    console.log("ℹ️ Bundle has no generated code.");
    return { restored: false, files: [] };
  }

  if (fs.existsSync(patchFile)) {
    try {
      // Patch paths are repo-root relative (git diff output), so apply
      // from the top level rather than from the automation folder.
      const topLevel = git(["rev-parse", "--show-toplevel"]).trim();
      git(["apply", "--3way", "--whitespace=nowarn", patchFile], topLevel);
      console.log("✅ Applied generated-code.patch.");
    } catch (error) {
      console.error("⚠️ generated-code.patch does not apply on this commit:");
      console.error(String(error.stderr || error.message));
      console.error(
        "Resetting code folders — this run will generate code fresh."
      );
      resetCodePaths();
      return { restored: false, files: [], conflict: true };
    }
  }

  const files = copyTree(untrackedDir);

  // git apply --3way stages what it applied; unstage so the later
  // `git status --porcelain` / staging logic sees a normal working tree.
  eachCodePath(["reset", "-q", "--"]);

  return { restored: true, files };
}

function buildContext(manifest, code, records, sessions) {
  const failed = manifest.failedTestCases || [];
  const passed = manifest.passedTestCases || [];
  const codeFiles = manifest.contents?.codeFiles || [];

  const out = [
    "# RESUMING A PREVIOUS ATTEMPT",
    "",
    "The user chose to retry this ticket WITH the previous run's data.",
    "",
    `- Previous run: ${manifest.runUrl || manifest.runId || "unknown"}`,
    `- Workflow: ${manifest.stage}, snapshot taken: ${manifest.checkpoint}`,
    `- Previous job status: ${manifest.jobStatus || "unknown"}`,
    `- Previous test status: ${manifest.testStatus || "unknown"}`,
    `- Previously passing: ${passed.join(", ") || "none recorded"}`,
    `- Previously failing: ${failed.join(", ") || "none recorded"}`,
    "",
  ];

  if (code.restored) {
    out.push(
      "## Code already in the working tree",
      "",
      "The code generated by the previous attempt has been restored:",
      "",
      ...codeFiles.map(file => `- ${file}`),
      "",
      "Continue from this code — do NOT start over:",
      "",
      "1. Read the restored files first.",
      "2. Keep test cases that already pass unchanged.",
      "3. Implement any selected test case that is still missing.",
      "4. Fix the failing ones (see data/test-failure-details.json if present).",
      "5. Do not create duplicate spec files, page objects or locators for",
      "   code that already exists above.",
      ""
    );
  } else if (code.conflict) {
    out.push(
      "The previous attempt's code could NOT be re-applied on the current",
      "commit (the files changed since). Generate the code fresh.",
      ""
    );
  }

  if (records.length) {
    out.push(
      "## Records restored into data/",
      "",
      "Records created by the previous attempt (they may be stale — verify",
      "a record still exists in the app before depending on it):",
      "",
      ...records.map(file => `- ${file}`),
      ""
    );
  }

  if (sessions.length) {
    out.push(
      `Previous authenticated sessions restored: ${sessions.join(", ")}.`,
      ""
    );
  }

  return out.join("\n");
}

function main() {
  const bundleDir = path.resolve(process.env.BUNDLE_DIR || "");
  const manifestFile = path.join(bundleDir, "manifest.json");

  if (!process.env.BUNDLE_DIR || !fs.existsSync(manifestFile)) {
    console.log("ℹ️ No resume bundle found — continuing as a fresh run.");
    writeOutputs({
      bundle_found: false,
      code_restored: false,
      records_restored: false,
      sessions_restored: false,
      testcases_restored: false,
      resume_failed_ids: "",
      resume_passed_ids: "",
    });
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

  console.log("======================================");
  console.log("RESTORING PREVIOUS RUN DATA");
  console.log("======================================");
  console.log(`From run:   ${manifest.runUrl || manifest.runId}`);
  console.log(`Stage:      ${manifest.stage} (${manifest.checkpoint})`);
  console.log(`Ticket:     ${manifest.ticketId}`);

  const skip = new Set(
    (process.env.RESUME_SKIP_RECORDS || "")
      .split(",")
      .map(name => name.trim())
      .filter(Boolean)
  );

  const code = restoreCode(bundleDir);

  const records = copyTree(path.join(bundleDir, "records"), relative =>
    skip.has(path.posix.basename(relative))
  );

  const sessions = copyTree(path.join(bundleDir, "sessions"));

  console.log(
    `Code restored:     ${code.restored} (${code.files.length} new file(s))`
  );
  console.log(`Records restored:  ${records.length}`);
  records.forEach(file => console.log(`  - ${file}`));
  console.log(`Sessions restored: ${sessions.join(", ") || "none"}`);

  fs.mkdirSync(path.dirname(CONTEXT_FILE), { recursive: true });
  fs.writeFileSync(
    CONTEXT_FILE,
    buildContext(manifest, code, records, sessions)
  );
  console.log(`Wrote ${path.relative(AUTOMATION_ROOT, CONTEXT_FILE)}`);

  writeOutputs({
    bundle_found: true,
    code_restored: code.restored,
    records_restored: records.length > 0,
    sessions_restored: sessions.length > 0,
    testcases_restored: records.includes("data/generated-testcases.json"),
    resume_failed_ids: (manifest.failedTestCases || []).join(","),
    resume_passed_ids: (manifest.passedTestCases || []).join(","),
  });
}

try {
  main();
} catch (error) {
  console.error(
    "⚠️ Failed to restore resume bundle — continuing as a fresh run:"
  );
  console.error(error.message);
  writeOutputs({
    bundle_found: false,
    code_restored: false,
    records_restored: false,
    sessions_restored: false,
    testcases_restored: false,
    resume_failed_ids: "",
    resume_passed_ids: "",
  });
}
