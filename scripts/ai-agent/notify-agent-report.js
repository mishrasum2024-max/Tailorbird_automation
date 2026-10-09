require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { WebClient } = require("@slack/web-api");

/*
 * ============================================================
 * NOTIFY AGENT REPORT (AI_FLOWS_V2)
 * ============================================================
 *
 * Posts .ai-run/agent-report.json (build-agent-report.js) to the
 * feature Slack channel: per case what is automated, failing, not
 * implemented or blocked, and what the agent found, lacked and
 * created. Runs whether or not a PR was opened, so a run that
 * produced nothing still says why.
 *
 * Env: SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, TICKET_ID, PR_URL, RUN_URL
 * Never fails the job.
 * ============================================================
 */

const REPORT_FILE = path.join(__dirname, "..", "..", ".ai-run", "agent-report.json");
const MAX_SECTION = 2900; // Slack section text limit is 3000.
const MAX_BLOCKS = 45; // Slack message limit is 50.

function sectionsFor(text) {
  const blocks = [];
  let rest = text;

  while (rest.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: rest.slice(0, MAX_SECTION) } });
    rest = rest.slice(MAX_SECTION);
  }

  return blocks;
}

// Ticket-wide progress: cases passing in any batch so far (batch record
// ai-batches/<TICKET>.json, already updated by this run) out of all
// generated cases. Empty when either file is missing.
function progressLine(ticketId) {
  const root = path.join(__dirname, "..", "..");
  const readJson = file => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      return null;
    }
  };

  if (!/^[A-Za-z0-9]{0,20}-\d{1,9}$/.test(String(ticketId || ""))) return "";

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- ticketId is checked against the ticket-ID pattern (letters/digits, one dash, digits) right above, so it cannot contain path separators or "..".
  const ledger = readJson(path.join(root, "ai-batches", `${ticketId}.json`));
  const generated = readJson(path.join(root, "data", "generated-testcases.json"));
  const allIds = ((generated && generated.testCases) || []).map(testCase => String(testCase.id || "").toUpperCase()).filter(Boolean);

  if (!ledger || !Array.isArray(ledger.batches) || !allIds.length) return "";

  const passing = new Set(ledger.batches.flatMap(batch => (batch.passedIds || []).map(id => String(id).toUpperCase())));
  const done = allIds.filter(id => passing.has(id)).length;

  return `Ticket progress: ${done}/${allIds.length} generated cases automated and passing`;
}

function caseText(item) {
  const lines = [`${item.icon} *${item.id}* — ${item.label}`];

  if (item.title) lines.push(`_${item.title}_`);
  if (item.parkedRef) lines.push(`📦 Not in the PR — the failing attempt is kept on \`${item.parkedRef}\``);
  if (item.roles.length) lines.push(`Roles: ${item.roles.join(", ")}`);
  if (item.blockerId || item.blockerType) {
    lines.push(`🧱 Blocker: ${[item.blockerId, item.blockerType].filter(Boolean).join(" · ")}${item.requiredState ? ` — needs ${item.requiredState}` : ""}`);
  }
  if ((item.resolutionAttempted || []).length) lines.push(`🔁 Tried: ${item.resolutionAttempted.join(" | ")}`);
  if (item.resolution) lines.push(`✅ Resolved: ${item.resolution}`);
  item.prerequisites.forEach(pre =>
    lines.push(`• Needs ${pre.need}: *${pre.state || "?"}*${pre.how ? ` (${pre.how})` : ""}`)
  );
  if (item.found.length) lines.push(`🔎 Found: ${item.found.join(" | ")}`);
  if (item.lacks.length) lines.push(`🚧 Lacks: ${item.lacks.join(" | ")}`);
  if (item.created.length) lines.push(`🛠️ Created: ${item.created.join(" | ")}`);
  if (item.reason) lines.push(`Why: ${item.reason}`);
  if (item.nextStep) lines.push(`➡️ Next: ${item.nextStep}`);

  return lines.join("\n");
}

async function main() {
  if (!fs.existsSync(REPORT_FILE)) {
    console.log("No agent report to post.");
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.log("SLACK_BOT_TOKEN / SLACK_CHANNEL_ID missing; not posting.");
    return;
  }

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  const c = report.counts;
  const header =
    `🤖 *Agent report — ${report.ticketId}*\n` +
    `${c.selected} selected: ✅ ${c.passing} passing · ❌ ${c.failing} failing · ` +
    `⚠️ ${c.notImplemented} not implemented · ⛔ ${c.blocked} blocked` +
    (c.existing ? ` · ℹ️ ${c.existing} already automated earlier` : "") +
    (report.sessions.length
      ? `\nRole sessions: ${report.sessions
          .map(session => `${session.role} ${session.status === "valid" ? "✅" : `❌ ${session.status}`}`)
          .join(" · ")}`
      : "") +
    (process.env.PR_URL ? `\nPR: ${process.env.PR_URL}` : "\nPR: not created") +
    (/^[0-9a-f]{40}$/.test(String(process.env.BATCH_COMMIT || "")) && process.env.GH_REPO_FULL
      ? ` · <${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GH_REPO_FULL}/commit/${process.env.BATCH_COMMIT}|review only this batch>`
      : "") +
    (progressLine(report.ticketId) ? `\n${progressLine(report.ticketId)}` : "") +
    (process.env.RUN_URL ? `\n<${process.env.RUN_URL}|Workflow run>` : "");

  const blocks = [...sectionsFor(header), { type: "divider" }];

  report.cases.forEach(item => blocks.push(...sectionsFor(caseText(item))));

  const general = [
    ...(report.resolvedBlockers || []).map(
      entry => `${entry.remembered ? "🧠" : "•"} ${entry.blockerId || "?"}: ${entry.resolution || "—"} (${entry.note})`
    ),
    ...report.general.found.map(item => `🔎 ${item}`),
    ...report.general.lacks.map(item => `🚧 ${item}`),
  ];

  if (general.length) {
    blocks.push({ type: "divider" }, ...sectionsFor(`*Run-wide*\n${general.join("\n")}`));
  }

  const trimmed = blocks.slice(0, MAX_BLOCKS);

  if (blocks.length > MAX_BLOCKS) {
    trimmed.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "Report truncated; the full report is in the PR body / run artifacts." }],
    });
  }

  // "Instruct & retry blocked cases": the next batch with only the cases that
  // are not passing, following the user's instructions (form text and/or
  // replies in this message's thread). Handled by `instruct_blocked_cases`
  // in scripts/slack-http-agent.js. Added only when there is something to
  // retry and the run's generation run ID is known.
  const retryIds = report.cases
    .filter(item => item.verdict !== "passing" && item.verdict !== "existing")
    .map(item => item.id);
  const generationRunId = String(process.env.GENERATION_RUN_ID || "").trim();
  const buttonValue = `${report.ticketId}|${generationRunId}|${String(process.env.GH_REPO_FULL || "").trim()}|${retryIds.join(",")}`;

  if (retryIds.length && /^\d+$/.test(generationRunId) && buttonValue.length <= 1900) {
    trimmed.push(
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              "Want to guide the next try? Reply in this thread with instructions (any length), " +
              "then click below — or type them in the form. Cases without instructions retry using the skills only.",
          },
        ],
      },
      {
        type: "actions",
        block_id: "instruct_blocked_actions",
        elements: [
          {
            type: "button",
            style: "primary",
            action_id: "instruct_blocked_cases",
            text: { type: "plain_text", text: `✍️ Instruct & retry (${retryIds.length})` },
            value: buttonValue,
          },
        ],
      }
    );
  }

  await new WebClient(token).chat.postMessage({
    channel,
    text: `Agent report — ${report.ticketId}`,
    blocks: trimmed,
  });

  console.log(`Posted the agent report for ${report.ticketId}.`);
}

main().catch(error => {
  console.log(`⚠️ Could not post the agent report: ${error.data?.error || error.message}`);
});
