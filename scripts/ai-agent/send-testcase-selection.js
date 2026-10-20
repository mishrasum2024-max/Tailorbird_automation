require("dotenv").config();

const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

/*
 * Repository this run belongs to ("owner/repo").
 *
 * Stamped onto the button value so the shared Slack listener
 * can dispatch the next workflow to the correct repository.
 */
const GH_REPO_FULL = process.env.GH_REPO_FULL || "";

/*
 * ============================================================
 * FILE PATHS
 * ============================================================
 */

const TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "generated-testcases.json"
);

const TESTCASES_MD_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "generated-testcases.md"
);

const DROPPED_TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "dropped-testcases.json"
);

const INVESTIGATION_STATUS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "investigation-status.json"
);

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 *
 * Keep 45 as the workflow safety limit.
 *
 * Slack's current documentation allows up to 50 blocks in a
 * message, but this workflow previously failed at 45 and the
 * existing implementation explicitly enforced 45.
 *
 * We therefore keep 45 as the safe application limit.
 */

const SLACK_MAX_BLOCKS = 45;

/*
 * Categories must remain in this order.
 *
 * Matches the two-category system in
 * .claude/skills/automation-testcase-generation/SKILL.md:
 * "E2E + Positive" and "Negative + Edge".
 */

const CATEGORIES = [
  {
    key: "e2e_positive",
    label: "✅ E2E + POSITIVE TEST CASES",
  },
  {
    key: "negative_edge",
    label: "⚠️ NEGATIVE + EDGE TEST CASES",
  },
];

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeCategory(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/*
 * Resolve the category from the generated testcase object.
 */

function getCategory(testCase) {
  const rawCategory =
    testCase.type ||
    testCase.category ||
    testCase.testType ||
    "";

  const normalized = normalizeCategory(rawCategory);

  if (
    normalized === "e2epositive" ||
    normalized === "e2e" ||
    normalized === "positive" ||
    normalized === "endtoendpositive"
  ) {
    return "e2e_positive";
  }

  if (
    normalized === "negativeedge" ||
    normalized === "edgenegative" ||
    normalized === "negative" ||
    normalized === "edge"
  ) {
    return "negative_edge";
  }

  return "";
}

/*
 * Resolve testcase ID.
 */

function getTestCaseId(testCase, index) {
  return (
    testCase.id ||
    testCase.testCaseId ||
    testCase.tcId ||
    `TC${String(index + 1).padStart(3, "0")}`
  );
}

/*
 * Resolve testcase title.
 *
 * IMPORTANT:
 * Do NOT truncate this value.
 *
 * The complete title from generated-testcases.json is passed
 * to Slack.
 */

function getTestCaseTitle(testCase) {
  const title =
    testCase.title ||
    testCase.name ||
    testCase.testCase ||
    "Untitled test case";

  return String(title).trim();
}

/*
 * Escape Slack mrkdwn-sensitive characters without changing
 * the visible testcase title.
 *
 * This prevents titles containing <, >, or & from accidentally
 * being interpreted as Slack markup.
 */

function escapeSlackText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/*
 * ============================================================
 * LOAD GENERATED TEST CASES
 * ============================================================
 */

function loadTestCases() {
  if (!fs.existsSync(TESTCASES_FILE)) {
    throw new Error(
      `Test case file not found: ${TESTCASES_FILE}`
    );
  }

  const data = JSON.parse(
    fs.readFileSync(TESTCASES_FILE, "utf8")
  );

  const ticketId =
    data.ticketId ||
    data.ticketID ||
    data.ticket ||
    "UNKNOWN";

  const ticketTitle =
    data.ticketTitle ||
    data.title ||
    "Unknown Ticket";

  const testCases =
    Array.isArray(data.testCases)
      ? data.testCases
      : [];

  return {
    ticketId,
    ticketTitle,
    testCases,
  };
}

/*
 * ============================================================
 * LOAD LIVE-INVESTIGATION RESULTS (OPTIONAL)
 * ============================================================
 *
 * Written by ai-generate-testcases.yml's investigation step (if it
 * ran). Both files are optional — older tickets, or a run where live
 * validation was skipped/fell back, simply won't have them.
 */

function loadDroppedTestCases() {
  if (!fs.existsSync(DROPPED_TESTCASES_FILE)) {
    return [];
  }

  try {
    const dropped = JSON.parse(
      fs.readFileSync(DROPPED_TESTCASES_FILE, "utf8")
    );

    return Array.isArray(dropped) ? dropped : [];
  } catch (error) {
    console.warn(
      `⚠️ Could not parse dropped-testcases.json: ${error.message}`
    );

    return [];
  }
}

function loadInvestigationStatus() {
  if (!fs.existsSync(INVESTIGATION_STATUS_FILE)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(INVESTIGATION_STATUS_FILE, "utf8")
    );
  } catch (error) {
    console.warn(
      `⚠️ Could not parse investigation-status.json: ${error.message}`
    );

    return null;
  }
}

/*
 * ============================================================
 * GROUP TEST CASES BY CATEGORY
 * ============================================================
 */

function groupTestCases(testCases) {
  const grouped = {
    e2e_positive: [],
    negative_edge: [],
  };

  const uncategorized = [];

  testCases.forEach((testCase, index) => {
    const category = getCategory(testCase);

    const normalizedTestCase = {
      ...testCase,

      id: getTestCaseId(testCase, index),

      title: getTestCaseTitle(testCase),

      category,
    };

    if (category && grouped[category]) {
      grouped[category].push(normalizedTestCase);
    } else {
      uncategorized.push(normalizedTestCase);
    }
  });

  return {
    grouped,
    uncategorized,
  };
}

/*
 * ============================================================
 * CREATE INDIVIDUAL TESTCASE BLOCK
 * ============================================================
 *
 * IMPORTANT:
 *
 * Each testcase gets its own section block.
 *
 * The checkbox is kept as the section accessory so the visual
 * interaction remains the same as the current Slack message.
 *
 * The COMPLETE testcase title is used.
 *
 * No substring().
 * No maxLength.
 * No "...".
 *
 * expand: true is used so Slack can render the complete section
 * expanded rather than collapsing long text where supported.
 */

function createTestCaseRowBlock(testCase, runId) {
  const fullTitle = getTestCaseTitle(testCase);

  return {
    type: "section",

    block_id: `tc_${testCase.id}`,

    expand: true,

    text: {
      type: "mrkdwn",

      text:
        `*${escapeSlackText(testCase.id)}* | ` +
        `${escapeSlackText(fullTitle)}`,
    },

    accessory: {
      type: "checkboxes",

      action_id: `selected_testcase_${runId}_${testCase.id}`,

      options: [
        {
          text: {
            type: "plain_text",
            text: testCase.id,
            emoji: true,
          },

          value: testCase.id,
        },
      ],
    },
  };
}

/*
 * ============================================================
 * CREATE CATEGORY HEADER
 * ============================================================
 */

function createCategoryHeaderBlock(category, testCases) {
  const categoryConfig = CATEGORIES.find(
    item => item.key === category
  );

  if (!categoryConfig) {
    throw new Error(
      `Unknown category: ${category}`
    );
  }

  return {
    type: "section",

    text: {
      type: "mrkdwn",

      text:
        `*${categoryConfig.label}*\n` +
        `*${testCases.length} test case${
          testCases.length === 1 ? "" : "s"
        }*`,
    },
  };
}

/*
 * ============================================================
 * CREATE CATEGORY MESSAGE
 * ============================================================
 *
 * Every category gets its own Slack message.
 *
 * This prevents one large 50-testcase message from exceeding
 * the Slack block limit.
 */

function createVerificationBannerBlock(investigationStatus) {
  // No investigation-status.json at all means the live-verification
  // step never ran for this ticket (older ticket, or the feature was
  // skipped) — say nothing rather than claiming a verification state
  // we have no evidence for either way.
  if (!investigationStatus) {
    return null;
  }

  if (investigationStatus.verified === false) {
    return {
      type: "section",

      text: {
        type: "mrkdwn",

        text:
          `⚠️ *Unverified candidates* — ${escapeSlackText(
            investigationStatus.note ||
            "Live verification could not complete this run."
          )}`,
      },
    };
  }

  if (investigationStatus.verified === true) {
    return {
      type: "section",

      text: {
        type: "mrkdwn",

        text:
          "✅ *Live-verified* — every test case below was checked " +
          "against the real application (not just the ticket text) " +
          "before being sent here.",
      },
    };
  }

  return null;
}

function createDroppedTestCaseBlocks(droppedTestCases) {
  if (!droppedTestCases.length) {
    return [];
  }

  const blocks = [
    {
      type: "section",

      text: {
        type: "mrkdwn",

        text:
          `*⚠️ Not automatable — dropped after live verification*\n` +
          `*${droppedTestCases.length} candidate${
            droppedTestCases.length === 1 ? "" : "s"
          }*`,
      },
    },
  ];

  droppedTestCases.forEach(dropped => {
    blocks.push({
      type: "section",

      text: {
        type: "mrkdwn",

        text:
          `⚠️ *${escapeSlackText(dropped.id || "?")}* | ` +
          `${escapeSlackText(dropped.title || "Untitled")} — ` +
          `${escapeSlackText(dropped.reason || "no reason recorded")}`,
      },
    });
  });

  blocks.push({
    type: "divider",
  });

  return blocks;
}

function createTopBlocks(
  ticketId,
  ticketTitle,
  totalTestCases,
  grouped,
  droppedTestCases,
  investigationStatus
) {
  const blocks = [
    {
      type: "header",

      text: {
        type: "plain_text",

        text: "🧪 AI Generated Test Cases",

        emoji: true,
      },
    },

    {
      type: "section",

      text: {
        type: "mrkdwn",

        text:
          `*Ticket:* ${escapeSlackText(ticketId)}\n` +
          `*Title:* ${escapeSlackText(ticketTitle)}\n\n` +
          `*Total Test Cases:* ${totalTestCases}\n\n` +
          `*Select the test cases you want to automate:*`,
      },
    },
  ];

  const bannerBlock = createVerificationBannerBlock(investigationStatus);

  if (bannerBlock) {
    blocks.push(bannerBlock);
  }

  blocks.push({
    type: "section",

    text: {
      type: "mrkdwn",

      text:
        "*Test Case Distribution*\n" +
        CATEGORIES.map(categoryItem => {
          const count =
            grouped[categoryItem.key].length;

          return `${categoryItem.label}: *${count}*`;
        }).join("\n"),
    },
  });

  blocks.push(
    ...createDroppedTestCaseBlocks(droppedTestCases)
  );

  blocks.push({
    type: "divider",
  });

  return blocks;
}

function createCategoryBlocks(
  category,
  categoryTestCases,
  runId
) {
  const categoryConfig = CATEGORIES.find(
    item => item.key === category
  );

  if (!categoryConfig) {
    throw new Error(
      `Unknown category: ${category}`
    );
  }

  const blocks = [];

  blocks.push(
    createCategoryHeaderBlock(
      category,
      categoryTestCases
    )
  );

  categoryTestCases.forEach(testCase => {
    blocks.push(
      createTestCaseRowBlock(
        testCase,
        runId
      )
    );
  });

  return blocks;
}

function createFinalActionBlocks(ticketId, runId) {
  return [
    {
      type: "divider",
    },

    {
      type: "section",

      text: {
        type: "mrkdwn",

        text:
          "When you are finished selecting test cases, " +
          "click the button below. Only the selected test cases " +
          "will be automated.",
      },
    },

    {
      type: "actions",

      block_id: "automate_testcases_final",

      elements: [
        {
          type: "button",

          text: {
            type: "plain_text",

            text: "Automate Selected Test Cases",

            emoji: true,
          },

          style: "primary",

          action_id: "automate_testcases",

          value: GH_REPO_FULL
            ? `${ticketId}|${runId}|${GH_REPO_FULL}`
            : `${ticketId}|${runId}`,
        },
      ],
    },
  ];
}

/*
 * ============================================================
 * VALIDATE SLACK BLOCK COUNT
 * ============================================================
 */

function validateBlockCount(category, blocks) {
  if (blocks.length > SLACK_MAX_BLOCKS) {
    throw new Error(
      `${category} requires ${blocks.length} Slack blocks, ` +
      `but the configured maximum is ${SLACK_MAX_BLOCKS}. ` +
      `The category cannot be safely sent as one Slack message.`
    );
  }

  console.log(
    `   ✅ ${category}: ${blocks.length}/${SLACK_MAX_BLOCKS} blocks`
  );
}

/*
 * ============================================================
 * SEND CATEGORY TO SLACK
 * ============================================================
 */

async function sendCategoryToSlack(
  category,
  categoryTestCases,
  runId,
  includeTopBlocks,
  ticketId,
  ticketTitle,
  totalTestCases,
  grouped,
  droppedTestCases,
  investigationStatus
) {
  const categoryConfig = CATEGORIES.find(
    item => item.key === category
  );

  if (!categoryConfig) {
    throw new Error(
      `Unknown category: ${category}`
    );
  }

  const blocks = [];

  if (includeTopBlocks) {
    blocks.push(
      ...createTopBlocks(
        ticketId,
        ticketTitle,
        totalTestCases,
        grouped,
        droppedTestCases,
        investigationStatus
      )
    );
  }

  blocks.push(
    ...createCategoryBlocks(
      category,
      categoryTestCases,
      runId
    )
  );

  validateBlockCount(
    categoryConfig.label,
    blocks
  );

  console.log(
    `\n📤 Sending ${categoryConfig.label}`
  );

  console.log(
    `   Test cases: ${categoryTestCases.length}`
  );

  console.log(
    `   Slack blocks: ${blocks.length}`
  );

  const response =
    await slack.chat.postMessage({
      channel: CHANNEL_ID,

      text:
        `${categoryConfig.label} - ` +
        `${ticketId}`,

      blocks,
    });

  console.log(
    `   ✅ ${categoryConfig.label} sent successfully.`
  );

  console.log(
    `   Message TS: ${response.ts}`
  );

  return response;
}

/*
 * ============================================================
 * UPLOAD GENERATED MARKDOWN TO SLACK
 * ============================================================
 *
 * Upload the complete generated-testcases.md file once.
 *
 * The file is uploaded as a thread reply to the first category
 * message so the user has a single downloadable full record.
 */

async function uploadGeneratedMarkdown(
  ticketId,
  messageTs
) {
  if (
    !fs.existsSync(TESTCASES_MD_FILE)
  ) {
    throw new Error(
      `Generated Markdown file not found: ${TESTCASES_MD_FILE}`
    );
  }

  const stats =
    fs.statSync(TESTCASES_MD_FILE);

  if (stats.size === 0) {
    throw new Error(
      `Generated Markdown file is empty: ${TESTCASES_MD_FILE}`
    );
  }

  const filename =
    `${ticketId || "generated"}-generated-testcases.md`;

  console.log(
    `\n📄 Uploading generated Markdown to Slack: ${filename}`
  );

  const response =
    await slack.filesUploadV2({
      channel_id: CHANNEL_ID,

      thread_ts: messageTs,

      initial_comment:
        `📄 *Generated test cases record*\n` +
        `Download this Markdown file to keep an offline copy ` +
        `of the complete generated test cases for *${ticketId}*.`,

      file: TESTCASES_MD_FILE,

      filename,

      title:
        `${ticketId} - Generated Test Cases`,
    });

  console.log(
    "✅ Generated Markdown uploaded to Slack successfully."
  );

  return response;
}

/*
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  try {
    console.log(
      "🤖 Starting AI test-case Slack selection..."
    );

    /*
     * ----------------------------------------------------------
     * VALIDATE ENVIRONMENT VARIABLES
     * ----------------------------------------------------------
     */

    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error(
        "SLACK_BOT_TOKEN environment variable is missing."
      );
    }

    if (!CHANNEL_ID) {
      throw new Error(
        "SLACK_CHANNEL_ID environment variable is missing."
      );
    }

    /*
     * ----------------------------------------------------------
     * LOAD GENERATED TEST CASES
     * ----------------------------------------------------------
     */

    const {
      ticketId,
      ticketTitle,
      testCases,
    } = loadTestCases();

    if (!testCases.length) {
      throw new Error(
        "No test cases were found in generated-testcases.json"
      );
    }

    console.log(
      `📋 Loaded ${testCases.length} test cases for ${ticketId}`
    );

    /*
     * ----------------------------------------------------------
     * LOAD LIVE-INVESTIGATION RESULTS (OPTIONAL)
     * ----------------------------------------------------------
     */

    const droppedTestCases = loadDroppedTestCases();
    const investigationStatus = loadInvestigationStatus();

    if (droppedTestCases.length) {
      console.log(
        `⚠️ ${droppedTestCases.length} candidate(s) were dropped ` +
        `during live verification.`
      );
    }

    if (investigationStatus && investigationStatus.verified === false) {
      console.log(
        `⚠️ Live verification did not complete — candidates are unverified.`
      );
    }

    /*
     * ----------------------------------------------------------
     * GITHUB ACTIONS RUN ID
     * ----------------------------------------------------------
     */

    const runId =
      process.env.GITHUB_RUN_ID;

    if (!runId) {
      throw new Error(
        "GITHUB_RUN_ID environment variable is missing."
      );
    }

    console.log(
      `🔗 Test-case generation run ID: ${runId}`
    );

    /*
     * ----------------------------------------------------------
     * GROUP TEST CASES
     * ----------------------------------------------------------
     */

    const {
      grouped,
      uncategorized,
    } = groupTestCases(testCases);

    /*
     * ----------------------------------------------------------
     * CATEGORY SUMMARY
     * ----------------------------------------------------------
     */

    console.log(
      "\n======================================"
    );

    console.log(
      "TEST CASE CATEGORY SUMMARY"
    );

    console.log(
      "======================================"
    );

    CATEGORIES.forEach(category => {
      console.log(
        `${category.label}: ` +
        `${grouped[category.key].length}`
      );
    });

    if (uncategorized.length) {
      console.log(
        `⚠️ Uncategorized: ${uncategorized.length}`
      );

      uncategorized.forEach(testCase => {
        console.log(
          `   - ${testCase.id} | ${testCase.title}`
        );
      });
    }

    console.log(
      "======================================\n"
    );

    /*
     * ----------------------------------------------------------
     * IMPORTANT VALIDATION
     * ----------------------------------------------------------
     *
     * Uncategorized test cases are NOT silently sent into one
     * large message.
     *
     * If generated data contains an unknown category, fail
     * clearly so the workflow does not lose test cases.
     */

    if (uncategorized.length) {
      throw new Error(
        `Found ${uncategorized.length} uncategorized test case(s). ` +
        `All test cases must belong to one of the two supported categories ` +
        `("E2E + Positive" or "Negative + Edge").`
      );
    }

    /*
     * ----------------------------------------------------------
     * SEND EACH CATEGORY AS A SEPARATE SLACK MESSAGE
     * ----------------------------------------------------------
     */

    const sentMessages = [];

    for (const category of CATEGORIES) {
      const categoryTestCases =
        grouped[category.key];

      if (!categoryTestCases.length) {
        console.log(
          `⏭️ Skipping ${category.label}: no test cases`
        );

        continue;
      }

      const response =
        await sendCategoryToSlack(
          category.key,
          categoryTestCases,
          runId,
          sentMessages.length === 0,
          ticketId,
          ticketTitle,
          testCases.length,
          grouped,
          droppedTestCases,
          investigationStatus
        );

      sentMessages.push({
        category: category.key,
        response,
      });
    }

    /*
     * ----------------------------------------------------------
     * VERIFY THAT ALL TEST CASES WERE SENT
     * ----------------------------------------------------------
     */

    const sentTestCaseCount =
      CATEGORIES.reduce(
        (total, category) =>
          total +
          grouped[category.key].length,
        0
      );

    if (
      sentTestCaseCount !==
      testCases.length
    ) {
      throw new Error(
        `Test case count mismatch. ` +
        `Loaded ${testCases.length}, ` +
        `but categorized ${sentTestCaseCount}.`
      );
    }

    console.log(
      `\n✅ All ${sentTestCaseCount} test cases were sent to Slack.`
    );

    /*
     * ----------------------------------------------------------
     * FINAL AUTOMATION ACTION
     * ----------------------------------------------------------
     *
     * Keep the final instruction and automate button in one
     * separate message so they appear only once at the bottom.
     */

    const finalBlocks =
      createFinalActionBlocks(
        ticketId,
        runId
      );

    validateBlockCount(
      "FINAL AUTOMATION ACTION",
      finalBlocks
    );

    console.log(
      "\n📤 Sending final automation action..."
    );

    const finalResponse =
      await slack.chat.postMessage({
        channel: CHANNEL_ID,

        text:
          `Automation selection complete - ${ticketId}`,

        blocks: finalBlocks,
      });

    console.log(
      "   ✅ Final automation button sent successfully."
    );

    console.log(
      `   Message TS: ${finalResponse.ts}`
    );

    /*
     * ----------------------------------------------------------
     * UPLOAD COMPLETE MARKDOWN FILE
     * ----------------------------------------------------------
     *
     * Upload only once, attached to the first category message.
     */

    if (sentMessages.length > 0) {
      await uploadGeneratedMarkdown(
        ticketId,
        sentMessages[0].response.ts
      );
    }

    /*
     * ----------------------------------------------------------
     * FINAL SUMMARY
     * ----------------------------------------------------------
     */

    console.log(
      "\n======================================"
    );

    console.log(
      "SLACK TEST CASE SELECTION COMPLETE"
    );

    console.log(
      "======================================"
    );

    console.log(
      `Ticket: ${ticketId}`
    );

    console.log(
      `Total test cases: ${testCases.length}`
    );

    console.log(
      `Category messages sent: ${sentMessages.length}`
    );

    CATEGORIES.forEach(category => {
      if (grouped[category.key].length) {
        console.log(
          `  ${category.label}: ` +
          `${grouped[category.key].length}`
        );
      }
    });

    console.log(
      "\n📄 Complete generated-testcases.md uploaded to Slack."
    );

    console.log(
      "\n🎯 Only the test cases selected in Slack " +
      "will be sent to the automation workflow."
    );

    console.log(
      "======================================\n"
    );
  } catch (error) {
    console.error(
      "\n❌ Failed to send test cases to Slack."
    );

    console.error(
      error.data?.error ||
      error.message ||
      error
    );

    if (error.data) {
      console.error(
        "\nSlack API response:"
      );

      console.error(
        JSON.stringify(
          error.data,
          null,
          2
        )
      );
    }

    process.exit(1);
  }
}

main();