require("dotenv").config({ quiet: true });

/*
 * ============================================================
 * BUG AGENT CONFIG
 * ============================================================
 *
 * The ONLY place the bug-regression agent reads environment
 * variables. Every bug-agent script gets its config from here.
 *
 * Isolation rule: bug-agent IDs (Notion data source, Slack
 * channel) have NO default and NEVER fall back to the feature
 * agent's variables (NOTION_DATA_SOURCE_ID / SLACK_CHANNEL_ID).
 * A missing value fails fast instead of silently reading the
 * feature Notion database or posting to the feature channel.
 *
 * Shared, read-only credentials (NOTION_API_KEY, SLACK_BOT_TOKEN)
 * are reused as-is; BUG_NOTION_API_KEY optionally overrides the
 * Notion key if the bug database needs its own integration.
 *
 * Env vars:
 *   BUG_NOTION_DATA_SOURCE_ID  required — bug DB *data source* id
 *                              (not the database id in the URL)
 *   BUG_SLACK_CHANNEL_ID       required — bug-regression channel
 *   BUG_NOTION_API_KEY         optional — overrides NOTION_API_KEY
 *   BUG_MAX_TICKETS            optional — default 10 (Slack radio limit)
 *
 * Hardcoded selection (no env override; BUG_TARGET_STATUS and
 * BUG_TARGET_PRIORITY are ignored):
 *   statuses   "Complete" or "Release Ready"
 *   host       beta.tailorbird.com (the bug's "URL", with or
 *              without https://)
 *   priority   none — every priority is picked
 * ============================================================
 */

const SLACK_RADIO_LIMIT = 10;

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function requireValue(name, value) {
  if (!value) {
    throw new Error(
      `${name} is missing. The bug agent never falls back to the feature agent's variables.`
    );
  }

  return value;
}

const bugConfig = {
  get notionApiKey() {
    return requireValue(
      "BUG_NOTION_API_KEY / NOTION_API_KEY",
      readEnv("BUG_NOTION_API_KEY") || readEnv("NOTION_API_KEY")
    );
  },

  get notionDataSourceId() {
    return requireValue(
      "BUG_NOTION_DATA_SOURCE_ID",
      readEnv("BUG_NOTION_DATA_SOURCE_ID")
    );
  },

  get slackBotToken() {
    return requireValue("SLACK_BOT_TOKEN", readEnv("SLACK_BOT_TOKEN"));
  },

  get slackChannelId() {
    return requireValue(
      "BUG_SLACK_CHANNEL_ID",
      readEnv("BUG_SLACK_CHANNEL_ID")
    );
  },

  // Hardcoded on purpose: a GitHub variable or local .env (e.g. the
  // old BUG_TARGET_STATUS=Validating) cannot change the selection.
  // "Release Ready" is the bug board's name for "Ready to Release".
  get targetStatuses() {
    return ["Complete", "Release Ready"];
  },

  get targetHost() {
    return "beta.tailorbird.com";
  },

  get maxTickets() {
    const value = parseInt(readEnv("BUG_MAX_TICKETS") || "10", 10);

    return Math.min(
      Number.isFinite(value) && value > 0 ? value : 10,
      SLACK_RADIO_LIMIT
    );
  },
};

module.exports = bugConfig;
