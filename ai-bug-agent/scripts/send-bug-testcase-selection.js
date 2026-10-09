const fs = require("fs");
const { WebClient } = require("@slack/web-api");
const bugConfig = require("./lib/bugConfig");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * SEND BUG TEST-CASE SELECTION (Phase 2)
 * ============================================================
 *
 * Bug-agent counterpart of scripts/ai-agent/send-testcase-selection.js.
 * Posts the validated regression cases to the BUG channel:
 *
 *   - live status banner (fixed / still reproduces / ...)
 *   - root-cause hypothesis
 *   - target spec the tests will be APPENDED to, and why
 *   - one checkbox row per case, grouped by type
 *   - "Automate Selected Regression Tests" button
 *   - the rendered Markdown uploaded in the thread
 *
 * Action IDs (bug-specific, handled in ai-bug-agent/slack/):
 *   selected_bugcase_<RUN_ID>_<CASE_ID>   checkbox per case
 *   automate_bug_testcases                final button,
 *                                         value BUG_ID|RUN_ID|owner/repo
 *
 * At most 8 cases, so everything fits one message (< 50 blocks).
 *
 * Env: GITHUB_RUN_ID (set by Actions), GH_REPO_FULL
 * ============================================================
 */

const GH_REPO_FULL = process.env.GH_REPO_FULL || "";
const RUN_ID = process.env.GITHUB_RUN_ID;

const TYPE_ORDER = ["Bug Reproduction", "Variant", "Neighbouring Flow"];

const LIVE_STATUS_BANNERS = {
  fixed: "✅ *Live check: fixed* — the correct behavior was observed on the live app.",
  still_reproduces:
    "⚠️ *Live check: STILL REPRODUCES* — the bug is still present. " +
    "These tests describe the correct behavior, so they will fail until the fix is deployed.",
  not_reproducible:
    "❔ *Live check: not reproducible* — the path/state could not be reached on the live app.",
  unverified: "⏸️ *Live check: unverified* — the live check did not complete this run.",
};

function escapeSlack(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shorten(value, maxLength) {
  const text = String(value || "").trim();

  return text.length <= maxLength ? text : `${text.substring(0, maxLength - 3)}...`;
}

function section(text) {
  return { type: "section", text: { type: "mrkdwn", text: shorten(text, 2900) } };
}

function caseRow(testCase) {
  return {
    type: "section",
    block_id: `bugcase_${testCase.id}`,
    text: {
      type: "mrkdwn",
      text: shorten(
        `*${escapeSlack(testCase.id)}* | ${escapeSlack(testCase.title)}\n` +
          `_${testCase.priority} · ${escapeSlack(testCase.coversRootCause)}_`,
        2900
      ),
    },
    accessory: {
      type: "checkboxes",
      action_id: `selected_bugcase_${RUN_ID}_${testCase.id}`,
      options: [
        {
          text: { type: "plain_text", text: testCase.id, emoji: true },
          value: testCase.id,
        },
      ],
    },
  };
}

function buildBlocks(data, context, dropped) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `🐞 Regression tests — ${data.bugId}` },
    },
    section(
      `*${escapeSlack(shorten(data.bugTitle || context.title, 250))}*\n` +
        `Priority: ${context.priority || "N/A"}` +
        (context.notionUrl ? `  |  <${context.notionUrl}|View in Notion>` : "")
    ),
    section(
      `${LIVE_STATUS_BANNERS[data.liveStatus]}` +
        (data.liveEvidence ? `\n>${escapeSlack(data.liveEvidence)}` : "")
    ),
    section(`*Root-cause hypothesis:*\n${escapeSlack(data.rootCauseHypothesis)}`),
    section(
      `*Tests will be appended to:* \`${escapeSlack(data.targetSpec)}\`\n` +
        `_${escapeSlack(data.targetSpecReason)}_`
    ),
  ];

  const warnings = context.quality?.warnings || [];

  if (warnings.length) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Bug report gaps: ${escapeSlack(warnings.join(" · "))}` }],
    });
  }

  if (data.alreadyCoveredBy?.length) {
    blocks.push(section(`*Already covered (not duplicated):*\n${data.alreadyCoveredBy.map((item) => `• ${escapeSlack(item)}`).join("\n")}`));
  }

  for (const type of TYPE_ORDER) {
    const cases = data.testCases.filter((testCase) => testCase.type === type);

    if (!cases.length) continue;

    blocks.push({ type: "divider" }, section(`*${type}* (${cases.length})`));
    cases.forEach((testCase) => blocks.push(caseRow(testCase)));
  }

  if (dropped.length) {
    blocks.push(
      { type: "divider" },
      section(
        `*⚠️ Dropped after live verification (${dropped.length}):*\n` +
          dropped.map((item) => `• *${escapeSlack(item.id)}* ${escapeSlack(item.title)} — ${escapeSlack(item.reason)}`).join("\n")
      )
    );
  }

  blocks.push(
    { type: "divider" },
    section(
      "Tick the cases to automate, then click the button. " +
        `Only the ticked cases will be appended to \`${escapeSlack(data.targetSpec)}\`.`
    ),
    {
      type: "actions",
      block_id: "automate_bug_testcases_final",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Automate Selected Regression Tests", emoji: true },
          style: "primary",
          action_id: "automate_bug_testcases",
          value: GH_REPO_FULL ? `${data.bugId}|${RUN_ID}|${GH_REPO_FULL}` : `${data.bugId}|${RUN_ID}`,
        },
      ],
    }
  );

  return blocks;
}

async function main() {
  if (!RUN_ID) {
    throw new Error("GITHUB_RUN_ID environment variable is missing.");
  }

  const data = JSON.parse(fs.readFileSync(paths.TESTCASES_JSON, "utf8"));
  const context = JSON.parse(fs.readFileSync(paths.BUG_CONTEXT, "utf8"));
  const dropped = fs.existsSync(paths.DROPPED_TESTCASES)
    ? JSON.parse(fs.readFileSync(paths.DROPPED_TESTCASES, "utf8"))
    : [];

  const slack = new WebClient(bugConfig.slackBotToken);
  const channel = bugConfig.slackChannelId;
  const blocks = buildBlocks(data, context, dropped);

  console.log(`🐞 Sending ${data.testCases.length} regression case(s) for ${data.bugId} (${blocks.length} blocks)...`);

  const response = await slack.chat.postMessage({
    channel,
    text: `Regression test cases for ${data.bugId} — select which to automate`,
    blocks,
  });

  console.log(`✅ Test-case selection message sent (ts ${response.ts}).`);

  if (fs.existsSync(paths.TESTCASES_MD)) {
    await slack.filesUploadV2({
      channel_id: channel,
      thread_ts: response.ts,
      initial_comment: `📄 *Regression test cases record* for *${data.bugId}*.`,
      file: paths.TESTCASES_MD,
      filename: `${data.bugId}-regression-testcases.md`,
      title: `${data.bugId} - Regression Test Cases`,
    });

    console.log("✅ Markdown record uploaded to the thread.");
  }
}

main().catch((error) => {
  console.error("\n❌ Failed to send bug test-case selection.");
  console.error(error.data?.error || error.message || error);
  process.exit(1);
});
