/**
 * CapEx E2E locators (tests/TC19_Capex.spec.js, CapEx E2E block).
 *
 * Multi-locator strategy lists for healingLocator() (utils/locatorHealer.js):
 * element-based Playwright methods first, CSS only as a last fallback.
 *
 * MCP-verified 2026-11-18 on beta (headed owner browser):
 *  - Scope filter: trigger shows "Entire Portfolio" / the selected property; its
 *    dropdown has a "Search properties…" box, an "Entire Portfolio" option that
 *    toggles all, one option per property, and "No matches" for no hits.
 *  - Grid: the property row has button.tree-toggle; budget-category rows have
 *    button.expand-button that opens the drill-down (master-detail); a category
 *    without work shows "No projects, jobs, or scopes linked to this category.";
 *    project rows in the drill-down expand to job rows whose contract number is a
 *    link "#<jobId>" → /jobs/<jobId>?tab=contracts (title "Contract #: <jobId>").
 *  - Export menu: "Export CSV" and "Export Custom Report" (AI ASSISTED); the
 *    Custom Report dialog header reads "Source: CapEx · FY <yr> · Properties · <scope>".
 *  - Budget revision editor: revisions are entered in "Adjustment Amount"
 *    (PUT /api/bird-table/cells, columnName adjustment_amount).
 * @param {import('@playwright/test').Page} page
 */
function capexE2EElementStrategies(page) {
  const main = page.locator("main");
  return {
    scopeSearch: [
      {
        name: "placeholder",
        locator: page.getByPlaceholder("Search properties…"),
      },
      {
        name: "role",
        locator: page.getByRole("textbox", { name: /Search properties/ }),
      },
    ],
    scopeOption: name => [
      {
        name: "role",
        locator: page.getByRole("option", { name, exact: true }),
      },
      {
        name: "css+text",
        locator: page.locator('[role="option"]').filter({ hasText: name }),
      },
    ],
    noMatches: [
      { name: "text", locator: page.getByText("No matches", { exact: true }) },
      {
        name: "css+text",
        locator: page.locator('[role="listbox"]').getByText("No matches"),
      },
    ],
    propertyTreeToggle: [
      {
        name: "css(original grid toggle)",
        locator: main.locator("button.tree-toggle"),
      },
    ],
    emptyDrillDown: [
      {
        name: "text",
        locator: page.getByText(
          "No projects, jobs, or scopes linked to this category.",
          {
            exact: true,
          }
        ),
      },
      {
        name: "css+text",
        locator: main.getByText(
          "No projects, jobs, or scopes linked to this category."
        ),
      },
    ],
    exportButton: [
      { name: "role", locator: main.getByRole("button", { name: "Export" }) },
      { name: "text", locator: main.getByText("Export", { exact: true }) },
    ],
    exportMenuItem: name => [
      { name: "role", locator: page.getByRole("menuitem", { name }) },
      {
        name: "css+text",
        locator: page.locator('[role="menuitem"]').filter({ hasText: name }),
      },
    ],
    customReportDialog: [
      {
        name: "role+text",
        locator: page.getByRole("dialog").filter({ hasText: "Custom Report" }),
      },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .filter({ hasText: "Custom Report" }),
      },
    ],
    contractsTab: [
      {
        name: "role",
        locator: page.getByRole("tab", { name: "Contracts", exact: true }),
      },
      {
        name: "text",
        locator: page
          .locator('[role="tab"]')
          .filter({ hasText: /^Contracts$/ }),
      },
    ],
  };
}

module.exports = { capexE2EElementStrategies };
