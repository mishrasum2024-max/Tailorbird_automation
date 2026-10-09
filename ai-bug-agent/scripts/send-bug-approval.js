const fs = require("fs");
const path = require("path");
const { WebClient } = require("@slack/web-api");
const bugConfig = require("./lib/bugConfig");

/*
 * ============================================================
 * SEND BUG APPROVAL (Phase 1)
 * ============================================================
 *
 * Bug-agent counterpart of scripts/ai-agent/send-ticket-approval.js.
 * Posts the fetched bugs to the BUG channel (BUG_SLACK_CHANNEL_ID)
 * as a single-select radio group plus an approve button.
 *
 * Action IDs are bug-specific so a click can never reach the
 * feature agent's handlers:
 *
 *   block_id  bug_selection         / action_id  selected_bug
 *   block_id  approve_bug_action    / action_id  approve_bug
 *
 * Radio option value: BUG_ID|owner/repo (same routing convention
 * as the feature agent, handled in ai-bug-agent/slack/).
 * There is no mode choice: approve_bug always automates the bug
 * itself as one test case (single mode).
 *
 * Env:
 *   GH_REPO_FULL       owner/repo stamped onto option values
 *   BUG_NOTIFY_EMPTY   "true" = post a short note when no bugs
 *                      (set for manual/slash runs, not the cron)
 * ============================================================
 */

const BUGS_FILE = path.join(
  __dirname,
  "..",
  "runtime",
  "notion-bug-tickets.json"
);

const GH_REPO_FULL = process.env.GH_REPO_FULL || "";
const NOTIFY_EMPTY = process.env.BUG_NOTIFY_EMPTY === "true";

// Slack radio_buttons support at most 10 options.
const MAX_RADIO_OPTIONS = 10;

function shorten(text, maxLength) {
  const value = String(text || "").trim();

  return value.length <= maxLength
    ? value
    : `${value.substring(0, maxLength - 3)}...`;
}

function buildBugDetailBlock(bug, index) {
  const meta = [
    `Priority: ${bug.priority || "N/A"}`,
    bug.tags.length ? `Tags: ${bug.tags.join(", ")}` : "",
    bug.reportedBy ? `Reported by: ${bug.reportedBy}` : "",
  ].filter(Boolean);

  const lines = [
    `*${index + 1}. ${bug.id} — ${shorten(bug.title, 250)}*`,
    meta.join("  |  "),
  ];

  if (bug.notionUrl) {
    lines.push(`<${bug.notionUrl}|View in Notion>`);
  }

  return {
    type: "section",
    text: { type: "mrkdwn", text: lines.join("\n") },
  };
}

function buildRadioOptions(bugs) {
  return bugs.slice(0, MAX_RADIO_OPTIONS).map(bug => ({
    text: {
      type: "plain_text",
      text: `${bug.priority || "NO PRIORITY"} | ${bug.id} | ${shorten(bug.title, 55)}`,
      emoji: true,
    },
    value: GH_REPO_FULL ? `${bug.id}|${GH_REPO_FULL}` : bug.id,
  }));
}

function buildBlocks(bugs) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "🐞 AI Bug-Regression Agent" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${bugs.length} bug${bugs.length === 1 ? "" : "s"} in "${bugConfig.targetStatuses.join(
          '" or "'
        )}" on ${bugConfig.targetHost} without regression tests:*`,
      },
    },
    { type: "divider" },
  ];

  bugs.forEach((bug, index) => blocks.push(buildBugDetailBlock(bug, index)));

  blocks.push(
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "*Select ONE bug to automate:*\n" +
          "_The agent automates the bug itself as one test and posts the PR here once it passes._",
      },
    },
    {
      type: "actions",
      block_id: "bug_selection",
      elements: [
        {
          type: "radio_buttons",
          action_id: "selected_bug",
          options: buildRadioOptions(bugs),
        },
      ],
    },
    {
      type: "actions",
      block_id: "approve_bug_action",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Automate Selected Bug" },
          style: "primary",
          action_id: "approve_bug",
          value: "approve",
        },
      ],
    }
  );

  return blocks;
}

async function main() {
  console.log("🐞 Starting Notion bugs → Slack approval flow...");

  if (!fs.existsSync(BUGS_FILE)) {
    throw new Error(
      "notion-bug-tickets.json not found. Run get-notion-bugs.js first."
    );
  }

  const bugs = JSON.parse(fs.readFileSync(BUGS_FILE, "utf8"));
  const slack = new WebClient(bugConfig.slackBotToken);
  const channel = bugConfig.slackChannelId;

  if (!bugs.length) {
    console.log(
      "ℹ️ No bug found."
    );

    if (NOTIFY_EMPTY) {
      await slack.chat.postMessage({
        channel,
        text: "🐞 No bug found.",
      });
    }

    return;
  }

  if (bugs.length > MAX_RADIO_OPTIONS) {
    console.warn(
      `⚠️ ${bugs.length} bugs loaded; only the first ${MAX_RADIO_OPTIONS} can be shown.`
    );
  }

  const response = await slack.chat.postMessage({
    channel,
    text: "AI Bug-Regression Agent - Select a bug",
    blocks: buildBlocks(bugs),
  });

  console.log(`\n✅ Slack bug approval message created (ts ${response.ts}).`);
  console.log(`Bugs shown: ${Math.min(bugs.length, MAX_RADIO_OPTIONS)}`);
}

main().catch(error => {
  console.error("\n❌ Failed to create Slack bug approval.");
  console.error(error.data?.error || error.message || error);

  if (error.data?.error === "not_in_channel") {
    console.error("➡️ Invite the bot to the bug channel: /invite @<bot-name>");
  }

  process.exit(1);
});
