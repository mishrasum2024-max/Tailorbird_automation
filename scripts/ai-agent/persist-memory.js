const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/*
 * ============================================================
 * PERSIST AI AGENT MEMORY
 * ============================================================
 *
 * GitHub Actions runners are ephemeral: anything written to
 * Playwright/Tailorbird_UI_Automation/memory/*.json during a run
 * disappears when the runner is torn down unless it's explicitly
 * pushed somewhere durable.
 *
 * This script commits the current memory/*.json files directly
 * onto `main` (default; override with MEMORY_BRANCH), using a
 * temporary git worktree so it never disturbs whatever branch the
 * calling job currently has checked out (e.g. an in-progress
 * ai/<ticket>-tests PR branch). Because both workflows already
 * check out main at job start, main's own tree already contains
 * the memory/ folder by the time later steps run — no separate
 * "restore" step is needed.
 *
 * Pushes straight to main (no PR). If main moved between fetch
 * and push, it retries once against the new tip before giving up.
 *
 * Requires the job to have `contents: write` permission.
 * ============================================================
 */

const AUTOMATION_ROOT = path.join(__dirname, "..", "..");
const MEMORY_DIR = path.join(AUTOMATION_ROOT, "memory");
const MEMORY_SUBPATH = "Playwright/Tailorbird_UI_Automation/memory";

const TARGET_BRANCH = process.env.MEMORY_BRANCH || "main";
const GIT_USER_NAME =
  process.env.MEMORY_GIT_USER_NAME || "tailorbird-ai-agent[bot]";
const GIT_USER_EMAIL =
  process.env.MEMORY_GIT_USER_EMAIL ||
  "tailorbird-ai-agent[bot]@users.noreply.github.com";
const COMMIT_LABEL = process.env.MEMORY_COMMIT_LABEL || "workflow run";
const MAX_ATTEMPTS = 2;

const README_CONTENT = [
  "# AI agent memory",
  "",
  "This folder is the AI test-generation/automation agent's",
  "persistent memory. It is written locally during a workflow run by",
  "`utils/playwrightMemory.js`, and committed here directly by",
  "`scripts/ai-agent/persist-memory.js` at the end of each AI",
  "workflow run, so learning survives across ephemeral GitHub",
  "Actions runners.",
  "",
  "- `testCases.json` — one entry per `ticketId::testCaseId`",
  "  (title, type, status, who selected it).",
  "- `executionLog.json` — start/end/pass-fail history per test case.",
  "- `patterns.json` — recurring error signatures and which test",
  "  cases hit them.",
  "- `fixHistory.json` — root cause + fix that resolved each recorded",
  "  error signature, with a full occurrence log across every ticket",
  "  it was seen on. Built by utils/playwrightMemory.js#recordFix and",
  "  read by scripts/ai-agent/build-memory-digest.js to remind future",
  "  runs how a matching failure was fixed before, so the same",
  "  mistake isn't rediscovered via the live browser each time.",
  "",
  "Nothing in this folder is ever deleted or expired — it is meant to",
  "accumulate forever across GitHub Actions runs.",
  "",
  "Do not hand-edit these files; they're regenerated/appended to by",
  "the AI agent workflows.",
  "",
].join("\n");

// Runs `git <args...>` via execFileSync (no shell involved, so none of
// these arguments — including ones built from env vars like
// TARGET_BRANCH/COMMIT_LABEL — can be interpreted as shell syntax).
function run(args, opts = {}) {
  console.log(`$ git ${args.join(" ")}`);
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function runInherit(args, opts = {}) {
  console.log(`$ git ${args.join(" ")}`);
  execFileSync("git", args, { stdio: "inherit", ...opts });
}

// Returns true on success, false if the push was rejected (branch moved).
function attemptPersist(memoryFiles) {
  const worktreeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ai-memory-")
  );

  try {
    run(["fetch", "origin", TARGET_BRANCH]);
    run(["worktree", "add", "--detach", worktreeDir, `origin/${TARGET_BRANCH}`]);

    const targetMemoryDir = path.join(worktreeDir, MEMORY_SUBPATH);
    fs.mkdirSync(targetMemoryDir, { recursive: true });

    memoryFiles.forEach(file => {
      // Sanitize: memoryFiles comes from fs.readdirSync(MEMORY_DIR), which
      // never returns anything but plain filenames — but validate strictly
      // (not just path.basename()) so a filename containing a path
      // separator or ".." is rejected outright rather than silently
      // stripped, and can never escape MEMORY_DIR/targetMemoryDir.
      if (!/^[A-Za-z0-9._-]+\.json$/.test(file) || path.basename(file) !== file) {
        throw new Error(`Refusing to persist unexpected memory filename: ${file}`);
      }

      // `file` is validated above against a strict allowlist regex and
      // confirmed equal to its own path.basename(), so it cannot contain
      // a path separator or "..".
      fs.copyFileSync(
        path.join(MEMORY_DIR, file), // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
        path.join(targetMemoryDir, file) // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
      );
    });

    fs.writeFileSync(
      path.join(targetMemoryDir, "README.md"),
      README_CONTENT
    );

    runInherit(["config", "user.name", GIT_USER_NAME], { cwd: worktreeDir });
    runInherit(["config", "user.email", GIT_USER_EMAIL], { cwd: worktreeDir });
    runInherit(["add", "--", MEMORY_SUBPATH], { cwd: worktreeDir });

    const status = run(
      ["status", "--porcelain", "--", MEMORY_SUBPATH],
      { cwd: worktreeDir }
    );

    if (!status) {
      console.log(
        "Memory unchanged since the last persisted run. Nothing to commit."
      );
      return true;
    }

    runInherit(
      ["commit", "-m", `Update AI agent memory (${COMMIT_LABEL})`],
      { cwd: worktreeDir }
    );

    try {
      runInherit(["push", "origin", `HEAD:${TARGET_BRANCH}`], {
        cwd: worktreeDir,
      });
      console.log(`✅ Memory persisted to branch: ${TARGET_BRANCH}`);
      return true;
    } catch (pushError) {
      console.warn(
        `Push to '${TARGET_BRANCH}' was rejected (branch likely moved ` +
        `since fetch): ${pushError.message}`
      );
      return false;
    }
  } finally {
    try {
      runInherit(["worktree", "remove", worktreeDir, "--force"]);
    } catch (error) {
      console.warn(
        `Could not clean up worktree at ${worktreeDir}: ${error.message}`
      );
    }
  }
}

function main() {
  if (!fs.existsSync(MEMORY_DIR)) {
    console.log("No memory directory found yet. Nothing to persist.");
    return;
  }

  const memoryFiles = fs
    .readdirSync(MEMORY_DIR)
    .filter(file => file.endsWith(".json"));

  if (!memoryFiles.length) {
    console.log("Memory directory is empty. Nothing to persist.");
    return;
  }

  console.log("======================================");
  console.log("PERSISTING AI AGENT MEMORY");
  console.log("======================================");
  console.log(`Target branch: ${TARGET_BRANCH}`);
  console.log(`Files: ${memoryFiles.join(", ")}`);

  try {
    run(["worktree", "prune"]);
  } catch (error) {
    // best-effort
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}...`);

    if (attemptPersist(memoryFiles)) {
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log("Retrying against the latest branch tip...");
    }
  }

  console.error(
    `❌ Could not push memory to '${TARGET_BRANCH}' after ${MAX_ATTEMPTS} ` +
    `attempt(s). This run's memory updates were not persisted.`
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("❌ Failed to persist AI agent memory.");
  console.error(error.message);
  // Never fail the workflow just because memory persistence failed.
  process.exit(0);
}
