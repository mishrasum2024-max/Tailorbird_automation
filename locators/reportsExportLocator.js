/**
 * Extra Reports locators for the FEAT-1313 export-only cases (MCP-verified 2026-10-21):
 * /reports lists "Recent Reports" as links to /reports/:id with a "View report" link per row.
 */
function reportsExportLocators(page) {
  return {
    viewReportLinks: page
      .getByRole("link", { name: "View report" })
      .or(page.locator('a[href^="/reports/"]:has-text("View report")')),
  };
}

module.exports = { reportsExportLocators };
