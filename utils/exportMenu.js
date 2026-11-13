const { Logger } = require("./logger");

/**
 * Export toolbar menu (Jobs, Invoices, CapEx …).
 * MCP-verified 2026-10-28 on beta: the toolbar "Export" button is now a menu trigger
 * (aria-haspopup="menu") and no longer downloads on click. The menu offers
 *   - "Export CSV — Current table view, as shown"   → downloads <table>-data.csv in ~1s
 *   - "Export Custom Report — AI Assisted"           → not handled here
 *
 * armCsvExportChoice(page) must be called BEFORE the existing
 * `Promise.all([page.waitForEvent('download'), exportBtn.click()])` block: it waits for the
 * menu that click opens and picks "Export CSV", so that block's download wait receives the CSV.
 * Await the returned promise after the block — it resolves true when "Export CSV" was chosen,
 * or false if no Export menu appeared (e.g. Export downloads directly again).
 */
function armCsvExportChoice(page, { timeout = 30000 } = {}) {
  const csvItem = page.getByRole("menuitem", { name: /^Export CSV/i }).first();
  return csvItem
    .waitFor({ state: "visible", timeout })
    .then(async () => {
      await csvItem.click();
      Logger.info(
        'Export menu opened — chose "Export CSV" (Current table view, as shown)'
      );
      return true;
    })
    .catch(e => {
      Logger.info(
        `Export menu "Export CSV" option not used (${e.message.split("\n")[0]})`
      );
      return false;
    });
}

module.exports = { armCsvExportChoice };
