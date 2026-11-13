const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { workerPdfLocators } = require("../locators/workerPdfLocator");
const { downloadAndExtractPdfText } = require("../utils/pdfTextExtractor");

/**
 * FEAT-1313 helpers: draw PDF regeneration, draw PDF document counting, event-loop
 * responsiveness probes and generated-PDF validation. Reuses DrawReportingJob /
 * CMFeeDrawPdfPage for everything draw-related; this class only adds what they lack.
 */
class WorkerPdfPage {
  constructor(page) {
    this.page = page;
    this.loc = workerPdfLocators(page);
  }

  /**
   * Creates and approves a $amount invoice on a job. Unlike the older draw-reporting helper this
   * scopes the amount cell to the Invoice Details dialog: once the job already has invoices the
   * background invoice list also matches the same column index and was clicked instead.
   */
  async createApprovedInvoice(jobId, title, amount) {
    await this.page.goto(`/jobs/${jobId}?tab=invoices`, { waitUntil: "load" });
    await expect(this.loc.jobInvoiceTab, "Invoice tab must render").toBeVisible(
      { timeout: 60000 }
    );
    await this.loc.jobInvoiceTab.click();
    await expect(this.loc.createInvoiceButton).toBeVisible({ timeout: 45000 });
    await this.loc.createInvoiceButton.click();
    const dialog = this.loc.invoiceDetailsDialog;
    await expect(dialog, "Invoice Details dialog must open").toBeVisible({
      timeout: 45000,
    });
    const invoiceNumberLabel = (
      await this.loc.invoiceNumberInput(dialog).inputValue()
    ).trim();
    await this.loc.invoiceTitleInput(dialog).fill(title);
    const header = this.loc.invoiceAmountHeader(dialog);
    await expect(
      header,
      "Invoice Amount column header must render"
    ).toBeVisible({ timeout: 45000 });
    const colIndex = await header.evaluate(el => el.getAttribute("data-rgcol"));
    const cell = this.loc.invoiceAmountCell(dialog, colIndex);
    await cell.scrollIntoViewIfNeeded();
    await cell.dblclick();
    await expect(
      this.loc.invoiceAmountEditor,
      "Invoice amount editor must open"
    ).toBeVisible({ timeout: 45000 });
    await this.loc.invoiceAmountEditor.fill(String(amount));
    await this.loc.invoiceAmountEditor.press("Enter");
    await expect(cell, "Amount cell must show the value").toContainText(
      String(amount)
    );
    await this.loc.confirmInvoiceButton(dialog).click();
    await expect(this.loc.approveInvoiceConfirmDialog).toBeVisible({
      timeout: 45000,
    });
    await this.loc.approveInvoiceConfirmButton.click();
    await expect(this.loc.approveInvoiceConfirmDialog).not.toBeVisible({
      timeout: 60000,
    });
    Logger.success(
      `Created and approved invoice "${invoiceNumberLabel}" on job ${jobId}`
    );
    return { invoiceNumberLabel, amount };
  }
}

module.exports = { WorkerPdfPage };
