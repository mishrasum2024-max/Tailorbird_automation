const fs = require("fs");

/*
 * Shared by scripts/ai-agent/record-fix-history.js and
 * scripts/ai-agent/record-fix-history-from-run.js.
 *
 * Claude is asked (see prepare-repair-prompt.js and the repair
 * prompts embedded in .github/workflows/ai-automate-selected-testcases.yml)
 * to end a repair response with a fenced ```json block shaped like:
 *   { "fixes": [ { "testCaseId": "...", "rootCause": "...",
 *                   "fixApplied": "...", "filesChanged": [...] } ] }
 *
 * Claude may print explanatory text around/between JSON blocks, so this
 * scans from the end of the log and returns the last block that actually
 * parses as `{ fixes: [...] }`.
 */
function extractFixesFromLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf8");
  const blocks = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];

  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(blocks[i][1]);
      if (Array.isArray(parsed.fixes)) {
        return parsed.fixes;
      }
    } catch (error) {
      // Not the block we're looking for — keep scanning earlier blocks.
    }
  }

  return [];
}

module.exports = { extractFixesFromLog };
