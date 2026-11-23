/**
 * Properties E2E locators (tests/TC04_properties.spec.js, Properties E2E block).
 *
 * Multi-locator strategy lists for healingLocator() (utils/locatorHealer.js):
 * element-based Playwright methods first, CSS only as a last fallback for
 * elements with no accessible role/label/text.
 *
 * MCP-verified 2026-11-18 on beta (headed owner browser):
 *  - Property details Overview has an "Edit" button that opens the
 *    "Edit Property" dialog; City/State/Zipcode are disabled there
 *    ("Auto-filled from address"); Save Changes → PUT /api/bird-table/rows,
 *    toast "property updated successfully".
 *  - Properties Table View row actions (pinned pane, same data-rgrow as the
 *    data row): eye + trash; trash opens the "Delete Property" dialog with
 *    Cancel / Delete; Delete → DELETE /api/bird-table/rows, toast
 *    "Row deleted successfully".
 *  - Locations → Units shows "<n> unassigned unit(s)" and an "Add Row" button.
 * @param {import('@playwright/test').Page} page
 */
function propertyE2EElementStrategies(page) {
  const editDialog = page
    .getByRole("dialog")
    .filter({ hasText: "Edit Property" });
  const deleteDialog = page
    .getByRole("dialog")
    .filter({ hasText: "Delete Property" });

  return {
    overviewEditButton: [
      {
        name: "role",
        locator: page.getByRole("button", { name: "Edit", exact: true }),
      },
      {
        name: "text",
        locator: page.locator("main").getByText("Edit", { exact: true }),
      },
    ],
    editDialog: [
      { name: "role+text", locator: editDialog },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .filter({ hasText: "Edit Property" }),
      },
    ],
    editInput: placeholder => [
      {
        name: "placeholder",
        locator: editDialog.getByPlaceholder(placeholder),
      },
      {
        name: "css+placeholder",
        locator: page
          .locator('[role="dialog"]')
          .filter({ hasText: "Edit Property" })
          .getByPlaceholder(placeholder),
      },
    ],
    editLabelledInput: label => [
      {
        name: "role",
        locator: editDialog.getByRole("textbox", { name: label, exact: true }),
      },
      { name: "label", locator: editDialog.getByLabel(label, { exact: true }) },
    ],
    saveChangesButton: [
      {
        name: "role",
        locator: editDialog.getByRole("button", { name: "Save Changes" }),
      },
      {
        name: "text",
        locator: editDialog.getByText("Save Changes", { exact: true }),
      },
    ],
    comboboxOption: text => [
      {
        name: "role",
        locator: page.getByRole("option", { name: text, exact: true }),
      },
      {
        name: "css",
        // Exact text match without building a RegExp from `text` (Semgrep
        // detect-non-literal-regexp).
        locator: page
          .locator("[data-combobox-option]")
          .getByText(text, { exact: true }),
      },
    ],
    deleteDialog: [
      { name: "role+text", locator: deleteDialog },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .filter({ hasText: "Delete Property" }),
      },
    ],
    deleteDialogButton: name => [
      {
        name: "role",
        locator: deleteDialog.getByRole("button", { name, exact: true }),
      },
      { name: "text", locator: deleteDialog.getByText(name, { exact: true }) },
    ],
    searchInput: [
      {
        name: "role",
        locator: page.getByRole("textbox", { name: "Search..." }),
      },
      { name: "placeholder", locator: page.getByPlaceholder("Search...") },
    ],
    addRowButton: [
      {
        name: "role",
        locator: page.locator("main").getByRole("button", { name: "Add Row" }),
      },
      {
        name: "text",
        locator: page.locator("main").getByText("Add Row", { exact: true }),
      },
    ],
    unassignedCounter: [
      { name: "text", locator: page.getByText(/^\d+ unassigned units?$/) },
      {
        name: "text-loose",
        locator: page.locator("main").getByText(/unassigned unit/),
      },
    ],
    takeoffsTab: [
      {
        name: "role",
        locator: page.getByRole("tab", { name: "Takeoffs", exact: true }),
      },
      {
        name: "text",
        locator: page.locator('[role="tab"]').filter({ hasText: /^Takeoffs$/ }),
      },
    ],
    notCoveredMessage: [
      { name: "text", locator: page.getByText(/not covered by takeoff/) },
      {
        name: "css+text",
        locator: page.locator("main").getByText(/not covered by takeoff/),
      },
    ],
  };
}

module.exports = { propertyE2EElementStrategies };
