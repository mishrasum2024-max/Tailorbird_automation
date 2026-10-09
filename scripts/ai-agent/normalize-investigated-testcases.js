const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * NORMALIZE INVESTIGATED TEST CASES
 * ============================================================
 *
 * Deterministic safety net run immediately after the live-browser
 * investigation Claude call in ai-generate-testcases.yml, before
 * "Verify JSON structure".
 *
 * The investigation prompt asks Claude to replace an invalidated
 * candidate IN PLACE (same array index, same category) rather than
 * deleting it and appending a replacement at the end. LLMs don't
 * reliably follow ordering instructions under load, and an
 * out-of-order array trips the existing category-grouping hard gate
 * in the "Verify JSON structure" step (every "E2E + Positive" case
 * must precede every "Negative + Edge" case) — which would surface
 * as a confusing, seemingly-unrelated failure right after an
 * expensive live-investigation run.
 *
 * This script re-sorts deterministically instead of trusting the
 * LLM's array order, and validates the two invariants that must
 * hold structurally (ID uniqueness, no overlap between the final
 * set and the dropped set) rather than silently patching them.
 *
 * Reads:
 *   data/generated-testcases.json
 *   data/dropped-testcases.json (optional)
 *
 * Writes:
 *   data/generated-testcases.json (re-sorted in place)
 * ============================================================
 */

const GENERATED_TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "generated-testcases.json"
);

const DROPPED_TESTCASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "dropped-testcases.json"
);

const CATEGORY_ORDER = ["E2E + Positive", "Negative + Edge"];

function readJson(filePath, name) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${name} not found: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${name}: ${error.message}`);
  }
}

function readDroppedIds() {
  if (!fs.existsSync(DROPPED_TESTCASES_FILE)) {
    return new Set();
  }

  let dropped;

  try {
    dropped = JSON.parse(
      fs.readFileSync(DROPPED_TESTCASES_FILE, "utf8")
    );
  } catch (error) {
    throw new Error(
      `Failed to parse dropped-testcases.json: ${error.message}`
    );
  }

  if (!Array.isArray(dropped)) {
    throw new Error(
      "dropped-testcases.json must contain an array."
    );
  }

  return new Set(dropped.map(item => item.id));
}

function main() {
  console.log("======================================");
  console.log("NORMALIZING INVESTIGATED TEST CASES");
  console.log("======================================");

  const data = readJson(
    GENERATED_TESTCASES_FILE,
    "generated-testcases.json"
  );

  const testCases = Array.isArray(data.testCases)
    ? data.testCases
    : [];

  if (!testCases.length) {
    throw new Error(
      "generated-testcases.json contains no test cases after investigation."
    );
  }

  // ------------------------------------------------------------
  // 1. Re-sort by category, stable within each category.
  // ------------------------------------------------------------

  const sorted = testCases
    .map((testCase, index) => ({ testCase, index }))
    .sort((a, b) => {
      const orderA = CATEGORY_ORDER.indexOf(a.testCase.type);
      const orderB = CATEGORY_ORDER.indexOf(b.testCase.type);

      const rankA = orderA === -1 ? CATEGORY_ORDER.length : orderA;
      const rankB = orderB === -1 ? CATEGORY_ORDER.length : orderB;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // Stable: preserve original relative order within a category.
      return a.index - b.index;
    })
    .map(entry => entry.testCase);

  const reordered = sorted.some(
    (testCase, index) => testCase !== testCases[index]
  );

  if (reordered) {
    console.log(
      "⚠️ Test cases were not in category order — re-sorted " +
      "(E2E + Positive before Negative + Edge)."
    );
  } else {
    console.log("✅ Test cases were already in category order.");
  }

  // ------------------------------------------------------------
  // 2. Verify ID uniqueness.
  // ------------------------------------------------------------

  const seenIds = new Set();

  for (const testCase of sorted) {
    if (seenIds.has(testCase.id)) {
      throw new Error(
        `Duplicate test case ID after investigation: ${testCase.id}`
      );
    }

    seenIds.add(testCase.id);
  }

  console.log(`✅ ${seenIds.size} unique test case ID(s).`);

  // ------------------------------------------------------------
  // 3. Verify no overlap with dropped-testcases.json.
  // ------------------------------------------------------------

  const droppedIds = readDroppedIds();

  const overlap = [...seenIds].filter(id => droppedIds.has(id));

  if (overlap.length) {
    throw new Error(
      `Test case ID(s) appear in BOTH the final set and ` +
      `dropped-testcases.json: ${overlap.join(", ")}`
    );
  }

  if (droppedIds.size) {
    console.log(
      `✅ ${droppedIds.size} dropped ID(s) do not overlap the final set.`
    );
  }

  // ------------------------------------------------------------
  // 4. Write back the normalized set.
  // ------------------------------------------------------------

  data.testCases = sorted;

  fs.writeFileSync(
    GENERATED_TESTCASES_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log("======================================");
  console.log(`Total test cases: ${sorted.length}`);
  console.log("======================================");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("======================================");
  console.error("❌ NORMALIZATION FAILED");
  console.error("======================================");
  console.error(error.message);
  process.exit(1);
}
