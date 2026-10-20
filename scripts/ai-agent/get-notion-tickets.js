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

/*
 * Notion filter: only these two Status values (OR-ed together).
 *
 * Replaces the earlier Status = "Complete" + Priority = "P1" filter.
 * No priority filter is applied anymore.
 */
const TARGET_STATUSES = ["Ready to Release", "Released"];

/*
 * Publish window, applied in this script (not in Notion):
 * only tickets whose "last edited time" falls between the start of
 * (today - LOOKBACK_DAYS) and now are published to Slack.
 */
const LOOKBACK_DAYS = parseInt(
  process.env.LOOKBACK_DAYS || "10",
  10
);

function getCutoffDate() {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - LOOKBACK_DAYS);
  return cutoff;
}

/*
 * How many tickets to pull per run.
 *
 * Was hard-coded to exactly 1, then defaulted to 5. Now defaults to 10 —
 * matching Slack's radio_buttons element limit (MAX_RADIO_OPTIONS in
 * send-ticket-approval.js), so every fetched ticket is guaranteed to be
 * selectable rather than silently truncated.
 */
const MAX_TICKETS = parseInt(
  process.env.MAX_TICKETS || "10",
  10
);

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

function mapTicket(page) {
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

    lastEditedTime: page.last_edited_time || "",

    url:
      getUrl(properties["URL"]) ||
      page.url,

    notionPageId: page.id,
  };
}

/*
 * Fetch every ticket matching the two Notion status filters,
 * newest "last edited" first.
 */
async function getAllMatchingTickets() {
  const tickets = [];

  let cursor = undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,

      start_cursor: cursor,

      page_size: 100,

      filter: {
        or: TARGET_STATUSES.map((status) => ({
          property: "Status",
          status: {
            equals: status,
          },
        })),
      },

      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending",
        },
      ],
    });

    for (const page of response.results) {
      tickets.push(mapTicket(page));
    }

    cursor = response.has_more
      ? response.next_cursor
      : undefined;

  } while (cursor);

  return tickets;
}

async function getAvailableTickets() {
  const cutoff = getCutoffDate();

  console.log(
    `🔎 Fetching Notion tickets with status ${TARGET_STATUSES.map((s) => `"${s}"`).join(" or ")}, sorted by last edited time (newest first)...`
  );

  const allTickets = await getAllMatchingTickets();

  console.log(
    `📥 Notion returned ${allTickets.length} ticket(s). Keeping only those last edited on/after ${cutoff.toISOString()} (today - ${LOOKBACK_DAYS} days)...`
  );

  /*
   * Check every ticket returned by Notion and keep only
   * those whose last edited time is inside the window.
   */
  const recentTickets = allTickets.filter((ticket) => {
    const edited = new Date(ticket.lastEditedTime);
    return !Number.isNaN(edited.getTime()) && edited >= cutoff;
  });

  /*
   * Log every fetched ticket with its priority. Priority is informational
   * only — tickets are never filtered by it; they are published with
   * whatever priority they have (or "No priority" when it is blank).
   */
  allTickets.forEach((ticket) => {
    const inWindow = recentTickets.includes(ticket);
    console.log(
      `   • ${ticket.id} | Priority: ${ticket.priority || "No priority"} | Status: ${ticket.status} | Edited: ${ticket.lastEditedTime} | ${inWindow ? "within window" : "outside window — skipped"}`
    );
  });

  console.log(
    `🗓️ ${recentTickets.length} ticket(s) fall within the last ${LOOKBACK_DAYS} days.`
  );

  /*
   * Slack's radio_buttons element shows at most 10 options
   * (MAX_RADIO_OPTIONS in send-ticket-approval.js), so only the
   * MAX_TICKETS most recently edited ones are published.
   */
  if (recentTickets.length > MAX_TICKETS) {
    console.log(
      `ℹ️ Publishing the ${MAX_TICKETS} most recently edited of them (Slack selection limit).`
    );
  }

  return recentTickets.slice(0, MAX_TICKETS);
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
     * Find up to MAX_TICKETS available tickets.
     *
     * Only Status = "Ready to Release" or "Released",
     * last edited within the past LOOKBACK_DAYS days.
     */
    const tickets = await getAvailableTickets();

    /*
     * No tickets available.
     */
    if (!tickets.length) {
      console.log(
        "\nℹ️ No ticket found."
      );

      console.log(
        `(No tickets with status ${TARGET_STATUSES.map((s) => `"${s}"`).join(" or ")} were edited in the last ${LOOKBACK_DAYS} days.) Nothing will be sent to Slack.`
      );

      /*
       * Overwrite the output file with an empty list so the Slack step
       * never posts stale data — data/notion-completed-tickets.json is
       * committed to git (as `[ {} ]`), so without this the next step
       * would read that leftover copy and post an empty "undefined" ticket.
       */
      const emptyOutputDir = path.join(__dirname, "..", "..", "data");
      fs.mkdirSync(emptyOutputDir, { recursive: true });
      fs.writeFileSync(
        path.join(emptyOutputDir, "notion-completed-tickets.json"),
        "[]\n",
        "utf8"
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
     * Save the tickets.
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
     * Output format is unchanged: an array of tickets.
     *
     * send-ticket-approval.js already loops over this
     * array to build the Slack checkboxes, so no changes
     * are needed there.
     *
     * It will contain:
     *
     * []                    -> no tickets available
     * [ticket]               -> 1 ticket (fewer than MAX_TICKETS were found)
     * [ticket, ticket, ...]  -> up to MAX_TICKETS tickets
     */
    fs.writeFileSync(
      outputFile,
      JSON.stringify(tickets, null, 2),
      "utf8"
    );

    /*
     * Display result.
     */
    console.log(
      "\n======================================"
    );

    console.log(
      `AVAILABLE TICKETS (${tickets.length})`
    );

    console.log(
      "======================================"
    );

    tickets.forEach((ticket, index) => {
      console.log(
        `\n[${index + 1}] ID:       ${ticket.id}`
      );

      console.log(
        `    Title:    ${ticket.title}`
      );

      console.log(
        `    Status:   ${ticket.status}`
      );

      console.log(
        `    Priority: ${ticket.priority || "N/A"}`
      );

      console.log(
        `    Type:     ${ticket.issueType || "N/A"}`
      );

      console.log(
        `    Created:  ${ticket.createdTime}`
      );

      console.log(
        `    Edited:   ${ticket.lastEditedTime}`
      );

      console.log(
        `    URL:      ${ticket.url}`
      );
    });

    console.log(
      "\n======================================"
    );

    console.log(
      `\n✅ ${tickets.length} ticket(s) selected for Slack.`
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