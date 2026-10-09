const fs = require("fs");
const path = require("path");
const https = require("https");
const { createNotionClient, findBugByNumber } = require("./lib/bugSource");
const { formatBugId } = require("./lib/notionBugMapper");
const paths = require("./lib/bugPaths");

/*
 * ============================================================
 * PROCESS APPROVED BUG (Phase 2)
 * ============================================================
 *
 * Bug-agent counterpart of scripts/ai-agent/process-approved-ticket.js.
 * Builds the full context Claude needs for one approved bug:
 *
 *   - properties (via notionBugMapper)
 *   - page body split by the bug template headings
 *     (Description / URLs / Steps to Reproduce / Developer Debug
 *     Notes), with unfilled template placeholders removed
 *   - embedded images + "Files & media" downloaded to
 *     runtime/attachments/ so Claude can look at the screenshots
 *   - comments (needs the Notion integration's "Read comments"
 *     capability; skipped with a note otherwise)
 *   - related bugs: "Is blocking" / "Blocked by" relations plus
 *     BUG-<n> mentions in the text (e.g. "recurrence of BUG-1445")
 *   - a quality report flagging thin bugs (no steps, no URL, ...)
 *
 * Email addresses are redacted: bug reports quote real customer
 * users, and regression tests must only use our test accounts.
 *
 * Env: BUG_ID (e.g. BUG-1458)
 *
 * Writes:
 *   ai-bug-agent/runtime/current-bug-context.json
 *   data/current-ticket-context.json  (compat copy, see bugPaths.js)
 * ============================================================
 */

const BUG_ID = process.env.BUG_ID;

const MAX_BLOCK_DEPTH = 3;
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_RELATED_BUGS = 5;

const SECTION_KEYS = {
  description: "description",
  urls: "urls",
  "steps to reproduce": "stepsToReproduce",
  "developer debug notes": "developerNotes",
};

// Lines from the Notion bug template that carry no information.
const PLACEHOLDER_PATTERNS = [
  /^\[[^\]]*\]$/, // "[Briefly describe the issue]"
  /^step\s*\d+$/i, // "Step1", "Step 2"
  /^logged in user email:?\s*$/i,
];

function redact(text) {
  return String(text || "").replace(
    /(mailto:)?[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
    "[redacted-email]"
  );
}

function richText(items = []) {
  return items.map((item) => item.plain_text || "").join("");
}

function isPlaceholder(line) {
  const value = line.trim();

  return !value || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

async function listChildren(notion, blockId) {
  const blocks = [];
  let cursor;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

// Flattens the page body (including nested children) to
// [{ type, text, depth, fileUrl? }].
async function readBody(notion, blockId, depth = 0) {
  const lines = [];

  for (const block of await listChildren(notion, blockId)) {
    const content = block[block.type] || {};
    const line = { type: block.type, depth, text: richText(content.rich_text) };

    if (block.type === "image" || block.type === "file" || block.type === "pdf") {
      line.fileUrl = content.file?.url || content.external?.url || "";
      line.text = richText(content.caption);
    }

    if (block.type === "bookmark" || block.type === "embed" || block.type === "link_preview") {
      line.text = content.url || "";
    }

    lines.push(line);

    if (block.has_children && depth < MAX_BLOCK_DEPTH) {
      lines.push(...(await readBody(notion, block.id, depth + 1)));
    }
  }

  return lines;
}

function formatLine(line, index) {
  const indent = "  ".repeat(line.depth);

  if (line.type === "numbered_list_item") return `${indent}${index}. ${line.text}`;
  if (line.type === "bulleted_list_item" || line.type === "to_do") return `${indent}- ${line.text}`;

  return `${indent}${line.text}`;
}

function splitSections(lines) {
  const sections = { preamble: [] };
  let current = "preamble";
  let listIndex = 0;

  for (const line of lines) {
    if (/^heading_[123]$/.test(line.type)) {
      const key = SECTION_KEYS[line.text.trim().toLowerCase()] || line.text.trim();
      current = key;
      sections[current] = sections[current] || [];
      listIndex = 0;
      continue;
    }

    listIndex = line.type === "numbered_list_item" ? listIndex + 1 : 0;

    if (line.fileUrl || isPlaceholder(line.text)) continue;

    sections[current] = sections[current] || [];
    sections[current].push(redact(formatLine(line, listIndex)));
  }

  return Object.fromEntries(
    Object.entries(sections)
      .map(([key, value]) => [key, value.join("\n").trim()])
      .filter(([, value]) => value)
  );
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 3) {
          response.resume();
          resolve(download(response.headers.location, destination, redirects + 1));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        let bytes = 0;
        const file = fs.createWriteStream(destination);

        response.on("data", (chunk) => {
          bytes += chunk.length;

          if (bytes > MAX_ATTACHMENT_BYTES) {
            response.destroy(new Error("attachment too large"));
          }
        });

        response.pipe(file);
        file.on("finish", () => file.close(() => resolve(bytes)));
        response.on("error", (error) => {
          file.close(() => fs.rmSync(destination, { force: true }));
          reject(error);
        });
      })
      .on("error", reject);
  });
}

function extensionFor(url, fallbackName = "") {
  const fromName = path.extname(fallbackName);
  const fromUrl = path.extname(new URL(url).pathname);

  return (fromName || fromUrl || ".bin").toLowerCase().slice(0, 6);
}

async function downloadAttachments(bodyLines, page) {
  const sources = [
    ...bodyLines
      .filter((line) => line.fileUrl)
      .map((line, index) => ({ url: line.fileUrl, name: `body-${index + 1}`, caption: line.text })),
    ...(page.properties["Files & media"]?.files || []).map((file) => ({
      url: file.file?.url || file.external?.url || "",
      name: file.name,
      caption: "",
    })),
  ].filter((source) => source.url);

  // Never let a previous bug's screenshots leak into this context.
  fs.rmSync(paths.ATTACHMENTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(paths.ATTACHMENTS_DIR, { recursive: true });

  const attachments = [];

  for (const [index, source] of sources.slice(0, MAX_ATTACHMENTS).entries()) {
    const fileName = `${String(index + 1).padStart(2, "0")}${extensionFor(source.url, source.name)}`;
    const destination = path.join(paths.ATTACHMENTS_DIR, fileName);

    try {
      await download(source.url, destination);
      attachments.push({
        file: path.relative(paths.AUTOMATION_ROOT, destination).replace(/\\/g, "/"),
        originalName: source.name,
        caption: redact(source.caption),
      });
    } catch (error) {
      console.warn(`⚠️ Could not download attachment ${source.name}: ${error.message}`);
    }
  }

  if (sources.length > MAX_ATTACHMENTS) {
    console.warn(`⚠️ ${sources.length} attachments found; only the first ${MAX_ATTACHMENTS} were downloaded.`);
  }

  return attachments;
}

async function readComments(notion, pageId) {
  try {
    const comments = [];
    let cursor;

    do {
      const response = await notion.comments.list({ block_id: pageId, start_cursor: cursor });
      comments.push(...response.results.map((comment) => redact(richText(comment.rich_text))));
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    return { comments: comments.filter(Boolean), note: "" };
  } catch (error) {
    return {
      comments: [],
      note:
        error.code === "restricted_resource"
          ? "Comments unavailable: enable 'Read comments' on the Notion integration."
          : `Comments unavailable: ${error.message}`,
    };
  }
}

async function readRelatedBugs(notion, bug, fullText) {
  const related = new Map();

  for (const pageId of bug.relatedPageIds) {
    try {
      const page = await notion.pages.retrieve({ page_id: pageId });
      const number = page.properties?.id?.unique_id?.number;
      const title = richText(page.properties?.["Bug description"]?.title);
      related.set(formatBugId(number), { id: formatBugId(number), title, source: "relation" });
    } catch (error) {
      console.warn(`⚠️ Could not read related page ${pageId}: ${error.message}`);
    }
  }

  const mentioned = [...new Set(fullText.match(/\bBUG-\d+\b/gi) || [])]
    .map((id) => id.toUpperCase())
    .filter((id) => id !== bug.id && !related.has(id));

  for (const id of mentioned) {
    if (related.size >= MAX_RELATED_BUGS) break;

    try {
      const found = await findBugByNumber(notion, id);

      if (found) {
        related.set(id, {
          id,
          title: found.bug.title,
          status: found.bug.status,
          source: "mentioned",
        });
      }
    } catch (error) {
      console.warn(`⚠️ Could not read mentioned bug ${id}: ${error.message}`);
    }
  }

  return [...related.values()].slice(0, MAX_RELATED_BUGS);
}

function assessQuality(bug, sections, attachments) {
  const warnings = [];

  if (!sections.description && !sections.preamble) warnings.push("No description filled in.");
  if (!sections.stepsToReproduce) warnings.push("No steps to reproduce filled in.");
  if (!bug.appUrl && !sections.urls) warnings.push("No in-app URL given.");
  if (!attachments.length) warnings.push("No screenshots attached.");

  return {
    hasDescription: Boolean(sections.description || sections.preamble),
    hasSteps: Boolean(sections.stepsToReproduce),
    hasAppUrl: Boolean(bug.appUrl || sections.urls),
    attachmentCount: attachments.length,
    warnings,
  };
}

async function main() {
  if (!BUG_ID) {
    throw new Error("BUG_ID was not provided.");
  }

  const notion = createNotionClient();
  const found = await findBugByNumber(notion, BUG_ID);

  if (!found) {
    throw new Error(`Bug ${BUG_ID} was not found in the Notion bug database.`);
  }

  const { bug, page } = found;

  const bodyLines = await readBody(notion, page.id);
  const sections = splitSections(bodyLines);
  const attachments = await downloadAttachments(bodyLines, page);
  const { comments, note: commentsNote } = await readComments(notion, page.id);

  const fullText = [bug.title, ...Object.values(sections), ...comments].join("\n");
  const relatedBugs = await readRelatedBugs(notion, bug, fullText);

  const context = {
    ...bug,
    title: redact(bug.title),
    update: redact(bug.update),
    property: redact(bug.property),
    issueType: "Bug",
    sections,
    attachments,
    comments,
    commentsNote,
    relatedBugs,
    quality: assessQuality(bug, sections, attachments),
    processedAt: new Date().toISOString(),
  };

  fs.mkdirSync(paths.RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(paths.BUG_CONTEXT, JSON.stringify(context, null, 2), "utf8");

  // Compat copy for shared scripts (build-memory-digest.js reads
  // id/title/issueType from the feature context path).
  fs.writeFileSync(
    paths.COMPAT_TICKET_CONTEXT,
    JSON.stringify(
      {
        id: context.id,
        title: context.title,
        status: context.status,
        issueType: context.issueType,
        priority: context.priority,
        url: context.notionUrl,
        notionPageId: context.notionPageId,
        description: [sections.description, sections.stepsToReproduce].filter(Boolean).join("\n\n"),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log("======================================");
  console.log("APPROVED BUG RECEIVED");
  console.log("======================================");
  console.log(`ID:          ${context.id}`);
  console.log(`Title:       ${context.title}`);
  console.log(`Status:      ${context.status}`);
  console.log(`Priority:    ${context.priority || "N/A"}`);
  console.log(`App URL:     ${context.appUrl || "N/A"}`);
  console.log(`Sections:    ${Object.keys(sections).join(", ") || "none"}`);
  console.log(`Attachments: ${attachments.length}`);
  console.log(`Comments:    ${comments.length}${commentsNote ? ` (${commentsNote})` : ""}`);
  console.log(`Related:     ${relatedBugs.map((related) => related.id).join(", ") || "none"}`);

  if (context.quality.warnings.length) {
    console.log("\n⚠️ Bug report quality:");
    context.quality.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  console.log(`\n📁 Saved to: ${paths.BUG_CONTEXT}`);
}

main().catch((error) => {
  console.error("\n❌ Failed to process approved bug.");
  console.error(error.body ? JSON.stringify(error.body, null, 2) : error.message);
  process.exit(1);
});
