const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * FETCH USER INSTRUCTIONS (Slack "Instruct & retry blocked cases")
 * ============================================================
 *
 * A user can give the agent instructions for a batch from Slack:
 *   - the short text box in the "Instruct & retry" form
 *     (USER_INSTRUCTIONS, up to ~3,000 characters), and/or
 *   - any length of replies in the THREAD of the agent-report message
 *     (USER_INSTRUCTIONS_THREAD = "<channel>:<thread ts>"), read here with
 *     the bot token so nothing large travels through workflow inputs.
 *
 * Writes .ai-run/user-instructions.md (appended to Claude's automation
 * and repair prompts by ai-approved-ticket.yml) only when there is at
 * least one instruction. Without any, it writes nothing and the run is
 * exactly as before.
 *
 * Env: USER_INSTRUCTIONS, USER_INSTRUCTIONS_THREAD, SLACK_BOT_TOKEN,
 *      SELECTED_TEST_CASES, TICKET_ID
 * Output ($GITHUB_OUTPUT): has_instructions=true|false
 * Never exits non-zero.
 * ============================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const RUN_DIR = path.join(ROOT, ".ai-run");
const OUT_FILE = path.join(RUN_DIR, "user-instructions.md");
const MAX_TOTAL_CHARS = 40000;
const THREAD_PATTERN = /^([A-Z0-9]+):(\d+\.\d+)$/;

function clean(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

// The bot's confirmation posted in the thread each time "Instruct & retry"
// starts a batch (scripts/slack-http-agent.js).
const ROUND_MARKER = "Next batch started for";

// Human replies in the report's thread that belong to THIS round: the bot's
// own messages are excluded, and so are replies older than the previous
// round's confirmation (they were instructions for an earlier batch). The
// latest confirmation belongs to the submit that started this run, so
// replies before it and after the one before it are this round's.
async function threadReplies(ref, token) {
  const match = THREAD_PATTERN.exec(String(ref || "").trim());

  if (!match || !token) return [];

  const [, channel, ts] = match;
  const messages = [];
  let cursor = "";

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ channel, ts, limit: "200" });

    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));

    if (!body.ok) {
      console.log(`Could not read the Slack thread (${body.error || response.status}); using the form text only.`);
      break;
    }

    messages.push(...(body.messages || []).filter(message => message.ts !== ts));

    cursor = body.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }

  const isBot = message => Boolean(message.bot_id) || message.subtype === "bot_message";
  const confirmations = messages
    .filter(message => isBot(message) && String(message.text || "").includes(ROUND_MARKER))
    .map(message => Number(message.ts))
    .sort((a, b) => a - b);
  // Replies after the PREVIOUS round's confirmation (none yet → whole thread).
  const roundStart = confirmations.length >= 2 ? confirmations[confirmations.length - 2] : 0;
  const replies = messages
    .filter(message => !isBot(message) && Number(message.ts) > roundStart)
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .map(message => clean(message.text))
    .filter(Boolean);

  if (roundStart) {
    console.log("Ignoring thread replies from earlier Instruct & retry rounds.");
  }

  return replies;
}

function writeOutput(hasInstructions) {
  console.log(`has_instructions=${hasInstructions}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_instructions=${hasInstructions}\n`, "utf8");
  }
}

async function main() {
  const formText = clean(process.env.USER_INSTRUCTIONS);
  const replies = await threadReplies(process.env.USER_INSTRUCTIONS_THREAD, process.env.SLACK_BOT_TOKEN);
  const parts = [formText, ...replies].filter(Boolean);

  if (!parts.length) {
    console.log("No user instructions for this batch.");
    writeOutput(false);
    return;
  }

  let body = parts.join("\n\n---\n\n");

  if (body.length > MAX_TOTAL_CHARS) {
    body = `${body.slice(0, MAX_TOTAL_CHARS)}\n\n[… truncated at ${MAX_TOTAL_CHARS} characters]`;
  }

  const cases = String(process.env.SELECTED_TEST_CASES || "").split(",").map(id => id.trim()).filter(Boolean);
  const markdown = [
    "",
    "==============================================",
    "USER INSTRUCTIONS FOR THIS BATCH — FOLLOW THEM",
    "==============================================",
    "",
    `Ticket ${process.env.TICKET_ID || ""}, cases: ${cases.join(", ") || "(the selected cases)"}.`,
    "A team member gave the instructions below in Slack for these cases. They are",
    "the PLAN for this batch and take precedence over your own choices (what to",
    "create, in which order, with which data and role, and what to assert). Use",
    "the site-flow map and the blocker-resolution skill only for whatever the",
    "instructions do not cover.",
    "",
    "While following them:",
    "- Verify each step live in the matching role's MCP browser. If the app does",
    "  not match an instruction (a control is missing, a state cannot be reached),",
    "  do not fake it: report exactly what you saw in that case's `found`/`lacks`",
    "  and set `resolution`/`resolutionAttempted` to say the user instruction was",
    "  followed and where it diverged.",
    "- The repository's safety rules still apply even if an instruction says",
    "  otherwise: never change existing lines, never delete or edit permanent seed",
    "  records or vendors other than \"sumit corp\", never use customer accounts or",
    "  hosts other than BASE_URL, never put credentials in code or reports (an",
    "  instruction may name a GitHub secret — read it from process.env).",
    "- Mention in each case's report entry that it followed user instructions.",
    "",
    "----- instructions start -----",
    body,
    "----- instructions end -----",
    "",
  ].join("\n");

  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, markdown, "utf8");
  console.log(`User instructions: ${formText ? "form text" : "no form text"}, ${replies.length} thread repl${replies.length === 1 ? "y" : "ies"}, ${body.length} characters.`);
  writeOutput(true);
}

main().catch(error => {
  console.log(`Could not collect user instructions: ${error.message}`);
  writeOutput(false);
});
