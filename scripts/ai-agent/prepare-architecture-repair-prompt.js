const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * PREPARE ARCHITECTURE REPAIR PROMPT
 * ============================================================
 *
 * Builds a targeted prompt asking Claude to move raw `page`
 * locator/interaction usage (flagged by verify-test-architecture.js)
 * out of spec files and into locators/*.js and pages/*.js, per this
 * repository's three-layer convention.
 *
 * Env vars expected:
 *   TICKET_ID
 *   ATTEMPT
 *   MAX_ATTEMPTS
 *
 * Reads:
 *   data/architecture-violations.json — written by
 *   verify-test-architecture.js, an array of
 *   { file, lineNumber, snippet, pattern }
 *
 * Writes:
 *   data/claude-architecture-repair-prompt.md
 * ============================================================
 */

const TICKET_ID = process.env.TICKET_ID || "UNKNOWN";
const ATTEMPT = process.env.ATTEMPT || "1";
const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || "4";

const VIOLATIONS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "architecture-violations.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "claude-architecture-repair-prompt.md"
);

function readViolations() {
  if (!fs.existsSync(VIOLATIONS_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(VIOLATIONS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function groupByFile(violations) {
  const grouped = {};

  violations.forEach(v => {
    grouped[v.file] = grouped[v.file] || [];
    grouped[v.file].push(v);
  });

  return grouped;
}

function formatViolations(violations) {
  const grouped = groupByFile(violations);

  return Object.entries(grouped)
    .map(([file, items]) => {
      const lines = items
        .map(v => `- Line ${v.lineNumber} (\`${v.pattern}\`): \`${v.snippet}\``)
        .join("\n");

      return `### ${file}\n\n${lines}`;
    })
    .join("\n\n");
}

function main() {
  const violations = readViolations();

  if (!violations.length) {
    throw new Error(
      "No architecture violations were found in " +
      `${VIOLATIONS_FILE} — nothing to build a repair prompt for.`
    );
  }

  const violationsText = formatViolations(violations);
  const affectedFiles = [...new Set(violations.map(v => v.file))];

  const prompt = `
# FIX SPEC-FILE ARCHITECTURE VIOLATIONS

Ticket: ${TICKET_ID}

The following spec file(s) contain raw \`page\` locator/interaction
usage instead of going through this repository's page-object layer.
Per repo convention:

- locators/*.js -> ALL selectors
- pages/*.js    -> ALL interactions, using those locators
- tests/*.js    -> calls page-object methods ONLY

--- VIOLATIONS FOUND ---

${violationsText}

--- END VIOLATIONS ---

---

Your job now is to refactor ONLY the flagged file(s) so they comply
with the three-layer pattern, WITHOUT changing test behavior or intent.

Follow \`.claude/skills/tailorbird-playwright/SKILL.md\` for this
repository's framework patterns (locators/pages/tests separation,
multi-locator rules, existing conventions) — do not improvise a
different approach.

1. For each flagged line, move the raw locator into the appropriate
   locators/*.js file (reuse an existing locator if one already
   covers the same element — do not duplicate).
2. Move the raw interaction into the appropriate pages/*.js file as a
   page-object method, using only locators imported from locators/*.js.
3. Update the spec file to call the page-object method instead of the
   raw \`page\` interaction.
4. Do not change what the test verifies or its expected outcome.
5. Do not touch any file that was not flagged above.
6. Do not touch any test case that is currently passing except to
   apply this refactor — the goal is a clean architecture, not a
   behavior change.

Affected file(s):

${affectedFiles.map(f => `- ${f}`).join("\n")}

This is attempt ${ATTEMPT} of ${MAX_ATTEMPTS}.

When you believe the refactor is correct, stop — the mandatory and
newly-added test case(s) will be re-run automatically after you finish
to confirm nothing broke.
`.trim();

  fs.writeFileSync(OUTPUT_FILE, prompt, "utf8");

  console.log(
    `Architecture repair prompt (attempt ${ATTEMPT}) saved to: ${OUTPUT_FILE}`
  );
  console.log(`Affected file(s): ${affectedFiles.join(", ") || "(none)"}`);
}

main();
