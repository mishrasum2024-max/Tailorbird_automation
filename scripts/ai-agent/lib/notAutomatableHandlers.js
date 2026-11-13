const { kindConfig } = require("./notAutomatableList");

/*
 * ============================================================
 * NOT-AUTOMATABLE LIST — SLACK HANDLERS
 * ============================================================
 *
 * Registered once per kind by the Slack listener:
 *   scripts/slack-http-agent.js               kind "ticket"
 *   ai-bug-agent/slack/registerBugHandlers.js kind "bug"
 *
 *   <kind> checkbox click   ack only (state is read on the button)
 *   Hide from future runs   -> ai-not-automatable.yml operation=hide
 *   Undo (thread reply)     -> ai-not-automatable.yml operation=undo
 *
 * The workflow saves the list and posts the confirmation (with the
 * Undo button) in the picker message's thread. Here the clicker only
 * gets a private "saving" note.
 *
 * Listener env (optional): NOT_AUTOMATABLE_WORKFLOW, default
 * "ai-not-automatable.yml".
 * ============================================================
 */

const NOT_AUTOMATABLE_WORKFLOW =
  process.env.NOT_AUTOMATABLE_WORKFLOW || "ai-not-automatable.yml";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function resolveRepo(repoFull, fallback) {
  return REPO_PATTERN.test(repoFull || "")
    ? { owner: repoFull.split("/")[0], repo: repoFull.split("/")[1] }
    : fallback;
}

async function tellUser(client, body, text) {
  try {
    await client.chat.postEphemeral({
      channel: body.channel?.id,
      user: body.user?.id,
      thread_ts: body.message?.thread_ts || undefined,
      text,
    });
  } catch (error) {
    // Ephemeral messages can fail (e.g. bot not in channel); fall back to the thread.
    console.warn(
      `⚠️ Ephemeral note failed (${error.data?.error || error.message}); posting in thread.`
    );
    await client.chat.postMessage({
      channel: body.channel?.id,
      thread_ts: body.message?.thread_ts || body.message?.ts,
      text,
    });
  }
}

function registerNotAutomatableHandlers(
  app,
  { kind, dispatchGitHubWorkflow, owner, repo }
) {
  const config = kindConfig(kind);
  const defaultRepo = { owner, repo };

  app.action(config.selectionActionId, async ({ ack }) => {
    await ack();
  });

  // ------------------------------------------------
  // Hide from future runs (picker message)
  // Checkbox value: ID|owner/repo, text: the radio label.
  // ------------------------------------------------
  app.action(config.hideActionId, async ({ ack, body, client }) => {
    await ack();

    const selected =
      body.state?.values?.[config.blockId]?.[config.selectionActionId]
        ?.selected_options || [];

    let repoFull = "";
    const items = selected
      .map(option => {
        const [id, optionRepo] = String(option.value || "").split("|");
        if (optionRepo && !repoFull) repoFull = optionRepo;
        return { id, label: option.text?.text || "" };
      })
      .filter(item => config.pattern.test(item.id));

    console.log(
      `🚫 Hide ${config.nouns} by ${body.user?.id}: ${items.map(i => i.id).join(", ") || "(none)"}`
    );

    if (!items.length) {
      await tellUser(
        client,
        body,
        `⚠️ Tick at least one ${config.noun} under "Can't be automated?" before clicking *Hide from future runs*.`
      );
      return;
    }

    const target = resolveRepo(repoFull, defaultRepo);
    const ids = items.map(item => item.id).join(", ");

    try {
      await dispatchGitHubWorkflow(
        target.owner,
        target.repo,
        NOT_AUTOMATABLE_WORKFLOW,
        {
          kind,
          operation: "hide",
          items: JSON.stringify(items),
          slack_user: body.user?.id || "",
          slack_channel: body.channel?.id || "",
          slack_thread_ts: body.message?.ts || "",
        }
      );

      await tellUser(
        client,
        body,
        `⏳ Hiding ${ids}… The confirmation, with an Undo button, will appear in this message's thread in about a minute.`
      );
    } catch (error) {
      console.error(
        "❌ Failed to start %s:",
        NOT_AUTOMATABLE_WORKFLOW,
        error.message
      );
      await tellUser(
        client,
        body,
        `❌ Could not hide ${ids}: ${error.message}`
      );
    }
  });

  // ------------------------------------------------
  // Undo (confirmation in the thread)
  // Button value: ID,ID|owner/repo
  // ------------------------------------------------
  app.action(config.undoActionId, async ({ ack, body, client }) => {
    await ack();

    const [idList, repoFull] = String(body.actions?.[0]?.value || "").split(
      "|"
    );
    const items = String(idList || "")
      .split(",")
      .map(id => id.trim())
      .filter(id => config.pattern.test(id))
      .map(id => ({ id, label: "" }));

    console.log(
      `↩️ Undo ${config.nouns} by ${body.user?.id}: ${items.map(i => i.id).join(", ") || "(none)"}`
    );

    if (!items.length) {
      await tellUser(client, body, "⚠️ This Undo button has no valid IDs.");
      return;
    }

    const target = resolveRepo(repoFull, defaultRepo);
    const ids = items.map(item => item.id).join(", ");

    try {
      await dispatchGitHubWorkflow(
        target.owner,
        target.repo,
        NOT_AUTOMATABLE_WORKFLOW,
        {
          kind,
          operation: "undo",
          items: JSON.stringify(items),
          slack_user: body.user?.id || "",
          slack_channel: body.channel?.id || "",
          slack_thread_ts: body.message?.thread_ts || body.message?.ts || "",
        }
      );

      await tellUser(
        client,
        body,
        `⏳ Restoring ${ids}… A confirmation will appear in this thread in about a minute.`
      );
    } catch (error) {
      console.error(
        "❌ Failed to start %s:",
        NOT_AUTOMATABLE_WORKFLOW,
        error.message
      );
      await tellUser(
        client,
        body,
        `❌ Could not restore ${ids}: ${error.message}`
      );
    }
  });
}

module.exports = { registerNotAutomatableHandlers, NOT_AUTOMATABLE_WORKFLOW };
