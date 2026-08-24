require("dotenv").config();

const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const DATA_SOURCE_ID =
  process.env.NOTION_DATA_SOURCE_ID ||
  "201aef20-7051-80c9-96fe-000b582249cd";

const TARGET_STATUS = "Complete";

function getText(property) {
  if (!property) return "";

  if (property.type === "title") {
    return (
      property.title
        ?.map((item) => item.plain_text)
        .join("") || ""
    );
  }

  if (property.type === "rich_text") {
    return (
      property.rich_text
        ?.map((item) => item.plain_text)
        .join("") || ""
    );
  }

  return "";
}

function getSelect(property) {
  if (!property) return "";

  return property.select?.name || "";
}

function getStatus(property) {
  if (!property) return "";

  return property.status?.name || "";
}

function getUrl(property) {
  if (!property) return "";

  return property.url || "";
}

function getUniqueId(property) {
  if (!property || !property.unique_id) {
    return "";
  }

  const prefix = property.unique_id.prefix || "";
  const number = property.unique_id.number || "";

  return `${prefix}-${number}`;
}

async function getAvailableTicket() {
  console.log(
    `🔎 Looking for the newest Notion ticket with status "${TARGET_STATUS}"...`
  );

  let cursor = undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,

      start_cursor: cursor,

      page_size: 100,

      filter: {
        property: "Status",
        status: {
          equals: TARGET_STATUS,
        },
      },

      sorts: [
        {
          property: "Created time",
          direction: "descending",
        },
      ],
    });

    /*
     * We only need ONE ticket.
     *
     * Because Notion returns results in descending
     * Created time order, the first result is the
     * newest available ticket.
     */
    if (response.results.length > 0) {
      const page = response.results[0];
      const properties = page.properties;

      return {
        id: getUniqueId(properties["ID"]),

        title: getText(properties["Name"]),

        status: getStatus(properties["Status"]),

        issueType: getSelect(
          properties["Issue Type"]
        ),

        priority: getSelect(
          properties["Priority"]
        ),

        testType: getText(
          properties["Test_TYPE"]
        ),

        createdTime:
          properties["Created time"]
            ?.created_time || "",

        url:
          getUrl(properties["URL"]) ||
          page.url,

        notionPageId: page.id,
      };
    }

    cursor = response.has_more
      ? response.next_cursor
      : undefined;

  } while (cursor);

  return null;
}

async function main() {
  try {
    if (!process.env.NOTION_API_KEY) {
      throw new Error(
        "NOTION_API_KEY is missing."
      );
    }

    console.log(
      "\n======================================"
    );

    console.log(
      "AI TICKET SELECTION"
    );

    console.log(
      "======================================"
    );

    /*
     * Find only ONE available ticket.
     *
     * Only Status = Complete is allowed.
     */
    const ticket = await getAvailableTicket();

    /*
     * No ticket available.
     */
    if (!ticket) {
      console.log(
        "\nℹ️ No tickets with status \"Complete\" are available."
      );

      console.log(
        "Nothing will be sent to Slack."
      );

      /*
       * This is not an error.
       *
       * GitHub Actions should finish successfully
       * when there is simply no ticket waiting.
       */
      process.exit(0);
    }

    /*
     * Save the single ticket.
     */
    const outputDir = path.join(
      __dirname,
      "..",
      "..",
      "data"
    );

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {
        recursive: true,
      });
    }

    const outputFile = path.join(
      outputDir,
      "notion-completed-tickets.json"
    );

    /*
     * IMPORTANT:
     *
     * Keep the output as an array because the
     * existing Slack script expects an array.
     *
     * But it will ALWAYS contain either:
     *
     * []       -> no ticket available
     *
     * [ticket] -> exactly one ticket
     */
    fs.writeFileSync(
      outputFile,
      JSON.stringify([ticket], null, 2),
      "utf8"
    );

    /*
     * Display result.
     */
    console.log(
      "\n======================================"
    );

    console.log(
      "AVAILABLE TICKET"
    );

    console.log(
      "======================================"
    );

    console.log(
      `ID:       ${ticket.id}`
    );

    console.log(
      `Title:    ${ticket.title}`
    );

    console.log(
      `Status:   ${ticket.status}`
    );

    console.log(
      `Priority: ${ticket.priority || "N/A"}`
    );

    console.log(
      `Type:     ${ticket.issueType || "N/A"}`
    );

    console.log(
      `Created:  ${ticket.createdTime}`
    );

    console.log(
      `URL:      ${ticket.url}`
    );

    console.log(
      "======================================"
    );

    console.log(
      `\n✅ Exactly one ticket selected for Slack: ${ticket.id}`
    );

    console.log(
      `📁 Saved to: ${outputFile}`
    );

    console.log(
      "\n➡️ Waiting for human approval in Slack..."
    );

  } catch (error) {
    console.error(
      "\n❌ Failed to fetch Notion ticket."
    );

    if (error.body) {
      console.error(
        JSON.stringify(
          error.body,
          null,
          2
        )
      );
    } else {
      console.error(
        error.message || error
      );
    }

    process.exit(1);
  }
}

main();