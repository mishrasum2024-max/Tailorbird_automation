require("dotenv").config();

const https = require("https");
const { App, ExpressReceiver } = require("@slack/bolt");

// --------------------------------------------------
// Environment variables
// --------------------------------------------------

const PORT = Number(process.env.PORT || 3000);

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

const GH_OWNER = process.env.GH_OWNER;
const GH_REPO = process.env.GH_REPO;
const GH_PAT = process.env.GH_PAT;

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

// --------------------------------------------------
// Slack HTTP receiver
// --------------------------------------------------

const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
  endpoints: "/slack/events",
});

// --------------------------------------------------
// Slack Bolt App
// --------------------------------------------------

const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
});

// --------------------------------------------------
// Health check
// --------------------------------------------------

receiver.app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "tailorbird-slack-agent",
  });
});

// --------------------------------------------------
// Trigger GitHub Actions workflow
// --------------------------------------------------

function triggerGitHubWorkflow(
  ticketId,
  selectedTestCases,
  generationRunId
) {
  return new Promise((resolve, reject) => {
    const selectedTestCasesString =
      selectedTestCases.join(",");

    const payload = JSON.stringify({
      ref: "main",

      inputs: {
        ticket_id: ticketId,
        selected_test_cases: selectedTestCasesString,
        generation_run_id: generationRunId || "",
      },
    });

    const options = {
      hostname: "api.github.com",

      path:
        `/repos/${GH_OWNER}/${GH_REPO}` +
        `/actions/workflows/ai-approved-ticket.yml/dispatches`,

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
          console.log(
            `✅ GitHub workflow triggered for ${ticketId}`
          );

          console.log(
            `   Selected test cases: ${selectedTestCasesString}`
          );

          console.log(
            `   Generation run ID: ${
              generationRunId || "N/A"
            }`
          );

          resolve();
        } else {
          reject(
            new Error(
              `GitHub workflow dispatch failed for ${ticketId}. ` +
                `Status: ${response.statusCode}. ` +
                `Response: ${responseBody}`
            )
          );
        }
      });
    });

    request.on("error", (error) => {
      reject(error);
    });

    request.write(payload);
    request.end();
  });
}

// --------------------------------------------------
// Extract selected test cases from Slack
// --------------------------------------------------

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

// --------------------------------------------------
// Automate Selected Test Cases
// --------------------------------------------------

app.action(
  "automate_testcases",
  async ({ ack, body, client }) => {
    // Slack requires acknowledgement immediately.
    await ack();

    console.log(
      "\n🔔 Automate Selected Test Cases clicked."
    );

    // ------------------------------------------------
    // Button value contains:
    //
    // FEAT-1134|32470304965
    //
    // Ticket ID + generation workflow run ID
    // ------------------------------------------------

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

    // ------------------------------------------------
    // Get selected test cases
    // ------------------------------------------------

    const selectedTestCases =
      getSelectedTestCases(body);

    console.log(
      "Selected test cases:",
      selectedTestCases
    );

    // ------------------------------------------------
    // Safety validation
    // ------------------------------------------------

    if (!ticketId) {
      console.error(
        "❌ Ticket ID is missing."
      );

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          "❌ Unable to process the request because the ticket ID is missing.",
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

    // ------------------------------------------------
    // Log approval information
    // ------------------------------------------------

    console.log(
      "\n✅ HUMAN APPROVAL RECEIVED"
    );

    console.log(
      `Ticket: ${ticketId}`
    );

    console.log(
      `Selected test cases: ${selectedTestCases.length}`
    );

    selectedTestCases.forEach((testCaseId) => {
      console.log(`   - ${testCaseId}`);
    });

    // ------------------------------------------------
    // Trigger GitHub Actions
    // ------------------------------------------------

    console.log(
      "\n🚀 Triggering AI Approved Ticket workflow..."
    );

    try {
      await triggerGitHubWorkflow(
        ticketId,
        selectedTestCases,
        generationRunId
      );

      console.log(
        `✅ ${ticketId} sent to GitHub Actions`
      );

      // ------------------------------------------------
      // Confirm in Slack
      // ------------------------------------------------

      await client.chat.postMessage({
        channel: body.channel.id,

        text:
          `✅ *Automation started for ${ticketId}*\n\n` +
          `Selected test cases: ${selectedTestCases.join(
            ", "
          )}\n\n` +
          `GitHub Actions workflow has been triggered.`,
      });
    } catch (error) {
      console.error(
        "❌ Failed to trigger GitHub workflow:",
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
      "\n🎉 Slack → GitHub automation trigger completed."
    );
  }
);

// --------------------------------------------------
// Start HTTP server
// --------------------------------------------------

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
      "👂 Waiting for Slack test-case selections..."
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