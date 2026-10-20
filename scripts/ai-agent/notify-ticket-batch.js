const path = require("path");
const {
  AUTOMATION_ROOT,
  splitIds,
  readJsonFile,
  readPlan,
} = require("./lib/ticketBatch");

/*
 * ============================================================
 * NOTIFY TICKET BATCH PROGRESS
 * ============================================================
 *
 * Posted by ai-approved-ticket.yml right after the usual PR-status
 * message (notify-slack-pr-status.js, unchanged). Adds the batch
 * view: which batch this was, what it was built on, whether earlier
 * batches still pass and their code is unchanged, and how many of
 * the ticket's generated cases are automated so far.
 *
 * Env: SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, TICKET_ID, PR_URL,
 *   TEST_STATUS, PASSED_TEST_CASES, FAILED_TEST_CASES,
 *   EARLIER_STATUS, EARLIER_FAILED_IDS, EARLIER_FLAKY_IDS,
 *   EARLIER_CODE_INTACT, EARLIER_CHANGED_FILES
 * Never exits non-zero.
 * ============================================================
 */

const GENERATED_FILE = path.join(
  AUTOMATION_ROOT,
  "data",
  "generated-testcases.json"
);
const MAX_LISTED = 25;

function shortList(ids) {
  if (!ids.length) return "none";

  const shown = ids.slice(0, MAX_LISTED).join(", ");

  return ids.length > MAX_LISTED
    ? `${shown} … (+${ids.length - MAX_LISTED} more)`
    : shown;
}

function earlierLine(plan) {
  if (!plan.previousPassedIds.length) return null;

  const failed = splitIds(process.env.EARLIER_FAILED_IDS);
  const flaky = splitIds(process.env.EARLIER_FLAKY_IDS);
  const total = plan.previousPassedIds.length;

  if (process.env.EARLIER_STATUS === "passed") {
    return (
      `*Earlier batches:* ✅ ${total}/${total} still passing` +
      (flaky.length ? ` (flaky on first try: ${shortList(flaky)})` : "")
    );
  }

  if (process.env.EARLIER_STATUS === "failed") {
    return plan.mode === "single-pr"
      ? `*Earlier batches:* ❌ broken: ${shortList(failed)} — the previous \`ai-batch/${plan.ticketId}/<N>\` tag has the working version.`
      : `*Earlier batches:* ❌ broken: ${shortList(failed)} — the earlier batch branch still has the working version.`;
  }

  return "*Earlier batches:* ⚠️ not re-run in this batch.";
}

function codeLine(plan) {
  if (!plan.previousCodeFiles.length) return null;

  if (process.env.EARLIER_CODE_INTACT === "false") {
    return `*Earlier code:* ⚠️ existing lines changed in ${process.env.EARLIER_CHANGED_FILES || "earlier files"}`;
  }

  if (process.env.EARLIER_CODE_INTACT === "expected") {
    return `*Earlier code:* ℹ️ changed only to fix re-selected failing cases (${shortList(plan.retriedFailingIds || [])}) in place`;
  }

  return "*Earlier code:* ✅ unchanged (only additions)";
}

function buildText(plan) {
  const passed = splitIds(process.env.PASSED_TEST_CASES);
  const failed = splitIds(process.env.FAILED_TEST_CASES);
  const generated = (readJsonFile(GENERATED_FILE, {}) || {}).testCases || [];
  const allIds = generated.map(testCase => testCase.id).filter(Boolean);
  const done = new Set([...plan.previousPassedIds, ...passed]);
  const remaining = allIds.filter(id => !done.has(id));

  const lines = [
    `🧩 *${plan.ticketId} — batch ${plan.batchNumber}*` +
      (plan.retryOfBatch ? " (retry)" : ""),
    plan.mode === "single-pr"
      ? `Branch \`${plan.batchBranch}\` — the ticket's single PR to main` +
        (plan.migratedFrom ? ` (started from \`${plan.migratedFrom}\`)` : "")
      : `Branch \`${plan.batchBranch}\`, built on \`${plan.baseRef}\``,
    "",
    `*This batch:* ✅ ${passed.length} passed, ❌ ${failed.length} failed` +
      (failed.length ? ` (${shortList(failed)})` : ""),
    passed.length && failed.length
      ? plan.mode === "single-pr"
        ? `_Only the passing cases were added to the PR; the failed attempts are kept on \`${plan.wipBranch}\`. Re-select them to try again._`
        : "_Partial batch: the next batch builds on its passing cases; re-select the failed ones to fix them in place._"
      : null,
    plan.mode === "single-pr" && !passed.length && failed.length
      ? `_Nothing was added to the PR this time; the attempt is kept on \`${plan.wipBranch}\`._`
      : null,
    earlierLine(plan),
    codeLine(plan),
    allIds.length
      ? `*Progress:* ${done.size}/${allIds.length} generated cases automated and passing. ` +
        `Remaining: ${shortList(remaining)}`
      : null,
    process.env.PR_URL ? `*PR:* ${process.env.PR_URL}` : "*PR:* not created",
  ];

  if (plan.skippedFailingBranches?.length) {
    lines.push(
      `_Not built on (open but not passing): ${plan.skippedFailingBranches.join(", ")}_`
    );
  }

  return lines.filter(line => line !== null).join("\n");
}

// AI_FLOWS_V2: one-click next batch. "Retry failed" = cases selected
// in this or an earlier batch that are still not passing (failing or
// never written); "Automate all remaining" = every generated case not
// passing yet. Handled by automate_failed_cases /
// automate_remaining_cases in scripts/slack-http-agent.js, which
// dispatches ai-approved-ticket.yml exactly like the checkbox flow.
// Button value: TICKET|GENERATION_RUN_ID|owner/repo|TC001,TC002
const MAX_BUTTON_VALUE = 1900; // Slack limit is 2000.

function nextBatchButtons(plan) {
  const generationRunId = String(process.env.GENERATION_RUN_ID || "").trim();

  if (process.env.AI_FLOWS_V2 !== "true" || !generationRunId) return null;

  const passed = splitIds(process.env.PASSED_TEST_CASES);
  const failed = splitIds(process.env.FAILED_TEST_CASES);
  const generated = (readJsonFile(GENERATED_FILE, {}) || {}).testCases || [];
  const allIds = generated.map(testCase => testCase.id).filter(Boolean);
  // Passed in an earlier batch counts as done unless it failed again
  // in this batch (previousPassedIds leaves out re-selected cases).
  const everPassed = (plan.priorBatches || []).flatMap(batch => batch.passedIds || []);
  const done = new Set([
    ...plan.previousPassedIds,
    ...passed,
    ...everPassed.filter(id => !failed.includes(id)),
  ]);
  const retryIds = [
    ...new Set([
      ...(plan.knownFailingIds || []),
      ...(plan.notWrittenIds || []),
      ...failed,
    ]),
  ].filter(id => !done.has(id));
  const remainingIds = allIds.filter(id => !done.has(id));
  const repo = String(process.env.GH_REPO_FULL || "").trim();
  const value = ids =>
    `${plan.ticketId}|${generationRunId}|${repo}|${ids.join(",")}`;
  const buttons = [];

  if (retryIds.length && value(retryIds).length <= MAX_BUTTON_VALUE) {
    buttons.push({
      type: "button",
      style: "primary",
      action_id: "automate_failed_cases",
      text: { type: "plain_text", text: `🔁 Retry failed cases (${retryIds.length})` },
      value: value(retryIds),
    });
  }

  if (
    remainingIds.length &&
    remainingIds.join(",") !== retryIds.join(",") &&
    value(remainingIds).length <= MAX_BUTTON_VALUE
  ) {
    buttons.push({
      type: "button",
      action_id: "automate_remaining_cases",
      text: { type: "plain_text", text: `▶️ Automate all remaining (${remainingIds.length})` },
      value: value(remainingIds),
    });
  }

  return buttons.length
    ? { type: "actions", block_id: "next_batch_actions", elements: buttons }
    : null;
}

async function main() {
  const plan = readPlan();
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!plan || !token || !channel) {
    console.log("No batch plan or Slack config; skipping batch progress.");
    return;
  }

  const text = buildText(plan);

  console.log(text);

  // Without buttons the message is posted exactly as before (text only).
  const buttons = nextBatchButtons(plan);
  const payload = buttons
    ? {
        channel,
        text,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } },
          buttons,
        ],
      }
    : { channel, text };

  if (buttons) {
    buttons.elements.forEach(button =>
      console.log(`Button: ${button.text.text} -> ${button.value.split("|").pop()}`)
    );
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));

  if (!result.ok) {
    console.warn(`Slack post failed: ${result.error || response.status}`);
  }
}

main().catch(error =>
  console.warn(`Could not post batch progress: ${error.message}`)
);
