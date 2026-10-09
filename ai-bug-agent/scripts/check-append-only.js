const { execFileSync } = require("child_process");
const fs = require("fs");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * CHECK APPEND-ONLY (single mode step B + regression-set automation)
 * ============================================================
 *
 * Deterministic gate after Claude automated the bug case, so the
 * "append to the existing spec, never change existing code" rule
 * does not rest on Claude alone:
 *
 *   - no existing line deleted or changed under tests/, pages/,
 *     locators/ or fixture/ (git numstat deletions must be 0)
 *   - under tests/, only the chosen targetSpec changed
 *   - no new spec file was created
 *   - the targetSpec gained a test titled with EVERY case ID in
 *     bug-testcases.json (one in single mode; the Slack selection
 *     in regression-set mode)
 *
 * Run from Playwright/Tailorbird_UI_Automation. Writes
 * append_only=true|false and has_changes=true|false to
 * $GITHUB_OUTPUT. Exits 1 with every problem listed on violation.
 * ============================================================
 */

const WATCHED_DIRS = ["tests", "pages", "locators", "fixture"];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function writeOutput(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);

  lines.forEach(line => console.log(line));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${lines.join("\n")}\n`,
      "utf8"
    );
}

function main() {
  console.log("======================================");
  console.log("CHECKING APPEND-ONLY CHANGES");
  console.log("======================================");

  const data = JSON.parse(fs.readFileSync(paths.TESTCASES_JSON, "utf8"));
  const targetSpec = data.targetSpec;
  const caseIds = (data.testCases || [])
    .map(testCase => testCase.id)
    .filter(Boolean);
  const problems = [];

  // --relative: paths are relative to this directory, like targetSpec.
  const numstat = git([
    "diff",
    "--numstat",
    "--relative",
    "HEAD",
    "--",
    ...WATCHED_DIRS,
  ])
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const [added, deleted, file] = line.split("\t");

      return { added, deleted, file };
    });

  const untracked = git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...WATCHED_DIRS,
  ])
    .split("\n")
    .filter(Boolean);

  for (const { added, deleted, file } of numstat) {
    console.log(`  modified  ${file}  (+${added} -${deleted})`);

    if (deleted !== "0")
      problems.push(
        `${file}: ${deleted} existing line(s) deleted or changed (append-only).`
      );
    if (file.startsWith("tests/") && file !== targetSpec) {
      problems.push(
        `${file}: only the target spec (${targetSpec}) may change under tests/.`
      );
    }
  }

  for (const file of untracked) {
    console.log(`  new       ${file}`);

    if (file.startsWith("tests/"))
      problems.push(
        `${file}: new files under tests/ are not allowed (append to ${targetSpec}).`
      );
  }

  const hasChanges = numstat.length > 0 || untracked.length > 0;
  const specChanged = numstat.some(({ file }) => file === targetSpec);

  if (!specChanged) {
    problems.push(
      `${targetSpec} was not changed: the bug test was not appended.`
    );
  } else {
    const addedLines = git(["diff", "--relative", "HEAD", "--", targetSpec])
      .split("\n")
      .filter(line => line.startsWith("+") && !line.startsWith("+++"))
      .join("\n");

    caseIds
      .filter(caseId => !addedLines.includes(caseId))
      .forEach(caseId =>
        problems.push(
          `${targetSpec}: no added test title contains "${caseId}".`
        )
      );
  }

  // `problems` (one line) lets the workflow tell Slack WHY it failed.
  writeOutput({
    has_changes: hasChanges,
    append_only: problems.length === 0,
    problems: problems.join(" | ").replace(/[\r\n]+/g, " "),
  });

  if (problems.length) {
    console.error("❌ Append-only check failed:");
    problems.forEach(problem => console.error(`  - ${problem}`));
    process.exit(1);
  }

  console.log(
    `✅ Append-only: ${caseIds.join(", ")} added to ${targetSpec}; no existing line changed.`
  );
}

main();
