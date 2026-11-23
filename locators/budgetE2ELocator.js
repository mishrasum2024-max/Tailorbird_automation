/**
 * Budget E2E locators (tests/TC15_Budget.spec.js, Budget E2E block).
 *
 * Multi-locator strategy lists for healingLocator() (utils/locatorHealer.js).
 *
 * MCP-verified 2026-11-18 on beta (headed owner browser, new property):
 *  - A property without a budget shows "Create First Budget"; it opens the
 *    "Name this budget revision" dialog (Title, placeholder "e.g. Q2 reforecast",
 *    Cancel / Continue). Continue is disabled for an empty or whitespace title;
 *    Enter submits (POST /api/bird-table/rows) and opens
 *    /financials/budget-revision/<id>/editor.
 *  - Revision editor: "Save as Draft", "Submit for Approval", "Upload Budget File".
 *    A CSV with wrong headers → POST /api/budget-revision-detail/import 400 and a
 *    persistent red alert "Import Failed · <server message>".
 *  - Save as Draft → toast "Budget revision saved as draft" (short-lived) and
 *    back to the Budget page; the version list shows "<title> · Draft".
 * @param {import('@playwright/test').Page} page
 */
function budgetE2EElementStrategies(page) {
  const nameDialog = page
    .getByRole("dialog")
    .filter({ hasText: "Name this budget revision" });
  return {
    createFirstBudgetButton: [
      {
        name: "role",
        locator: page.getByRole("button", { name: "Create First Budget" }),
      },
      {
        name: "text",
        locator: page.getByText("Create First Budget", { exact: true }),
      },
    ],
    nameDialog: [
      {
        name: "role-name",
        locator: page.getByRole("dialog", {
          name: "Name this budget revision",
        }),
      },
      { name: "role+text", locator: nameDialog },
    ],
    nameInput: [
      {
        name: "placeholder",
        locator: nameDialog.getByPlaceholder("e.g. Q2 reforecast"),
      },
      { name: "role", locator: nameDialog.getByRole("textbox") },
    ],
    nameDialogButton: name => [
      {
        name: "role",
        locator: nameDialog.getByRole("button", { name, exact: true }),
      },
      { name: "text", locator: nameDialog.getByText(name, { exact: true }) },
    ],
    editorButton: name => [
      {
        name: "role",
        locator: page.getByRole("button", { name, exact: true }),
      },
      { name: "text", locator: page.getByText(name, { exact: true }) },
    ],
    importFailedAlert: [
      {
        name: "role",
        locator: page.getByRole("alert").filter({ hasText: "Import Failed" }),
      },
      {
        name: "css",
        locator: page
          .locator(".mantine-Notification-root")
          .filter({ hasText: "Import Failed" }),
      },
    ],
    savedAsDraftAlert: [
      {
        name: "role",
        locator: page
          .getByRole("alert")
          .filter({ hasText: "Budget revision saved as draft" }),
      },
      {
        name: "css",
        locator: page
          .locator(".mantine-Notification-root")
          .filter({ hasText: "Budget revision saved as draft" }),
      },
    ],
  };
}

module.exports = { budgetE2EElementStrategies };
