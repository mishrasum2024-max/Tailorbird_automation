/**
 * Approvals E2E locators (tests/TC10_approval.spec.js, Approvals E2E block).
 *
 * Every element is a multi-locator strategy list consumed by healingLocator()
 * (utils/locatorHealer.js): element-based Playwright methods first, a CSS
 * fallback only where the element has no accessible role/label/text.
 *
 * MCP-verified 2026-11-18 on beta (owner + approver browsers):
 *  - Approval details open in a dialog headed "Approval Details" with a notes
 *    textarea (placeholder "Enter any remarks or notes about this approval..."),
 *    "Approve" / "Reject" for the reviewer, "Approve on Behalf" /
 *    "Reject on Behalf" for an org admin acting for another approver.
 *  - Rejecting with empty notes shows "Notes are required for rejection" and
 *    sends no request (ApprovalDetailsDrawer.tsx handleReject).
 *  - Approving/submitting over budget shows a PreflightConfirmModal
 *    ("Complete the following before approving|submitting") with
 *    "Proceed Anyway".
 *  - The approvals grid is RevoGrid: the data row and its pinned Actions row
 *    share the same data-rgrow index.
 * @param {import('@playwright/test').Page} page
 */
function approvalE2EElementStrategies(page) {
  const detailsDialog = page
    .getByRole("dialog")
    .filter({ hasText: "Approval Details" });

  return {
    approvalsTab: name => [
      { name: "role", locator: page.getByRole("tab", { name, exact: true }) },
      {
        name: "text",
        locator: page.locator('[role="tab"]').filter({ hasText: name }),
      },
    ],
    searchInput: [
      {
        name: "role",
        locator: page.getByRole("textbox", { name: "Search..." }),
      },
      { name: "placeholder", locator: page.getByPlaceholder("Search...") },
    ],
    viewDetailsButtons: [
      {
        name: "role",
        locator: page.getByRole("button", { name: "View Details" }),
      },
      {
        name: "text",
        locator: page.getByText("View Details", { exact: true }),
      },
    ],
    detailsDialog: [
      { name: "role+text", locator: detailsDialog },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .filter({ hasText: "Approval Details" }),
      },
    ],
    notesInput: [
      {
        name: "placeholder",
        locator: detailsDialog.getByPlaceholder(
          "Enter any remarks or notes about this approval..."
        ),
      },
      {
        name: "label",
        locator: detailsDialog.getByLabel(/Notes \(required for rejection\)/i),
      },
    ],
    drawerButton: name => [
      {
        name: "role",
        locator: detailsDialog.getByRole("button", { name, exact: true }),
      },
      { name: "text", locator: detailsDialog.getByText(name, { exact: true }) },
    ],
    notesRequiredError: [
      {
        name: "text",
        locator: detailsDialog.getByText("Notes are required for rejection"),
      },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .getByText("Notes are required for rejection"),
      },
    ],
    preflightDialog: [
      {
        name: "role+text",
        locator: page
          .getByRole("dialog")
          .filter({
            hasText: /Complete the following before (approving|submitting)/,
          }),
      },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .filter({
            hasText: /Complete the following before (approving|submitting)/,
          }),
      },
    ],
    preflightProceedButton: [
      {
        name: "role",
        locator: page.getByRole("button", { name: /^Proceed( Anyway)?$/ }),
      },
      { name: "text", locator: page.getByText(/^Proceed( Anyway)?$/) },
    ],
    notification: title => [
      {
        name: "role",
        locator: page.getByRole("alert").filter({ hasText: title }),
      },
      {
        name: "css",
        locator: page
          .locator(".mantine-Notification-root")
          .filter({ hasText: title }),
      },
    ],
    drawSchedulePanel: [
      {
        name: "text",
        locator: detailsDialog.getByText("Draw disbursement schedule", {
          exact: true,
        }),
      },
      {
        name: "css+text",
        locator: page
          .locator('[role="dialog"]')
          .getByText("Draw disbursement schedule"),
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
    changeOrdersTab: [
      {
        name: "role",
        locator: page.getByRole("tab", { name: "Change Orders", exact: true }),
      },
      {
        name: "text",
        locator: page
          .locator('[role="tab"]')
          .filter({ hasText: /^Change Orders$/ }),
      },
    ],
    templateNameInput: [
      {
        name: "placeholder",
        locator: page.getByPlaceholder("Enter template name"),
      },
      { name: "label", locator: page.getByLabel(/Template name/i) },
    ],
  };
}

module.exports = { approvalE2EElementStrategies };
