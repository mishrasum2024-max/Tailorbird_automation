/*
 * ============================================================
 * NOTION BUG MAPPER
 * ============================================================
 *
 * Maps a page from the "Bugs (New Repo)" Notion database to a
 * plain bug object. Its schema differs from the feature database
 * (verified 2026-09-29 against the live data source):
 *
 *   - title property is "Bug description" (feature DB: "Name")
 *   - ID property is lowercase "id" with NO prefix, so the raw
 *     value is just a number; the team refers to bugs as
 *     "BUG-<number>" (e.g. "recurrence of BUG-1445"), so that is
 *     the ID format used everywhere in this agent. It also can
 *     never collide with feature ticket IDs in shared memory.
 *   - "URL" holds the in-app URL where the bug occurs (not the
 *     Notion link), so it is mapped to appUrl; the Notion page
 *     link is notionUrl.
 *
 * All property names live in PROPERTIES so a Notion rename is a
 * one-line change; check-bug-source.js verifies every entry
 * still exists with the expected type.
 * ============================================================
 */

const BUG_ID_PREFIX = "BUG";

const PROPERTIES = {
  id: { name: "id", type: "unique_id" },
  title: { name: "Bug description", type: "title" },
  status: { name: "Status", type: "status" },
  priority: { name: "Priority", type: "select" },
  reportedBy: { name: "Reported by", type: "select" },
  customers: { name: "Customer", type: "multi_select" },
  tags: { name: "Tags", type: "multi_select" },
  property: { name: "Property", type: "rich_text" },
  update: { name: "Update", type: "rich_text" },
  featureEnvUrl: { name: "Feature Env", type: "url" },
  appUrl: { name: "URL", type: "url" },
  files: { name: "Files & media", type: "files" },
  isBlocking: { name: "Is blocking", type: "relation" },
  blockedBy: { name: "Blocked by", type: "relation" },
  createdTime: { name: "Created time", type: "created_time" },
  lastEditedTime: { name: "Last edited time", type: "last_edited_time" },
};

function getText(property) {
  const items = property?.title || property?.rich_text || [];

  return items.map((item) => item.plain_text || "").join("").trim();
}

function formatBugId(number) {
  return number ? `${BUG_ID_PREFIX}-${number}` : "";
}

function mapBug(page) {
  const props = page.properties || {};
  const get = (key) => props[PROPERTIES[key].name];

  const number = get("id")?.unique_id?.number || null;

  return {
    id: formatBugId(number),
    number,
    title: getText(get("title")),
    status: get("status")?.status?.name || "",
    priority: get("priority")?.select?.name || "",
    reportedBy: get("reportedBy")?.select?.name || "",
    customers: (get("customers")?.multi_select || []).map((o) => o.name),
    tags: (get("tags")?.multi_select || []).map((o) => o.name),
    property: getText(get("property")),
    update: getText(get("update")),
    featureEnvUrl: get("featureEnvUrl")?.url || "",
    appUrl: get("appUrl")?.url || "",
    notionUrl: page.url || "",
    files: (get("files")?.files || []).map((file) => file.name),
    relatedPageIds: [
      ...(get("isBlocking")?.relation || []),
      ...(get("blockedBy")?.relation || []),
    ].map((relation) => relation.id),
    createdTime: get("createdTime")?.created_time || "",
    lastEditedTime: get("lastEditedTime")?.last_edited_time || "",
    notionPageId: page.id,
  };
}

module.exports = {
  BUG_ID_PREFIX,
  PROPERTIES,
  formatBugId,
  mapBug,
};
