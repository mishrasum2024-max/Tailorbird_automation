const {
  AUTOMATION_SUBPATH,
  CODE_PATH_PATTERN,
  isSafeRelativePath,
  git,
  readPlan,
  writeOutputs,
  writeWorkFile,
} = require("./lib/ticketBatch");

/*
 * ============================================================
 * CHECK EARLIER BATCH CODE
 * ============================================================
 *
 * Deterministic guard for batched tickets (ai-approved-ticket.yml):
 * the files earlier batches of this ticket created or changed may
 * only GROW in this batch. Any deleted or modified line in them
 * (git diff --numstat deletions > 0, working tree vs. the commit
 * this batch started from) is reported, so the PR is marked for
 * review. The earlier batch branch itself is never touched, so its
 * working code stays available as the backup either way.
 *
 * Reads .ai-batch/plan.json (previousCodeFiles, baseSha,
 * retriedFailingIds).
 * Outputs: earlier_code_intact (true | false | expected — changed
 *   while fixing re-selected failing cases in place), earlier_changed_files
 * Never exits non-zero.
 * ============================================================
 */

function main() {
  const plan = readPlan();
  const files = (plan?.previousCodeFiles || []).filter(file =>
    isSafeRelativePath(file, CODE_PATH_PATTERN)
  );

  if (!plan?.baseSha || !files.length) {
    console.log("No earlier batch code to check.");
    writeOutputs({ earlier_code_intact: true, earlier_changed_files: "" });
    return;
  }

  const numstat = git(["diff", "--numstat", plan.baseSha, "--", ...files]);
  const changed = numstat
    .split("\n")
    .filter(Boolean)
    .map(line => line.split("\t"))
    .filter(([, deleted]) => deleted === "-" || Number(deleted) > 0)
    .map(([, deleted, file]) => ({
      file: String(file).replace(`${AUTOMATION_SUBPATH}/`, ""),
      deleted,
    }));

  if (!changed.length) {
    console.log(
      `✅ ${files.length} earlier-batch file(s) only grew or are unchanged.`
    );
    writeWorkFile("earlier-code.md", "");
    writeOutputs({ earlier_code_intact: true, earlier_changed_files: "" });
    return;
  }

  changed.forEach(({ file, deleted }) =>
    console.log(`⚠️ ${file}: ${deleted} existing line(s) changed or removed`)
  );

  writeWorkFile(
    "earlier-code.md",
    changed.map(({ file, deleted }) => `- ${file}: ${deleted}`).join("\n")
  );

  // This batch re-selected cases an earlier batch automated but left
  // failing: fixing their existing tests in place changes earlier
  // files by design. Reported as "expected"; the re-run of the
  // earlier PASSING cases is what guards them in that case.
  const retried = plan.retriedFailingIds || [];

  if (retried.length) {
    console.log(
      `ℹ️ Expected: this batch fixes earlier failing cases in place (${retried.join(", ")}).`
    );
  }

  writeOutputs({
    earlier_code_intact: retried.length ? "expected" : false,
    earlier_changed_files: changed.map(({ file }) => file).join(","),
  });
}

try {
  main();
} catch (error) {
  console.warn(`Earlier-code check could not run: ${error.message}`);
  writeOutputs({ earlier_code_intact: "unknown", earlier_changed_files: "" });
}
