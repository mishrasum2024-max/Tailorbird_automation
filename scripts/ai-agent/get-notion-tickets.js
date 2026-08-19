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

function getText(property) {
  if (!property) return "";

  if (property.type === "title") {
    return (
      property.title
        ?.map(item => item.plain_text)
        .join("") || ""
    );
  }

  if (property.type === "rich_text") {
    return (
      property.rich_text
        ?.map(item => item.plain_text)
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

async function getCompletedTickets() {
  console.log("🔎 Fetching completed Notion tickets...");

  const results = [];
  let cursor = undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,

      start_cursor: cursor,

      page_size: 100,

      filter: {
        property: "Status",
        status: {
          equals: "Complete & Archived",
        },
      },

      sorts: [
        {
          property: "Created time",
          direction: "descending",
        },
      ],
    });

    for (const page of response.results) {
      const properties = page.properties;

      results.push({
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
      });
    }

    cursor = response.has_more
      ? response.next_cursor
      : undefined;

  } while (cursor);

  return results;
}

async function main() {
  try {
    /*
     * STEP 1
     * Fetch all completed tickets.
     *
     * Notion already returns them
     * newest → oldest because of the
     * Created time descending sort.
     */
    let tickets = await getCompletedTickets();

    /*
     * STEP 2
     * Keep only the newest 10 tickets.
     */
    tickets = tickets.slice(0, 10);

    /*
     * STEP 3
     * Sort those 10 tickets for Slack.
     *
     * Required order:
     * P1 → P2 → P0
     */
    const priorityOrder = {
      P1: 1,
      P2: 2,
      P0: 3,
    };

    tickets.sort((a, b) => {
      const priorityA =
        priorityOrder[a.priority] ?? 999;

      const priorityB =
        priorityOrder[b.priority] ?? 999;

      return priorityA - priorityB;
    });

    /*
     * STEP 4
     * Create data directory if it doesn't exist.
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

    /*
     * STEP 5
     * Save the selected tickets.
     */
    const outputFile = path.join(
      outputDir,
      "notion-completed-tickets.json"
    );

    fs.writeFileSync(
      outputFile,
      JSON.stringify(tickets, null, 2),
      "utf8"
    );

    /*
     * STEP 6
     * Display the selected tickets.
     */
    console.log(
      `\n✅ Completed tickets selected: ${tickets.length}`
    );

    console.log(
      `📁 Saved to: ${outputFile}`
    );

    console.log(
      "\n======================================"
    );

    console.log("SELECTED TICKETS");

    console.log(
      "======================================\n"
    );

    tickets.forEach((ticket, index) => {
      console.log(
        `${index + 1}. ` +
        `${ticket.priority || "NO PRIORITY"} | ` +
        `${ticket.id} | ` +
        `${ticket.title}`
      );

      console.log(
        `   Status: ${ticket.status}`
      );

      console.log(
        `   Created: ${ticket.createdTime}`
      );

      console.log(
        `   Type: ${ticket.issueType || "N/A"}`
      );

      console.log("");
    });

    console.log(
      "======================================"
    );

  } catch (error) {
    console.error(
      "\n❌ Failed to fetch Notion tickets."
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