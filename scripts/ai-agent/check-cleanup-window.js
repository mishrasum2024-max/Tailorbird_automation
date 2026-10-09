const {
  cleanupConfig,
  localParts,
  formatMinutes,
  writeOutputs,
} = require("./lib/ticketBatch");

/*
 * ============================================================
 * CHECK CLEANUP WINDOW
 * ============================================================
 *
 * A daily job deletes the properties, projects, jobs and invoices
 * that tests created (default 06:00-09:00, Asia/Kolkata). A run that
 * overlaps it sees its test data disappear mid-run, which looks like
 * flaky automation. This check runs in its own job before
 * ai-approved-ticket.yml's main job and blocks a run that starts
 * inside the window, or within AI_CLEANUP_GUARD_MINUTES before it.
 *
 * When blocked it posts one clear Slack message (so the main job's
 * generic failure notice never fires) and outputs blocked=true.
 *
 * Env:
 *   AI_CLEANUP_WINDOW          "HH:MM-HH:MM" local, default 06:00-09:00
 *   AI_CLEANUP_TZ              IANA zone, default Asia/Kolkata
 *   AI_CLEANUP_GUARD_MINUTES   default 60
 *   AI_CLEANUP_WINDOW_DISABLED "true" = never block
 *   TICKET_ID, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, RUN_URL
 *
 * Never exits non-zero: any doubt resolves to blocked=false, so
 * this check can never stop a run on its own failure.
 * ============================================================
 */

async function postSlack(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.log("Slack not configured; skipping the cleanup-window notice.");
    return;
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });
  const result = await response.json().catch(() => ({}));

  if (!result.ok) {
    console.warn(`Slack post failed: ${result.error || response.status}`);
  }
}

async function main() {
  if (process.env.AI_CLEANUP_WINDOW_DISABLED === "true") {
    console.log("Cleanup-window check disabled.");
    writeOutputs({ blocked: false });
    return;
  }

  const config = cleanupConfig();

  if (!config) {
    console.warn(
      "AI_CLEANUP_WINDOW / AI_CLEANUP_TZ is invalid; not blocking this run."
    );
    writeOutputs({ blocked: false });
    return;
  }

  const now = localParts(new Date(), config.timeZone);
  const inWindow = now.minutes >= config.start && now.minutes < config.end;
  const tooClose =
    now.minutes < config.start &&
    now.minutes + config.guardMinutes > config.start;
  const blocked = inWindow || tooClose;
  const windowLabel = `${config.windowText} (${config.timeZone})`;

  console.log(`Local time: ${now.key} ${config.timeZone}`);
  console.log(
    `Cleanup window: ${windowLabel}, guard ${config.guardMinutes} min`
  );

  if (!blocked) {
    writeOutputs({ blocked: false });
    return;
  }

  const ticketId = process.env.TICKET_ID || "this ticket";
  const reason = inWindow
    ? "the daily test-data cleanup is running now"
    : `the daily test-data cleanup starts at ${formatMinutes(config.start)}, ` +
      `within ${config.guardMinutes} minutes`;
  const text =
    `⏸️ *Automation for ${ticketId} was not started:* ${reason} ` +
    `(${windowLabel}). Test data created now would be deleted mid-run.\n\n` +
    `Please start it again after ${formatMinutes(config.end)}.` +
    (process.env.RUN_URL ? `\n<${process.env.RUN_URL}|Workflow run>` : "");

  console.log(text);
  writeOutputs({ blocked: true });

  await postSlack(text).catch(error =>
    console.warn(`Slack post failed: ${error.message}`)
  );
}

main().catch(error => {
  console.warn(`Cleanup-window check failed (${error.message}); not blocking.`);
  writeOutputs({ blocked: false });
});
