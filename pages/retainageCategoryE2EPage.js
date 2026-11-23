/**
 * Retainage & Categories E2E page object (tests/TC22_Retainage.spec.js and
 * tests/TC07_category.spec.js, E2E blocks).
 *
 * Retainage works on a suite-owned Contract job (JobProjectE2EPage chain); the
 * "Open invoice" check only reads job 4304's Retainage tab. Categories only
 * creates, edits and deletes its own AUTO-<suffix> codes; existing categories are
 * only read. Reuses RetainagePage and FinancialsCategoryPage unchanged.
 *
 * Live-verified behaviour: see locators/retainageCategoryE2ELocator.js.
 */
const fs = require("fs");
const path = require("path");
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const {
  retainageCategoryE2EElementStrategies,
} = require("../locators/retainageCategoryE2ELocator");
const { RetainagePage } = require("./retainagePage");
const { FinancialsCategoryPage } = require("./categoryPage");

const BASE_URL = process.env.BASE_URL;
const CATEGORY_CSV_TEMPLATE = path.join(
  __dirname,
  "..",
  "files",
  "category_data.csv"
);

class RetainageCategoryE2EPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.s = retainageCategoryE2EElementStrategies(page);
    this.retainage = new RetainagePage(page);
    this.category = new FinancialsCategoryPage(page);
  }

  loc(name) {
    return healingLocator(this.s[name]).first();
  }

  toast(text) {
    return this.page
      .locator(".mantine-Notification-root")
      .filter({ hasText: text })
      .first();
  }

  // ─── Retainage: contract overview drawer ───────────────────────────────────

  async openContractDrawer(jobId) {
    await this.page.goto(`${BASE_URL}/jobs/${jobId}?tab=contracts`, {
      waitUntil: "load",
    });
    // Job Summary and Contracts both render an "Edit" button; "Contract ID" only
    // renders on the Contracts panel (same guard as ApprovalE2EPage).
    await expect(
      this.page.getByText("Contract ID", { exact: true }).first(),
      "FAIL: Contracts panel must render"
    ).toBeVisible({ timeout: 30000 });
    await this.retainage.openEditContractOverviewDrawer();
    return this.loc("contractDrawer");
  }

  async typeContractRetainage(value) {
    const input = this.loc("contractRetainageInput");
    await input.click();
    await input.press("Control+A");
    await input.fill(String(value));
    await input.press("Tab");
    await this.page.waitForTimeout(500);
    return input.inputValue();
  }

  async setContractEstimatedCost(amount) {
    const input = this.loc("contractEstimatedCostInput");
    await input.click();
    await input.press("Control+A");
    await input.fill(String(amount));
    await input.press("Tab");
  }

  async saveContractDrawer() {
    await this.loc("contractDrawerSave").click();
    await expect(
      this.toast("Contract overview updated"),
      'FAIL: toast "Contract overview updated"'
    ).toBeVisible({ timeout: 30000 });
    await expect(this.loc("contractDrawer")).toBeHidden({ timeout: 30000 });
  }

  async cancelContractDrawer() {
    await this.loc("contractDrawerCancel").click();
    await expect(this.loc("contractDrawer")).toBeHidden({ timeout: 15000 });
  }

  // ─── Retainage: contract Retainage tab ─────────────────────────────────────

  /** Waits for the first "Open invoice" action in the Retainage sub-tab. */
  async firstOpenInvoiceAction(jobId) {
    await this.retainage.gotoContractRetainageTab(jobId);
    const action = this.loc("openInvoiceAction");
    await expect(
      action,
      `FAIL: job ${jobId} Retainage tab must list an invoice with an "Open invoice" action`
    ).toBeVisible({ timeout: 60000 });
    return action;
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  async categoryRows() {
    const res = await this.page.request.get(
      `${BASE_URL}/api/bird-table?table_name=category`
    );
    expect(res.status(), "FAIL: category API must answer").toBeLessThan(300);
    const j = await res.json();
    return Array.isArray(j) ? j : j.data || j.rows || [];
  }

  async categoryByCode(code) {
    return (await this.categoryRows()).find(r => r.code === code) || null;
  }

  async openCategoryPage() {
    await this.page.goto(`${BASE_URL}/financials/category`, {
      waitUntil: "load",
    });
    await expect(
      this.loc("gridSearch"),
      "FAIL: category grid search"
    ).toBeVisible({
      timeout: 60000,
    });
  }

  async searchCategory(term) {
    const s = this.loc("gridSearch");
    await s.fill(term);
    await s.press("Enter").catch(() => {});
    await this.page.waitForTimeout(2500);
  }

  /**
   * Writes a CSV with the org's category headers (the header line of the
   * framework's files/category_data.csv — the import rejects other schemas with
   * "Table schema not matching") and one row per given {code, name}.
   */
  writeCategoryCsv(file, rows) {
    // Takes the full path from the caller, so no path.join on parameters here (Semgrep).
    const fileName = path.basename(file);
    const header = fs
      .readFileSync(CATEGORY_CSV_TEMPLATE, "utf8")
      .split(/\r?\n/)[0];
    const cols = header.split(",").map(h => h.trim());
    const line = r =>
      cols
        .map(c =>
          c === "Category Code"
            ? r.code
            : c === "Category Name"
              ? r.name
              : c === "GL Account Number"
                ? "9001"
                : c === "Imported From"
                  ? fileName
                  : c === "Description"
                    ? ""
                    : "auto"
        )
        .join(",");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, [header, ...rows.map(line)].join("\n") + "\n");
    return file;
  }

  async importCategoryCsv(file) {
    await this.category.uploadCategory(file);
  }

  async editCategoryName(currentName, newName) {
    const cell = this.page
      .locator("main [role=gridcell]")
      .filter({ hasText: currentName })
      .first();
    await expect(cell, `FAIL: category cell "${currentName}"`).toBeVisible({
      timeout: 30000,
    });
    await cell.dblclick({ force: true });
    const editor = this.loc("gridCellEditor");
    await expect(editor, "FAIL: inline editor must open").toBeVisible({
      timeout: 15000,
    });
    await editor.fill(newName);
    await this.page.keyboard.press("Enter");
  }

  /** Deletes the single row a code search returns (no confirmation dialog in this table). */
  async deleteCategoryByCode(code) {
    await this.searchCategory(code);
    const del = healingLocator(this.s.rowDeleteButton);
    await expect(del, `FAIL: exactly one row for "${code}"`).toHaveCount(1, {
      timeout: 30000,
    });
    await del.first().click();
    await expect
      .poll(async () => Boolean(await this.categoryByCode(code)), {
        message: `FAIL: category "${code}" must be deleted`,
        timeout: 30000,
        intervals: [2000],
      })
      .toBe(false);
  }

  /** Best-effort cleanup of this suite's own codes (never touches other rows). */
  async deleteOwnCategoriesQuietly(prefix) {
    try {
      const own = (await this.categoryRows()).filter(r =>
        String(r.code).startsWith(prefix)
      );
      if (!own.length) return;
      await this.openCategoryPage();
      for (const r of own) {
        await this.deleteCategoryByCode(r.code).catch(e =>
          Logger.info(
            `Cleanup: could not delete "${r.code}" (${e.message.split("\n")[0]})`
          )
        );
      }
    } catch (e) {
      Logger.info(
        `Cleanup: category cleanup skipped (${e.message.split("\n")[0]})`
      );
    }
  }

  async visibleCodes() {
    const cells = healingLocator(this.s.codeCells);
    return (await cells.allInnerTexts())
      .map(t => t.trim())
      .filter(t => t && t !== "—");
  }

  async clickHeader(name) {
    await healingLocator(this.s.columnHeader(name)).first().click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Clicks the column header until the visible codes are in the wanted order
   * (at most 3 clicks: unsorted → asc → desc). Run of 2026-11-19 (TC606): a click
   * right after the grid loaded was ignored and the codes stayed unsorted, so a
   * single click is not enough. Returns the ordered codes, or the last read when
   * the order is never reached (the caller asserts it).
   * @param {(a: string, b: string) => number} compare
   * @param {"asc"|"desc"} direction
   */
  async sortCodes(header, compare, direction) {
    const isOrdered = codes => {
      const want = [...codes].sort(compare);
      if (direction === "desc") want.reverse();
      return codes.length > 1 && codes.every((c, i) => c === want[i]);
    };
    await expect(
      healingLocator(this.s.codeCells).first(),
      "FAIL: category rows"
    ).toBeVisible({
      timeout: 30000,
    });
    let codes = [];
    for (let click = 1; click <= 3; click++) {
      await this.clickHeader(header);
      const reached = await expect
        .poll(async () => isOrdered((codes = await this.visibleCodes())), {
          timeout: 10000,
        })
        .toBe(true)
        .then(() => true)
        .catch(() => false);
      if (reached) return codes;
      Logger.info(
        `${header}: not ${direction} after click ${click} — clicking again`
      );
    }
    return codes;
  }
}

module.exports = { RetainageCategoryE2EPage };
