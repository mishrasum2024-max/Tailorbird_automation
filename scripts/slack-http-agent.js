require("dotenv").config();

const https = require("https");
const { App, ExpressReceiver } = require("@slack/bolt");

// ==================================================
// ENVIRONMENT VARIABLES
// ==================================================

const PORT = Number(process.env.PORT || 3000);

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

const GH_OWNER = process.env.GH_OWNER;
const GH_REPO = process.env.GH_REPO;
const GH_PAT = process.env.GH_PAT;

// IMPORTANT:
// Set this in Render Environment Variables to the
// actual filename of your test-case generation workflow.
//
// Example:
// ai-generate-test-cases.yml
//
const TESTCASE_GENERATION_WORKFLOW =
  process.env.TESTCASE_GENERATION_WORKFLOW ||
  "ai-generate-test-cases.yml";

// ==================================================
// VALIDATION
// ==================================================

if (!SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN is missing.");
}

if (!SLACK_SIGNING_SECRET) {
  throw new Error("SLACK_SIGNING_SECRET is missing.");
}

if (!GH_OWNER || !GH_REPO || !GH_PAT) {
  throw new Error(
    "GH_OWNER, GH_REPO, or GH_PAT environment variable is missing."
  );
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

function dispatchGitHubWorkflow(workflowFile, inputs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      ref: "main",
      inputs,
    });

    const options = {
      hostname: "api.github.com",

      path:
        `/repos/${GH_OWNER}/${GH_REPO}` +
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

    const request = https.request(options, (response) => {
      let responseBody = "";

      response.on("data", (chunk) => {
        responseBody += chunk;
      });

      response.on("end", () => {
        if (
          response.statusCode >= 200 &&
          response.statusCode < 300
        ) {
          resolve({
            statusCode: response.statusCode,
            body: responseBody,
          });

          return;
        }

        reject(
          new Error(
            `GitHub workflow dispatch failed. ` +
              `Workflow: ${workflowFile}. ` +
              `Status: ${response.statusCode}. ` +
              `Response: ${responseBody}`
          )
        );
      });
    });

    request.on("error", (error) => {
      reject(error);
    });

    request.write(payload);
    request.end();
  });
}

// ==================================================
// EXTRACT CHECKBOX SELECTIONS
// ==================================================

function getSelectedTestCases(body) {
  const stateValues = body.state?.values || {};

  const selectedTestCases = [];

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
            selectedTestCases.push(option.value);
          }
        }
      }
    }
  }

  return [...new Set(selectedTestCases)];
}

// ==================================================
// EXTRACT SELECTED TICKETS
// ==================================================

function getSelectedTickets(body) {
  const stateValues = body.state?.values || {};

  const selectedTickets = [];

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
            selectedTickets.push(option.value);
          }
        }
      }
    }
  }

  return [...new Set(selectedTickets)];
}

// ==================================================
// STAGE 1
//
// SELECT TICKETS
//
// Slack action_id:
// approve_tickets
// ==================================================

app.action(
  "approve_tickets",
  async ({ ack, body, client }) => {

    // VERY IMPORTANT:
    // Acknowledge Slack immediately.
    await ack();

    console.log("");
    console.log("======================================");
    console.log("🎫 TICKET APPROVAL RECEIVED");
    console.log("======================================");

    const selectedTickets =
      getSelectedTickets(body);

    console.log(
      "Selected tickets:",
      selectedTickets
    );

    // ----------------------------------------------
    // Validate
    // ----------------------------------------------

    if (selectedTickets.length === 0) {
      console.error(
        "❌ No tickets selected."
      );

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          "⚠️ No tickets were selected.\n\n" +
          "Please select at least one ticket.",
      });

      return;
    }

    console.log(
      `✅ ${selectedTickets.length} ticket(s) approved.`
    );

    selectedTickets.forEach((ticketId) => {
      console.log(`   - ${ticketId}`);
    });

    // ----------------------------------------------
    // Trigger test-case generation
    // ----------------------------------------------

    for (const ticketId of selectedTickets) {

      try {

        console.log("");
        console.log(
          `🚀 Starting test-case generation for ${ticketId}...`
        );

        await dispatchGitHubWorkflow(
          TESTCASE_GENERATION_WORKFLOW,
          {
            ticket_id: ticketId,
          }
        );

        console.log(
          `✅ Test-case generation started for ${ticketId}`
        );

      } catch (error) {

        console.error(
          `❌ Failed to start generation for ${ticketId}:`,
          error.message
        );

        await client.chat.postMessage({
          channel: body.channel.id,

          text:
            `❌ *Failed to generate test cases for ${ticketId}*\n\n` +
            `${error.message}`,
        });

        continue;
      }
    }

    // ----------------------------------------------
    // Slack confirmation
    // ----------------------------------------------

    await client.chat.postMessage({
      channel: body.channel.id,

      text:
        `✅ *Ticket approval received*\n\n` +
        `Selected tickets:\n` +
        selectedTickets
          .map((ticket) => `• ${ticket}`)
          .join("\n") +
        `\n\n` +
        `🤖 Test-case generation has been started for the selected tickets.\n\n` +
        `Once the test cases are generated, a second approval message will appear where you can select which test cases should actually be automated.`,
    });

    console.log("");
    console.log(
      "🎉 STAGE 1 COMPLETED"
    );

    console.log(
      "Tickets approved:",
      selectedTickets.join(", ")
    );

    console.log(
      "======================================"
    );
  }
);

// ==================================================
// STAGE 2
//
// SELECT TEST CASES
//
// Slack action_id:
// automate_testcases
// ==================================================

app.action(
  "automate_testcases",
  async ({ ack, body, client }) => {

    // VERY IMPORTANT:
    // Acknowledge Slack immediately.
    await ack();

    console.log("");
    console.log("======================================");
    console.log("🧪 TEST CASE APPROVAL RECEIVED");
    console.log("======================================");

    // ----------------------------------------------
    // Button value format:
    //
    // FEAT-1134|32692036243
    //
    // ticket_id | generation_run_id
    // ----------------------------------------------

    const buttonValue =
      body.actions?.[0]?.value || "";

    const [ticketId, generationRunId] =
      buttonValue.split("|");

    console.log(
      `Ticket ID: ${ticketId || "UNKNOWN"}`
    );

    console.log(
      `Generation Run ID: ${
        generationRunId || "UNKNOWN"
      }`
    );

    // ----------------------------------------------
    // Get selected test cases
    // ----------------------------------------------

    const selectedTestCases =
      getSelectedTestCases(body);

    console.log(
      "Selected test cases:",
      selectedTestCases
    );

    // ----------------------------------------------
    // Validation
    // ----------------------------------------------

    if (!ticketId) {

      console.error(
        "❌ Ticket ID is missing."
      );

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          "❌ Unable to start automation because the ticket ID is missing.",
      });

      return;
    }

    if (!generationRunId) {

      console.error(
        "❌ Generation run ID is missing."
      );

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          `❌ Unable to start automation for ${ticketId} because the generation workflow run ID is missing.`,
      });

      return;
    }

    if (selectedTestCases.length === 0) {

      console.error(
        "❌ No test cases selected."
      );

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          "⚠️ No test cases were selected.\n\n" +
          "Please select at least one test case.",
      });

      return;
    }

    // ----------------------------------------------
    // Approval information
    // ----------------------------------------------

    console.log(
      `✅ Human approved ${selectedTestCases.length} test case(s).`
    );

    selectedTestCases.forEach((testCaseId) => {
      console.log(
        `   - ${testCaseId}`
      );
    });

    // ----------------------------------------------
    // Trigger AI Approved Ticket workflow
    // ----------------------------------------------

    try {

      console.log("");
      console.log(
        "🚀 Triggering AI Approved Ticket workflow..."
      );

      await dispatchGitHubWorkflow(
        "ai-approved-ticket.yml",
        {
          ticket_id: ticketId,

          selected_test_cases:
            selectedTestCases.join(","),

          generation_run_id:
            generationRunId,
        }
      );

      console.log(
        `✅ AI Approved Ticket workflow triggered for ${ticketId}`
      );

      // --------------------------------------------
      // Slack confirmation
      // --------------------------------------------

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          `✅ *Automation started for ${ticketId}*\n\n` +
          `Selected test cases:\n` +
          selectedTestCases
            .map((testCase) => `• ${testCase}`)
            .join("\n") +
          `\n\n` +
          `🤖 Claude will automate only these approved test cases.`,
      });

      console.log("");
      console.log(
        "🎉 STAGE 2 COMPLETED"
      );

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

    console.log(
      "======================================"
    );
  }
);

// ==================================================
// START SERVER
// ==================================================

async function start() {

  try {

    await app.start(PORT);

    console.log(
      "🤖 Tailorbird Slack HTTP Agent is running."
    );

    console.log(
      `🌐 Health endpoint: http://localhost:${PORT}/health`
    );

    console.log(
      "👂 Waiting for Slack ticket and test-case selections..."
    );

    console.log("");
    console.log(
      "🎫 Stage 1 listener: approve_tickets"
    );

    console.log(
      "🧪 Stage 2 listener: automate_testcases"
    );

  } catch (error) {

    console.error(
      "❌ Failed to start Slack HTTP Agent:",
      error
    );

    process.exit(1);
  }
}

start();