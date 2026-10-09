const { Client } = require("@notionhq/client");
const bugConfig = require("./bugConfig");
const { PROPERTIES, mapBug } = require("./notionBugMapper");

/*
 * ============================================================
 * BUG SOURCE
 * ============================================================
 *
 * Read-only access to the Notion bug database, shared by every
 * bug-agent script that needs bugs (check, fetch, process).
 * ============================================================
 */

function createNotionClient() {
  return new Client({ auth: bugConfig.notionApiKey });
}

// True when the bug's "URL" property is on the target host, with or
// without a scheme ("https://beta.tailorbird.com/jobs" and
// "beta.tailorbird.com/jobs" both match). The Notion filter below is
// a "contains" match; this exact host check also rejects look-alikes
// such as beta.tailorbird.com.example.org.
function isOnTargetHost(appUrl) {
  const value = String(appUrl || "").trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(withScheme).hostname.toLowerCase() === bugConfig.targetHost;
  } catch (error) {
    return false;
  }
}

function buildTargetFilter() {
  const filters = [
    {
      or: bugConfig.targetStatuses.map((status) => ({
        property: PROPERTIES.status.name,
        status: { equals: status },
      })),
    },
    {
      property: PROPERTIES.appUrl.name,
      url: { contains: bugConfig.targetHost },
    },
  ];

  return { and: filters };
}

/*
 * Newest-first bugs in a target status whose "URL" is on the
 * target host (any priority).
 * `skip(bug)` excludes bugs (e.g. already covered) without
 * counting them toward `limit`.
 */
async function fetchTargetBugs(notion, { limit, skip = () => false } = {}) {
  const bugs = [];
  let cursor;

  do {
    const response = await notion.dataSources.query({
      data_source_id: bugConfig.notionDataSourceId,
      start_cursor: cursor,
      page_size: 100,
      filter: buildTargetFilter(),
      sorts: [{ property: PROPERTIES.createdTime.name, direction: "descending" }],
    });

    for (const page of response.results) {
      const bug = mapBug(page);

      if (!isOnTargetHost(bug.appUrl) || skip(bug)) continue;

      bugs.push(bug);

      if (limit && bugs.length >= limit) return bugs;
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return bugs;
}

/*
 * Finds one bug by its number (BUG-1458 or 1458), regardless of
 * status. Returns { bug, page } or null.
 */
async function findBugByNumber(notion, bugId) {
  const number = parseInt(String(bugId).replace(/^\D+/, ""), 10);

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid bug ID "${bugId}". Expected BUG-<number>.`);
  }

  const response = await notion.dataSources.query({
    data_source_id: bugConfig.notionDataSourceId,
    page_size: 1,
    filter: { property: PROPERTIES.id.name, unique_id: { equals: number } },
  });

  const page = response.results[0];

  return page ? { bug: mapBug(page), page } : null;
}

module.exports = {
  createNotionClient,
  buildTargetFilter,
  isOnTargetHost,
  fetchTargetBugs,
  findBugByNumber,
};
