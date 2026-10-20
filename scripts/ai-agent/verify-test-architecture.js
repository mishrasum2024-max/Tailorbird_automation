const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * VERIFY TEST ARCHITECTURE
 * ============================================================
 *
 * Scans changed tests/*.js spec files for direct use of the raw
 * Playwright `page` object for interactions or locators. Per
 * repo convention:
 *
 *   locators/*.js  -> all selectors
 *   pages/*.js     -> all interactions, using those locators
 *   tests/*.js     -> calls page-object methods ONLY
 *
 * This is a heuristic regex check, not a full static analyzer.
 * It flags likely violations for human review — it does not
 * hard-fail the workflow, since some edge cases (rare, deliberate
 * inline assertions) may be legitimate.
 * ============================================================
 */

// Patterns that indicate a spec file is talking to `page` directly
// instead of going through a page-object method.
const VIOLATION_PATTERNS = [
  { name: "page.locator(", regex: /\bpage\.locator\(/ },
  { name: "page.getByRole(", regex: /\bpage\.getByRole\(/ },
  { name: "page.getByText(", regex: /\bpage\.getByText\(/ },
  { name: "page.getByLabel(", regex: /\bpage\.getByLabel\(/ },
  { name: "page.getByTestId(", regex: /\bpage\.getByTestId\(/ },
  { name: "page.getByPlaceholder(", regex: /\bpage\.getByPlaceholder\(/ },
  { name: "page.click(", regex: /\bpage\.click\(/ },
  { name: "page.fill(", regex: /\bpage\.fill\(/ },
  { name: "page.check(", regex: /\bpage\.check\(/ },
  { name: "page.uncheck(", regex: /\bpage\.uncheck\(/ },
  { name: "page.selectOption(", regex: /\bpage\.selectOption\(/ },
  { name: "page.$(", regex: /\bpage\.\$\(/ },
  { name: "page.\\$\\$(", regex: /\bpage\.\$\$\(/ },
];

function getChangedSpecFiles() {
  let output;

  try {
    output = execSync(
      "git status --porcelain -- tests/",
      { encoding: "utf8" }
    );
  } catch (error) {
    console.error(
      "❌ Failed to run git status:",
      error.message
    );
    return [];
  }

  // `git status --porcelain` reports paths relative to the REPO ROOT,
  // not the current working directory (CI-verified 2026-09-22 — this
  // silently made getChangedSpecFiles() return [] on every real run,
  // since this job's working-directory is a subdirectory of the repo:
  // the porcelain path and fs.existsSync()'s CWD-relative check never
  // agreed). Resolving through the repo root fixes that regardless of
  // which directory this script is invoked from.
  let repoRoot;
  try {
    repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch (error) {
    console.error("❌ Failed to resolve repo root:", error.message);
    return [];
  }
  const cwd = process.cwd();

  return output
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/\s+/).pop())
    .filter(file => file.endsWith(".js"))
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- repoRelativePath comes from this same CI job's own `git status --porcelain` output for the repository it just checked out, not external/attacker-controlled input; repoRoot is resolved via `git rev-parse --show-toplevel` on that same checkout, so the joined path can only ever land inside this job's own working copy.
    .map(repoRelativePath => path.relative(cwd, path.join(repoRoot, repoRelativePath)))
    .filter(file => fs.existsSync(file));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  const violations = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Skip comments — best-effort, not a full parser.
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      return;
    }

    // test.use({ storageState: ... }) is explicitly allowed.
    if (trimmed.includes("test.use(")) {
      return;
    }

    for (const pattern of VIOLATION_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          file: filePath,
          lineNumber: index + 1,
          snippet: trimmed.slice(0, 120),
          pattern: pattern.name,
        });
      }
    }
  });

  return violations;
}

const VIOLATIONS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "architecture-violations.json"
);

function writeViolationsFile(violations) {
  const outputDir = path.dirname(VIOLATIONS_FILE);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    VIOLATIONS_FILE,
    JSON.stringify(violations, null, 2),
    "utf8"
  );
}

function main() {
  console.log("======================================");
  console.log("VERIFYING TEST ARCHITECTURE");
  console.log("======================================");

  const changedSpecFiles = getChangedSpecFiles();

  if (!changedSpecFiles.length) {
    console.log("No changed spec files to check.");
    console.log("architecture_status=skipped");
    return;
  }

  console.log(`Checking ${changedSpecFiles.length} spec file(s):`);
  changedSpecFiles.forEach(file => console.log(`  - ${file}`));
  console.log("");

  let allViolations = [];

  changedSpecFiles.forEach(file => {
    const violations = scanFile(file);
    allViolations = allViolations.concat(violations);
  });

  if (!allViolations.length) {
    console.log("✅ No raw page/locator usage found in spec files.");
    console.log("All interactions appear to go through page-object methods.");
    console.log("");
    console.log("architecture_status=clean");
    return;
  }

  console.log(
    `⚠️ Found ${allViolations.length} possible architecture violation(s):`
  );
  console.log("");

  writeViolationsFile(allViolations);

  allViolations.forEach(v => {
    console.log(`${v.file}:${v.lineNumber}`);
    console.log(`  Pattern: ${v.pattern}`);
    console.log(`  Line: ${v.snippet}`);
    console.log("");
  });

  console.log(
    "These spec files appear to interact with the raw `page` object " +
    "directly instead of calling page-object methods. Per repo " +
    "convention, locators belong in locators/*.js and interactions " +
    "belong in pages/*.js — spec files should only call page-object " +
    "methods."
  );
  console.log("");
  console.log("architecture_status=violations");
  console.log(`architecture_violation_count=${allViolations.length}`);
}

module.exports = {
  getChangedSpecFiles,
  scanFile,
  VIOLATIONS_FILE,
};

if (require.main === module) {
  main();
}