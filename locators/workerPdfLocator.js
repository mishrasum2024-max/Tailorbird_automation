/**
 * Locators for FEAT-1313 (worker-thread PDF generation) checks that are not covered by the
 * existing draw / invoice locator files: the Property Documents file list (draw PDF count)
 * and the Invoice Documents section on an invoice's details page.
 */
function workerPdfLocators(page) {
  return {
    jobInvoiceTab: page.getByRole("tab", { name: "Invoice", exact: true }),
    createInvoiceButton: page.getByRole("button", {
      name: "Create Invoice",
      exact: true,
    }),
    invoiceDetailsDialog: page
      .getByRole("dialog")
      .filter({ has: page.getByText("Invoice Details", { exact: true }) })
      .last(),
    invoiceNumberInput: dialog =>
      dialog.getByRole("textbox", { name: "Enter invoice number" }),
    invoiceTitleInput: dialog =>
      dialog.getByRole("textbox", { name: "Enter title" }),
    invoiceAmountHeader: dialog =>
      dialog.getByRole("columnheader", { name: "Invoice Amount", exact: true }),
    invoiceAmountCell: (dialog, colIndex) =>
      dialog.locator(`[role="gridcell"][data-rgcol="${colIndex}"]`).first(),
    invoiceAmountEditor: page.getByTestId("bird-table-currency-input"),
    confirmInvoiceButton: dialog =>
      dialog.getByRole("button", { name: "Confirm Invoice", exact: true }),
    approveInvoiceConfirmDialog: page.getByRole("dialog").filter({
      has: page.getByText("Are you sure you want to approve this invoice?", {
        exact: true,
      }),
    }),
    approveInvoiceConfirmButton: page
      .getByRole("dialog")
      .filter({
        has: page.getByText("Are you sure you want to approve this invoice?", {
          exact: true,
        }),
      })
      .getByRole("button", { name: "Confirm", exact: true }),
    propertyDocumentsByFileName: fileName =>
      page.getByText(fileName, { exact: false }),
    invoiceDocumentsSection: page
      .getByText("Invoice Documents", { exact: true })
      .first()
      .or(page.locator("text=Invoice Documents").first()),
    invoiceDocumentLinks: page
      .locator('main a[href*=".pdf"]')
      .or(page.locator('main a[href*="files.tailorbird.com"]'))
      .or(page.locator('main a[href*="ucarecdn"]')),
    invoiceDocumentFileNames: page
      .locator("main")
      .getByText(".pdf", { exact: false }),
  };
}

module.exports = { workerPdfLocators };
