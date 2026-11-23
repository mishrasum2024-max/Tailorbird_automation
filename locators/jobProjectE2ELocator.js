/**
 * Jobs & Projects E2E locators (tests/TC05_project.spec.js and
 * tests/TC06_jobs.spec.js, E2E blocks).
 *
 * Multi-locator strategy lists for healingLocator() (utils/locatorHealer.js):
 * element-based Playwright methods first, CSS only as a last fallback.
 *
 * Live-verified 2026-11-19 on beta (headed owner browser, suite-owned property,
 * project 5401, jobs 6834/6835):
 *  - Project detail: tabs "Overview" / "Jobs"; clicking Jobs puts tab=jobs in the
 *    URL (kept on reload); "Create Job" renders only on the Jobs tab.
 *  - Edit Project drawer: Save Changes disabled until a field changes; Budget
 *    Category pill input disabled + readOnly; Fiscal Year is a text input
 *    ("Enter fiscal year"). Changing the FY of a project with a finalized job opens
 *    "Complete the following before saving" with "Fiscal year cannot be changed
 *    because this project has approved or pending-approval jobs for <FY>." and
 *    only a Close button.
 *  - Project Documents: "Upload Files" → Uploadcare dialog ("From device" opens
 *    the OS file chooser) → "Done" → "Add Tags & Types" → "Add Files". Row action
 *    "Delete File" (aria-label) → dialog "Delete File" (no Download button exists).
 *  - Projects table: row actions "View Details" (eye) and "Delete Project"; CM fee
 *    projects ("Construction Management Fee Project") show only the eye.
 *  - Jobs table: row checkbox per job; selecting rows shows "Complete/Close" and
 *    "Reopen"; row trash has data-testid="delete-row-button".
 *  - Close modal "Complete/Close jobs" → "Ready to close (N)" → "Close N jobs";
 *    Reopen modal "Reopen jobs" → "Ready to reopen (N)" → "Reopen N jobs".
 *  - Locked job page: banner "This job is locked." + "Closed by …"/"Voided by …",
 *    "Reopen Job" button; Edit and "Void/Cancel Contract" disabled.
 *  - Void modal "Void/Cancel Contract": textarea Notes *, confirm button
 *    "Void/Cancel Contract" disabled until notes are entered.
 * @param {import('@playwright/test').Page} page
 */
function jobProjectE2EElementStrategies(page) {
  const main = page.locator("main");
  const dialog = title =>
    page.getByRole("dialog").filter({ hasText: title }).last();
  return {
    dialog,
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
    tab: name => [
      { name: "role", locator: page.getByRole("tab", { name, exact: true }) },
      {
        name: "css+text",
        locator: page.locator('[role="tab"]').filter({ hasText: name }),
      },
    ],
    editButton: [
      { name: "role", locator: main.getByRole("button", { name: /^Edit$/ }) },
    ],
    createJobButton: [
      {
        name: "role",
        locator: page.getByRole("button", { name: /Create Job/i }),
      },
    ],
    saveChangesButton: scope => [
      {
        name: "role",
        locator: scope.getByRole("button", { name: "Save Changes" }),
      },
    ],
    fiscalYearInput: scope => [
      {
        name: "placeholder",
        locator: scope.getByPlaceholder("Enter fiscal year"),
      },
      { name: "label", locator: scope.getByLabel(/Fiscal Year/i) },
    ],
    // Edit Job drawer: BudgetCategoryMultiSelectCombobox renders <label> + a
    // <div role="button"> trigger (no input). When locked (finalized contract) the
    // trigger gets pointer-events:none + cursor:not-allowed (source-verified,
    // app/components/BudgetCategoryMultiSelectCombobox.tsx).
    jobBudgetCategoryTrigger: scope => [
      {
        name: "label → following role=button",
        locator: scope
          .locator("label")
          .filter({ hasText: /^\s*Budget Category/ })
          .locator('xpath=following-sibling::div[@role="button"][1]'),
      },
    ],
    budgetCategoryInput: scope => [
      { name: "label", locator: scope.getByLabel(/Budget Category/i) },
    ],
    toast: text => [
      {
        name: "css(mantine notification)+text",
        locator: page
          .locator(".mantine-Notification-root")
          .filter({ hasText: text }),
      },
      {
        name: "alert role",
        locator: page.getByRole("alert").filter({ hasText: text }),
      },
    ],
    // Project documents
    uploadFilesButton: [
      {
        name: "role",
        locator: page.getByRole("button", { name: /Upload Files/i }),
      },
    ],
    uploadFromDevice: [
      { name: "text", locator: page.getByText("From device", { exact: true }) },
      {
        name: "role",
        locator: page.getByRole("button", { name: /From device/i }),
      },
    ],
    deleteFileButton: [
      {
        name: "aria-label",
        locator: page.locator('[aria-label="Delete File"]'),
      },
      { name: "title", locator: page.locator('[title="Delete File"]') },
    ],
    // Projects table
    deleteProjectButton: [
      {
        name: "role",
        locator: page.getByRole("button", { name: "Delete Project" }),
      },
      {
        name: "aria-label",
        locator: page.locator('[aria-label="Delete Project"]'),
      },
    ],
    // Jobs table
    deleteRowButton: [
      { name: "testid", locator: page.getByTestId("delete-row-button") },
      {
        name: "aria-label",
        locator: page.locator('[aria-label="Delete Row"]'),
      },
    ],
    bulkButton: name => [
      {
        name: "role",
        locator: page.getByRole("button", { name, exact: true }),
      },
    ],
    // Job page
    lockedBanner: [
      {
        name: "text",
        locator: page.getByText("This job is locked.", { exact: false }),
      },
    ],
    voidCancelButton: [
      {
        name: "role",
        locator: main.getByRole("button", {
          name: "Void/Cancel Contract",
          exact: true,
        }),
      },
    ],
  };
}

module.exports = { jobProjectE2EElementStrategies };
