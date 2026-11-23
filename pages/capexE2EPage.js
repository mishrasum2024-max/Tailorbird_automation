/**
 * CapEx E2E page object (tests/TC19_Capex.spec.js, CapEx E2E block).
 *
 * Works only on properties the suite creates itself (PropertyE2EPage /
 * ApprovalE2EPage chains) and deletes afterwards. Reuses the existing CapexPage
 * (goto / waitForShellReady / portfolio filter / KPI cards) and BudgetJob
 * (first budget + revision editor) unchanged.
 *
 * API facts used as the source of truth (MCP-verified 2026-11-18 on beta):
 *  - GET /api/capex-tracker/portfolio-stats?dimension=properties&fiscal_year=<y>&selection=<id>
 *    → { properties_count, remaining_budget, total_funds_remaining, current_committed }
 *    (remaining_budget = Σ current_budget − current_contract; a non-Pro Forma
 *    revision raises it and leaves total_funds_remaining unchanged)
 *  - GET /api/bird-table?table_name=capex_tracker&dimension=properties&selection=<id>&fiscal_year=<y>
 *    → property row (__treeRowKind "top") + one row per budget category
 */
const fs = require("fs");
const path = require("path");
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const { capexE2EElementStrategies } = require("../locators/capexE2ELocator");
const { CapexPage } = require("./capexPage");
const { BudgetJob } = require("./budgetPage");

const BASE_URL = process.env.BASE_URL;
const BUDGET_CSV = path.join(
  __dirname,
  "..",
  "files",
  "budget_data_for_E2EFlow.csv"
);

class CapexE2EPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.s = capexE2EElementStrategies(page);
    this.capex = new CapexPage(page);
    this.fiscalYear = String(new Date().getFullYear());
  }

  // ─── API (source of truth) ─────────────────────────────────────────────────

  async _getJson(url) {
    const res = await this.page.request.get(`${BASE_URL}${url}`);
    expect(res.status(), `FAIL: GET ${url} must succeed`).toBeLessThan(300);
    return res.json();
  }

  async getStats(propertyId) {
    const stats = await this._getJson(
      `/api/capex-tracker/portfolio-stats?dimension=properties&fiscal_year=${this.fiscalYear}&selection=${propertyId}`
    );
    Logger.info(
      `CapEx stats (property ${propertyId}) → ${JSON.stringify(stats)}`
    );
    return {
      properties: Number(stats.properties_count),
      remaining: Number(stats.remaining_budget),
      fundsRemaining: Number(stats.total_funds_remaining),
      committed: Number(stats.current_committed),
    };
  }

  async getTrackerRows(propertyId) {
    const j = await this._getJson(
      `/api/bird-table?table_name=capex_tracker&dimension=properties&selection=${propertyId}&fiscal_year=${this.fiscalYear}`
    );
    const rows = Array.isArray(j) ? j : j.data || j.rows || [];
    return rows.filter(r => String(r.property_id) === String(propertyId));
  }

  async getCategoryRow(propertyId, category) {
    const row = (await this.getTrackerRows(propertyId)).find(
      r => r.group_label === category
    );
    expect(row, `FAIL: CapEx must have a "${category}" row`).toBeTruthy();
    return {
      revision: Number(row.budget_revision),
      current: Number(row.current_budget),
      original: Number(row.original_budget),
    };
  }

  // ─── Budget (first budget + revision) on the suite's own property ─────────

  /** Uploads files/budget_data_for_E2EFlow.csv as the property's first budget. */
  async submitFirstBudget(propertyName, propertyId) {
    expect(
      fs.existsSync(BUDGET_CSV),
      "FAIL: files/budget_data_for_E2EFlow.csv must exist"
    ).toBeTruthy();
    const budgetJob = new BudgetJob(this.page);
    await budgetJob.navigateToBudget();
    await budgetJob.waitForPageLoad();
    expect(
      await budgetJob.selectPropertyByName(propertyName),
      `FAIL: Budget property dropdown must list "${propertyName}"`
    ).toBeTruthy();
    await budgetJob.openRevisionEditor();
    await budgetJob.uploadFileInRevision(BUDGET_CSV);
    await budgetJob.ensureSubmitEnabledAfterUpload();
    await budgetJob.clickSubmitForApproval();
    await expect
      .poll(async () => (await this.getStats(propertyId)).remaining, {
        message: "FAIL: the submitted budget must reach CapEx",
        timeout: 90000,
        intervals: [5000],
      })
      .toBeGreaterThan(0);
    Logger.success(`Budget: first budget submitted for "${propertyName}"`);
  }

  /**
   * Opens a new revision, sets "Adjustment Amount" for one budget item and
   * submits it. Returns the PUT /cells body that saved the adjustment.
   */
  async submitRevisionAdjustment(propertyName, budgetItem, amount) {
    const page = this.page;
    const budgetJob = new BudgetJob(page);
    await budgetJob.navigateToBudget();
    await budgetJob.waitForPageLoad();
    expect(
      await budgetJob.selectPropertyByName(propertyName),
      `FAIL: Budget property dropdown must list "${propertyName}"`
    ).toBeTruthy();
    await budgetJob.openRevisionEditor();

    // The editor grid also virtualizes ROWS: at the test viewport (1280x720)
    // only ~9 budget items are mounted, so a later item is absent from the DOM
    // (run 2). The editor's own search filters the grid to the item
    // (MCP-verified 2026-11-18: "Tile and carpet flooring" becomes data-rgrow 0).
    const editorSearch = page.getByPlaceholder(
      "Search by Category, Item, or Description"
    );
    await expect(
      editorSearch,
      "FAIL: revision editor search must be shown"
    ).toBeVisible({ timeout: 30000 });
    await editorSearch.fill(budgetItem);
    await expect(
      page
        .locator('revogr-data[type="rgRow"] [role="row"]')
        .filter({ has: page.getByText(budgetItem, { exact: true }) })
        .first(),
      `FAIL: revision editor search must show "${budgetItem}"`
    ).toBeVisible({ timeout: 30000 });

    // RevoGrid mounts only the columns that fit; widen it, then resolve the
    // "Adjustment Amount" column and the budget item's row by data-rgrow.
    const header = page
      .getByRole("columnheader", { name: "Adjustment Amount", exact: true })
      .first();
    await expect
      .poll(
        async () => {
          await page.evaluate(() =>
            document.querySelectorAll("revo-grid").forEach(g => {
              g.style.setProperty("width", "4000px", "important");
              g.style.setProperty("min-width", "4000px", "important");
            })
          );
          return header.count();
        },
        {
          message: 'FAIL: revision editor must show "Adjustment Amount"',
          timeout: 45000,
          intervals: [1000, 2000],
        }
      )
      .toBeGreaterThan(0);
    const col = await header.getAttribute("data-rgcol");
    const rgrow = await page
      .locator('revogr-data[type="rgRow"] [role="row"]')
      .filter({ has: page.getByText(budgetItem, { exact: true }) })
      .first()
      .getAttribute("data-rgrow");
    expect(
      rgrow,
      `FAIL: revision editor must list "${budgetItem}"`
    ).not.toBeNull();

    const cell = page
      .locator(
        `revogr-data[type="rgRow"] [role="row"][data-rgrow="${rgrow}"] [role="gridcell"][data-rgcol="${col}"]`
      )
      .first();
    await cell.dblclick({ force: true });
    const editor = page.locator("revogr-edit input, revo-grid input").first();
    await editor.waitFor({ state: "visible", timeout: 10000 });
    await expect
      .poll(
        async () => {
          await editor.click();
          await editor.press("Control+A");
          await editor.press("Backspace");
          await editor.pressSequentially(String(amount), { delay: 40 });
          return (await editor.inputValue()).replace(/[^0-9.-]/g, "");
        },
        {
          message: `FAIL: the adjustment editor must hold ${amount}`,
          timeout: 20000,
          intervals: [500, 1000],
        }
      )
      .toBe(String(amount));
    const [response] = await Promise.all([
      page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/cells") &&
          r.request().method() === "PUT",
        { timeout: 60000 }
      ),
      editor.press("Enter"),
    ]);
    const body = JSON.parse(response.request().postData() || "{}");
    expect(
      response.status(),
      "FAIL: saving the adjustment must succeed"
    ).toBeLessThan(300);
    Logger.info(
      `Revision: "${budgetItem}" adjustment → PUT /cells ${response.status()} ${JSON.stringify(body)}`
    );

    await budgetJob.clickSubmitForApproval();
    Logger.success(`Revision: +${amount} on "${budgetItem}" submitted`);
    return body;
  }

  // ─── CapEx page ────────────────────────────────────────────────────────────

  async open() {
    await this.capex.goto();
  }

  /** Narrows the scope filter to exactly one property. */
  async selectOnlyProperty(propertyName) {
    await this.capex.openPortfolioFilter();
    const search = healingLocator(this.s.scopeSearch).first();
    await expect(search, "FAIL: scope search must be shown").toBeVisible({
      timeout: 15000,
    });
    await search.fill(propertyName);
    await healingLocator(this.s.scopeOption("Entire Portfolio"))
      .first()
      .click();
    const statsResponse = this.page.waitForResponse(
      r => r.url().includes("/api/capex-tracker/portfolio-stats"),
      { timeout: 60000 }
    );
    await healingLocator(this.s.scopeOption(propertyName)).first().click();
    await this.capex.closePortfolioFilter();
    await statsResponse;
    await expect(
      this.capex.l.portfolioFilterBtn,
      "FAIL: scope trigger must show the selected property"
    ).toContainText(propertyName, { timeout: 30000 });
    Logger.success(`CapEx scope: only "${propertyName}"`);
  }

  async readCards() {
    const kpi = await this.capex.getKpiValues();
    Logger.info(`CapEx cards → ${JSON.stringify(kpi)}`);
    return kpi;
  }

  /** Types into the scope search; returns whether "No matches" shows. */
  async scopeSearchShowsNoMatches(term) {
    await this.capex.openPortfolioFilter();
    const search = healingLocator(this.s.scopeSearch).first();
    await search.fill(term);
    const visible = await healingLocator(this.s.noMatches)
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    await search.fill("");
    await this.capex.closePortfolioFilter();
    return visible;
  }

  async expandPropertyRow(propertyName) {
    await healingLocator(this.s.propertyTreeToggle).first().click();
    await expect(
      this.page
        .locator('revogr-data[type="rgRow"] [role="row"]')
        .filter({
          has: this.page.getByText("Bathroom fixtures install", {
            exact: true,
          }),
        })
        .first(),
      `FAIL: "${propertyName}" must expand into its budget categories`
    ).toBeVisible({ timeout: 30000 });
  }

  /** Opens a budget category's drill-down (master-detail). */
  async openCategoryDrillDown(category) {
    const row = this.page
      .locator('revogr-data[type="rgRow"] [role="row"]')
      .filter({ has: this.page.getByText(category, { exact: true }) })
      .first();
    await row.locator("button.expand-button").first().click();
    Logger.info(`CapEx: opened the "${category}" drill-down`);
  }

  emptyDrillDown() {
    return healingLocator(this.s.emptyDrillDown).first();
  }

  async openExportMenu() {
    await healingLocator(this.s.exportButton).first().click();
    return {
      csv: healingLocator(this.s.exportMenuItem("Export CSV")).first(),
      custom: healingLocator(
        this.s.exportMenuItem("Export Custom Report")
      ).first(),
    };
  }

  customReportDialog() {
    return healingLocator(this.s.customReportDialog).last();
  }

  /** In an open drill-down, expands the project row and returns the job link. */
  async contractLinkInDrillDown(projectName, jobId) {
    // Clicking the project name only focuses the cell (run 1); the row expands
    // through its own tree-toggle "›" (MCP-verified 2026-11-18).
    await this.page
      .locator('[role="gridcell"]')
      .filter({ has: this.page.getByText(projectName, { exact: true }) })
      .first()
      .locator("button.tree-toggle")
      .click();
    const link = this.page
      .locator(`main a[href="/jobs/${jobId}?tab=contracts"]`)
      .or(this.page.getByRole("link", { name: `#${jobId}`, exact: true }))
      .first();
    await expect(
      link,
      `FAIL: the drill-down must show contract link #${jobId}`
    ).toBeVisible({ timeout: 30000 });
    return link;
  }

  contractsTab() {
    return healingLocator(this.s.contractsTab).first();
  }
}

module.exports = { CapexE2EPage };
