const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * NOT-AUTOMATABLE LIST (ticket picker + bug picker + QA report)
 * ============================================================
 *
 * Tickets and bugs a person marked in Slack as "can't be automated".
 * The pickers leave them out of every future Slack list, and the QA
 * daily report leaves them out of every total, until someone clicks
 * Undo on the Slack confirmation.
 *
 * Where it lives: the `ai-not-automatable` branch (never main), one
 * file per kind:
 *
 *   tickets.json   { "FEAT-1361": { label, by, at }, ... }
 *   bugs.json      { "BUG-1612":  { label, by, at }, ... }
 *
 *   label  the Slack option text when it was hidden
 *   by     Slack user ID of the person who hid it
 *   at     ISO time it was hidden
 *
 * Workflows load that branch into a folder and point
 * AI_NOT_AUTOMATABLE_DIR at it. Written only by
 * ai-not-automatable.yml (scripts/ai-agent/not-automatable-list.js).
 *
 * Reading never fails: no folder, no file or a broken file is an empty
 * list, so every reader behaves exactly as before.
 * ============================================================
 */

const DATA_BRANCH = "ai-not-automatable";

const KINDS = {
  ticket: {
    file: "tickets.json",
    // Notion unique_id "<prefix>-<number>" (same as lib/ticketBatch.js).
    pattern: /^[A-Za-z0-9]{0,20}-\d{1,9}$/,
    noun: "ticket",
    nouns: "tickets",
    // Slack IDs. Kept distinct from every other action/block ID.
    blockId: "not_automatable_tickets",
    selectionActionId: "not_automatable_tickets_selection",
    hideActionId: "hide_not_automatable_tickets",
    undoActionId: "undo_not_automatable_tickets",
    reportName: "the ticket list and the QA report",
  },
  bug: {
    file: "bugs.json",
    pattern: /^BUG-\d{1,9}$/,
    noun: "bug",
    nouns: "bugs",
    blockId: "not_automatable_bugs",
    selectionActionId: "not_automatable_bugs_selection",
    hideActionId: "hide_not_automatable_bugs",
    undoActionId: "undo_not_automatable_bugs",
    reportName: "the bug list and the QA report",
  },
};

// Slack checkboxes support at most 10 options of 75 characters.
const MAX_OPTIONS = 10;
const MAX_OPTION_TEXT = 75;

function kindConfig(kind) {
  const config = KINDS[kind];

  if (!config) {
    throw new Error(
      `Unknown not-automatable kind: "${kind}" (use "ticket" or "bug").`
    );
  }

  return config;
}

function listDir() {
  const dir = String(process.env.AI_NOT_AUTOMATABLE_DIR || "").trim();
  return dir ? path.resolve(dir) : "";
}

function listFile(kind, dir = listDir()) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- dir is the workflow's own AI_NOT_AUTOMATABLE_DIR (never Slack input) and the file name is a hardcoded constant ("tickets.json" / "bugs.json"); kindConfig throws for any other kind.
  return dir ? path.join(dir, kindConfig(kind).file) : "";
}

/*
 * { available, entries } — available is false when no list could be
 * read (not configured, branch not created yet, or a broken file).
 */
function readList(kind, dir = listDir()) {
  const file = listFile(kind, dir);

  if (!file || !fs.existsSync(file)) {
    return { available: false, entries: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const { pattern } = kindConfig(kind);
    const entries = {};

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([id, value]) => {
        if (pattern.test(id))
          entries[id] = value && typeof value === "object" ? value : {};
      });
    }

    return { available: true, entries };
  } catch (error) {
    console.warn(
      `⚠️ Could not read the not-automatable list ${file}: ${error.message}`
    );
    return { available: false, entries: {} };
  }
}

function hiddenIds(kind, dir = listDir()) {
  return new Set(Object.keys(readList(kind, dir).entries));
}

/*
 * Drops hidden items from `items` (each has an `id`). Logs what was
 * dropped. Returns { kept, hidden }.
 */
function filterHidden(kind, items, dir = listDir()) {
  const ids = hiddenIds(kind, dir);
  const kept = [];
  const hidden = [];

  items.forEach(item => (ids.has(item.id) ? hidden : kept).push(item));

  if (hidden.length) {
    console.log(
      `🙈 Left out ${hidden.length} ${hidden.length === 1 ? kindConfig(kind).noun : kindConfig(kind).nouns} marked not automatable in Slack: ` +
        hidden.map(item => item.id).join(", ")
    );
  }

  return { kept, hidden };
}

/*
 * Applies "hide" or "undo" to the list file in `dir` and returns
 * { changed: [ids], unchanged: [ids] }.
 */
function updateList(
  kind,
  operation,
  items,
  { by = "", at = new Date().toISOString() } = {},
  dir = listDir()
) {
  if (!dir) throw new Error("AI_NOT_AUTOMATABLE_DIR is not set.");

  const { pattern } = kindConfig(kind);
  const { entries } = readList(kind, dir);
  const changed = [];
  const unchanged = [];

  items.forEach(({ id, label }) => {
    if (!pattern.test(id)) throw new Error(`Invalid ${kind} ID: "${id}"`);

    if (operation === "hide") {
      if (entries[id]) {
        unchanged.push(id);
      } else {
        entries[id] = { label: String(label || "").slice(0, 200), by, at };
        changed.push(id);
      }
    } else if (operation === "undo") {
      if (entries[id]) {
        delete entries[id];
        changed.push(id);
      } else {
        unchanged.push(id);
      }
    } else {
      throw new Error(
        `Unknown operation: "${operation}" (use "hide" or "undo").`
      );
    }
  });

  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map(id => [id, entries[id]])
  );

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    listFile(kind, dir),
    `${JSON.stringify(sorted, null, 2)}\n`,
    "utf8"
  );

  return { changed, unchanged };
}

function shorten(text, maxLength) {
  const value = String(text || "").trim();
  return value.length <= maxLength
    ? value
    : `${value.substring(0, maxLength - 3)}...`;
}

/*
 * Slack blocks for the picker message: the "Can't be automated?"
 * checkboxes and the "Hide from future runs" button. `options` is
 * [{ id, label }] in the order shown in the message. Option value is
 * ID|owner/repo, like the radio buttons.
 */
function buildHideBlocks(kind, options, repoFull = "") {
  const config = kindConfig(kind);
  const shown = options.slice(0, MAX_OPTIONS);

  if (!shown.length) return [];

  return [
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "*🚫 Can't be automated?*\n" +
          `Tick the ${config.nouns} the agent can't automate, then click *Hide from future runs*. ` +
          "They stop appearing here until someone clicks Undo.",
      },
    },
    {
      type: "actions",
      block_id: config.blockId,
      elements: [
        {
          type: "checkboxes",
          action_id: config.selectionActionId,
          options: shown.map(option => ({
            text: {
              type: "plain_text",
              text: shorten(option.label, MAX_OPTION_TEXT),
              emoji: true,
            },
            value: repoFull ? `${option.id}|${repoFull}` : option.id,
          })),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Hide from future runs" },
          action_id: config.hideActionId,
          value: "hide",
          confirm: {
            title: { type: "plain_text", text: "Hide from future runs?" },
            text: {
              type: "mrkdwn",
              text: `The ticked ${config.nouns} won't appear in this list again. You can undo from the confirmation in the thread.`,
            },
            confirm: { type: "plain_text", text: "Hide" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
      ],
    },
  ];
}

// "🙈 3 tickets marked not automatable are hidden ..." (null when none).
function buildHiddenContextBlock(kind, count) {
  if (!count) return null;

  const config = kindConfig(kind);
  const one = count === 1;

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          `🙈 ${count} ${one ? config.noun : config.nouns} marked not automatable ${one ? "is" : "are"} hidden from this list. ` +
          `Undo from the thread where ${one ? "it was" : "they were"} hidden.`,
      },
    ],
  };
}

module.exports = {
  DATA_BRANCH,
  KINDS,
  kindConfig,
  listDir,
  readList,
  hiddenIds,
  filterHidden,
  updateList,
  buildHideBlocks,
  buildHiddenContextBlock,
};
