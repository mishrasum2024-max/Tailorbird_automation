/**
 * Retainage & Categories E2E locators (tests/TC22_Retainage.spec.js and
 * tests/TC07_category.spec.js, E2E blocks).
 *
 * Multi-locator strategy lists for healingLocator() (utils/locatorHealer.js):
 * element-based Playwright methods first, CSS only as a last fallback.
 *
 * Live-verified 2026-11-19 on beta (headed owner browser, suite-owned job 6853):
 *  - Edit Contract Overview drawer: "Retainage %" input (placeholder "Enter
 *    retainage percentage") clamps typed values to 0–100 on blur (150 → 100%,
 *    -5 → 0%); Save → toast "Contract overview updated". After the contract is
 *    finalized the input is disabled with "Contract is finalized. Retainage %
 *    cannot be changed."
 *  - Invoice Details: invoice-level Retainage % outside 0–100 → toast
 *    "Retainage % must be between 0 and 100", value unchanged.
 *  - Contract → Retainage sub-tab: invoice row action with tooltip "Open invoice"
 *    opens /jobs/<job>/invoices/<id> in a NEW tab.
 *  - Category table (/financials/category): CSV import with the org's headers
 *    (files/category_data.csv header line); inline edit of Category Name via
 *    double-click → revogr-edit input → Enter; row "Delete" button removes the row
 *    immediately (no confirmation dialog); "Category Code" header click sorts.
 * @param {import('@playwright/test').Page} page
 */
function retainageCategoryE2EElementStrategies(page) {
  const main = page.locator("main");
  const contractDrawer = page
    .getByRole("dialog", { name: "Edit Contract Overview" })
    .or(page.getByRole("dialog").filter({ hasText: "Edit Contract Overview" }));
  return {
    contractDrawer: [{ name: "role:dialog[name]", locator: contractDrawer }],
    contractRetainageInput: [
      {
        name: "placeholder",
        locator: contractDrawer.getByPlaceholder("Enter retainage percentage"),
      },
      { name: "label", locator: contractDrawer.getByLabel(/Retainage %/) },
    ],
    contractEstimatedCostInput: [
      {
        name: "placeholder",
        locator: contractDrawer.getByPlaceholder("Enter estimated total cost"),
      },
      {
        name: "label",
        locator: contractDrawer.getByLabel(/Estimated total cost/i),
      },
    ],
    contractDrawerSave: [
      {
        name: "role",
        locator: contractDrawer.getByRole("button", { name: "Save Changes" }),
      },
    ],
    contractDrawerCancel: [
      {
        name: "role",
        locator: contractDrawer.getByRole("button", {
          name: "Cancel",
          exact: true,
        }),
      },
    ],
    openInvoiceAction: [
      {
        name: "aria-label",
        locator: main.locator('[aria-label="Open invoice"]'),
      },
      { name: "title", locator: main.locator('[title="Open invoice"]') },
    ],
    // Category table
    gridSearch: [
      {
        name: "placeholder(main)",
        locator: main.getByPlaceholder("Search...", { exact: true }),
      },
      {
        name: "css",
        locator: page.locator('main input[placeholder="Search..."]'),
      },
    ],
    gridCellEditor: [
      {
        name: "css(revogr-edit)",
        locator: page.locator("revogr-edit input, revogr-edit textarea"),
      },
    ],
    rowDeleteButton: [
      {
        name: "role",
        locator: main.getByRole("button", { name: "Delete", exact: true }),
      },
    ],
    columnHeader: name => [
      {
        name: "role",
        locator: main.getByRole("columnheader").filter({ hasText: name }),
      },
    ],
    codeCells: [
      {
        name: "css(first column cells)",
        locator: main.locator('[role="gridcell"][data-rgcol="0"]'),
      },
    ],
  };
}

module.exports = { retainageCategoryE2EElementStrategies };
