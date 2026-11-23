const fs = require("fs");
const { expect } = require("@playwright/test");
const { CapexPage } = require("./capexPage");
const { AddColumnPage } = require("./addColumnPage");
const { tableSettingsLocators } = require("../locators/tableSettingsLocator");
const { armCsvExportChoice } = require("../utils/exportMenu");
const { Logger } = require("../utils/logger");

/**
 * Column terminology on the CapEx Tracker: the "Table settings" drawer lets an org admin rename a
 * column inline ("<name> display name") and "Save for everyone" stores it org-wide
 * (MCP-verified 2026-11-05). Clearing an override = restoring the standard label.
 */
class CapexColumnTerminologyPage {
  constructor(page) {
    this.page = page;
    this.capex = new CapexPage(page);
    this.columns = new AddColumnPage(page, { scope: page.locator("main") });
    this.ts = tableSettingsLocators(page);
  }

  async open() {
    await this.capex.goto();
    await this.capex.waitForShellReady();
  }

  async getHeaders() {
    await expect(this.capex.l.columnHeaders.first()).toBeVisible({
      timeout: 30000,
    });
    return this.capex.getColumnHeaders();
  }

  /** Renames a column in Table settings and saves it for the whole organization. */
  async setCustomLabelForEveryone(currentLabel, newLabel, aliasLabel) {
    Logger.step(
      `Rename "${currentLabel}" -> "${newLabel}" (save for everyone)`
    );
    await this.columns.openTableSettings();
    // The textbox is named after the column's standard label; the current value may be custom.
    const box = this.ts
      .columnDisplayName(currentLabel)
      .or(this.ts.columnDisplayName(aliasLabel || newLabel))
      .first();
    await expect(box).toBeVisible({ timeout: 15000 });
    // Already saved with this label (e.g. left by an earlier run): Save stays disabled, nothing to do.
    if ((await box.inputValue()) !== newLabel) {
      await box.fill(newLabel);
      await expect(this.ts.saveForEveryoneButton).toBeEnabled({
        timeout: 10000,
      });
      // Added 2026-11-11 (insert-only): trace-verified TC559 failure — the PUT
      // /api/table-view-config?labels=1 started by this click was still in flight when the reload below
      // ran, so it was aborted (no response) and the caller's waitForResponse timed out after 60s.
      // Let the save finish before closing the drawer and reloading.
      const labelsSaved = this.page
        .waitForResponse(
          res =>
            res.url().includes("/api/table-view-config") &&
            res.url().includes("labels=1") &&
            res.request().method() === "PUT",
          { timeout: 60000 }
        )
        .catch(() => null);
      await this.ts.saveForEveryoneButton.click();
      const labelsSaveResponse = await labelsSaved;
      Logger.info(
        `Column label save → ${labelsSaveResponse ? labelsSaveResponse.status() : "no response within 60s"}`
      );
      await this.page.waitForTimeout(500);
    }
    await this.columns.closeTableSettings();
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.capex.waitForShellReady();
    await this.waitForHeader(newLabel);
  }

  /** Clears the override by restoring the standard label. */
  async clearCustomLabel(customLabel, standardLabel) {
    await this.setCustomLabelForEveryone(
      standardLabel,
      standardLabel,
      customLabel
    );
  }

  async waitForHeader(label) {
    await expect
      .poll(async () => (await this.getHeaders()).includes(label), {
        timeout: 30000,
      })
      .toBe(true);
  }

  async isHeaderPresent(label) {
    if ((await this.getHeaders()).includes(label)) return true;
    // Header may be virtualized out of the grid: fall back to the saved value in Table settings.
    await this.columns.openTableSettings();
    const found = await this.ts.columnNameTextboxes
      .evaluateAll((els, l) => els.some(e => e.value === l), label)
      .catch(() => false);
    await this.columns.closeTableSettings();
    return found;
  }

  /** Exports CSV and returns { header: string[], lines: string[] }. */
  async exportCsv() {
    const choice = armCsvExportChoice(this.page);
    const download = await Promise.all([
      this.page.waitForEvent("download", { timeout: 45000 }),
      this.capex.l.exportBtn.click(),
    ]).then(r => r[0]);
    await choice;
    const file = await download.path();
    const lines = fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter(l => l.trim());
    const header = (lines[0] || "")
      .split(",")
      .map(h => h.replace(/^"|"$/g, "").trim());
    return { header, lines };
  }

  /** Text of every grid row (pinned + scrolling cells), in on-screen order. */
  async getGridRowTexts() {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="row"]'))
        .filter(r => r.querySelectorAll('[role="gridcell"]').length >= 7)
        .map(r => (r.textContent || "").trim())
    );
  }

  async sortByHeader(label) {
    const header = this.capex.l.columnHeaders
      .filter({ hasText: label })
      .first();
    await expect(header).toBeVisible({ timeout: 15000 });
    await this.capex.clickColumnHeader(header);
  }

  async getFirstDataRow() {
    return this.capex.getFirstDataRowText();
  }

  async getTotals() {
    return this.capex.getTotalRowValues();
  }

  /** Static elements of the Table settings drawer where labels are renamed. */
  async verifyTerminologyControls(columnLabel) {
    await this.columns.openTableSettings();
    const ts = this.ts;
    await expect(ts.title).toBeVisible();
    await expect(ts.subtitle).toBeVisible();
    await expect(ts.organizationDefaultTag).toBeVisible();
    await expect(ts.columnsHeading).toBeVisible();
    await expect(ts.columnsHint).toBeVisible();
    await expect(ts.columnDisplayName(columnLabel)).toBeVisible();
    expect(await ts.columnNameTextboxes.count()).toBeGreaterThan(0);
    await expect(ts.addColumnTrigger).toBeVisible();
    await expect(ts.footerCancelButton).toBeVisible();
    await expect(ts.saveForEveryoneButton).toBeVisible();
    await expect(ts.saveChangesButton).toBeVisible();
    await expect(ts.closeButton).toBeVisible();
    await this.columns.closeTableSettings();
  }
}

module.exports = { CapexColumnTerminologyPage };
