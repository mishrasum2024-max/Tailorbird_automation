require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { WebClient } = require("@slack/web-api");

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

const TICKET_ID = process.env.TICKET_ID || "UNKNOWN";
const SELECTED_TEST_CASES = process.env.SELECTED_TEST_CASES || "";

const PR_STATUS = process.env.PR_STATUS || "unknown";
const PR_URL = process.env.PR_URL || "";

const TEST_STATUS = process.env.TEST_STATUS || "unknown";
const REPAIR_ATTEMPTS = parseInt(process.env.REPAIR_ATTEMPTS || "0", 10);
const PASSED_TEST_CASES = process.env.PASSED_TEST_CASES || "";
const FAILED_TEST_CASES = process.env.FAILED_TEST_CASES || "";
const ARCHITECTURE_STATUS = process.env.ARCHITECTURE_STATUS || "unknown";

const RUN_URL = process.env.RUN_URL || "";

// "pr" (default) = automation run with a PR outcome;
// "generation" = ai-generate-testcases.yml failed before its Slack
// test-case selection message could be sent.
const NOTIFY_KIND = process.env.NOTIFY_KIND || "pr";

// Resume / retry (see build-resume-bundle.js + slack-http-agent.js)
const JOB_STATUS = process.env.JOB_STATUS || "";
const RESUME_WORKFLOW = process.env.RESUME_WORKFLOW || "";
const RESUME_ARTIFACT_URL = process.env.RESUME_ARTIFACT_URL || "";
const RUN_ID = process.env.RUN_ID || "";
const GENERATION_RUN_ID = process.env.GENERATION_RUN_ID || "";
const GH_REPO_FULL = process.env.GH_REPO_FULL || "";

const RESUME_MANIFEST_FILE = path.join(
  __dirname,
  "..",
  "..",
  ".resume-bundle",
  "manifest.json"
);

function readResumeManifest() {
  try {
    return JSON.parse(fs.readFileSync(RESUME_MANIFEST_FILE, "utf8"));
  } catch (error) {
    return null;
  }
}

function runFailed() {
  return JOB_STATUS === "failure" || JOB_STATUS === "cancelled";
}

// Offer retry whenever the run didn't end with verified, passing tests.
function retryWorthOffering() {
  return (
    NOTIFY_KIND === "generation" ||
    runFailed() ||
    TEST_STATUS !== "passed" ||
    !["created", "updated"].includes(PR_STATUS)
  );
}

function describeTestStatus() {
  switch (TEST_STATUS) {
    case "passed":
      return REPAIR_ATTEMPTS > 0
        ? `✅ New test case failed initially, auto-fixed via live-browser repair (${REPAIR_ATTEMPTS} attempt(s)), now passing`
        : "✅ Mandatory tests + new test case(s) passed";
    case "mandatory_failed":
      return "🚨 Mandatory (regression) tests FAILED — possible regression";
    case "failed":
      return REPAIR_ATTEMPTS > 0
        ? `❌ New test case still failing after ${REPAIR_ATTEMPTS} automatic repair attempt(s) — needs manual review`
        : "❌ New test case(s) failed";
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

function buildResultsLine() {
  const lines = [];

  if (PASSED_TEST_CASES) {
    lines.push(`✅ Passed: ${PASSED_TEST_CASES}`);
  }

  if (FAILED_TEST_CASES) {
    lines.push(`❌ Failed: ${FAILED_TEST_CASES}`);
  }

  return lines.join("\n");
}

function needsReview() {
  return (
    TEST_STATUS !== "passed" ||
    ARCHITECTURE_STATUS === "violations" ||
    ARCHITECTURE_STATUS === "unknown"
  );
}

/*
 * "Saved data" section + Download / Retry buttons.
 *
 * Retry button value (parsed by slack-http-agent.js):
 *   WORKFLOW_FILE|TICKET_ID|SELECTED_TEST_CASES|GENERATION_RUN_ID|FAILED_RUN_ID|owner/repo
 */
function buildResumeBlocks() {
  if (!RESUME_WORKFLOW || !RUN_ID) {
    return [];
  }

  const manifest = readResumeManifest();
  const contents = manifest?.contents || {};
  const hasBundle = Boolean(RESUME_ARTIFACT_URL && manifest);
  const offerRetry = retryWorthOffering();

  if (!hasBundle && !offerRetry) {
    return [];
  }

  const blocks = [];

  if (hasBundle) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "*💾 Data saved from this run*\n" +
          `• Generated code files: ${(contents.codeFiles || []).length}\n` +
          `• Records / test data files: ${(contents.recordFiles || []).length}\n` +
          `• Login sessions: ${(contents.sessionFiles || []).length}\n` +
          `• Logs: ${(contents.logFiles || []).length}\n\n` +
          "_Download needs GitHub access to this repo. It contains login " +
          "session cookies — don't share the zip outside the team._",
      },
    });
  }

  const elements = [];

  if (hasBundle) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "📦 Download data", emoji: true },
      url: RESUME_ARTIFACT_URL,
    });
  }

  if (offerRetry) {
    const value = [
      RESUME_WORKFLOW,
      TICKET_ID,
      SELECTED_TEST_CASES,
      GENERATION_RUN_ID,
      RUN_ID,
      GH_REPO_FULL,
    ].join("|");

    if (hasBundle) {
      elements.push({
        type: "button",
        text: {
          type: "plain_text",
          text: "♻️ Retry with previous data",
          emoji: true,
        },
        style: "primary",
        action_id: "resume_reuse",
        value,
      });
    }

    elements.push({
      type: "button",
      text: { type: "plain_text", text: "🆕 Start from scratch", emoji: true },
      action_id: "resume_fresh",
      value,
    });
  }

  if (RUN_URL) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "View run", emoji: true },
      url: RUN_URL,
    });
  }

  if (elements.length) {
    blocks.push({ type: "actions", elements });
  }

  return blocks;
}

function buildGenerationFailedBlocks() {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text:
          JOB_STATUS === "cancelled"
            ? "⚠️ Test-Case Generation Cancelled"
            : "❌ Test-Case Generation Failed",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Ticket:* ${TICKET_ID}\n\n` +
          "The run stopped before the test cases could be sent for selection. " +
          "Retry with the previous data (sessions, any test cases already " +
          "generated) or start from scratch.",
      },
    },
  ];
}

function buildBlocks() {
  if (NOTIFY_KIND === "generation") {
    return [...buildGenerationFailedBlocks(), ...buildResumeBlocks()];
  }

  return [...buildPrBlocks(), ...buildResumeBlocks()];
}

function buildPrBlocks() {
  const blocks = [];

  const testLine = describeTestStatus();
  const archLine = describeArchitectureStatus();
  const resultsLine = buildResultsLine();

  switch (PR_STATUS) {
    case "created": {
      const reviewNeeded = needsReview();

      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: reviewNeeded
            ? "⚠️ AI-Generated Test PR — Needs Review"
            : "✅ AI-Generated Test PR Ready",
        },
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Ticket:* ${TICKET_ID}\n` +
            `*Test case(s):* ${SELECTED_TEST_CASES || "N/A"}\n\n` +
            `${testLine}\n${archLine}` +
            (resultsLine ? `\n\n${resultsLine}` : ""),
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
            `${testLine}\n${archLine}` +
            (resultsLine ? `\n\n${resultsLine}` : ""),
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
          text: runFailed()
            ? "❌ AI Automation Run Failed"
            : "❓ AI Automation Run Finished",
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

    let summaryText;

    if (NOTIFY_KIND === "generation") {
      summaryText = `Test-case generation failed for ${TICKET_ID}`;
    } else if (PR_STATUS === "skipped") {
      summaryText = `No PR created for ${TICKET_ID}`;
    } else if (!["created", "updated"].includes(PR_STATUS)) {
      summaryText = runFailed()
        ? `AI automation run failed for ${TICKET_ID}`
        : `AI automation run finished for ${TICKET_ID}`;
    } else {
      summaryText = `AI-generated test PR for ${TICKET_ID}: ${PR_STATUS}`;
    }

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
