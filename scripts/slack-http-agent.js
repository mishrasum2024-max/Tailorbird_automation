require("dotenv").config();

const https = require("https");
const { App, ExpressReceiver } = require("@slack/bolt");

// ==================================================
// ENVIRONMENT VARIABLES
// ==================================================

const PORT = Number(process.env.PORT || 3000);

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

const GH_PAT = process.env.GH_PAT;

// ==================================================
// REPO ROUTING
// ==================================================
//
// This listener is shared by more than one repository's
// Slack messages (they post to the same Slack app/channel).
//
// Each "send to Slack" script in THIS repo stamps its own
// `owner/repo` into the button value it creates, so a click
// can be routed to the repo that actually posted it.
//
// Messages posted by scripts that do NOT stamp a repo
// fall back to LEGACY_GH_OWNER / LEGACY_GH_REPO.
//
// ==================================================

const LEGACY_GH_OWNER = process.env.LEGACY_GH_OWNER || "mishrasum2024-max";

const LEGACY_GH_REPO = process.env.LEGACY_GH_REPO || "Tailorbird_automation";

// ==================================================
// GITHUB WORKFLOW NAMES
// ==================================================

// Stage 1:
// Slack ticket approval -> generate test cases

const TESTCASE_GENERATION_WORKFLOW =
  process.env.TESTCASE_GENERATION_WORKFLOW || "ai-generate-testcases.yml";

// Stage 2:
// Slack test-case approval -> automate selected test cases

const APPROVED_TICKET_WORKFLOW =
  process.env.APPROVED_TICKET_WORKFLOW || "ai-approved-ticket.yml";

// Slack slash command:
// /ai-ticket-selection -> fetch Notion tickets -> send to Slack

const TICKET_SELECTION_WORKFLOW =
  process.env.TICKET_SELECTION_WORKFLOW || "ai-ticket-selection.yml";

const TICKET_SELECTION_OWNER =
  process.env.TICKET_SELECTION_OWNER || "tailorbird-inc";

const TICKET_SELECTION_REPO =
  process.env.TICKET_SELECTION_REPO || "tailorbird-next";

// ==================================================
// VALIDATION
// ==================================================

if (!SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN is missing.");
}

if (!SLACK_SIGNING_SECRET) {
  throw new Error("SLACK_SIGNING_SECRET is missing.");
}

if (!GH_PAT) {
  throw new Error("GH_PAT environment variable is missing.");
}

// ==================================================
// SLACK HTTP RECEIVER
// ==================================================

const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
  endpoints: "/slack/events",
});

// ==================================================
// SLACK BOLT APP
// ==================================================

const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
});

// ==================================================
// TEST CASE SELECTION STATE
// ==================================================
//
// Test-case checkboxes are spread across multiple Slack
// messages, while the final Automate button is in a
// separate message. Store selections as users make them
// so the final button can submit the complete selection.
//
const selectedTestCasesByUserAndRun = new Map();

function getSelectionKey(userId, generationRunId) {
  return `${userId}|${generationRunId}`;
}

// ==================================================
// HEALTH CHECK
// ==================================================

receiver.app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "tailorbird-slack-agent",
  });
});

// ==================================================
// GITHUB WORKFLOW DISPATCH
// ==================================================

function dispatchGitHubWorkflow(owner, repo, workflowFile, inputs = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      ref: "main",
      inputs,
    });

    const options = {
      hostname: "api.github.com",

      path:
        `/repos/${owner}/${repo}` +
        `/actions/workflows/${workflowFile}/dispatches`,

      method: "POST",

      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tailorbird-ai-ticket-agent",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    console.log("");
    console.log("======================================");
    console.log("🚀 GITHUB WORKFLOW DISPATCH");
    console.log("======================================");
    console.log(`Workflow: ${workflowFile}`);
    console.log(`Repository: ${owner}/${repo}`);
    console.log(`Inputs: ${JSON.stringify(inputs)}`);
    console.log("======================================");

    const request = https.request(options, response => {
      let responseBody = "";

      response.on("data", chunk => {
        responseBody += chunk;
      });

      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          console.log("✅ GitHub workflow dispatched successfully.");

          console.log(`   Workflow: ${workflowFile}`);

          console.log(`   Status: ${response.statusCode}`);

          resolve({
            statusCode: response.statusCode,
            body: responseBody,
          });

          return;
        }

        reject(
          new Error(
            `GitHub workflow dispatch failed. ` +
              `Repository: ${owner}/${repo}. ` +
              `Workflow: ${workflowFile}. ` +
              `Status: ${response.statusCode}. ` +
              `Response: ${responseBody}`
          )
        );
      });
    });

    request.on("error", error => {
      reject(error);
    });

    request.write(payload);
    request.end();
  });
}

// ==================================================
// SLACK COMMAND
//
// /ai-ticket-selection
//
// Manually triggers:
// .github/workflows/ai-ticket-selection.yml
//
// IMPORTANT:
// Slack must receive ack() immediately.
// GitHub dispatch happens AFTER acknowledgement.
// ==================================================

app.command("/ai-ticket-selection", async ({ ack, command, client }) => {
  // ------------------------------------------------
  // ACKNOWLEDGE SLACK IMMEDIATELY
  // ------------------------------------------------
  //
  // Slack requires the command request to be
  // acknowledged within a few seconds.
  //
  await ack();

  console.log("");
  console.log("======================================");
  console.log("🤖 AI TICKET SELECTION COMMAND");
  console.log("======================================");

  console.log(`User: ${command.user_name || command.user_id}`);

  console.log(`Channel: ${command.channel_name || command.channel_id}`);

  console.log(`Repository: ${TICKET_SELECTION_OWNER}/${TICKET_SELECTION_REPO}`);

  console.log(`Workflow: ${TICKET_SELECTION_WORKFLOW}`);

  console.log("======================================");

  // ------------------------------------------------
  // Trigger GitHub workflow AFTER Slack ACK
  // ------------------------------------------------

  try {
    console.log("🚀 Starting AI Ticket Selection workflow...");

    await dispatchGitHubWorkflow(
      TICKET_SELECTION_OWNER,
      TICKET_SELECTION_REPO,
      TICKET_SELECTION_WORKFLOW,
      {}
    );

    console.log("✅ AI Ticket Selection workflow triggered successfully.");

    // ------------------------------------------------
    // Slack confirmation
    // ------------------------------------------------

    await client.chat.postMessage({
      channel: command.channel_id,

      text:
        "✅ *AI Ticket Selection workflow started.*\n\n" +
        "Fetching completed Notion tickets and sending them to Slack.",
    });

    console.log("🎉 AI TICKET SELECTION COMMAND COMPLETED");
    console.log("======================================");
  } catch (error) {
    console.error("❌ Failed to trigger AI Ticket Selection workflow:");

    console.error(error.message);

    await client.chat.postMessage({
      channel: command.channel_id,

      text:
        "❌ *Failed to start AI Ticket Selection.*\n\n" + `${error.message}`,
    });
  }
});

// ==================================================
// STAGE 2 CHECKBOX SELECTION
// ==================================================
//
// Store each checkbox change immediately because the
// checkboxes and final Automate button are now in separate
// Slack messages.
//
// action_id format:
// selected_testcase_RUN_ID_TEST_CASE_ID
//
// ==================================================

app.action(/^selected_testcase_.+/, async ({ ack, body }) => {
  await ack();

  const userId = body.user?.id;
  const action = body.actions?.[0];

  if (!userId || !action) {
    console.error("❌ Invalid testcase checkbox payload.");

    return;
  }

  const prefix = "selected_testcase_";

  if (!action.action_id.startsWith(prefix)) {
    return;
  }

  const payload = action.action_id.slice(prefix.length);

  const separatorIndex = payload.indexOf("_");

  if (separatorIndex === -1) {
    console.error(
      `❌ Invalid testcase checkbox action ID: ${action.action_id}`
    );

    return;
  }

  const generationRunId = payload.slice(0, separatorIndex);

  const testCaseId = payload.slice(separatorIndex + 1);

  if (!generationRunId || !testCaseId) {
    console.error(
      `❌ Could not extract run ID or test case ID from: ${action.action_id}`
    );

    return;
  }

  const selectionKey = getSelectionKey(userId, generationRunId);

  let selections = selectedTestCasesByUserAndRun.get(selectionKey);

  if (!selections) {
    selections = new Set();

    selectedTestCasesByUserAndRun.set(selectionKey, selections);
  }

  const selectedOptions = Array.isArray(action.selected_options)
    ? action.selected_options
    : [];

  const isSelected = selectedOptions.some(
    option => option.value === testCaseId
  );

  if (isSelected) {
    selections.add(testCaseId);

    console.log(
      `☑️ ${userId} selected ${testCaseId} ` + `(run ${generationRunId})`
    );
  } else {
    selections.delete(testCaseId);

    console.log(
      `☐ ${userId} unselected ${testCaseId} ` + `(run ${generationRunId})`
    );
  }

  console.log(
    `   Current selections: ` + `${[...selections].join(", ") || "none"}`
  );
});

// ==================================================
// EXTRACT CHECKBOX SELECTIONS
// ==================================================

function getCheckboxSelections(body) {
  const stateValues = body.state?.values || {};

  const selections = [];

  for (const blockId of Object.keys(stateValues)) {
    const block = stateValues[blockId];

    for (const actionId of Object.keys(block)) {
      const action = block[actionId];

      if (
        action.type === "checkboxes" &&
        Array.isArray(action.selected_options)
      ) {
        for (const option of action.selected_options) {
          if (option.value) {
            selections.push(option.value);
          }
        }
      }
    }
  }

  return [...new Set(selections)];
}

// ==================================================
// EXTRACT RADIO BUTTON SELECTION
// ==================================================
//
// Slack's radio_buttons element sends a single
// selected_option object under action.selected_option.
//
// ==================================================

function getRadioSelection(body) {
  const stateValues = body.state?.values || {};

  for (const blockId of Object.keys(stateValues)) {
    const block = stateValues[blockId];

    for (const actionId of Object.keys(block)) {
      const action = block[actionId];

      if (
        action.type === "radio_buttons" &&
        action.selected_option &&
        action.selected_option.value
      ) {
        return action.selected_option.value;
      }
    }
  }

  return null;
}

// ==================================================
// PARSE "owner/repo" INTO { owner, repo }
// ==================================================

function parseRepoFull(repoFull) {
  if (!repoFull || !repoFull.includes("/")) {
    return null;
  }

  const [owner, repo] = repoFull.split("/");

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo,
  };
}

// ==================================================
// STAGE 1
//
// SELECT ONE NOTION TICKET
//
// Slack action_id:
// approve_ticket
//
// Button value:
//
// TICKET_ID
// OR
// TICKET_ID|owner/repo
//
// ==================================================

app.action("approve_ticket", async ({ ack, body, client }) => {
  // ------------------------------------------------
  // Slack acknowledgement
  // ------------------------------------------------

  await ack();

  console.log("");
  console.log("======================================");
  console.log("🎫 TICKET APPROVAL RECEIVED");
  console.log("======================================");

  console.log(
    "Raw Slack action:",
    JSON.stringify(body.actions?.[0] || {}, null, 2)
  );

  // ------------------------------------------------
  // Extract selected ticket
  // ------------------------------------------------

  const rawValue = getRadioSelection(body);

  console.log("Selected value:", rawValue);

  // ------------------------------------------------
  // Validate
  // ------------------------------------------------

  if (!rawValue) {
    console.error("❌ No ticket selected.");

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        "⚠️ No ticket was selected.\n\n" +
        "Please select exactly one ticket before clicking " +
        "'Start Automation for Selected Ticket'.",
    });

    return;
  }

  // ------------------------------------------------
  // Parse ticket + repository
  // ------------------------------------------------

  const [selectedTicket, repoFull] = rawValue.split("|");

  const parsedRepo = parseRepoFull(repoFull);

  const targetOwner = parsedRepo?.owner || LEGACY_GH_OWNER;

  const targetRepo = parsedRepo?.repo || LEGACY_GH_REPO;

  console.log(`✅ Ticket approved: ${selectedTicket}`);

  console.log(`➡️ Target repository: ${targetOwner}/${targetRepo}`);

  // ------------------------------------------------
  // Trigger test-case generation
  // ------------------------------------------------

  try {
    console.log("");

    console.log(`🚀 Starting test-case generation for ${selectedTicket}...`);

    await dispatchGitHubWorkflow(
      targetOwner,
      targetRepo,
      TESTCASE_GENERATION_WORKFLOW,
      {
        ticket_id: selectedTicket,
      }
    );

    console.log(`✅ Test-case generation started for ${selectedTicket}`);

    // ------------------------------------------------
    // Slack confirmation
    // ------------------------------------------------

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        `✅ *Ticket approved: ${selectedTicket}*\n\n` +
        `🤖 Test-case generation has been started ` +
        `(${targetOwner}/${targetRepo}).\n\n` +
        `Once the test cases are generated, a second approval ` +
        `message will appear where you can select which test ` +
        `cases should actually be automated.`,
    });

    console.log("");
    console.log("🎉 STAGE 1 COMPLETED");

    console.log(`Ticket approved: ${selectedTicket}`);

    console.log("======================================");
  } catch (error) {
    console.error(
      "❌ Failed to start generation for",
      selectedTicket,
      "-",
      error.message
    );

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        `❌ *Failed to generate test cases for ${selectedTicket}*\n\n` +
        `${error.message}`,
    });
  }
});

// ==================================================
// STAGE 2
//
// SELECT TEST CASES
//
// Slack action_id:
// automate_testcases
//
// Button value:
//
// TICKET_ID|RUN_ID
// OR
// TICKET_ID|RUN_ID|owner/repo
//
// ==================================================

app.action("automate_testcases", async ({ ack, body, client }) => {
  // ------------------------------------------------
  // Slack acknowledgement
  // ------------------------------------------------

  await ack();

  console.log("");
  console.log("======================================");
  console.log("🧪 TEST CASE APPROVAL RECEIVED");
  console.log("======================================");

  console.log(
    "Raw Slack action:",
    JSON.stringify(body.actions?.[0] || {}, null, 2)
  );

  // ------------------------------------------------
  // Extract button value
  // ------------------------------------------------

  const buttonValue = body.actions?.[0]?.value || "";

  const [ticketId, generationRunId, repoFull] = buttonValue.split("|");

  const parsedRepo = parseRepoFull(repoFull);

  const targetOwner = parsedRepo?.owner || LEGACY_GH_OWNER;

  const targetRepo = parsedRepo?.repo || LEGACY_GH_REPO;

  console.log(`Ticket ID: ${ticketId || "UNKNOWN"}`);

  console.log(`Generation Run ID: ${generationRunId || "UNKNOWN"}`);

  console.log(`Target repository: ${targetOwner}/${targetRepo}`);

  // ------------------------------------------------
  // Get selected test cases
  // ------------------------------------------------

  const userId = body.user?.id;

  const selectionKey = getSelectionKey(userId, generationRunId);

  const selectedTestCases = [
    ...(selectedTestCasesByUserAndRun.get(selectionKey) || []),
  ];

  console.log("Selected test cases:", selectedTestCases);

  // ------------------------------------------------
  // Validate ticket
  // ------------------------------------------------

  if (!ticketId) {
    console.error("❌ Ticket ID is missing.");

    await client.chat.postMessage({
      channel: body.channel.id,

      text: "❌ Unable to start automation because the ticket ID is missing.",
    });

    return;
  }

  // ------------------------------------------------
  // Validate generation run ID
  // ------------------------------------------------

  if (!generationRunId) {
    console.error("❌ Generation run ID is missing.");

    await client.chat.postMessage({
      channel: body.channel.id,

      text: `❌ Unable to start automation for ${ticketId} because the generation workflow run ID is missing.`,
    });

    return;
  }

  // ------------------------------------------------
  // Validate selected test cases
  // ------------------------------------------------

  if (selectedTestCases.length === 0) {
    console.error("❌ No test cases selected.");

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        "⚠️ No test cases were selected.\n\n" +
        "Please select at least one test case.",
    });

    return;
  }

  // ------------------------------------------------
  // Approval information
  // ------------------------------------------------

  console.log(`✅ Human approved ${selectedTestCases.length} test case(s).`);

  selectedTestCases.forEach(testCaseId => {
    console.log(`   - ${testCaseId}`);
  });

  // ------------------------------------------------
  // Trigger AI Approved Ticket workflow
  // ------------------------------------------------

  try {
    console.log("");

    console.log("🚀 Triggering AI Approved Ticket workflow...");

    await dispatchGitHubWorkflow(
      targetOwner,
      targetRepo,
      APPROVED_TICKET_WORKFLOW,
      {
        ticket_id: ticketId,

        selected_test_cases: selectedTestCases.join(","),

        generation_run_id: generationRunId,
      }
    );

    console.log(`✅ AI Approved Ticket workflow triggered for ${ticketId}`);

    selectedTestCasesByUserAndRun.delete(selectionKey);

    console.log(
      `🧹 Cleared testcase selections for ${userId} ` +
        `(run ${generationRunId})`
    );

    // ------------------------------------------------
    // Slack confirmation
    // ------------------------------------------------

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        `✅ *Automation started for ${ticketId}* ` +
        `(${targetOwner}/${targetRepo})\n\n` +
        `Selected test cases:\n` +
        selectedTestCases.map(testCase => `• ${testCase}`).join("\n") +
        `\n\n` +
        `🤖 Claude will automate only these approved test cases.`,
    });

    console.log("");

    console.log("🎉 STAGE 2 COMPLETED");
  } catch (error) {
    console.error(
      "❌ Failed to trigger AI Approved Ticket workflow:",
      error.message
    );

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        `❌ *Failed to start automation for ${ticketId}*\n\n` +
        `Error: ${error.message}`,
    });
  }

  console.log("======================================");
});

// ==================================================
// RETRY A FAILED / UNFINISHED RUN
//
// Slack action_id:
// resume_reuse  -> restart with the previous run's saved data
// resume_fresh  -> restart from scratch
//
// Button value (posted by notify-slack-pr-status.js):
//
// WORKFLOW_FILE|TICKET_ID|SELECTED_TEST_CASES|GENERATION_RUN_ID|FAILED_RUN_ID|owner/repo
//
// The failed run uploaded its code, created records and
// sessions as a `resume-bundle` artifact (build-resume-bundle.js);
// with resume_mode=reuse the new run restores it from
// FAILED_RUN_ID.
// ==================================================

// Only these workflows accept resume inputs — each maps the
// button fields onto that workflow's own input names.
const RESUMABLE_WORKFLOWS = {
  [APPROVED_TICKET_WORKFLOW]: fields => ({
    ticket_id: fields.ticketId,
    selected_test_cases: fields.selectedTestCases,
    generation_run_id: fields.generationRunId,
  }),

  "ai-automate-selected-testcases.yml": fields => ({
    ticket_id: fields.ticketId,
    test_case_ids: fields.selectedTestCases,
    testcase_run_id: fields.generationRunId,
  }),

  [TESTCASE_GENERATION_WORKFLOW]: fields => ({
    ticket_id: fields.ticketId,
  }),
};

function parseResumeValue(value) {
  const [
    workflowFile,
    ticketId,
    selectedTestCases,
    generationRunId,
    failedRunId,
    repoFull,
  ] = (value || "").split("|");

  return {
    workflowFile,
    ticketId,
    selectedTestCases,
    generationRunId,
    failedRunId,
    repoFull,
  };
}

async function handleResume({ ack, body, client, mode }) {
  await ack();

  const reuse = mode === "reuse";

  console.log("");
  console.log("======================================");
  console.log(
    reuse
      ? "♻️ RETRY WITH PREVIOUS DATA RECEIVED"
      : "🆕 RETRY FROM SCRATCH RECEIVED"
  );
  console.log("======================================");

  const fields = parseResumeValue(body.actions?.[0]?.value);
  const buildInputs = RESUMABLE_WORKFLOWS[fields.workflowFile];

  const parsedRepo = parseRepoFull(fields.repoFull);
  const targetOwner = parsedRepo?.owner || LEGACY_GH_OWNER;
  const targetRepo = parsedRepo?.repo || LEGACY_GH_REPO;

  console.log(`Workflow: ${fields.workflowFile || "UNKNOWN"}`);
  console.log(`Ticket ID: ${fields.ticketId || "UNKNOWN"}`);
  console.log(`Failed run ID: ${fields.failedRunId || "UNKNOWN"}`);
  console.log(`Target repository: ${targetOwner}/${targetRepo}`);

  if (!buildInputs || !fields.ticketId || !fields.failedRunId) {
    console.error("❌ Invalid retry button value.");

    await client.chat.postMessage({
      channel: body.channel.id,
      text:
        "❌ Unable to retry: this button is missing the workflow, " +
        "ticket or run information.",
    });

    return;
  }

  const inputs = {
    ...buildInputs(fields),
    resume_mode: reuse ? "reuse" : "fresh",
    resume_run_id: reuse ? fields.failedRunId : "",
  };

  const who = body.user?.id ? `<@${body.user.id}>` : "Someone";

  try {
    await dispatchGitHubWorkflow(
      targetOwner,
      targetRepo,
      fields.workflowFile,
      inputs
    );

    console.log(`✅ Retry dispatched (${inputs.resume_mode}).`);

    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message?.ts,
      text: reuse
        ? `♻️ ${who} restarted *${fields.ticketId}* using the previous ` +
          `run's data (code, records, sessions from run ` +
          `${fields.failedRunId}). Claude will continue from where it stopped.`
        : `🆕 ${who} restarted *${fields.ticketId}* from scratch. ` +
          `Previous data is ignored (it stays downloadable from the ` +
          `earlier message until the artifact expires).`,
    });
  } catch (error) {
    console.error("❌ Failed to dispatch retry:", error.message);

    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message?.ts,
      text:
        `❌ *Failed to restart ${fields.ticketId}*\n\n` +
        `Error: ${error.message}`,
    });
  }

  console.log("======================================");
}

app.action("resume_reuse", args => handleResume({ ...args, mode: "reuse" }));

app.action("resume_fresh", args => handleResume({ ...args, mode: "fresh" }));

// ==================================================
// NEXT BATCH FROM THE BATCH-PROGRESS MESSAGE (AI_FLOWS_V2)
//
// Slack action_id:
// automate_failed_cases     -> cases selected earlier, still not passing
// automate_remaining_cases  -> every generated case not passing yet
//
// Button value (scripts/ai-agent/notify-ticket-batch.js):
// TICKET_ID|GENERATION_RUN_ID|owner/repo|TC001,TC002
//
// Dispatches ai-approved-ticket.yml exactly like "automate_testcases"
// (same inputs), so the next batch builds on the earlier ones as usual.
// The buttons are removed from the message after the first click so a
// double click cannot start two runs.
// ==================================================

const NEXT_BATCH_CASE_ID_PATTERN = /^TC\d+$/;

async function handleNextBatch({ ack, body, client, kind }) {
  await ack();

  const value = String(body.actions?.[0]?.value || "");
  const [ticketId, generationRunId, repoFull, idList] = value.split("|");
  const caseIds = [
    ...new Set(
      String(idList || "")
        .split(",")
        .map(id => id.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  const parsedRepo = parseRepoFull(repoFull);
  const targetOwner = parsedRepo?.owner || LEGACY_GH_OWNER;
  const targetRepo = parsedRepo?.repo || LEGACY_GH_REPO;
  const reply = text =>
    client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message?.ts,
      text,
    });

  console.log("");
  console.log("======================================");
  console.log(`🔁 NEXT BATCH (${kind}) REQUESTED`);
  console.log("======================================");
  console.log(`Ticket: ${ticketId || "UNKNOWN"} | run: ${generationRunId || "UNKNOWN"}`);
  console.log(`Cases: ${caseIds.join(", ") || "none"}`);

  if (
    !ticketId ||
    !/^\d+$/.test(generationRunId || "") ||
    !caseIds.length ||
    !caseIds.every(id => NEXT_BATCH_CASE_ID_PATTERN.test(id))
  ) {
    console.error(`❌ Invalid next-batch button value: "${value}"`);
    await reply("❌ This button is invalid (missing ticket, run or case IDs). Select the cases in the test-case message instead.");
    return;
  }

  // Remove the buttons first: a second click must not start a second run.
  try {
    const keptBlocks = (body.message?.blocks || []).filter(
      block => block.block_id !== "next_batch_actions"
    );

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: body.message?.text || `${ticketId} batch progress`,
      blocks: [
        ...keptBlocks,
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `▶️ Next batch started by <@${body.user?.id}>: ${caseIds.join(", ")}`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.warn(`Could not update the batch message: ${error.message}`);
  }

  try {
    await dispatchGitHubWorkflow(targetOwner, targetRepo, APPROVED_TICKET_WORKFLOW, {
      ticket_id: ticketId,
      selected_test_cases: caseIds.join(","),
      generation_run_id: generationRunId,
    });

    console.log(`✅ AI Approved Ticket workflow triggered for ${ticketId}`);

    await reply(
      `✅ *Next batch started for ${ticketId}* (${targetOwner}/${targetRepo})\n\n` +
        `${kind === "failed" ? "Retrying failed cases" : "Automating all remaining cases"}: ${caseIds.join(", ")}`
    );
  } catch (error) {
    console.error("❌ Failed to trigger the next batch:", error.message);
    await reply(`❌ *Failed to start the next batch for ${ticketId}*\n\nError: ${error.message}`);
  }
}

app.action("automate_failed_cases", args => handleNextBatch({ ...args, kind: "failed" }));

app.action("automate_remaining_cases", args => handleNextBatch({ ...args, kind: "remaining" }));

// ==================================================
// INSTRUCT & RETRY BLOCKED CASES (agent report → form → next batch)
//
// Slack action_id: instruct_blocked_cases   (button on the agent report,
//                                            scripts/ai-agent/notify-agent-report.js)
// Slack view callback_id: instruct_blocked_cases_modal
//
// Button value: TICKET_ID|GENERATION_RUN_ID|owner/repo|TC001,TC002
//
// Opens a form: checkboxes for the cases (all pre-ticked) + one optional
// instruction box. Longer instructions go as replies in the report's thread;
// the workflow reads that thread itself (fetch-user-instructions.js), so only
// "<channel>:<ts>" is passed. Dispatches ai-approved-ticket.yml with the same
// inputs as the other next-batch buttons plus user_instructions and
// user_instructions_thread. New IDs only — no existing handler changes.
// ==================================================

const INSTRUCT_MAX_TEXT = 3000; // Slack plain_text_input limit
const INSTRUCT_OPTIONS_PER_BLOCK = 10; // Slack checkboxes limit

app.action("instruct_blocked_cases", async ({ ack, body, client }) => {
  await ack();

  const [ticketId, generationRunId, repoFull, idList] = String(
    body.actions?.[0]?.value || ""
  ).split("|");
  const caseIds = [
    ...new Set(
      String(idList || "")
        .split(",")
        .map(id => id.trim().toUpperCase())
        .filter(id => NEXT_BATCH_CASE_ID_PATTERN.test(id))
    ),
  ];

  if (!ticketId || !/^\d+$/.test(generationRunId || "") || !caseIds.length) {
    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message?.ts,
      text: "❌ This button is invalid (missing ticket, run or case IDs).",
    });
    return;
  }

  const caseBlocks = [];

  for (let i = 0; i < caseIds.length; i += INSTRUCT_OPTIONS_PER_BLOCK) {
    const chunk = caseIds.slice(i, i + INSTRUCT_OPTIONS_PER_BLOCK);
    const options = chunk.map(id => ({ text: { type: "plain_text", text: id }, value: id }));

    caseBlocks.push({
      type: "input",
      block_id: `cases_${i / INSTRUCT_OPTIONS_PER_BLOCK}`,
      optional: i > 0,
      label: { type: "plain_text", text: i === 0 ? "Cases to run in the next batch" : "More cases" },
      element: { type: "checkboxes", action_id: "selected", options, initial_options: options },
    });
  }

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "instruct_blocked_cases_modal",
        private_metadata: JSON.stringify({
          ticketId,
          generationRunId,
          repoFull: repoFull || "",
          channel: body.channel.id,
          threadTs: body.message?.ts || "",
        }),
        title: { type: "plain_text", text: "Instruct & retry" },
        submit: { type: "plain_text", text: "Start batch" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*${ticketId}* — the agent follows your instructions for the ticked cases; ` +
                "cases you don't mention retry using the skills only.\n" +
                "_Longer instructions: reply in the report's thread (any length) — they are read too. " +
                "Never paste passwords; name the GitHub secret instead._",
            },
          },
          ...caseBlocks,
          {
            type: "input",
            block_id: "instructions",
            optional: true,
            label: { type: "plain_text", text: "Instructions for these cases" },
            element: {
              type: "plain_text_input",
              action_id: "text",
              multiline: true,
              max_length: INSTRUCT_MAX_TEXT,
              placeholder: {
                type: "plain_text",
                text: "e.g. TC014–TC016: create a new property, no Change Order approval template, job with vendor Sumit_Corp, finalize, then submit the CO as the vendor.",
              },
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("❌ Could not open the instruct form:", error.data?.error || error.message);
  }
});

app.view("instruct_blocked_cases_modal", async ({ ack, view, body, client }) => {
  let meta = {};

  try {
    meta = JSON.parse(view.private_metadata || "{}");
  } catch (error) {
    meta = {};
  }

  const values = view.state?.values || {};
  const selected = [
    ...new Set(
      Object.entries(values)
        .filter(([blockId]) => blockId.startsWith("cases_"))
        .flatMap(([, block]) => block.selected?.selected_options || [])
        .map(option => String(option.value || "").toUpperCase())
        .filter(id => NEXT_BATCH_CASE_ID_PATTERN.test(id))
    ),
  ];
  const instructions = String(values.instructions?.text?.value || "").trim().slice(0, INSTRUCT_MAX_TEXT);

  if (!selected.length) {
    await ack({ response_action: "errors", errors: { cases_0: "Tick at least one case." } });
    return;
  }

  await ack();

  const parsedRepo = parseRepoFull(meta.repoFull);
  const targetOwner = parsedRepo?.owner || LEGACY_GH_OWNER;
  const targetRepo = parsedRepo?.repo || LEGACY_GH_REPO;
  const threadRef = meta.channel && meta.threadTs ? `${meta.channel}:${meta.threadTs}` : "";
  const reply = text =>
    meta.channel
      ? client.chat.postMessage({ channel: meta.channel, thread_ts: meta.threadTs || undefined, text })
      : Promise.resolve();

  console.log("");
  console.log("======================================");
  console.log("✍️ INSTRUCT & RETRY REQUESTED");
  console.log("======================================");
  console.log(`Ticket: ${meta.ticketId} | run: ${meta.generationRunId} | by: ${body.user?.id}`);
  console.log(`Cases: ${selected.join(", ")} | form text: ${instructions.length} chars | thread: ${threadRef || "none"}`);

  if (!meta.ticketId || !/^\d+$/.test(meta.generationRunId || "")) {
    await reply("❌ Could not start the batch: the form lost its ticket/run details. Click the button again.");
    return;
  }

  const baseInputs = {
    ticket_id: meta.ticketId,
    selected_test_cases: selected.join(","),
    generation_run_id: meta.generationRunId,
  };

  try {
    try {
      await dispatchGitHubWorkflow(targetOwner, targetRepo, APPROVED_TICKET_WORKFLOW, {
        ...baseInputs,
        user_instructions: instructions,
        user_instructions_thread: threadRef,
      });
    } catch (error) {
      // The workflow on main does not declare the instruction inputs yet
      // (this listener was deployed before that workflow change was merged):
      // GitHub rejects unknown inputs. Start a skills-only retry instead of
      // failing, and say so.
      if (!/Unexpected inputs/i.test(String(error.message))) throw error;

      console.warn("⚠️ Workflow on main has no user_instructions inputs yet — dispatching without instructions.");
      await dispatchGitHubWorkflow(targetOwner, targetRepo, APPROVED_TICKET_WORKFLOW, baseInputs);
      await reply(
        `⚠️ *Next batch started for ${meta.ticketId}: ${selected.join(", ")} — WITHOUT your instructions.*\n` +
          "The workflow on main does not accept instructions yet (merge the instruction-input change to main). " +
          "The cases retry using the skills only."
      );
      return;
    }

    await reply(
      `✅ *Next batch started for ${meta.ticketId}* by <@${body.user?.id}>: ${selected.join(", ")}\n` +
        (instructions || threadRef
          ? "🧭 The agent will follow the instructions from the form and this thread's replies; cases not mentioned retry using the skills only."
          : "🤖 No instructions given — the cases retry using the skills only.")
    );
  } catch (error) {
    console.error("❌ Failed to start the instructed batch:", error.message);
    await reply(`❌ *Failed to start the next batch for ${meta.ticketId}*\n\nError: ${error.message}`);
  }
});

// ==================================================
// BUG-REGRESSION AGENT (ai-bug-agent/slack/)
// ==================================================
//
// Registers only bug-specific commands/actions; no handler
// above is changed or shadowed.
//
require("../ai-bug-agent/slack/registerBugHandlers")(app, {
  dispatchGitHubWorkflow,
  owner: TICKET_SELECTION_OWNER,
  repo: TICKET_SELECTION_REPO,
});

// ==================================================
// START SERVER
// ==================================================

async function start() {
  try {
    await app.start(PORT);

    console.log("🤖 Tailorbird Slack HTTP Agent is running.");

    console.log(`🌐 Health endpoint: http://localhost:${PORT}/health`);

    console.log(
      "👂 Waiting for Slack commands, ticket selections, and test-case selections..."
    );

    console.log("");

    console.log("💬 Slack command: /ai-ticket-selection");
    console.log("🐞 Slack commands: /ai-bug-selection, /ai_bug_automation");

    console.log("🎫 Stage 1 listener: approve_ticket");

    console.log("🧪 Stage 2 listener: automate_testcases");

    console.log("♻️ Retry listeners: resume_reuse, resume_fresh");
    console.log("🔁 Next-batch listeners: automate_failed_cases, automate_remaining_cases");
    console.log("✍️ Instruct listeners: instruct_blocked_cases, view instruct_blocked_cases_modal");

    console.log("");

    console.log(`📋 Ticket-selection workflow: ${TICKET_SELECTION_WORKFLOW}`);

    console.log(
      `🧪 Test-case generation workflow: ${TESTCASE_GENERATION_WORKFLOW}`
    );

    console.log(`🤖 Approved-ticket workflow: ${APPROVED_TICKET_WORKFLOW}`);

    console.log("");

    console.log(
      `🗂️ Ticket-selection repository: ${TICKET_SELECTION_OWNER}/${TICKET_SELECTION_REPO}`
    );

    console.log(
      `🗂️ Legacy fallback repository (no repo stamped on the click): ${LEGACY_GH_OWNER}/${LEGACY_GH_REPO}`
    );

    console.log("");
  } catch (error) {
    console.error("❌ Failed to start Slack HTTP Agent:", error);

    process.exit(1);
  }
}

start();
