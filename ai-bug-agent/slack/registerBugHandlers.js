/*
 * ============================================================
 * BUG AGENT — SLACK HANDLERS
 * ============================================================
 *
 * Every Slack command/action for the bug-regression agent lives
 * here. scripts/slack-http-agent.js calls this once with its
 * existing `app` and helpers, so the bug agent shares the same
 * Slack app and request URL without touching any feature-agent
 * handler. All IDs here are bug-specific and can never match a
 * feature handler (/ai-ticket-selection, approve_ticket,
 * selected_testcase_*, automate_testcases, resume_*).
 *
 * Handlers are added phase by phase, only once the workflow they
 * dispatch exists on main:
 *
 *   Phase 1  /ai-bug-selection [P0,P1] -> ai-bug-selection.yml
 *                                       (optional priorities override
 *                                       BUG_TARGET_PRIORITY for that run)
 *            /ai_bug_automation      -> ai-bug-selection.yml (same
 *                                       workflow, no arguments)
 *   Phase 2  selected_bug              (radio click, ack only)
 *            approve_bug               -> ai-bug-generate-testcases.yml
 *                                       (bug_id + mode=single: automate
 *                                       the bug directly, PR on pass)
 *
 *   Legacy regression-set flow (only reachable from old Slack messages
 *   or a manual regression-set run; kept so they still ack cleanly):
 *            selected_bug_mode         (radio click, ack only)
 *            selected_bugcase_*        (checkbox state, per user+run)
 *            automate_bug_testcases    -> ai-bug-automate.yml
 *                                       (bug_id + ticked case IDs +
 *                                       generation_run_id)
 *
 * Listener env (optional, with defaults):
 *   BUG_SELECTION_WORKFLOW    default "ai-bug-selection.yml"
 *   BUG_GENERATION_WORKFLOW   default "ai-bug-generate-testcases.yml"
 *   BUG_AUTOMATION_WORKFLOW   default "ai-bug-automate.yml"
 * ============================================================
 */

const BUG_SELECTION_WORKFLOW =
  process.env.BUG_SELECTION_WORKFLOW || "ai-bug-selection.yml";

const BUG_GENERATION_WORKFLOW =
  process.env.BUG_GENERATION_WORKFLOW || "ai-bug-generate-testcases.yml";

const BUG_AUTOMATION_WORKFLOW =
  process.env.BUG_AUTOMATION_WORKFLOW || "ai-bug-automate.yml";

// Literal regexes only (semgrep detect-non-literal-regexp).
const BUG_ID_PATTERN = /^BUG-\d+$/;
const CASE_ID_PATTERN = /^BUG-\d+-TC\d{2}$/;
const BUGCASE_ACTION_PATTERN = /^selected_bugcase_.+/;
const BUGCASE_PREFIX = "selected_bugcase_";

// The bug itself is the test case: approve_bug always runs single mode,
// even from older bug-list messages that still show a mode radio.
const BUG_MODE = "single";

const STARTED_TEXT =
  "🤖 The agent will run login + mandatory tests, automate the bug directly on BASE_URL " +
  "(appended to the existing spec), and post the PR link here once the test passes.";

// "/ai-bug-selection P0, p1" -> "P0,P1". Only P0–P3 are accepted, so
// nothing else from the command text reaches the workflow input.
function parsePriorities(text) {
  const values = String(text || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(value => value.toUpperCase());

  if (values.some(value => !/^P[0-3]$/.test(value))) return null;

  return [...new Set(values)].join(",");
}

// Checkboxes are toggled one at a time before the final button is
// clicked; keep the selection per Slack user + generation run.
// Separate from the feature agent's own selection map.
const selectedBugCasesByUserAndRun = new Map();

function selectionKey(userId, runId) {
  return `${userId}|${runId}`;
}

// Ticked case IDs for one generation run, read from the message's
// checkbox state (action_id selected_bugcase_<RUN_ID>_<CASE_ID>).
function selectedCasesFromState(state, runId) {
  const prefix = `${BUGCASE_PREFIX}${runId}_`;
  const selected = [];

  for (const block of Object.values(state?.values || {})) {
    for (const [actionId, action] of Object.entries(block)) {
      if (!actionId.startsWith(prefix) || action.type !== "checkboxes")
        continue;

      (action.selected_options || []).forEach(
        option => option.value && selected.push(option.value)
      );
    }
  }

  return [...new Set(selected)];
}

// "owner/repo" -> { owner, repo }, falling back to this listener's
// bug-agent repository (never the feature agent's legacy repo).
function resolveRepo(repoFull, fallback) {
  const [owner, repo] = String(repoFull || "").split("/");

  return owner && repo ? { owner, repo } : fallback;
}

function registerBugHandlers(app, { dispatchGitHubWorkflow, owner, repo }) {
  const defaultRepo = { owner, repo };

  // ------------------------------------------------
  // Phase 1: /ai-bug-selection -> fetch Notion bugs -> bug channel
  // ------------------------------------------------
  app.command("/ai-bug-selection", async ({ ack, command, client }) => {
    await ack();

    console.log("");
    console.log("======================================");
    console.log("🐞 AI BUG SELECTION COMMAND");
    console.log("======================================");
    console.log(`User: ${command.user_name || command.user_id}`);
    console.log(`Channel: ${command.channel_name || command.channel_id}`);
    console.log(`Repository: ${owner}/${repo}`);
    console.log(`Workflow: ${BUG_SELECTION_WORKFLOW}`);
    console.log("======================================");

    const priorities = parsePriorities(command.text);

    if (priorities === null) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text:
          "⚠️ Unknown priority. Use P0–P3, e.g. `/ai-bug-selection P0,P1`, " +
          "or `/ai-bug-selection` alone for the default filter.",
      });

      return;
    }

    try {
      await dispatchGitHubWorkflow(owner, repo, BUG_SELECTION_WORKFLOW, {
        triggered_by: "slash",
        priorities,
      });

      await client.chat.postMessage({
        channel: command.channel_id,
        text:
          "✅ *AI Bug Selection workflow started.*\n\n" +
          `Fetching ${priorities ? `${priorities.replace(/,/g, ", ")} ` : ""}bugs from Notion ` +
          "and sending them to the bug channel.",
      });
    } catch (error) {
      console.error(
        "❌ Failed to trigger AI Bug Selection workflow:",
        error.message
      );

      await client.chat.postMessage({
        channel: command.channel_id,
        text: `❌ *Failed to start AI Bug Selection.*\n\n${error.message}`,
      });
    }
  });

  // ------------------------------------------------
  // Phase 1 (alias): /ai_bug_automation -> same ai-bug-selection.yml
  //
  // Same workflow as /ai-bug-selection. Takes no arguments: bug
  // selection has no priority filter (bugConfig.js), so any text after
  // the command is ignored and `priorities` is sent empty.
  // ------------------------------------------------
  app.command("/ai_bug_automation", async ({ ack, command, client }) => {
    await ack();

    console.log("");
    console.log("======================================");
    console.log("🐞 AI BUG AUTOMATION COMMAND");
    console.log("======================================");
    console.log(`User: ${command.user_name || command.user_id}`);
    console.log(`Channel: ${command.channel_name || command.channel_id}`);
    console.log(`Repository: ${owner}/${repo}`);
    console.log(`Workflow: ${BUG_SELECTION_WORKFLOW}`);
    console.log("======================================");

    try {
      await dispatchGitHubWorkflow(owner, repo, BUG_SELECTION_WORKFLOW, {
        triggered_by: "slash",
        priorities: "",
      });

      await client.chat.postMessage({
        channel: command.channel_id,
        text:
          "✅ *AI Bug Selection workflow started.*\n\n" +
          "Fetching Complete / Release Ready bugs on beta.tailorbird.com from Notion " +
          "and sending them to the bug channel.",
      });
    } catch (error) {
      console.error(
        "❌ Failed to trigger AI Bug Selection workflow:",
        error.message
      );

      await client.chat.postMessage({
        channel: command.channel_id,
        text: `❌ *Failed to start AI Bug Selection.*\n\n${error.message}`,
      });
    }
  });

  // ------------------------------------------------
  // Phase 2: radio click — nothing to do until approve_bug, but
  // acknowledge so Slack does not show a warning icon.
  // ------------------------------------------------
  app.action("selected_bug", async ({ ack }) => {
    await ack();
  });

  app.action("selected_bug_mode", async ({ ack }) => {
    await ack();
  });

  // ------------------------------------------------
  // Phase 2: approve_bug -> generate regression test cases
  //
  // Radio value (send-bug-approval.js): BUG_ID|owner/repo
  // ------------------------------------------------
  app.action("approve_bug", async ({ ack, body, client }) => {
    await ack();

    console.log("");
    console.log("======================================");
    console.log("🐞 BUG APPROVAL RECEIVED");
    console.log("======================================");

    const rawValue =
      body.state?.values?.bug_selection?.selected_bug?.selected_option?.value ||
      "";

    const [bugId, repoFull] = rawValue.split("|");

    if (!BUG_ID_PATTERN.test(bugId || "")) {
      console.error(`❌ No valid bug selected (value: "${rawValue}").`);

      await client.chat.postMessage({
        channel: body.channel.id,
        text:
          "⚠️ No bug was selected.\n\n" +
          "Select exactly one bug before clicking 'Start Regression Tests for Selected Bug'.",
      });

      return;
    }

    const target = resolveRepo(repoFull, defaultRepo);

    const mode = BUG_MODE;

    console.log(`✅ Bug approved: ${bugId} by ${body.user?.id}`);
    console.log(`➡️ Mode: ${mode}`);
    console.log(`➡️ Target repository: ${target.owner}/${target.repo}`);

    try {
      await dispatchGitHubWorkflow(
        target.owner,
        target.repo,
        BUG_GENERATION_WORKFLOW,
        {
          bug_id: bugId,
          mode,
        }
      );

      await client.chat.postMessage({
        channel: body.channel.id,
        text: `✅ *Bug approved: ${bugId}*\n\n${STARTED_TEXT}`,
      });
    } catch (error) {
      console.error(
        "❌ Failed to start generation for %s:",
        bugId,
        error.message
      );

      await client.chat.postMessage({
        channel: body.channel.id,
        text: `❌ *Failed to start regression test generation for ${bugId}*\n\n${error.message}`,
      });
    }
  });

  // ------------------------------------------------
  // Phase 2: checkbox toggles
  //
  // action_id: selected_bugcase_<RUN_ID>_<CASE_ID>
  // ------------------------------------------------
  app.action(BUGCASE_ACTION_PATTERN, async ({ ack, body }) => {
    await ack();

    const userId = body.user?.id;
    const action = body.actions?.[0];

    if (!userId || !action?.action_id?.startsWith(BUGCASE_PREFIX)) return;

    const payload = action.action_id.slice(BUGCASE_PREFIX.length);
    const separator = payload.indexOf("_");

    if (separator === -1) {
      console.error(
        `❌ Invalid bug case checkbox action ID: ${action.action_id}`
      );
      return;
    }

    const runId = payload.slice(0, separator);
    const caseId = payload.slice(separator + 1);
    const key = selectionKey(userId, runId);

    const selections = selectedBugCasesByUserAndRun.get(key) || new Set();
    selectedBugCasesByUserAndRun.set(key, selections);

    const isSelected = (action.selected_options || []).some(
      option => option.value === caseId
    );

    if (isSelected) selections.add(caseId);
    else selections.delete(caseId);

    console.log(
      `${isSelected ? "☑️" : "☐"} ${userId} ${caseId} (bug run ${runId}) — ` +
        `now: ${[...selections].join(", ") || "none"}`
    );
  });

  // ------------------------------------------------
  // Phase 3: automate_bug_testcases -> ai-bug-automate.yml
  //
  // Button value (send-bug-testcase-selection.js): BUG_ID|RUN_ID|owner/repo
  //
  // The checkboxes live in the same message as the button, so Slack
  // sends their current state with the click (body.state). That is
  // the primary source; the per-user map is only a fallback.
  // ------------------------------------------------
  app.action("automate_bug_testcases", async ({ ack, body, client }) => {
    await ack();

    console.log("");
    console.log("======================================");
    console.log("🐞 BUG TEST AUTOMATION REQUESTED");
    console.log("======================================");

    const [bugId, runId, repoFull] = String(
      body.actions?.[0]?.value || ""
    ).split("|");
    const reply = text =>
      client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: body.message?.ts,
        text,
      });

    if (!BUG_ID_PATTERN.test(bugId || "") || !/^\d+$/.test(runId || "")) {
      console.error(
        `❌ Invalid automate button value: "${body.actions?.[0]?.value}"`
      );
      await reply(
        "❌ This button is invalid (missing bug or run ID). Re-run the generation for the bug."
      );
      return;
    }

    const isCaseOfBug = id =>
      CASE_ID_PATTERN.test(id) && id.startsWith(`${bugId}-TC`);
    const fromState = selectedCasesFromState(body.state, runId);
    const fromMap = [
      ...(selectedBugCasesByUserAndRun.get(
        selectionKey(body.user?.id, runId)
      ) || []),
    ];
    const selections = (fromState.length ? fromState : fromMap)
      .filter(isCaseOfBug)
      .sort();

    console.log(`Bug: ${bugId} | run: ${runId} | by: ${body.user?.id}`);
    console.log(
      `Selected: ${selections.join(", ") || "none"} (from ${fromState.length ? "message state" : "stored toggles"})`
    );

    if (!selections.length) {
      await reply(
        `⚠️ No test cases are ticked for *${bugId}*. Tick at least one case, then click the button again.`
      );
      return;
    }

    const target = resolveRepo(repoFull, defaultRepo);

    try {
      await dispatchGitHubWorkflow(
        target.owner,
        target.repo,
        BUG_AUTOMATION_WORKFLOW,
        {
          bug_id: bugId,
          test_case_ids: selections.join(","),
          generation_run_id: runId,
        }
      );

      await reply(
        `✅ *Automation started for ${bugId}*: ${selections.join(", ")}\n\n` +
          "🤖 The agent will append these cases to the target spec, run and repair them, " +
          "check that no existing test changed, and post the PR link here."
      );
    } catch (error) {
      console.error(
        "❌ Failed to start automation for %s:",
        bugId,
        error.message
      );
      await reply(
        `❌ *Failed to start automation for ${bugId}*\n\n${error.message}`
      );
    }
  });

  console.log(`🐞 Bug agent: /ai-bug-selection -> ${BUG_SELECTION_WORKFLOW}`);
  console.log(`🐞 Bug agent: /ai_bug_automation -> ${BUG_SELECTION_WORKFLOW}`);
  console.log(`🐞 Bug agent: approve_bug -> ${BUG_GENERATION_WORKFLOW}`);
  console.log(
    `🐞 Bug agent: automate_bug_testcases -> ${BUG_AUTOMATION_WORKFLOW}`
  );
  console.log(
    "🐞 Bug agent: selected_bug, selected_bug_mode, selected_bugcase_*"
  );
}

module.exports = registerBugHandlers;
