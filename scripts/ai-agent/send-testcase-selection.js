require("dotenv").config();

const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

const TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "generated-testcases.json"
);

async function main() {
  try {
    console.log("🤖 Starting AI test-case Slack selection...");

    if (!fs.existsSync(TESTCASES_FILE)) {
      throw new Error(
        `Test case file not found: ${TESTCASES_FILE}`
      );
    }

    const data = JSON.parse(
      fs.readFileSync(TESTCASES_FILE, "utf8")
    );

    const ticketId = data.ticketId || "UNKNOWN";
    const ticketTitle = data.ticketTitle || "Unknown Ticket";
    const testCases = data.testCases || [];

    if (!testCases.length) {
      throw new Error(
        "No test cases were found in generated-testcases.json"
      );
    }

    console.log(
      `📋 Loaded ${testCases.length} test cases for ${ticketId}`
    );

    /*
     * GitHub Actions run ID.
     *
     * This must be provided by the workflow when this script runs.
     * It allows the next workflow to download the exact test-case
     * artifact generated for this ticket.
     */
    const runId = process.env.GITHUB_RUN_ID;

    if (!runId) {
      throw new Error(
        "GITHUB_RUN_ID environment variable is missing."
      );
    }

    console.log(
      `🔗 Test-case generation run ID: ${runId}`
    );

    const options = testCases.map((testCase) => ({
      text: {
        type: "plain_text",
        text: `${testCase.id} | ${testCase.title}`.substring(
          0,
          75
        ),
      },
      value: testCase.id,
    }));

    const response = await slack.chat.postMessage({
      channel: CHANNEL_ID,

      text: `AI Test Cases Ready - ${ticketId}`,

      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🧪 AI Generated Test Cases",
          },
        },

        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Ticket:* ${ticketId}\n` +
              `*Title:* ${ticketTitle}\n\n` +
              `*Select the test cases you want to automate:*`,
          },
        },

        {
          type: "divider",
        },

        {
          type: "actions",

          block_id: "testcase_selection",

          elements: [
            {
              type: "checkboxes",

              action_id: "selected_testcases",

              options,
            },
          ],
        },

        {
          type: "actions",

          elements: [
            {
              type: "button",

              text: {
                type: "plain_text",
                text: "Automate Selected Test Cases",
              },

              style: "primary",

              action_id: "automate_testcases",

              /*
               * IMPORTANT:
               *
               * We send both the ticket ID and the GitHub
               * Actions run ID.
               *
               * Example:
               *
               * FEAT-1134|32454169759
               */
              value: `${ticketId}|${runId}`,
            },
          ],
        },
      ],
    });

    console.log(
      "\n✅ Test-case selection message sent to Slack."
    );

    console.log(`Message TS: ${response.ts}`);

    console.log(`Ticket: ${ticketId}`);

    console.log(`Test cases: ${testCases.length}`);

    console.log(`Run ID: ${runId}`);

  } catch (error) {
    console.error(
      "\n❌ Failed to send test cases to Slack."
    );

    console.error(
      error.data?.error ||
      error.message ||
      error
    );

    process.exit(1);
  }
}

main();