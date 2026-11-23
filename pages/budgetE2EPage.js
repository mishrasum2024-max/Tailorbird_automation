/**
 * Budget E2E page object (tests/TC15_Budget.spec.js, Budget E2E block).
 *
 * Works only on a property the suite creates and deletes itself. Reuses
 * BudgetJob.uploadFileInRevision (CI-safe Uploadcare upload) and the existing
 * budgetLocators(page).versionDropdown unchanged.
 */
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const { budgetE2EElementStrategies } = require("../locators/budgetE2ELocator");
const { budgetLocators } = require("../locators/budgetLocator");
const { BudgetJob } = require("./budgetPage");

const BASE_URL = process.env.BASE_URL;

class BudgetE2EPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.s = budgetE2EElementStrategies(page);
    this.nameDialog = healingLocator(this.s.nameDialog).first();
    this.nameInput = healingLocator(this.s.nameInput).first();
  }

  async openBudget(propertyId) {
    await this.page.goto(
      `${BASE_URL}/financials/budget?propertyId=${propertyId}`,
      { waitUntil: "load" }
    );
  }

  createFirstBudgetButton() {
    return healingLocator(this.s.createFirstBudgetButton).first();
  }

  nameDialogButton(name) {
    return healingLocator(this.s.nameDialogButton(name)).first();
  }

  editorButton(name) {
    return healingLocator(this.s.editorButton(name)).first();
  }

  async openNameDialog() {
    await expect(
      this.createFirstBudgetButton(),
      'FAIL: a property without a budget must offer "Create First Budget"'
    ).toBeVisible({ timeout: 30000 });
    // Run 1 (2026-11-18): the button renders before the page finishes
    // hydrating and an early click is ignored (screenshot: button visible, no
    // dialog). Clicking only opens a dialog, so retry until it opens.
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (await this.nameDialog.isVisible().catch(() => false)) break;
      await this.createFirstBudgetButton().click();
      const opened = await this.nameDialog
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (opened) break;
      Logger.info(
        `"Create First Budget" click ${attempt} did not open the dialog yet — retrying`
      );
    }
    await expect(
      this.nameDialog,
      'FAIL: "Name this budget revision" dialog must open'
    ).toBeVisible({ timeout: 15000 });
  }

  /** Rows with data in the revision editor grid. */
  async gridRowCount() {
    return this.page
      .locator('revogr-data[type="rgRow"] [role="row"]')
      .evaluateAll(els => els.filter(e => (e.innerText || "").trim()).length);
  }

  /**
   * Uploads a CSV through BudgetJob.uploadFileInRevision and records every
   * import response. For a rejected file the helper ends with
   * "No rows after upload" — returned as `error` instead of thrown.
   */
  async uploadCsv(filePath) {
    const imports = [];
    const listener = r => {
      if (r.url().includes("/api/budget-revision-detail/import"))
        imports.push(r.status());
    };
    this.page.on("response", listener);
    let error = null;
    try {
      await new BudgetJob(this.page).uploadFileInRevision(filePath);
    } catch (e) {
      error = String(e.message);
    } finally {
      this.page.off("response", listener);
    }
    Logger.info(
      `Upload ${filePath.split(/[\\/]/).pop()} → import statuses [${imports.join(", ")}]${error ? `, helper: ${error.split("\n")[0]}` : ""}`
    );
    return { imports, error };
  }

  importFailedAlert() {
    return healingLocator(this.s.importFailedAlert).first();
  }

  /** Closes persistent notifications (e.g. "Import Failed") via their close buttons. */
  async dismissAlerts() {
    const closeButtons = this.page.locator(".mantine-Notification-root button");
    for (let i = (await closeButtons.count()) - 1; i >= 0; i--) {
      await closeButtons
        .nth(i)
        .click()
        .catch(() => {});
    }
    await expect(this.importFailedAlert()).toHaveCount(0, { timeout: 10000 });
  }

  /** Clicks Save as Draft; the toast is short-lived, so it is awaited from before the click. */
  async saveAsDraft() {
    const toast = healingLocator(this.s.savedAsDraftAlert).first();
    const seen = toast
      .waitFor({ state: "visible", timeout: 20000 })
      .then(async () => (await toast.innerText()).trim())
      .catch(() => null);
    await this.editorButton("Save as Draft").click();
    return seen;
  }

  /** Lists the Budget page version options (text per option). */
  async versionOptions() {
    const dropdown = budgetLocators(this.page).versionDropdown;
    await expect(dropdown, "FAIL: version selector must be shown").toBeVisible({
      timeout: 30000,
    });
    await dropdown.click();
    const options = this.page.getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 15000 });
    return (await options.allInnerTexts()).map(t =>
      t.replace(/\s+/g, " ").trim()
    );
  }

  /** Picks the version whose option contains `title`; waits for its editor. */
  async openVersion(title) {
    await this.page
      .getByRole("option")
      .filter({ hasText: title })
      .first()
      .click();
    await this.page.waitForURL(/budget-revision\/\d+\/editor/, {
      timeout: 30000,
    });
    await expect(this.editorButton("Save as Draft")).toBeVisible({
      timeout: 30000,
    });
  }
}

module.exports = { BudgetE2EPage };
