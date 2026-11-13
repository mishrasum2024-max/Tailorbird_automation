const fs = require("fs");
const path = require("path");
const {
  DATA_BRANCH,
  kindConfig,
  listDir,
  readList,
  updateList,
} = require("./lib/notAutomatableList");

/*
 * ============================================================
 * NOT-AUTOMATABLE LIST — SAVE + CONFIRM (ai-not-automatable.yml)
 * ============================================================
 *
 *   node not-automatable-list.js apply
 *     Adds ("hide") or removes ("undo") the IDs in the list folder
 *     (AI_NOT_AUTOMATABLE_DIR, a checkout of the ai-not-automatable
 *     branch). The workflow commits and pushes the folder afterwards.
 *     Writes the outcome to NA_RESULT_FILE for the notify step.
 *
 *   node not-automatable-list.js notify
 *     Replies in the Slack thread: who hid / restored what, with an
 *     Undo button after a hide. NA_SAVE_OUTCOME (the push step's
 *     outcome) other than "success" posts a failure note instead.
 *
 * Env (set by the workflow from its inputs, never interpolated into
 * a shell):
 *   NA_KIND          ticket | bug
 *   NA_OPERATION     hide | undo
 *   NA_ITEMS         JSON [{ "id": "...", "label": "..." }]
 *   NA_SLACK_USER    Slack user ID who clicked
 *   NA_SLACK_CHANNEL channel of the picker message
 *   NA_SLACK_THREAD  ts of the thread to reply in
 *   NA_RESULT_FILE   where apply writes its outcome for notify
 *   NA_SAVE_OUTCOME  notify only: outcome of the push step
 *   NA_RUN_URL       notify only: link to this workflow run
 *   SLACK_BOT_TOKEN  notify only
 *   GITHUB_REPOSITORY  owner/repo stamped onto the Undo button
 * ============================================================
 */

const SLACK_USER_PATTERN = /^[UW][A-Z0-9]{2,20}$/;
const SLACK_CHANNEL_PATTERN = /^[CDG][A-Z0-9]{2,20}$/;
const SLACK_TS_PATTERN = /^\d{1,12}\.\d{1,8}$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_ITEMS = 25;

function env(name) {
  return String(process.env[name] || "").trim();
}

function readInputs() {
  const kind = env("NA_KIND");
  const operation = env("NA_OPERATION");
  const config = kindConfig(kind);

  if (!["hide", "undo"].includes(operation)) {
    throw new Error(
      `NA_OPERATION must be "hide" or "undo", got "${operation}".`
    );
  }

  let items;
  try {
    items = JSON.parse(env("NA_ITEMS") || "[]");
  } catch (error) {
    throw new Error(`NA_ITEMS is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) {
    throw new Error(`NA_ITEMS must list 1-${MAX_ITEMS} items.`);
  }

  const seen = new Set();
  items = items
    .map(item => ({
      id: String(item?.id || "").trim(),
      label: String(item?.label || "").trim(),
    }))
    .filter(item => {
      if (!config.pattern.test(item.id))
        throw new Error(`Invalid ${kind} ID: "${item.id}"`);
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  const user = env("NA_SLACK_USER");
  const channel = env("NA_SLACK_CHANNEL");
  const thread = env("NA_SLACK_THREAD");

  return {
    kind,
    operation,
    items,
    user: SLACK_USER_PATTERN.test(user) ? user : "",
    channel: SLACK_CHANNEL_PATTERN.test(channel) ? channel : "",
    thread: SLACK_TS_PATTERN.test(thread) ? thread : "",
  };
}

function resultFile() {
  const file = env("NA_RESULT_FILE");
  if (!file) throw new Error("NA_RESULT_FILE is not set.");
  return path.resolve(file);
}

function writeReadme(dir) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- dir is the workflow's own AI_NOT_AUTOMATABLE_DIR (never Slack input) and "README.md" is a hardcoded name.
  const file = path.join(dir, "README.md");
  if (fs.existsSync(file)) return;

  fs.writeFileSync(
    file,
    [
      "# Not-automatable list",
      "",
      'Tickets and bugs marked in Slack as "can\'t be automated". The ticket picker,',
      "the bug picker and the QA daily report leave them out until they are restored.",
      "",
      "- `tickets.json`: feature tickets (ai-ticket-selection.yml)",
      "- `bugs.json`: bugs (ai-bug-selection.yml)",
      "",
      "Written by `.github/workflows/ai-not-automatable.yml` when someone clicks",
      "**Hide from future runs** or **Undo** in Slack. To restore an item by hand,",
      "delete its entry from the JSON file and commit to this branch.",
      "",
    ].join("\n"),
    "utf8"
  );
}

function apply() {
  const inputs = readInputs();
  const dir = listDir();
  if (!dir) throw new Error("AI_NOT_AUTOMATABLE_DIR is not set.");

  const { changed, unchanged } = updateList(
    inputs.kind,
    inputs.operation,
    inputs.items,
    {
      by: inputs.user,
    },
    dir
  );
  writeReadme(dir);

  const total = Object.keys(readList(inputs.kind, dir).entries).length;

  fs.writeFileSync(
    resultFile(),
    JSON.stringify({ ...inputs, changed, unchanged, total }, null, 2),
    "utf8"
  );

  console.log(
    `✅ ${inputs.operation === "hide" ? "Hidden" : "Restored"} ${changed.length} ${kindConfig(inputs.kind).nouns}` +
      (changed.length ? `: ${changed.join(", ")}` : "") +
      (unchanged.length ? ` (no change for ${unchanged.join(", ")})` : "") +
      `. ${total} now on the list (branch ${DATA_BRANCH}).`
  );
}

function bulletList(items, ids) {
  const byId = new Map(items.map(item => [item.id, item]));
  return ids
    .map(id => {
      const label = byId.get(id)?.label || "";
      // The label already starts with "<priority> | <ID> | ..." for picker options.
      return label.includes(id)
        ? `• ${label}`
        : `• *${id}*${label ? ` — ${label}` : ""}`;
    })
    .join("\n");
}

function buildMessage(result, saveOutcome, runUrl) {
  const config = kindConfig(result.kind);
  const who = result.user ? `<@${result.user}>` : "someone";
  const runLink = runUrl ? ` (<${runUrl}|workflow run>)` : "";

  if (saveOutcome !== "success") {
    return {
      text: `❌ Could not save the not-automatable list${runLink}. Nothing was changed, so try the button again.`,
    };
  }

  if (result.operation === "undo") {
    const restored = result.changed.length
      ? `↩️ *Restored* by ${who}: ${result.changed.join(", ")}. They'll appear again in the next run.`
      : `↩️ Nothing to restore: ${result.unchanged.join(", ")} ${result.unchanged.length === 1 ? "was" : "were"} not on the list.`;
    return { text: restored };
  }

  const ids = [...result.changed, ...result.unchanged];
  const repoFull = REPO_PATTERN.test(env("GITHUB_REPOSITORY"))
    ? env("GITHUB_REPOSITORY")
    : "";
  const lines = [
    `🚫 *Hidden from future runs* by ${who}:`,
    bulletList(result.items, ids),
  ];

  if (result.unchanged.length) {
    lines.push(
      `_${result.unchanged.join(", ")} ${result.unchanged.length === 1 ? "was" : "were"} already hidden._`
    );
  }

  const text = lines.join("\n");

  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `They won't appear in ${config.reportName} until someone clicks Undo. ${result.total} ${result.total === 1 ? config.noun : config.nouns} hidden in total.`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Undo" },
            action_id: config.undoActionId,
            value: repoFull ? `${ids.join(",")}|${repoFull}` : ids.join(","),
          },
        ],
      },
    ],
  };
}

async function notify() {
  const saveOutcome = env("NA_SAVE_OUTCOME");
  let result;

  try {
    result = JSON.parse(fs.readFileSync(resultFile(), "utf8"));
  } catch {
    // apply failed before writing a result: report from the inputs alone.
    try {
      result = { ...readInputs(), changed: [], unchanged: [], total: 0 };
    } catch (error) {
      console.error(`❌ Cannot notify Slack: ${error.message}`);
      return;
    }
  }

  if (!result.channel) {
    console.log("ℹ️ No Slack channel given; nothing posted.");
    return;
  }

  const { WebClient } = require("@slack/web-api");
  const slack = new WebClient(env("SLACK_BOT_TOKEN"));
  const message = buildMessage(
    result,
    saveOutcome === "success" && fs.existsSync(resultFile())
      ? "success"
      : "failure",
    env("NA_RUN_URL")
  );

  await slack.chat.postMessage({
    channel: result.channel,
    thread_ts: result.thread || undefined,
    ...message,
  });

  console.log("✅ Slack confirmation posted.");
}

module.exports = { buildMessage };

if (require.main === module) {
  const command = process.argv[2];
  const run =
    command === "apply"
      ? async () => apply()
      : command === "notify"
        ? notify
        : null;

  if (!run) {
    console.error("Usage: node not-automatable-list.js apply|notify");
    process.exit(1);
  }

  run().catch(error => {
    console.error(
      `❌ not-automatable-list ${command} failed: ${error.data?.error || error.message}`
    );
    process.exit(1);
  });
}
