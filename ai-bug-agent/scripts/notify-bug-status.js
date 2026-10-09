const { WebClient } = require("@slack/web-api");
const bugConfig = require("./lib/bugConfig");

/*
 * ============================================================
 * NOTIFY BUG STATUS
 * ============================================================
 *
 * Posts a run status message to the BUG channel. The feature
 * agent's notify-slack-pr-status.js is not reused because it posts
 * to SLACK_CHANNEL_ID with feature resume buttons. Retry buttons
 * for the bug agent arrive in Phase 4.
 *
 * Env:
 *   NOTIFY_KIND   "generation" (Phase 2 failure) |
 *                 "automation" (single-case mode: PR result, any status)
 *   BUG_ID, JOB_STATUS, RUN_URL
 *   automation only: PR_URL, PR_STATUS, TEST_STATUS, LIVE_STATUS,
 *                    CASE_RESULTS (regression-set, optional),
 *                    MANDATORY_STATUS (optional), TARGET_SPEC,
 *                    NO_TEST_REASON (single mode: no test was added)
 * ============================================================
 */

const KIND_LABELS = {
  generation: "Regression test-case generation",
  automation:
    process.env.BUG_AGENT_MODE === "regression-set"
      ? "Regression test automation"
      : "Bug replication and automation",
};

const TEST_STATUS_LINES = {
  passed: "✅ The bug test PASSED on BASE_URL.",
  failed: "❌ The bug test FAILED on BASE_URL.",
  skipped: "⚠️ The bug test was not run.",
};

// Single mode raises a PR only when the bug test passes; say why not.
function noPrReason(testStatus) {
  if (process.env.NO_TEST_REASON) {
    return `No PR was raised: no bug test was added. Claude reported: ${process.env.NO_TEST_REASON}`;
  }
  if (testStatus !== "failed") return "No PR was created.";
  if (process.env.LIVE_STATUS === "still_reproduces") {
    return "No PR was raised: the bug still reproduces on BASE_URL, so the correct-behavior test fails.";
  }

  return "No PR was raised: the test did not pass after the repair attempts. Check the run logs.";
}

function failureText(label, bugId, jobStatus, runUrl) {
  const icon = jobStatus === "cancelled" ? "⏹️" : "❌";

  // Set when the append-only guard stopped the run (no PR is opened).
  const appendProblems = process.env.APPEND_PROBLEMS
    ? `*Append-only check failed* — the test was not opened as a PR because:\n` +
      process.env.APPEND_PROBLEMS.split(" | ")
        .map(problem => `• ${problem}`)
        .join("\n") +
      "\n\n"
    : "";

  return (
    `${icon} *${label} ${jobStatus === "cancelled" ? "was cancelled" : "failed"} for ${bugId}.*\n\n` +
    appendProblems +
    (runUrl ? `<${runUrl}|Open the workflow run> for logs.\n` : "") +
    "Fix the cause, then approve the bug again from the bug list (`/ai-bug-selection`)."
  );
}

function automationText(label, bugId, runUrl) {
  const prUrl = process.env.PR_URL || "";
  const testStatus = process.env.TEST_STATUS || "skipped";

  const lines = [
    `🐞 *${label} for ${bugId}*`,
    "",
    `*Live status:* ${process.env.LIVE_STATUS || "unverified"}`,
    `*Spec (appended):* \`${process.env.TARGET_SPEC || "—"}\``,
    process.env.NO_TEST_REASON
      ? "⚠️ No bug test was added, so nothing was run."
      : TEST_STATUS_LINES[testStatus] || TEST_STATUS_LINES.skipped,
    ...(process.env.CASE_RESULTS
      ? [`*Cases:* ${process.env.CASE_RESULTS}`]
      : []),
    ...(process.env.MANDATORY_STATUS
      ? [`*Mandatory tests:* ${process.env.MANDATORY_STATUS}`]
      : []),
    "",
    prUrl
      ? `*PR (${process.env.PR_STATUS || "created"}):* ${prUrl}`
      : noPrReason(testStatus),
  ];

  if (runUrl) lines.push(`<${runUrl}|Open the workflow run>`);

  return lines.join("\n");
}

async function main() {
  const kind = process.env.NOTIFY_KIND || "generation";
  const bugId = process.env.BUG_ID || "unknown bug";
  const jobStatus = process.env.JOB_STATUS || "failure";
  const runUrl = process.env.RUN_URL || "";
  const label = KIND_LABELS[kind] || kind;

  const text =
    kind === "automation" && jobStatus === "success"
      ? automationText(label, bugId, runUrl)
      : failureText(label, bugId, jobStatus, runUrl);

  const slack = new WebClient(bugConfig.slackBotToken);

  await slack.chat.postMessage({ channel: bugConfig.slackChannelId, text });

  console.log(`Posted ${kind} ${jobStatus} notice for ${bugId}.`);
}

main().catch(error => {
  // Never mask the original failure with a notification failure.
  console.error(
    "⚠️ Could not post bug status to Slack:",
    error.data?.error || error.message
  );
});
