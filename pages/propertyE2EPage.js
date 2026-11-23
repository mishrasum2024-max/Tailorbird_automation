/**
 * Properties E2E page object (tests/TC04_properties.spec.js, Properties E2E block).
 *
 * Every test creates its OWN property (PropertiesHelper.createPropertyRobust,
 * unchanged) and deletes it at the end — no seeded property, unit or shared
 * data file is read for modification or written. createPropertyRobust writes no
 * data/*.json hand-off file.
 *
 * API facts used as the source of truth (MCP-verified 2026-11-18 on beta):
 *  - GET  /api/bird-table?table_name=property → rows with id, name, legal_name,
 *    legal_address, type ("mid_rise" …), unit_count
 *  - PUT  /api/bird-table/rows   (Edit Property → Save Changes)
 *  - DELETE /api/bird-table/rows (Delete Property → Delete)
 *  - POST /api/bird-table/rows   (Units → Add Row)
 *  - PUT  /api/bird-table/cells?&property_id=<id> body
 *    {columnName, value, rowId, tableName:"unit"}; Admin-only unit columns are
 *    rejected with 400 "This field can only be edited in the Admin Portal."
 */
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const {
  propertyE2EElementStrategies,
} = require("../locators/propertyE2ELocator");
const PropertiesHelper = require("./properties");

const BASE_URL = process.env.BASE_URL;
const TEST_ADDRESS = "Domestic Terminal, College Park, GA 30337, USA";

class PropertyE2EPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.s = propertyE2EElementStrategies(page);
    this.prop = new PropertiesHelper(page);
    this.editDialog = healingLocator(this.s.editDialog).first();
    this.deleteDialog = healingLocator(this.s.deleteDialog).first();
    this.searchInput = healingLocator(this.s.searchInput).first();
    this.unassignedCounter = healingLocator(this.s.unassignedCounter).first();
  }

  // ─── API (source of truth) ─────────────────────────────────────────────────

  async _getJson(url) {
    const res = await this.page.request.get(`${BASE_URL}${url}`);
    expect(res.status(), `FAIL: GET ${url} must succeed`).toBeLessThan(300);
    return res.json();
  }

  async getPropertyRecord(name) {
    const j = await this._getJson("/api/bird-table?table_name=property");
    const rows = Array.isArray(j) ? j : j.data || j.rows || [];
    return rows.find(r => r.name === name) || null;
  }

  // ─── Own property lifecycle ────────────────────────────────────────────────

  /** Creates a property owned by the calling test; returns { name, id }. */
  async createOwnProperty(label) {
    const name = `PropE2E_${label}_${Date.now()}`;
    Logger.info(`Creating test-owned property "${name}"`);
    await this.prop.goToProperties();
    await this.prop.createPropertyRobust(
      name,
      TEST_ADDRESS,
      "College Park",
      "GA",
      "30337",
      "Garden Style"
    );
    let record = null;
    await expect
      .poll(
        async () => {
          record = await this.getPropertyRecord(name);
          return record ? record.id : null;
        },
        {
          message: `FAIL: new property "${name}" must be returned by the property API`,
          timeout: 60000,
          intervals: [3000],
        }
      )
      .not.toBeNull();
    expect(record.city, "FAIL: City must be auto-filled from the address").toBe(
      "College Park"
    );
    Logger.success(
      `Property "${name}" created (id ${record.id}, ${record.city} ${record.state} ${record.zipcode})`
    );
    return { name, id: String(record.id) };
  }

  /** Opens Table View and searches the listing; returns the row's data-rgrow. */
  async findListingRow(name) {
    const page = this.page;
    // Navigate directly first: a full-screen editor/drawer left open by a
    // failed test covers the nav menu that goToProperties() clicks (TC581 run 2).
    await page.goto(`${BASE_URL}/properties`, { waitUntil: "load" });
    await this.prop.goToProperties();
    await this.prop.changeView("Table View");
    await expect(this.searchInput).toBeVisible({ timeout: 30000 });
    await this.searchInput.fill(name);
    await this.searchInput.press("Enter"); // listing filters on Enter (MCP-verified)
    const dataRows = page.locator('revogr-data[type="rgRow"] [role="row"]');
    let rgrow = null;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && rgrow === null) {
      const rows = await dataRows.evaluateAll(els =>
        els.map(e => ({
          rgrow: e.getAttribute("data-rgrow"),
          text: e.innerText || "",
        }))
      );
      const hit = rows.find(r => r.text.includes(name));
      if (hit) rgrow = hit.rgrow;
      else await page.waitForTimeout(1500);
    }
    return rgrow;
  }

  rowDeleteButton(rgrow) {
    return this.page
      .locator(`[role="row"][data-rgrow="${rgrow}"]`)
      .getByRole("button")
      .filter({ has: this.page.locator("svg.lucide-trash-2") })
      .first();
  }

  /** Clicks the row trash icon and returns the Delete Property dialog text. */
  async openDeleteDialog(rgrow) {
    await this.rowDeleteButton(rgrow).click();
    await expect(
      this.deleteDialog,
      "FAIL: Delete Property confirmation must open"
    ).toBeVisible({ timeout: 15000 });
    return (await this.deleteDialog.innerText()).replace(/\s+/g, " ").trim();
  }

  deleteDialogButton(name) {
    return healingLocator(this.s.deleteDialogButton(name)).first();
  }

  /** Confirms Delete in the open dialog; returns the DELETE response status. */
  async confirmDelete() {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/rows") &&
          r.request().method() === "DELETE",
        { timeout: 60000 }
      ),
      this.deleteDialogButton("Delete").click(),
    ]);
    return response.status();
  }

  /** Best-effort teardown for a test-owned property (never throws). */
  async deletePropertyQuietly(name) {
    try {
      if (!(await this.getPropertyRecord(name))) return;
      const rgrow = await this.findListingRow(name);
      if (rgrow === null) throw new Error("row not found in listing");
      await this.openDeleteDialog(rgrow);
      const status = await this.confirmDelete();
      if (status < 300) {
        Logger.success(`Cleanup: property "${name}" deleted (HTTP ${status})`);
      } else {
        // MCP-verified 2026-11-18: a property with a finalized contract is
        // refused with 400 "Unable to save the changes…" (app behaviour).
        Logger.info(
          `Cleanup: delete of "${name}" refused (HTTP ${status}) — it has a finalized contract; left for the daily cleanup`
        );
      }
    } catch (e) {
      Logger.info(
        `Cleanup: could not delete "${name}" (${e.message}) — it is test-owned and removed by the daily cleanup`
      );
    }
  }

  // ─── Property details: Overview + Edit Property ────────────────────────────

  async openDetails(id, query = "") {
    await this.page.goto(
      `${BASE_URL}/properties/details?propertyId=${id}${query}`,
      { waitUntil: "load" }
    );
  }

  /** Reads "Label\nValue" pairs from the Overview panel. */
  async readOverview(labels) {
    await expect(
      this.page.getByText("Legal Name", { exact: true }).first()
    ).toBeVisible({ timeout: 30000 });
    const lines = (await this.page.locator("main").innerText())
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    const out = {};
    for (const label of labels) {
      const i = lines.indexOf(label);
      out[label] = i >= 0 ? lines[i + 1] : null;
    }
    Logger.info(`Overview → ${JSON.stringify(out)}`);
    return out;
  }

  async openEditDrawer() {
    await healingLocator(this.s.overviewEditButton).first().click();
    await expect(
      this.editDialog,
      "FAIL: Edit Property drawer must open"
    ).toBeVisible({ timeout: 15000 });
    Logger.success("Edit Property drawer opened");
  }

  editInput(placeholder) {
    return healingLocator(this.s.editInput(placeholder)).first();
  }

  editLabelledInput(label) {
    return healingLocator(this.s.editLabelledInput(label)).first();
  }

  /** Picks a Type in the Mantine Select (options are not visible to a normal click). */
  async selectType(typeLabel) {
    const input = this.editInput("Select type");
    await input.fill(typeLabel);
    const option = healingLocator(this.s.comboboxOption(typeLabel)).first();
    await option.waitFor({ state: "attached", timeout: 15000 });
    await option.evaluate(el => el.click());
    await expect(input).toHaveValue(typeLabel, { timeout: 10000 });
  }

  /** Save Changes → returns { status, toast }. */
  async saveEdit() {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/rows") &&
          r.request().method() === "PUT",
        { timeout: 60000 }
      ),
      healingLocator(this.s.saveChangesButton).first().click(),
    ]);
    const toast = this.page
      .getByRole("alert")
      .filter({ hasText: "property updated successfully" })
      .or(
        this.page
          .locator(".mantine-Notification-root")
          .filter({ hasText: "property updated successfully" })
      )
      .first();
    await expect(
      toast,
      'FAIL: "property updated successfully" toast must appear'
    ).toBeVisible({ timeout: 20000 });
    await expect(
      this.editDialog,
      "FAIL: Edit Property drawer must close after saving"
    ).toBeHidden({ timeout: 20000 });
    return { status: response.status() };
  }

  // ─── Locations → Units ─────────────────────────────────────────────────────

  async openUnits(id) {
    await this.openDetails(
      id,
      "&selected-tab=locations&selected-location=unit"
    );
    await expect(
      this.unassignedCounter,
      "FAIL: Units view must show the unassigned-unit counter"
    ).toBeVisible({ timeout: 30000 });
  }

  async unassignedCount() {
    const text = (await this.unassignedCounter.innerText()).trim();
    const n = Number(text.match(/^(\d+)/)?.[1]);
    return { text, n };
  }

  /** Units → Add Row; returns the POST status. */
  async addUnitRow() {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/rows") &&
          r.request().method() === "POST",
        { timeout: 60000 }
      ),
      healingLocator(this.s.addRowButton).first().click(),
    ]);
    return response.status();
  }

  /** RevoGrid drops off-screen columns from the DOM; widen it before reading. */
  async _widenUnitsGrid() {
    const main = this.page.locator("main");
    // Run 1 (2026-11-18): after a reload the counter rendered before the grid
    // re-mounted, so a one-shot widen hit the old/missing revo-grid and only 5
    // columns stayed in the DOM. Wait for the grid's first header, then re-apply
    // the width until the right-most customer column is mounted.
    await expect(
      main.getByRole("columnheader", { name: "Unit Name", exact: true }),
      "FAIL: Units grid headers must render"
    ).toBeAttached({ timeout: 30000 });
    const target = main.getByRole("columnheader", { name: "Client SQFT" });
    await expect
      .poll(
        async () => {
          await this.page.evaluate(() => {
            document.querySelectorAll("main revo-grid").forEach(g => {
              g.style.setProperty("width", "3200px", "important");
              g.style.setProperty("min-width", "3200px", "important");
            });
          });
          return target.count();
        },
        {
          message:
            'FAIL: widened Units grid must mount the "Client SQFT" column',
          timeout: 30000,
          intervals: [500, 1000, 2000],
        }
      )
      .toBeGreaterThan(0);
  }

  /**
   * The Locations page also mounts the property documents grid ("Cover",
   * "File Name", "Actions" — seen read-only on Test Property 2, 2026-11-18), so
   * every unit lookup is scoped to the revo-grid that owns the "Unit Name" header.
   */
  _unitsGrid() {
    return this.page
      .locator("main revo-grid")
      .filter({
        has: this.page.getByRole("columnheader", {
          name: "Unit Name",
          exact: true,
        }),
      })
      .first();
  }

  async _unitColumnIndex(header) {
    const h = this._unitsGrid()
      .getByRole("columnheader", { name: header, exact: true })
      .first();
    await expect(h, `FAIL: Units grid must have "${header}"`).toBeAttached({
      timeout: 15000,
    });
    return h.getAttribute("data-rgcol");
  }

  _unitCell(col) {
    return this._unitsGrid()
      .locator(
        `revogr-data[type="rgRow"] [role="gridcell"][data-rgcol="${col}"]`
      )
      .first();
  }

  _gridEditor() {
    return this._unitsGrid()
      .locator("revogr-edit input, revogr-edit textarea, input, textarea")
      .first();
  }

  /** Double-clicks the first unit's cell under `header`; true if an editor opened. */
  async unitCellOpensEditor(header) {
    await this._widenUnitsGrid();
    const col = await this._unitColumnIndex(header);
    await this._unitCell(col).dblclick({ force: true });
    const opened = await this._gridEditor()
      .waitFor({ state: "attached", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    await this.page.keyboard.press("Escape");
    await expect(this._gridEditor()).toHaveCount(0, { timeout: 5000 });
    Logger.info(`Units: "${header}" (col ${col}) editor opened = ${opened}`);
    return opened;
  }

  /** Edits the first unit's cell; returns { status, body } of PUT /cells. */
  async editUnitCell(header, value) {
    await this._widenUnitsGrid();
    const col = await this._unitColumnIndex(header);
    await this._unitCell(col).dblclick({ force: true });
    const editor = this._gridEditor();
    await editor.waitFor({ state: "visible", timeout: 10000 });
    // Type the value and confirm the editor really holds it before committing.
    // Call this on a freshly loaded grid: an editor left open by an earlier
    // double-click + Escape is committed on the next double-click and the new
    // session's Enter then sends nothing (MCP-reproduced 2026-11-18).
    await expect
      .poll(
        async () => {
          await editor.click();
          await editor.press("Control+A");
          await editor.press("Backspace");
          await editor.pressSequentially(String(value), { delay: 40 });
          return editor.inputValue();
        },
        {
          message: `FAIL: the "${header}" editor must hold "${value}" before saving`,
          timeout: 20000,
          intervals: [500, 1000],
        }
      )
      .toBe(String(value));
    const [response] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/cells") &&
          r.request().method() === "PUT",
        { timeout: 60000 }
      ),
      editor.press("Enter"),
    ]);
    const body = JSON.parse(response.request().postData() || "{}");
    Logger.info(
      `Units: "${header}" = ${value} → PUT /cells ${response.status()} ${JSON.stringify(body)}`
    );
    return { status: response.status(), body };
  }

  async readUnitCell(header) {
    await this._widenUnitsGrid();
    const col = await this._unitColumnIndex(header);
    return (await this._unitCell(col).innerText()).trim();
  }

  /** Sends a cell edit straight to the API (as the grid would) and returns the result. */
  async putUnitCellViaApi(propertyId, rowId, columnName, value) {
    const res = await this.page.request.put(
      `${BASE_URL}/api/bird-table/cells?&property_id=${propertyId}`,
      { data: { columnName, value, rowId, tableName: "unit" } }
    );
    const body = await res.json().catch(() => ({}));
    Logger.info(
      `API PUT unit.${columnName}=${value} → ${res.status()} ${JSON.stringify(body)}`
    );
    return { status: res.status(), body };
  }

  // ─── Takeoffs ──────────────────────────────────────────────────────────────

  async openTakeoffs() {
    await healingLocator(this.s.takeoffsTab).first().click();
    await expect(healingLocator(this.s.takeoffsTab).first()).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 15000 }
    );
  }

  notCoveredMessage() {
    return healingLocator(this.s.notCoveredMessage).first();
  }
}

module.exports = { PropertyE2EPage, TEST_ADDRESS };
