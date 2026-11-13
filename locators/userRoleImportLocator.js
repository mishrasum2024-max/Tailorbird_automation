/**
 * Locators for Approvers Management (/user-role-management) -> "Import Property Role" modal.
 * Texts verified in the app source (app/user-role-management/page.tsx).
 */
function userRoleImportLocators(page) {
  return {
    importButton: page
      .getByRole("button", { name: "Import Property Role" })
      .or(page.locator("button").filter({ hasText: "Import Property Role" }))
      .first(),
    importModal: page
      .getByRole("dialog")
      .filter({ hasText: "Import User Role Assignments" })
      .first()
      .or(
        page
          .locator(".mantine-Modal-content")
          .filter({ hasText: "Import User Role Assignments" })
          .first()
      ),
    fileInput: page
      .getByRole("dialog")
      .locator('input[type="file"]')
      .first()
      .or(page.locator('uc-upload-list input[type="file"]').first())
      .or(page.locator('input[type="file"]').first()),
    fromDeviceButton: page
      .getByRole("dialog")
      .getByRole("button", { name: "From device" })
      .first()
      .or(page.getByRole("button", { name: "From device" }).first()),
    uploadedFileSummary: page
      .getByRole("dialog")
      .getByText(/1 file uploaded/)
      .first()
      .or(
        page
          .locator("uc-upload-list")
          .getByText(/file uploaded/)
          .first()
      ),
    uploadDoneButton: page
      .getByRole("dialog")
      .locator("button.uc-done-btn")
      .first()
      .or(page.locator("uc-upload-list button.uc-done-btn").first()),
    resultSuccessAlert: page
      .getByRole("dialog")
      .getByText("Import completed", { exact: true })
      .first()
      .or(
        page.getByText("Role assignments were updated from your CSV.").first()
      )
      .first(),
    resultFailureAlert: page
      .getByRole("dialog")
      .getByText("Import failed", { exact: true })
      .first()
      .or(page.getByText("Please review the issues below").first())
      .first(),
    invitedUsersAlert: page
      .getByRole("dialog")
      .getByText("Invited Users", { exact: true })
      .first(),
    errorsAlert: page
      .getByRole("dialog")
      .getByText("Errors", { exact: true })
      .first(),
    doneButton: page
      .getByRole("button", { name: "Done", exact: true })
      .or(page.locator("button").filter({ hasText: "Done" }))
      .first(),
    modalText: page.getByRole("dialog").first(),
  };
}

module.exports = { userRoleImportLocators };
