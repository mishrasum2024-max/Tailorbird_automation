const fs = require("fs");
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");
const { resetActiveFilters } = require("../utils/filterResetHelper");
const leftPanel = require("./leftPanel");
const data = require("../fixture/unitTracker.json");
const L = require("../locators/unitTrackerLocator");

const UI_TIMEOUT = 60000;

/**
 * Page object for the Unit Tracker page (/unit-tracker).
 * APIs MCP-verified on beta.tailorbird.com, 2026-10-26:
 * - Grid data: GET /api/bird-table?table_name=unit_tracker&property_id=<id>&limit=80&offset=<n>
 *   (rows = units + job + contract rows, tree-linked by parentId / __treeRowKind);
 *   &all_rows=true returns every row (what Export uses).
 * - Filter Apply / Reset Filters and every View action: PUT /api/table-view-config (saved
 *   server-side); deleting a view: DELETE /api/table-view-config?tableName=unit_tracker&viewName=<name>.
 * - Update Status: PUT /api/bird-table/cells/batch?&property_id=<id>
 *   { tableName, columnName: "status", value, rowIds }.
 * - The grid is a RevoGrid: getSource() = every loaded row, getVisibleSource() = the rows the
 *   grid currently shows after search/filter/expand — used to compare UI with API data.
 */
class UnitTrackerPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.data = data;
    this.baseUrl = process.env.BASE_URL;
    // CI sets BASE_URL with a trailing "/" — strip it so `${baseUrl}/unit-tracker` never becomes "//unit-tracker".
    this.baseUrl = String(this.baseUrl || "").replace(/\/+$/, "");
    this.propertyId = null;
    const main = page.getByRole("main");

    this.selectPropertyButton = healingLocator(
      L.selectPropertyButtonStrategies(page, data.selectPropertyButton)
    );
    this.propertyMenu = healingLocator(
      L.propertyMenuStrategies(page, data.propertySearchPlaceholder)
    );
    this.breadcrumbHome = healingLocator(
      L.breadcrumbHomeStrategies(page, data.breadcrumb.home)
    );
    this.breadcrumbPage = healingLocator(
      L.mainTextStrategies(page, data.breadcrumb.page)
    );
    this.searchInput = healingLocator(
      L.gridSearchInputStrategies(page, data.searchPlaceholder)
    );
    this.searchButton = healingLocator(
      L.textButtonStrategies(main, data.searchButton)
    );
    this.updateStatusButton = healingLocator(
      L.textButtonStrategies(main, data.updateStatusButton)
    );
    this.grid = healingLocator(L.gridStrategies(page));
    this.filterPanel = healingLocator(
      L.filterPanelStrategies(
        page,
        data.filter.panelSubtitle,
        data.filter.applyButton
      )
    );
    this.viewPopover = healingLocator(
      L.viewPopoverStrategies(page, data.view.nameInputPlaceholder)
    );
    this.updateStatusDialog = healingLocator(
      L.dialogStrategies(page, data.updateStatusDialogTitle)
    );
    this.statusMenuItems = healingLocator(L.statusMenuItemsStrategies(page));
  }

  toolbarButton(name) {
    return healingLocator(
      L.textButtonStrategies(this.page.getByRole("main"), name)
    );
  }

  gridRow(label) {
    return healingLocator(
      L.gridRowStrategies(this.page, this.grid, label)
    ).first();
  }

  // ---------- Navigation & property ----------

  async navigateToUnitTracker() {
    Logger.step("Dashboard → left panel → Unit Tracker");
    await this.page.goto(process.env.DASHBOARD_URL, {
      waitUntil: "domcontentloaded",
    });
    await ensureLeftPanelExpanded(this.page);
    // Added 2026-11-11 (insert-only): run-verified TC500/TC501 failure — getChildMenuLocator
    // resolved a HIDDEN duplicate of the Trackers link (the nav renders hidden copies of every
    // NavLink, and had folded Trackers into "More"), so the click waited until timeout. Prefer a
    // visible entry point; the original lookup below stays as the fallback.
    const visibleUnitTrackerItem = await leftPanel.getVisibleChildMenuLocator(
      this.page,
      data.leftPanel.section,
      data.leftPanel.item
    );
    if (visibleUnitTrackerItem) {
      await visibleUnitTrackerItem.click();
      const reachedUnitTracker = await this.page
        .waitForURL(url => url.pathname === data.unitTrackerPath, {
          timeout: UI_TIMEOUT,
        })
        .then(() => true)
        .catch(() => false);
      if (reachedUnitTracker) return;
      Logger.info(
        "navigateToUnitTracker: visible nav item did not open Unit Tracker — using the original lookup"
      );
    }
    // Existing helper: returns the item inside the Trackers section when it is in the nav,
    // or the menuitem of the left panel's "More" menu when the nav is collapsed into it
    // (MCP-verified: which one is shown depends on the window height).
    const item = await leftPanel.getChildMenuLocator(
      this.page,
      data.leftPanel.section,
      data.leftPanel.item
    );
    expect(
      item,
      `FAIL: "${data.leftPanel.item}" not found in the left panel or its More menu`
    ).toBeTruthy();
    await item.click();
    await this.page.waitForURL(url => url.pathname === data.unitTrackerPath, {
      timeout: UI_TIMEOUT,
    });
  }

  async verifyUnitTrackerUrl() {
    await expect(this.page, "FAIL: Unit Tracker URL is wrong").toHaveURL(
      `${this.baseUrl}${data.unitTrackerPath}`
    );
    Logger.success(`URL is ${this.baseUrl}${data.unitTrackerPath}`);
  }

  async selectProperty(propertyName = data.propertyName) {
    Logger.step(`Selecting property "${propertyName}"`);
    await expect(
      this.selectPropertyButton,
      'FAIL: "Select a Property" dropdown not available'
    ).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(
      this.selectPropertyButton,
      'FAIL: "Select a Property" dropdown not enabled'
    ).toBeEnabled();
    await this.selectPropertyButton.click();
    await expect(
      this.propertyMenu,
      "FAIL: Property dropdown did not open"
    ).toBeVisible({ timeout: UI_TIMEOUT });
    await healingLocator(
      L.propertySearchStrategies(
        this.propertyMenu,
        data.propertySearchPlaceholder
      )
    ).fill(propertyName);
    const option = healingLocator(
      L.propertyOptionStrategies(this.propertyMenu, propertyName)
    ).first();
    await expect(
      option,
      `FAIL: "${propertyName}" not in the property dropdown`
    ).toBeVisible({ timeout: UI_TIMEOUT });
    const [gridResponse] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r
            .url()
            .includes("/api/bird-table?table_name=unit_tracker&property_id=") &&
          r.request().method() === "GET",
        { timeout: UI_TIMEOUT }
      ),
      option.click(),
    ]);
    expect(
      gridResponse.status(),
      "FAIL: Unit Tracker grid API did not return 200"
    ).toBe(200);
    this.propertyId = new URL(gridResponse.url()).searchParams.get(
      "property_id"
    );
    await expect(
      this.page,
      "FAIL: Property was not applied to the page"
    ).toHaveURL(url => url.searchParams.get("propertyId") === this.propertyId, {
      timeout: UI_TIMEOUT,
    });
    await expect(
      this.grid.getByRole("row").first(),
      "FAIL: Grid did not render"
    ).toBeVisible({ timeout: UI_TIMEOUT });
    // A filter applied by an earlier run is saved server-side and would hide rows.
    await resetActiveFilters(this.page);
    await this.closeFilterPanelIfOpen();
    Logger.success(
      `Property "${propertyName}" selected (propertyId=${this.propertyId})`
    );
  }

  // ---------- Data access ----------

  async fetchAllRowsFromApi() {
    const res = await this.page.request.get(
      `${this.baseUrl}/api/bird-table?table_name=unit_tracker&property_id=${this.propertyId}&all_rows=true`
    );
    expect(
      res.status(),
      "FAIL: Unit Tracker all-rows API did not return 200"
    ).toBe(200);
    return (await res.json()).rows;
  }

  async visibleRows() {
    return this.grid.evaluate(async g =>
      (await g.getVisibleSource()).map(r => ({
        id: r.id,
        parentId: r.parentId,
        kind: r.__treeRowKind,
        label: r.hierarchy_label,
        status: r.status,
        floorPlanType: r.floor_plan_type,
        unitType: r.unit_type,
      }))
    );
  }

  /** Waits until the grid has loaded every page of rows (it fetches 80 units per request). */
  async waitForAllRowsLoaded() {
    const total = (await this.fetchAllRowsFromApi()).length;
    await expect
      .poll(() => this.grid.evaluate(async g => (await g.getSource()).length), {
        message: `FAIL: Grid did not load all ${total} rows`,
        timeout: UI_TIMEOUT,
      })
      .toBe(total);
    return total;
  }

  // ---------- TC1: page loaded ----------

  async verifyPageLoaded(propertyName = data.propertyName) {
    Logger.step("Verifying breadcrumbs, page content, toolbar and grid data");
    await expect(
      this.breadcrumbHome,
      'FAIL: Breadcrumb "Home" missing'
    ).toHaveText(data.breadcrumb.home);
    await expect(
      this.breadcrumbPage,
      'FAIL: Breadcrumb "Unit Tracker" missing'
    ).toHaveText(data.breadcrumb.page);
    const propertyCrumb = healingLocator(
      L.selectPropertyButtonStrategies(this.page, propertyName)
    );
    await expect(
      propertyCrumb,
      `FAIL: Breadcrumb does not show "${propertyName}"`
    ).toHaveText(propertyName);

    const mainText = (await this.page.getByRole("main").innerText()).trim();
    expect(mainText.length, "FAIL: Unit Tracker page is blank").toBeGreaterThan(
      0
    );
    for (const label of data.metricLabels) {
      await expect(
        healingLocator(L.mainTextStrategies(this.page, label)),
        `FAIL: "${label}" not shown`
      ).toBeVisible();
    }

    await expect(
      this.searchInput,
      "FAIL: Search box not visible"
    ).toBeVisible();
    await expect(
      this.searchInput,
      "FAIL: Search box not enabled"
    ).toBeEnabled();
    for (const name of data.toolbarButtons) {
      await expect(
        this.toolbarButton(name),
        `FAIL: "${name}" not visible`
      ).toBeVisible();
      await expect(
        this.toolbarButton(name),
        `FAIL: "${name}" not enabled`
      ).toBeEnabled();
    }

    const total = await this.waitForAllRowsLoaded();
    const rows = await this.grid.evaluate(async g =>
      (await g.getSource()).map(
        r =>
          `${r.__treeRowKind} | ${r.hierarchy_label} | ${r.status} | ${r.floor_plan_type} | ${r.unit_type}`
      )
    );
    expect(rows.length, "FAIL: Grid has no data").toBeGreaterThan(0);
    await expect(
      this.grid.getByRole("row").first(),
      "FAIL: Grid rows not rendered"
    ).toBeVisible();
    Logger.info(
      `Grid data: ${total} rows (units + jobs + scopes). First ${data.gridLogRowCount}:`
    );
    rows.slice(0, data.gridLogRowCount).forEach(r => Logger.info(`  ${r}`));
    Logger.success("Breadcrumbs, page, toolbar and grid data verified");
  }

  // ---------- TC2: search, expand, checkbox ----------

  async searchUnit(label = data.unitLabel) {
    Logger.step(`Searching "${label}"`);
    await this.searchInput.fill(label);
    await this.searchButton.click();
    await expect
      .poll(
        async () =>
          (await this.visibleRows())
            .filter(r => r.kind === "unit")
            .map(r => r.label),
        {
          message: `FAIL: Search for "${label}" did not narrow the grid`,
          timeout: UI_TIMEOUT,
        }
      )
      .toEqual([label]);
  }

  async verifySearchResult(label = data.unitLabel) {
    const visible = await this.visibleRows();
    expect(
      visible.map(r => r.label),
      `FAIL: Grid must show only "${label}"`
    ).toEqual([label]);
    await expect(
      this.gridRow(label),
      `FAIL: Row "${label}" not shown`
    ).toBeVisible();
    Logger.success(`Search shows only "${label}"`);
  }

  async expandUnit(label = data.unitLabel) {
    Logger.step(`Expanding "${label}"`);
    const unit = (await this.visibleRows()).find(
      r => r.label === label && r.kind === "unit"
    );
    expect(unit, `FAIL: Unit "${label}" not in the grid`).toBeTruthy();
    const toggle = healingLocator(L.rowToggleStrategies(this.gridRow(label)));
    await expect(
      toggle,
      `FAIL: Expand button for "${label}" not available`
    ).toBeVisible();
    await toggle.click();
    await expect
      .poll(
        async () =>
          (await this.visibleRows()).filter(r => r.parentId === unit.id).length,
        {
          message: `FAIL: Expanding "${label}" showed no data`,
          timeout: UI_TIMEOUT,
        }
      )
      .toBeGreaterThan(0);
    const children = (await this.visibleRows()).filter(
      r => r.parentId === unit.id
    );
    for (const child of children) {
      await expect(
        this.gridRow(child.label),
        `FAIL: Expanded row "${child.label}" not shown`
      ).toBeVisible();
    }
    Logger.success(
      `"${label}" expanded: ${children.map(c => `${c.label} (${c.status})`).join(", ")}`
    );
    return { unit, children };
  }

  async verifySubRecordCheckbox(subLabel = data.subRecordToUpdate) {
    Logger.step(`Checking the checkbox of expanded row "${subLabel}"`);
    const checkbox = healingLocator(
      L.rowCheckboxStrategies(this.gridRow(subLabel))
    );
    await expect(
      checkbox,
      `FAIL: Checkbox of "${subLabel}" not enabled`
    ).toBeEnabled();
    await checkbox.check();
    await expect(
      checkbox,
      `FAIL: Checkbox of "${subLabel}" did not get checked`
    ).toBeChecked();
    await expect(
      this.updateStatusButton,
      "FAIL: Selecting the row did not enable row actions"
    ).toBeVisible();
    await checkbox.uncheck();
    await expect(
      checkbox,
      `FAIL: Checkbox of "${subLabel}" did not get unchecked`
    ).not.toBeChecked();
    await expect(
      this.updateStatusButton,
      "FAIL: Row actions still shown after unchecking"
    ).toBeHidden();
    Logger.success(`Checkbox of "${subLabel}" checks and unchecks`);
  }

  // ---------- TC3: filter ----------

  async openFilterPanel() {
    Logger.step("Opening Filter");
    if (!(await this.filterPanel.isVisible()))
      await this.toolbarButton("Filter").click();
    await expect(
      this.filterPanel,
      "FAIL: Filter panel did not open"
    ).toBeVisible({ timeout: UI_TIMEOUT });
  }

  async closeFilterPanelIfOpen() {
    if (await this.filterPanel.isVisible()) {
      await healingLocator(
        L.filterCloseButtonStrategies(this.filterPanel)
      ).click();
      await expect(
        this.filterPanel,
        "FAIL: Filter panel did not close"
      ).toBeHidden();
    }
  }

  filterGroup(group, option) {
    return healingLocator(
      L.filterGroupStrategies(this.page, this.filterPanel, group, option)
    );
  }

  async verifyFilterPanelContents() {
    Logger.step("Verifying everything in the Filter panel");
    const f = data.filter;
    await expect(
      this.filterPanel.getByText(f.panelTitle, { exact: true }),
      'FAIL: "Filters" title missing'
    ).toBeVisible();
    await expect(
      this.filterPanel.getByText(f.panelSubtitle, { exact: true }),
      'FAIL: "Filter Options" missing'
    ).toBeVisible();
    await expect(
      healingLocator(L.filterCloseButtonStrategies(this.filterPanel)),
      "FAIL: Filter close button missing"
    ).toBeVisible();
    for (const g of f.groups) {
      await expect(
        this.filterPanel.getByText(g.group, { exact: true }),
        `FAIL: Filter group "${g.group}" missing`
      ).toBeVisible();
      for (const option of g.options) {
        const cb = healingLocator(
          L.labelledCheckboxStrategies(
            this.filterGroup(g.group, option),
            option
          )
        );
        await expect(
          cb,
          `FAIL: "${g.group}" option "${option}" missing`
        ).toBeVisible();
        await expect(
          cb,
          `FAIL: "${g.group}" option "${option}" not enabled`
        ).toBeEnabled();
      }
    }
    await expect(
      this.filterPanel.getByText(f.dateGroup, { exact: true }),
      `FAIL: "${f.dateGroup}" filter missing`
    ).toBeVisible();
    await expect(
      healingLocator(
        L.placeholderInputStrategies(
          this.filterPanel,
          f.dateFromPlaceholder,
          f.dateFromLabel
        )
      ),
      'FAIL: Reno Date "From" missing'
    ).toBeVisible();
    await expect(
      healingLocator(
        L.placeholderInputStrategies(
          this.filterPanel,
          f.dateToPlaceholder,
          f.dateToLabel
        )
      ),
      'FAIL: Reno Date "To" missing'
    ).toBeVisible();
    // MCP-verified: Clear and Apply stay disabled until a filter value is chosen (they enable
    // on selection — exercised by every apply step of the filter test).
    for (const name of [f.clearButton, f.applyButton]) {
      const button = healingLocator(
        L.textButtonStrategies(this.filterPanel, name)
      );
      await expect(button, `FAIL: "${name}" button missing`).toBeVisible();
      await expect(
        button,
        `FAIL: "${name}" must be disabled while no filter value is chosen`
      ).toBeDisabled();
    }
    Logger.success(
      "Filter panel shows every group, option, date range and action"
    );
  }

  async applyFilter() {
    const [put] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/table-view-config") &&
          r.request().method() === "PUT",
        { timeout: UI_TIMEOUT }
      ),
      healingLocator(
        L.textButtonStrategies(this.filterPanel, data.filter.applyButton)
      ).click(),
    ]);
    expect(
      put.status(),
      "FAIL: Applying the filter did not save (PUT table-view-config)"
    ).toBe(200);
    await expect(
      healingLocator(
        L.textButtonStrategies(this.filterPanel, data.filter.resetButton)
      ),
      "FAIL: Filter not active after Apply"
    ).toBeVisible({ timeout: UI_TIMEOUT });
  }

  async applyCheckboxFilter(group, option) {
    Logger.step(`Filter ${group} = ${option}`);
    await healingLocator(
      L.labelledCheckboxStrategies(this.filterGroup(group, option), option)
    ).check();
    await this.applyFilter();
  }

  async applyDateFilter(fromText, toText) {
    const f = data.filter;
    Logger.step(`Filter ${f.dateGroup} ${fromText} – ${toText}`);
    const from = healingLocator(
      L.placeholderInputStrategies(
        this.filterPanel,
        f.dateFromPlaceholder,
        f.dateFromLabel
      )
    );
    const to = healingLocator(
      L.placeholderInputStrategies(
        this.filterPanel,
        f.dateToPlaceholder,
        f.dateToLabel
      )
    );
    await from.fill(fromText);
    await from.press("Enter");
    await to.fill(toText);
    await to.press("Enter");
    await expect(from, 'FAIL: Reno Date "From" not set').toHaveValue(fromText);
    await expect(to, 'FAIL: Reno Date "To" not set').toHaveValue(toText);
    await this.applyFilter();
  }

  /**
   * MCP-verified: the grid filters as a tree — a unit is shown when it, or any job/scope under
   * it, matches. Asserts the shown units are exactly the expected ones (computed from the API)
   * and that no shown row is outside the filter result.
   */
  async verifyFilterResult(description, matches, allRows) {
    const byParent = {};
    allRows.forEach(r =>
      (byParent[r.parentId] = byParent[r.parentId] || []).push(r)
    );
    const descendants = id =>
      (byParent[id] || []).flatMap(r => [r, ...descendants(r.id)]);
    const inResult = r => matches(r) || descendants(r.id).some(matches);
    const expectedUnits = allRows
      .filter(r => r.__treeRowKind === "unit" && inResult(r))
      .map(r => r.hierarchy_label)
      .sort();
    expect(
      expectedUnits.length,
      `FAIL: No data matches ${description} — nothing to verify`
    ).toBeGreaterThan(0);

    await expect
      .poll(
        async () =>
          (await this.visibleRows())
            .filter(r => r.kind === "unit")
            .map(r => r.label)
            .sort(),
        {
          message: `FAIL: ${description} does not show exactly the matching units`,
          timeout: UI_TIMEOUT,
        }
      )
      .toEqual(expectedUnits);
    const outside = (await this.visibleRows()).filter(v => {
      const row = allRows.find(r => r.id === v.id);
      return !row || !inResult(row);
    });
    expect(
      outside.map(r => `${r.kind}:${r.label}`),
      `FAIL: ${description} shows data outside the filter result`
    ).toEqual([]);
    Logger.success(
      `${description}: ${expectedUnits.length} unit(s), nothing outside the result`
    );
  }

  async resetFilters() {
    const reset = healingLocator(
      L.textButtonStrategies(this.filterPanel, data.filter.resetButton)
    );
    const [put] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/table-view-config") &&
          r.request().method() === "PUT",
        { timeout: UI_TIMEOUT }
      ),
      reset.click(),
    ]);
    expect(put.status(), "FAIL: Reset Filters did not save").toBe(200);
    await expect(
      reset,
      "FAIL: Filter still active after Reset Filters"
    ).toBeHidden({ timeout: UI_TIMEOUT });
  }

  // ---------- TC4: views ----------

  async openViewPopover() {
    if (!(await this.viewPopover.isVisible()))
      await this.toolbarButton("View").click();
    await expect(
      this.viewPopover,
      "FAIL: View popover did not open"
    ).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(
      this.viewPopover.getByText(data.view.saveLabel),
      'FAIL: "Save current view as" missing'
    ).toBeVisible();
  }

  savedView(name) {
    return healingLocator(L.savedViewButtonStrategies(this.viewPopover, name));
  }

  async waitForViewSave(action) {
    const [put] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/table-view-config") &&
          r.request().method() === "PUT",
        { timeout: UI_TIMEOUT }
      ),
      action(),
    ]);
    expect(
      put.status(),
      "FAIL: View change was not saved (PUT table-view-config)"
    ).toBe(200);
    return put;
  }

  async createView(name) {
    Logger.step(`Creating view "${name}"`);
    await this.openViewPopover();
    await this.viewPopover
      .getByPlaceholder(data.view.nameInputPlaceholder)
      .fill(name);
    const save = healingLocator(
      L.saveViewButtonStrategies(this.page, this.viewPopover)
    );
    await expect(
      save,
      "FAIL: Save view button not enabled after entering a name"
    ).toBeEnabled();
    const put = await this.waitForViewSave(() => save.click());
    const savedViews = (
      JSON.parse(put.request().postData() || "{}").config.views || []
    ).map(v => v.name);
    expect(savedViews, `FAIL: View "${name}" not saved`).toContain(name);
    await this.verifyActiveView(name);
    Logger.success(`View "${name}" created and active`);
  }

  async verifyActiveView(name) {
    await this.openViewPopover();
    await expect(
      this.savedView(name),
      `FAIL: View "${name}" not listed`
    ).toBeVisible();
    await expect(
      this.savedView(name),
      `FAIL: View "${name}" is not the active view`
    ).toHaveAttribute("data-active", "true");
    await expect(
      healingLocator(
        L.textButtonStrategies(this.viewPopover, data.view.resetToDefault)
      ),
      'FAIL: "Reset to default" not offered'
    ).toBeVisible();
  }

  async resetToDefaultView(name) {
    Logger.step("Reset to default view");
    await this.openViewPopover();
    await this.waitForViewSave(() =>
      healingLocator(
        L.textButtonStrategies(this.viewPopover, data.view.resetToDefault)
      ).click()
    );
    await this.openViewPopover();
    await expect(
      this.savedView(name),
      `FAIL: View "${name}" still active after reset`
    ).not.toHaveAttribute("data-active", "true");
    await expect(
      healingLocator(
        L.textButtonStrategies(this.viewPopover, data.view.resetToDefault)
      ),
      "FAIL: Still not on the default view"
    ).toBeHidden();
    Logger.success("Default view restored");
  }

  async switchToView(name) {
    Logger.step(`Switching to view "${name}"`);
    await this.openViewPopover();
    await this.waitForViewSave(() => this.savedView(name).click());
    await this.verifyActiveView(name);
    Logger.success(`View "${name}" active again`);
  }

  /** Cleanup only: removes a view the test created (verified: DELETE table-view-config → 200). */
  async deleteViewIfPresent(name) {
    const res = await this.page.request.get(
      `${this.baseUrl}/api/table-view-config?tableName=unit_tracker`
    );
    const views = ((await res.json()).config || {}).views || [];
    if (!views.some(v => v.name === name)) return;
    await this.openViewPopover();
    if (
      await healingLocator(
        L.textButtonStrategies(this.viewPopover, data.view.resetToDefault)
      ).isVisible()
    ) {
      await this.waitForViewSave(() =>
        healingLocator(
          L.textButtonStrategies(this.viewPopover, data.view.resetToDefault)
        ).click()
      );
      await this.openViewPopover();
    }
    const [del] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.request().method() === "DELETE" &&
          r.url().includes(`viewName=${encodeURIComponent(name)}`),
        { timeout: UI_TIMEOUT }
      ),
      healingLocator(
        L.deleteViewButtonStrategies(this.page, this.savedView(name))
      ).click(),
    ]);
    Logger.info(`Cleanup: deleted view "${name}" → ${del.status()}`);
    await this.page.keyboard.press("Escape");
  }

  // ---------- TC5: export ----------

  async exportCsv() {
    Logger.step("Export");
    const [response, download] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table?table_name=unit_tracker") &&
          r.url().includes("all_rows=true"),
        { timeout: UI_TIMEOUT }
      ),
      this.page.waitForEvent("download", { timeout: UI_TIMEOUT }),
      this.toolbarButton("Export").click(),
    ]);
    expect(response.status(), "FAIL: Export data API did not return 200").toBe(
      200
    );
    expect(
      download.suggestedFilename(),
      "FAIL: Exported file name is wrong"
    ).toBe(data.export.fileName);
    const csv = fs
      .readFileSync(await download.path(), "utf8")
      .replace(/^﻿/, "");
    Logger.success(`Exported ${download.suggestedFilename()}`);
    return csv;
  }

  static parseCsv(text) {
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(r => r.length > 1);
  }

  /**
   * Compares the CSV with the grid's own data, row by row and cell by cell, matching columns
   * by header. MCP-verified: the CSV writes dates as MM/DD/YYYY while the grid data holds ISO
   * (YYYY-MM-DD) — only that format is normalised; every value must otherwise be identical.
   */
  async verifyCsvMatchesGrid(csv) {
    await this.waitForAllRowsLoaded();
    const grid = await this.grid.evaluate(async g => {
      const cols = (await g.getColumns())
        .filter(c => c.prop !== "__selection")
        .map(c => ({ prop: c.prop, name: c.name }));
      const rows = (await g.getSource()).map(r =>
        Object.fromEntries(cols.map(c => [c.prop, r[c.prop]]))
      );
      return { cols, rows };
    });
    // Verified 2026-11-11 (headed, Test Property 2_The Westerham): the grid gained a UI-only
    // "Actions" column (prop "actions", pinned colPinEnd) holding row buttons; the CSV export
    // correctly omits it and every other column name matches. Exclude it like "__selection".
    grid.cols = grid.cols.filter(c => c.prop !== "actions");
    // Added 2026-11-17 (insert-only): "Move-In Date"/"Move-Out Date" (move_in_date /
    // move_out_date) arrive in the grid source as "YYYY-MM-DD 00:00:00", while the grid cell and
    // the CSV both show "MM/DD/YYYY" (MCP-verified on Test Property 2_The Westerham: cell
    // "11/28/2026", source "2026-11-28 00:00:00", CSV "11/28/2026"). Drop a midnight time so
    // asCsv() below converts these like every other date column; any other time is kept.
    grid.rows.forEach(r =>
      Object.keys(r).forEach(k => {
        const midnight =
          typeof r[k] === "string" &&
          r[k].match(/^(\d{4}-\d{2}-\d{2}) 00:00:00$/);
        if (midnight) r[k] = midnight[1];
      })
    );
    const [header, ...rows] = UnitTrackerPage.parseCsv(csv);
    const propByName = Object.fromEntries(grid.cols.map(c => [c.name, c.prop]));
    expect(
      [...header].sort(),
      "FAIL: CSV columns differ from the grid columns"
    ).toEqual(grid.cols.map(c => c.name).sort());
    expect(rows.length, "FAIL: CSV row count differs from the grid").toBe(
      grid.rows.length
    );
    const asCsv = v => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : s;
    };
    const mismatches = [];
    rows.forEach((r, i) =>
      header.forEach((h, j) => {
        const expected = asCsv(grid.rows[i][propByName[h]]);
        if (r[j] !== expected)
          mismatches.push(
            `row ${i + 1} "${h}": csv="${r[j]}" grid="${expected}"`
          );
      })
    );
    expect(
      mismatches.slice(0, 20),
      "FAIL: CSV data differs from the grid"
    ).toEqual([]);
    Logger.success(
      `CSV matches the grid: ${rows.length} rows × ${header.length} columns`
    );
  }

  // ---------- TC6: status ----------

  async clickUnitRecord(label = data.unitLabel) {
    await this.gridRow(label).getByText(label, { exact: true }).click();
  }

  async verifyUnitStatus(label, expectedStatus) {
    const unit = (await this.visibleRows()).find(
      r => r.label === label && r.kind === "unit"
    );
    expect(unit, `FAIL: Unit "${label}" not in the grid`).toBeTruthy();
    Logger.info(`Current status of ${label}: "${unit.status}"`);
    expect(
      unit.status,
      `FAIL: Status of ${label} is not "${expectedStatus}"`
    ).toBe(expectedStatus);
    await expect(
      this.grid
        .getByRole("gridcell", { name: expectedStatus, exact: true })
        .first(),
      `FAIL: "${expectedStatus}" not shown in the grid`
    ).toBeVisible();
    return unit;
  }

  async verifySubRecordsStatus(children, expectedStatus) {
    for (const child of children) {
      Logger.info(`Sub record "${child.label}": "${child.status}"`);
      expect(
        child.status,
        `FAIL: Sub record "${child.label}" is not "${expectedStatus}"`
      ).toBe(expectedStatus);
    }
    Logger.success(
      `All ${children.length} sub records are "${expectedStatus}"`
    );
  }

  async apiRowStatus(rowId) {
    return (await this.fetchAllRowsFromApi()).find(r => r.id === rowId)?.status;
  }

  async updateSubRecordStatus(subRow, status) {
    Logger.step(`Updating "${subRow.label}" to "${status}"`);
    const checkbox = healingLocator(
      L.rowCheckboxStrategies(this.gridRow(subRow.label))
    );
    await expect(
      checkbox,
      `FAIL: Checkbox of "${subRow.label}" not enabled`
    ).toBeEnabled();
    if (!(await checkbox.isChecked())) await checkbox.check();
    await expect(
      this.updateStatusButton,
      'FAIL: "Update Status" not available'
    ).toBeEnabled();
    await this.updateStatusButton.click();
    await expect(
      this.statusMenuItems,
      `FAIL: ${data.statusOptions.length} status options must be available`
    ).toHaveText(data.statusOptions);
    for (const option of data.statusOptions) {
      await expect(
        healingLocator(L.menuItemStrategies(this.page, option)),
        `FAIL: Status option "${option}" not enabled`
      ).toBeEnabled();
    }
    await healingLocator(L.menuItemStrategies(this.page, status)).click();
    await expect(
      this.updateStatusDialog,
      "FAIL: Update Status confirmation did not open"
    ).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(
      this.updateStatusDialog,
      "FAIL: Confirmation does not name the new status"
    ).toContainText(`${data.updateStatusConfirmText} "${status}"`);
    const [put] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/cells/batch") &&
          r.request().method() === "PUT",
        { timeout: UI_TIMEOUT }
      ),
      healingLocator(
        L.textButtonStrategies(
          this.updateStatusDialog,
          data.updateStatusDialogTitle
        )
      ).click(),
    ]);
    expect(
      put.status(),
      `FAIL: Status update to "${status}" did not return 200`
    ).toBe(200);
    const body = JSON.parse(put.request().postData() || "{}");
    expect(body.value, "FAIL: Wrong status sent").toBe(status);
    expect(body.rowIds, "FAIL: Wrong row updated").toEqual([subRow.id]);
    await expect(
      healingLocator(
        L.toastStrategies(this.page, `${data.updateStatusToast} "${status}"`)
      ).first(),
      "FAIL: Success toast missing"
    ).toBeVisible({ timeout: UI_TIMEOUT });
    await expect
      .poll(
        async () =>
          (await this.visibleRows()).find(r => r.id === subRow.id)?.status,
        {
          message: `FAIL: Grid does not show "${subRow.label}" as "${status}"`,
          timeout: UI_TIMEOUT,
        }
      )
      .toBe(status);
    expect(
      await this.apiRowStatus(subRow.id),
      `FAIL: "${subRow.label}" is not "${status}" in the API`
    ).toBe(status);
    Logger.success(`"${subRow.label}" changed to "${status}"`);
  }

  /** Cleanup only: puts a sub record back to its original status if a test stopped mid-way. */
  async restoreRowStatus(rowId, status) {
    if (!rowId || (await this.apiRowStatus(rowId)) === status) return;
    const res = await this.page.request.put(
      `${this.baseUrl}/api/bird-table/cells/batch?&property_id=${this.propertyId}`,
      {
        data: {
          tableName: "unit_tracker",
          columnName: "status",
          value: status,
          rowIds: [rowId],
        },
      }
    );
    Logger.info(`Cleanup: ${rowId} status → "${status}" (${res.status()})`);
  }

  // ---------- Move-In / Move-Out dates (TC564–TC567) ----------
  // MCP-verified 2026-11-16 (headed MCP browser, owner session, Test Property 2_The Westerham, unit 101):
  // - Save: PUT /api/bird-table/cells?&property_id=<id> { columnName: "move_in_date" | "move_out_date",
  //   value: "<YYYY-MM-DD>T00:00:00.000Z" (or "" when cleared), rowId: "<unit row id>",
  //   tableName: "unit_tracker" } → 200 { success: true, message: "Cell updated successfully" }; no toast.
  // - Move-In earlier than Move-Out → 400 { success: false, message: "Move-in date must be on or
  //   after the move-out date" } + the same toast; the same day is accepted. Move-Out can be cleared
  //   while Move-In is set.
  // - Grid source and the all-rows API hold "YYYY-MM-DD 00:00:00"; the cell shows MM/DD/YYYY, "—" when empty.
  // - Only unit rows are editable; job / scope rows show the columns read-only (cell class "disabled").
  // - The first edit creates a unit lease cycle (state "locked") that the UI cannot remove; clearing
  //   both cells empties the dates again.
  // - Contract → Units tab (/jobs/<id>?tab=contracts&contractSubTab=units, data from
  //   GET /api/bird-table?table_name=ui-contract-units&layout=table&jobId=<id>) has NO Move-In /
  //   Move-Out field (neither in the grid, its Columns settings, nor its API) — the tests assert that
  //   the unit's contract data stays consistent with the Unit Tracker and is untouched by date edits.

  static isoDay(value) {
    return value ? String(value).slice(0, 10) : null;
  }

  static displayDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  }

  moveDateField(columnName) {
    const md = data.moveDates;
    return columnName === md.moveInColumn ? md.moveInField : md.moveOutField;
  }

  /** Search is a "contains" match across fields (MCP: "101" also lists 704, 1010…) — require the unit, not an exact list. */
  async searchUnitContaining(label = data.moveDates.unitLabel) {
    Logger.step(`Searching "${label}"`);
    await this.searchInput.fill(label);
    await this.searchButton.click();
    await expect
      .poll(
        async () =>
          (await this.visibleRows())
            .filter(r => r.kind === "unit")
            .map(r => r.label),
        {
          message: `FAIL: Search for "${label}" does not show unit ${label}`,
          timeout: UI_TIMEOUT,
        }
      )
      .toContain(label);
    await expect(
      this.gridRow(label),
      `FAIL: Row "${label}" not shown after search`
    ).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /** The unit row and its job rows from the all-rows API. */
  async moveDateRows(label = data.moveDates.unitLabel) {
    const rows = await this.fetchAllRowsFromApi();
    const unit = rows.find(
      r => r.__treeRowKind === "unit" && String(r.hierarchy_label) === label
    );
    expect(unit, `FAIL: Unit ${label} not returned by the API`).toBeTruthy();
    const jobs = rows.filter(
      r => r.parentId === unit.id && r.__treeRowKind === "job"
    );
    return { unit, jobs };
  }

  async moveDateCell(label, columnName) {
    const header = healingLocator(
      L.columnHeaderStrategies(this.grid, columnName)
    ).first();
    await expect(header, `FAIL: "${columnName}" column not shown`).toBeVisible({
      timeout: UI_TIMEOUT,
    });
    const colIndex = await header.getAttribute("aria-colindex");
    const rowIndex = await this.gridRow(label).getAttribute("data-rgrow");
    expect(
      colIndex !== null && rowIndex !== null,
      `FAIL: Could not locate the "${columnName}" cell of "${label}"`
    ).toBeTruthy();
    return healingLocator(
      L.gridCellStrategies(this.grid, rowIndex, colIndex)
    ).first();
  }

  datePicker() {
    return healingLocator(L.datePickerDropdownStrategies(this.page)).first();
  }

  /** MCP-verified: Escape does not close the date editor; clicking outside the grid does. */
  async closeCellEditor() {
    await this.breadcrumbPage.click();
    await expect(
      this.datePicker(),
      "FAIL: Date picker did not close"
    ).toBeHidden({
      timeout: UI_TIMEOUT,
    });
  }

  /** Waits for the single-cell save of `field` while `action` runs. */
  async captureCellSave(field, action) {
    const [put] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/cells?") &&
          r.request().method() === "PUT" &&
          (r.request().postData() || "").includes(`"columnName":"${field}"`),
        { timeout: UI_TIMEOUT }
      ),
      action(),
    ]);
    return {
      status: put.status(),
      body: JSON.parse(put.request().postData() || "{}"),
      json: await put.json().catch(() => ({})),
    };
  }

  /** Double-clicks the cell and picks `day` of the month the date picker opens on. */
  async pickMoveDate(label, columnName, day) {
    Logger.step(`"${columnName}" of ${label}: picking day ${day}`);
    const field = this.moveDateField(columnName);
    const cell = await this.moveDateCell(label, columnName);
    await cell.dblclick();
    const calendar = this.datePicker();
    await expect(
      calendar,
      `FAIL: Date picker of "${columnName}" did not open`
    ).toBeVisible({ timeout: UI_TIMEOUT });
    const level = (
      await healingLocator(L.calendarLevelStrategies(calendar))
        .first()
        .innerText()
    ).trim();
    const [monthName, year] = level.split(" ");
    const month = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
    expect(month, `FAIL: Unreadable calendar month "${level}"`).toBeGreaterThan(
      0
    );
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayButton = healingLocator(
      L.calendarDayStrategies(calendar, `${day} ${monthName} ${year}`)
    ).first();
    await expect(
      dayButton,
      `FAIL: Day ${day} not in the date picker`
    ).toBeEnabled();
    const result = await this.captureCellSave(field, () => dayButton.click());
    Logger.info(
      `"${columnName}" → ${iso}: ${result.status} ${JSON.stringify(result.json)}`
    );
    return { ...result, iso, display: UnitTrackerPage.displayDate(iso), field };
  }

  verifyMoveDateRequest(result, unitId, expectedValueIso) {
    expect(result.body.tableName, "FAIL: Wrong table saved").toBe(
      "unit_tracker"
    );
    expect(result.body.columnName, "FAIL: Wrong column saved").toBe(
      result.field
    );
    expect(String(result.body.rowId), "FAIL: Wrong row saved").toBe(
      String(unitId)
    );
    if (expectedValueIso === "")
      expect(result.body.value, "FAIL: Clear must send an empty value").toBe(
        ""
      );
    else
      expect(
        UnitTrackerPage.isoDay(result.body.value),
        "FAIL: Wrong date sent"
      ).toBe(expectedValueIso);
  }

  async setMoveDate(label, unitId, columnName, day) {
    const result = await this.pickMoveDate(label, columnName, day);
    this.verifyMoveDateRequest(result, unitId, result.iso);
    expect(
      result.status,
      `FAIL: Saving "${columnName}" did not return 200`
    ).toBe(200);
    expect(
      result.json,
      `FAIL: "${columnName}" save not confirmed`
    ).toMatchObject({
      success: true,
      message: data.moveDates.cellUpdatedMessage,
    });
    Logger.success(`"${columnName}" of ${label} saved as ${result.display}`);
    return result;
  }

  async verifyMoveDateRejected(result, unitId) {
    const md = data.moveDates;
    this.verifyMoveDateRequest(result, unitId, result.iso);
    expect(
      result.status,
      "FAIL: Invalid Move-In must be rejected with 400"
    ).toBe(400);
    expect(result.json, "FAIL: Wrong rejection message").toMatchObject({
      success: false,
      message: md.invalidOrderMessage,
    });
    await expect(
      healingLocator(
        L.toastStrategies(this.page, md.invalidOrderMessage)
      ).first(),
      "FAIL: Validation toast not shown"
    ).toBeVisible({ timeout: UI_TIMEOUT });
    Logger.success(`Rejected with "${md.invalidOrderMessage}"`);
  }

  async clearMoveDate(label, unitId, columnName) {
    Logger.step(`Clearing "${columnName}" of ${label}`);
    const cell = await this.moveDateCell(label, columnName);
    await cell.hover();
    const clear = healingLocator(
      L.cellClearButtonStrategies(cell, data.moveDates.clearButton)
    ).first();
    await expect(
      clear,
      `FAIL: Clear (✕) of "${columnName}" not shown`
    ).toBeVisible();
    // Added 2026-11-23 (insert-only): CI run (TC566, second clear) — the ✕ was visible after hover,
    // then "element is not visible" for the whole 55s click. MCP-verified CSS on /unit-tracker: the
    // ✕ is display:none except `div[role="gridcell"]:hover .revo-grid-cell-clear-btn`, so it only
    // shows while the pointer is over the cell; the grid re-renders after the previous save, and a
    // re-rendered cell under a stationary (headless) pointer does not get :hover back. Move the real
    // pointer onto the cell right before the click until the ✕ shows again.
    await expect(async () => {
      const box = await cell.boundingBox();
      if (box) {
        await this.page.mouse.move(
          box.x + box.width / 2,
          box.y + box.height / 2,
          { steps: 5 }
        );
      }
      await expect(clear).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000, intervals: [250, 500, 1000] });
    const result = {
      ...(await this.captureCellSave(this.moveDateField(columnName), () =>
        clear.click()
      )),
      field: this.moveDateField(columnName),
    };
    this.verifyMoveDateRequest(result, unitId, "");
    expect(
      result.status,
      `FAIL: Clearing "${columnName}" did not return 200`
    ).toBe(200);
    expect(
      result.json,
      `FAIL: Clearing "${columnName}" not confirmed`
    ).toMatchObject({
      success: true,
      message: data.moveDates.cellUpdatedMessage,
    });
    Logger.success(`"${columnName}" of ${label} cleared`);
  }

  /**
   * Asserts both dates of the unit in the grid cells (MM/DD/YYYY or "—"), the grid's data and the
   * API. `expected` = { moveIn, moveOut } as YYYY-MM-DD or null.
   */
  async verifyMoveDates(label, unitId, expected) {
    const md = data.moveDates;
    for (const [columnName, iso] of [
      [md.moveInColumn, expected.moveIn],
      [md.moveOutColumn, expected.moveOut],
    ]) {
      const cell = await this.moveDateCell(label, columnName);
      if (iso)
        await expect(
          cell,
          `FAIL: "${columnName}" of ${label} does not show ${UnitTrackerPage.displayDate(iso)}`
        ).toContainText(UnitTrackerPage.displayDate(iso), {
          timeout: UI_TIMEOUT,
        });
      else
        await expect(
          cell,
          `FAIL: "${columnName}" of ${label} must be empty ("${md.emptyCell}")`
        ).toHaveText(md.emptyCell, { timeout: UI_TIMEOUT });
    }
    const want = [expected.moveIn, expected.moveOut];
    await expect
      .poll(
        async () =>
          (
            await this.grid.evaluate(
              async (g, [id, inField, outField]) => {
                const r = (await g.getSource()).find(x => x.id === id);
                return r ? [r[inField], r[outField]] : [];
              },
              [unitId, md.moveInField, md.moveOutField]
            )
          ).map(UnitTrackerPage.isoDay),
        {
          message: `FAIL: Grid data of ${label} has the wrong dates`,
          timeout: UI_TIMEOUT,
        }
      )
      .toEqual(want);
    const apiRow = (await this.fetchAllRowsFromApi()).find(
      r => r.id === unitId
    );
    expect(
      [apiRow?.[md.moveInField], apiRow?.[md.moveOutField]].map(
        UnitTrackerPage.isoDay
      ),
      `FAIL: API dates of ${label} are wrong`
    ).toEqual(want);
    Logger.success(
      `${label}: Move-In ${expected.moveIn ?? md.emptyCell}, Move-Out ${expected.moveOut ?? md.emptyCell} (cell, grid data, API)`
    );
  }

  /** Job rows under the unit show the dates read-only: "—", disabled cell, no date picker. */
  async verifyJobRowsMoveDatesReadOnly(label = data.moveDates.unitLabel) {
    const md = data.moveDates;
    const { children } = await this.expandUnit(label);
    for (const child of children) {
      for (const columnName of [md.moveInColumn, md.moveOutColumn]) {
        const cell = await this.moveDateCell(child.label, columnName);
        await expect(
          cell,
          `FAIL: "${columnName}" of job row "${child.label}" must be empty`
        ).toHaveText(md.emptyCell);
        await expect(
          cell,
          `FAIL: "${columnName}" of job row "${child.label}" must be read-only`
        ).toHaveClass(/disabled/);
        await cell.dblclick();
        await expect(
          this.datePicker(),
          `FAIL: Job row "${child.label}" opened a date picker`
        ).toBeHidden();
      }
    }
    Logger.success(
      `Job rows of ${label} show Move-In/Move-Out read-only: ${children.map(c => c.label).join(", ")}`
    );
  }

  /** Opens the Unit Tracker on the property and searches the unit. */
  async openUnitInTracker(label = data.moveDates.unitLabel) {
    await this.navigateToUnitTracker();
    await this.selectProperty();
    await this.searchUnitContaining(label);
  }

  /** Cleanup / precondition: empties both dates through the same API the grid uses. */
  async restoreMoveDates(unitId) {
    const md = data.moveDates;
    if (!unitId || !this.propertyId) return;
    for (const field of [md.moveInField, md.moveOutField]) {
      const res = await this.page.request.put(
        `${this.baseUrl}/api/bird-table/cells?&property_id=${this.propertyId}`,
        {
          data: {
            columnName: field,
            value: "",
            rowId: String(unitId),
            tableName: "unit_tracker",
          },
        }
      );
      Logger.info(`Cleanup: ${unitId} ${field} → "" (${res.status()})`);
    }
  }

  // ---------- Contract → Units tab ----------

  async contractUnitRowsFromApi(jobId, label = data.moveDates.unitLabel) {
    const res = await this.page.request.get(
      `${this.baseUrl}/api/bird-table?table_name=${data.moveDates.contractUnitsTable}&layout=table&jobId=${jobId}`
    );
    expect(
      res.status(),
      `FAIL: Contract Units API of job ${jobId} did not return 200`
    ).toBe(200);
    return (await res.json()).rows.filter(r => String(r.unit_name) === label);
  }

  async openContractUnitsTab(jobId) {
    const md = data.moveDates;
    Logger.step(`Opening job ${jobId} → Contracts → ${md.contractUnitsTab}`);
    const [res] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes(`table_name=${md.contractUnitsTable}`) &&
          r.url().includes(`jobId=${jobId}`) &&
          r.request().method() === "GET",
        { timeout: UI_TIMEOUT }
      ),
      this.page.goto(
        `${this.baseUrl}/jobs/${jobId}?tab=contracts&propertyId=${this.propertyId}&contractSubTab=units`,
        { waitUntil: "domcontentloaded" }
      ),
    ]);
    expect(res.status(), "FAIL: Contract Units data did not return 200").toBe(
      200
    );
    await expect(
      healingLocator(L.tabStrategies(this.page, md.contractUnitsTab)).first(),
      `FAIL: "${md.contractUnitsTab}" tab is not selected`
    ).toHaveAttribute("aria-selected", "true", { timeout: UI_TIMEOUT });
    await expect(
      this.grid.getByRole("row").first(),
      "FAIL: Contract Units grid did not render"
    ).toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Contract → Units tab of `job` shows the unit with the same FP Type, Unit Type (= tracker
   * "Bed x Bath"), Status and Start/End dates as the Unit Tracker's job row.
   */
  async verifyContractUnitMatchesTracker(
    trackerUnit,
    trackerJob,
    label = data.moveDates.unitLabel
  ) {
    await this.openContractUnitsTab(trackerJob.job_id);
    let contract = null;
    await expect
      .poll(
        async () =>
          (contract = await this.grid.evaluate(async (g, l) => {
            const r = (await g.getSource()).find(
              x => String(x.unit_name) === l
            );
            return r
              ? {
                  status: r.status,
                  floorPlanType: r.floor_plan_type,
                  unitType: r.unit_type,
                  start: r.reno_start_date,
                  end: r.reno_end_date,
                }
              : null;
          }, label)),
        {
          message: `FAIL: Unit ${label} not on the Contract Units tab of job ${trackerJob.job_id}`,
          timeout: UI_TIMEOUT,
        }
      )
      .not.toBeNull();
    const row = this.gridRow(label);
    await expect(
      row,
      `FAIL: Unit ${label} row not shown on the Contract Units tab`
    ).toBeVisible();
    expect(
      contract.floorPlanType,
      "FAIL: FP Type differs from the Unit Tracker"
    ).toBe(trackerUnit.floor_plan_type);
    expect(
      contract.unitType,
      "FAIL: Unit Type differs from the Unit Tracker's Bed x Bath"
    ).toBe(trackerUnit.bed_x_bath);
    expect(
      contract.status,
      "FAIL: Status differs from the Unit Tracker job row"
    ).toBe(trackerJob.status);
    expect(
      UnitTrackerPage.isoDay(contract.start),
      "FAIL: Start Date differs from the Unit Tracker"
    ).toBe(UnitTrackerPage.isoDay(trackerJob.contract_reno_start));
    expect(
      UnitTrackerPage.isoDay(contract.end),
      "FAIL: End Date differs from the Unit Tracker"
    ).toBe(UnitTrackerPage.isoDay(trackerJob.contract_reno_end));
    for (const text of [
      contract.floorPlanType,
      contract.unitType,
      contract.status,
    ].filter(Boolean))
      await expect(
        row,
        `FAIL: Unit ${label} row does not show "${text}"`
      ).toContainText(text);
    Logger.success(
      `Contract Units (job ${trackerJob.job_id}) unit ${label}: ${contract.status} | ${contract.floorPlanType} | ${contract.unitType} — matches the Unit Tracker`
    );
  }

  /** Snapshot of the unit on every job's Contract Units data (to prove date edits never touch it). */
  async contractUnitSnapshot(jobs, label = data.moveDates.unitLabel) {
    const snapshot = {};
    for (const job of jobs)
      snapshot[job.job_id] = await this.contractUnitRowsFromApi(
        job.job_id,
        label
      );
    return snapshot;
  }
}

module.exports = { UnitTrackerPage };
