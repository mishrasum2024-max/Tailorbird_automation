require("dotenv").config();

const { WebClient } = require("@slack/web-api");

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

const TICKET_ID = process.env.TICKET_ID || "UNKNOWN";
const SELECTED_TEST_CASES = process.env.SELECTED_TEST_CASES || "";

const PR_STATUS = process.env.PR_STATUS || "unknown";
const PR_URL = process.env.PR_URL || "";

const TEST_STATUS = process.env.TEST_STATUS || "unknown";
const ARCHITECTURE_STATUS = process.env.ARCHITECTURE_STATUS || "unknown";

const RUN_URL = process.env.RUN_URL || "";

function describeTestStatus() {
  switch (TEST_STATUS) {
    case "passed":
      return "✅ Mandatory tests + new test case(s) passed";
    case "mandatory_failed":
      return "🚨 Mandatory (regression) tests FAILED — possible regression";
    case "failed":
      return "❌ New test case(s) failed";
    case "skipped":
      return "⚠️ Tests were not run";
    default:
      return "❓ Unknown test status";
  }
}

function describeArchitectureStatus() {
  switch (ARCHITECTURE_STATUS) {
    case "clean":
      return "✅ No raw locator/page-interaction usage found in spec files";
    case "violations":
      return "⚠️ Spec file(s) contain raw page/locator usage — review needed";
    case "skipped":
      return "⚠️ Architecture check was not run";
    default:
      return "❓ Unknown architecture status";
  }
}

function buildBlocks() {
  const blocks = [];

  const testLine = describeTestStatus();
  const archLine = describeArchitectureStatus();

  switch (PR_STATUS) {
    case "created": {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: "✅ AI-Generated Test PR Ready",
        },
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Ticket:* ${TICKET_ID}\n` +
            `*Test case(s):* ${SELECTED_TEST_CASES || "N/A"}\n\n` +
            `${testLine}\n${archLine}`,
        },
      });

      if (PR_URL) {
        blocks.push({
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open Pull Request",
              },
              style: "primary",
              url: PR_URL,
            },
          ],
        });
      }

      break;
    }

    case "updated": {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: "🔄 AI-Generated Test PR Updated",
        },
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Ticket:* ${TICKET_ID}\n` +
            `*Test case(s):* ${SELECTED_TEST_CASES || "N/A"}\n\n` +
            `${testLine}\n${archLine}`,
        },
      });

      if (PR_URL) {
        blocks.push({
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open Pull Request",
              },
              url: PR_URL,
            },
          ],
        });
      }

      break;
    }

    case "skipped": {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ No PR Created",
        },
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Ticket:* ${TICKET_ID}\n` +
            `*Test case(s):* ${SELECTED_TEST_CASES || "N/A"}\n\n` +
            "Claude did not produce any test file changes for this run. " +
            "No pull request was opened." +
            (RUN_URL ? `\n\n<${RUN_URL}|View workflow run and logs>` : ""),
        },
      });

      break;
    }

    default: {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: "❓ AI Automation Run Finished",
        },
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Ticket:* ${TICKET_ID}\n` +
            `*PR status:* ${PR_STATUS}\n` +
            (RUN_URL ? `\n<${RUN_URL}|View workflow run and logs>` : ""),
        },
      });
    }
  }

  return blocks;
}

async function main() {
  try {
    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN environment variable is missing.");
    }

    if (!CHANNEL_ID) {
      throw new Error("SLACK_CHANNEL_ID environment variable is missing.");
    }

    console.log("🤖 Sending PR status notification to Slack...");
    console.log(`Ticket: ${TICKET_ID}`);
    console.log(`PR status: ${PR_STATUS}`);
    console.log(`PR URL: ${PR_URL || "N/A"}`);
    console.log(`Test status: ${TEST_STATUS}`);
    console.log(`Architecture status: ${ARCHITECTURE_STATUS}`);

    const blocks = buildBlocks();

    const summaryText =
      PR_STATUS === "skipped"
        ? `No PR created for ${TICKET_ID}`
        : `AI-generated test PR for ${TICKET_ID}: ${PR_STATUS}`;

    const response = await slack.chat.postMessage({
      channel: CHANNEL_ID,
      text: summaryText,
      blocks,
    });

    console.log("\n✅ Slack notification sent.");
    console.log(`Message TS: ${response.ts}`);
  } catch (error) {
    console.error("\n❌ Failed to send Slack notification.");
    console.error(error.data?.error || error.message || error);

    // Do not fail the workflow just because the notification failed —
    // the PR itself (or lack of one) is the source of truth.
    process.exit(0);
  }
}

main();
