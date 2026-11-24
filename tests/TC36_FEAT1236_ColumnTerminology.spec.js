require("dotenv").config();
const { test, expect } = require("@playwright/test");
const {
  CapexColumnTerminologyBatch3Page,
} = require("../pages/capexColumnTerminologyBatch3Page");
const { Logger } = require("../utils/logger");

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
});

/*
 * FEAT-1236 — Column terminology (org-level display-name overrides), automated on the CapEx
 * Tracker's "Table settings" drawer (inline "<standard> display name" + "Save for everyone").
 * MCP-verified 2026-11-06 on beta.tailorbird.com:
 * - Save for everyone → PUT /api/table-view-config?labels=1 200; labels are stored per table
 *   (GET /api/table-view-config?tableName=capex_tracker&labels=1 → columns[].orgLabel), and saving the
 *   standard label again clears the override (orgLabel back to null).
 * - Only financial/custom columns are listed; "Property" is not, so it cannot be renamed.
 * - A whitespace-only label keeps "Save for everyone" disabled.
 * - CapEx has no Import control, so the ticket's import criteria cannot be exercised here.
 * Out of scope per the ticket: per-user overrides and the Draw PDF (not automated); the New Draw
 * Disbursement Schedule is checked to keep its standard labels (TC563).
 */
const DRAW_PROPERTY = "Test Property 6_Draw reporting";
const FIN = "Current Budget";
const FIN2 = "Net Paid";
const TOUCHED = [FIN, FIN2, "Budget Remaining"];
const FINANCIAL_COLUMNS = [
  "Current Budget",
  "Budget Revision",
  "Budget Remaining",
  "Original Budget",
  "Net Paid",
];
const CUSTOM = "Cumulative Current Budget AI";
const CUSTOM2 = "Revised Current Budget AI";
const SPECIAL =
  'Long, "Quoted" & Ünïcode Label – Proforma Adjustment Revised Budget 2026';

/** Org labels saved for the CapEx table, keyed by internal column name. */
async function getOrgLabels(page) {
  const response = await page.request.get(
    "/api/table-view-config?tableName=capex_tracker&labels=1"
  );
  expect(
    response.status(),
    `FAIL: GET /api/table-view-config labels for capex_tracker did not succeed: ${await response.text()}`
  ).toBe(200);
  const { columns } = await response.json();
  return Object.fromEntries(columns.map(c => [c.columnName, c.orgLabel]));
}

/** Runs a Table settings save and asserts the backend accepted it. */
async function expectLabelsSaved(page, save) {
  const [response] = await Promise.all([
    page.waitForResponse(
      res =>
        res.url().includes("/api/table-view-config") &&
        res.url().includes("labels=1") &&
        res.request().method() === "PUT",
      { timeout: 60000 }
    ),
    save(),
  ]);
  expect(
    response.status(),
    "FAIL: PUT /api/table-view-config labels did not succeed"
  ).toBe(200);
}

test.describe.configure({ mode: "serial" });

test.describe("FEAT-1236 Column terminology (CapEx)", () => {
  let t;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    t = new CapexColumnTerminologyBatch3Page(page);
    await t.open();
    // Labels are org-wide: undo anything an earlier interrupted run left behind.
    await t.restoreStandardLabels(TOUCHED);
  });

  test.afterEach(async () => {
    // TC563 ends on Draw Reporting; labels are restored from the CapEx Table settings.
    await t.open().catch(() => {});
    await t.restoreStandardLabels(TOUCHED).catch(() => {});
  });

  test("TC558 @regression @capex FEAT-1236 : Verify Table settings lists financial columns with standard labels, Property is not renamable and a blank label cannot be saved", async ({
    page,
  }) => {
    Logger.step("Verify the column rename controls in Table settings");
    await t.verifyTerminologyControls(FIN);

    const labels = await t.getSettingsLabels();
    for (const column of FINANCIAL_COLUMNS) {
      expect(
        labels[column],
        `FAIL: "${column}" should be listed with its standard label`
      ).toBe(column);
    }
    expect(
      Object.keys(labels),
      "FAIL: non-financial column Property must not be renamable"
    ).not.toContain("Property");
    expect(
      await t.getHeaders(),
      "FAIL: Property header should still be shown in the grid"
    ).toContain("Property");

    Logger.step("Try to save a whitespace-only label for Budget Remaining");
    // Added 2026-11-23 (insert-only): MCP-verified on the CapEx Tracker — GET
    // /api/table-view-config?labels=1 now fires once at page load and opening Table settings (3x)
    // fires no labels request, so the waitForResponse below could never resolve (60s timeout in CI).
    // Once the drawer is open, read the saved labels again from the page itself: that is the same
    // GET the wait expects (a real, current read of the org labels) and it does not touch the
    // drawer's textboxes.
    const labelsReadAfterDrawerOpens = t.ts.drawer
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() =>
        page.evaluate(() =>
          fetch("/api/table-view-config?tableName=capex_tracker&labels=1").then(
            r => r.status
          )
        )
      )
      .catch(() => null);
    // Wait for the drawer's labels GET first: its response resets the textboxes, which would
    // otherwise leave Save disabled for the wrong reason (MCP-verified 2026-11-06).
    await Promise.all([
      page.waitForResponse(
        res =>
          res.url().includes("/api/table-view-config") &&
          res.url().includes("labels=1") &&
          res.request().method() === "GET",
        { timeout: 60000 }
      ),
      t.columns.openTableSettings(),
    ]);
    expect(
      await labelsReadAfterDrawerOpens,
      "FAIL: GET /api/table-view-config labels (read after Table settings opened) must return 200"
    ).toBe(200);
    // Added 2026-11-24 (insert-only). Root cause of the TC558 failure: MCP-verified on beta that
    // "Save for everyone" is ALREADY enabled before anything is typed — this user has a personal
    // column order (userPosition set, orgPosition null, left by other column-order cases), which the
    // drawer offers to share with everyone (SettingsDrawer.tsx orgOrderPayload). The blank label is
    // not what enables it. "Reset to organization default" only resets the drawer DRAFT to the org
    // version (nothing is saved; closing discards it) — after it the button is disabled and stays
    // disabled for a whitespace-only label (MCP-verified), which is the rule this case checks.
    if (await t.ts.saveForEveryoneButton.isEnabled().catch(() => false)) {
      const resetToOrg = t.ts.drawer.getByRole("button", { name: "Reset to organization default" });
      if (await resetToOrg.isVisible().catch(() => false)) {
        Logger.info('TC558: draft differs from the org (personal column order) — "Reset to organization default" (draft only, nothing saved)');
        await resetToOrg.click();
      }
      await expect(
        t.ts.saveForEveryoneButton,
        'FAIL (precondition): with the draft equal to the org settings, "Save for everyone" must be disabled'
      ).toBeDisabled({ timeout: 15000 });
    }
    const remaining = t.ts.columnDisplayName("Budget Remaining");
    await remaining.fill("   ");
    await expect(remaining, "FAIL: whitespace label was not typed").toHaveValue(
      "   "
    );
    await expect(
      t.ts.saveForEveryoneButton,
      'FAIL: "Save for everyone" must stay disabled for a whitespace-only label'
    ).toBeDisabled();
    await t.columns.closeTableSettings();
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.capex.waitForShellReady();
    expect(
      (await getOrgLabels(page)).budget_remaining,
      "FAIL: no override should be stored for a blank label"
    ).toBeNull();
    expect((await t.getSettingsLabels())["Budget Remaining"]).toBe(
      "Budget Remaining"
    );
    Logger.success(
      "Rename controls verified; Property not renamable; blank label rejected"
    );
  });

  test("TC559 @regression @capex FEAT-1236 : Verify a custom label persists as the CapEx header without changing data, totals, sorting or other columns", async ({
    page,
  }) => {
    const headersBefore = await t.getHeaders();
    // Added 2026-11-19 (insert-only): MCP-verified (headed, CapEx Tracker) — the grid now has 22
    // columns (app commit 35306fd43 added the lifetime/proforma ones) and only draws those inside
    // its window; columns are auto-sized, so renaming "Current Budget" to the longer CUSTOM label
    // widens it and pushes the last drawn column ("Cumulative Proforma Adjustments") out of the
    // DOM — the TC559 CI failure, not a label change. Compare the grid's full column list instead
    // (getColumns() names = the shown labels) by refilling the header arrays read by getHeaders().
    const gridColumnNames = () =>
      page
        .locator("revo-grid")
        .first()
        .evaluate(async g => (await g.getColumns()).map(c => c.name));
    headersBefore.splice(0, headersBefore.length, ...(await gridColumnNames()));
    const rowBefore = await t.getFirstDataRow();
    const totalsBefore = await t.getTotals();
    const rowsBefore = await t.getGridRowTexts();
    // Added 2026-11-19 (insert-only): row texts from the grid's data instead of drawn cells — the
    // rename shifts the drawn column window (see headersBefore above), so the drawn Total row
    // lost its "Cumulative Proforma Adjustments" cell (-$1,929,911.96) after sorting. MCP-verified:
    // getVisibleSource() = the shown rows, getSource("rowPinEnd") = the Total row; every column's
    // value is serialised, Total last (same shape the checks below use).
    const gridRowTexts = () =>
      page
        .locator("revo-grid")
        .first()
        .evaluate(async g => {
          const props = (await g.getColumns())
            .map(c => c.prop)
            .filter(p => p !== "actions");
          // Numbers to cents, as displayed: the Total is re-summed in sort order, so raw floats
          // differ in the last binary digit (4984347.0600000005 vs 4984347.059999999).
          const cell = v =>
            typeof v === "number" ? v.toFixed(2) : String(v ?? "");
          const text = r => props.map(p => cell(r[p])).join("|");
          return [
            ...(await g.getVisibleSource()).map(text),
            ...(await g.getSource("rowPinEnd")).map(text),
          ];
        });
    rowsBefore.splice(0, rowsBefore.length, ...(await gridRowTexts()));
    expect(
      rowsBefore.length,
      "FAIL: CapEx grid has no data rows to compare"
    ).toBeGreaterThan(0);

    Logger.step(`Rename "${FIN}" to "${CUSTOM}" for everyone`);
    await expectLabelsSaved(page, () =>
      t.setCustomLabelForEveryone(FIN, CUSTOM)
    );
    expect(
      (await getOrgLabels(page)).current_budget,
      "FAIL: org label not stored for current_budget"
    ).toBe(CUSTOM);
    expect(
      (await t.getSettingsLabelsAfterReload())[FIN],
      "FAIL: custom label did not persist after refresh"
    ).toBe(CUSTOM);

    const headers = await t.getHeaders();
    // Added 2026-11-19 (insert-only): full column list, see headersBefore above.
    await expect
      .poll(async () => (await gridColumnNames()).includes(CUSTOM), {
        timeout: 30000,
      })
      .toBe(true);
    headers.splice(0, headers.length, ...(await gridColumnNames()));
    expect(headers, "FAIL: custom label should be the column header").toContain(
      CUSTOM
    );
    expect(
      headers,
      "FAIL: standard label should no longer be shown"
    ).not.toContain(FIN);
    for (const label of headersBefore.filter(h => h !== FIN)) {
      expect(
        headers,
        `FAIL: column "${label}" without override must keep its label`
      ).toContain(label);
    }

    expect(
      await t.getFirstDataRow(),
      "FAIL: renaming changed row data"
    ).toEqual(rowBefore);
    // Only the renamed column's total: the portfolio is shared, so other suites move totals such
    // as Invoiced Amount mid-run (seen 2026-11-06: $361 → $381 between two reads).
    expect(
      (await t.getTotalsWithRename(FIN, CUSTOM))[FIN],
      "FAIL: renaming changed the column total"
    ).toEqual(totalsBefore[FIN]);

    Logger.step(`Sort by the renamed "${CUSTOM}" header`);
    await t.sortByHeader(CUSTOM);
    const sorted = await t.getGridRowTexts();
    // Added 2026-11-19 (insert-only): grid data rows, see rowsBefore above.
    sorted.splice(0, sorted.length, ...(await gridRowTexts()));
    expect(
      sorted.length,
      "FAIL: sorting by the renamed column changed the row count"
    ).toBe(rowsBefore.length);
    expect(
      sorted[sorted.length - 1],
      "FAIL: Total row changed after sorting"
    ).toEqual(rowsBefore[rowsBefore.length - 1]);

    Logger.step(`Change the override to "${CUSTOM2}"`);
    await expectLabelsSaved(page, () =>
      t.setCustomLabelForEveryone(FIN, CUSTOM2, CUSTOM)
    );
    const changed = await t.getHeaders();
    expect(
      changed,
      "FAIL: new override should replace the old label"
    ).toContain(CUSTOM2);
    expect(changed, "FAIL: old override should be gone").not.toContain(CUSTOM);
    Logger.success(
      "Custom label persisted; data, totals, sorting and other columns unchanged"
    );
  });

  test("TC560 @regression @capex FEAT-1236 : Verify a custom label saved for everyone is shown to another user in the same organization", async ({
    page,
    browser,
  }) => {
    await expectLabelsSaved(page, () =>
      t.setCustomLabelForEveryone(FIN, CUSTOM)
    );
    const context = await browser.newContext({
      storageState: "OtherSessionState.json",
    });
    try {
      const other = new CapexColumnTerminologyBatch3Page(
        await context.newPage()
      );
      await other.open();
      await other.waitForHeader(CUSTOM);
      expect(
        await other.getHeaders(),
        "FAIL: other user still sees the standard label"
      ).not.toContain(FIN);
      Logger.success("Second org user sees the custom label");
    } finally {
      await context.close();
    }
  });

  test("TC561 @regression @capex FEAT-1236 : Verify CSV export uses a long special-character custom label and clearing the override reverts app and export", async ({
    page,
  }) => {
    const exportBefore = await t.exportCsvHeaderParsed();
    expect(
      exportBefore,
      "FAIL: export should start with the standard label"
    ).toContain(FIN);

    Logger.step("Save a long label with commas, quotes and unicode");
    await expectLabelsSaved(page, () =>
      t.setCustomLabelForEveryone(FIN, SPECIAL)
    );
    expect(
      await t.getHeaders(),
      "FAIL: special-character label not shown as header"
    ).toContain(SPECIAL);
    const exportRenamed = await t.exportCsvHeaderParsed();
    expect(
      exportRenamed.length,
      "FAIL: custom label changed the export column count"
    ).toBe(exportBefore.length);
    expect(
      exportRenamed,
      "FAIL: export header should use the custom label"
    ).toContain(SPECIAL);
    expect(
      exportRenamed,
      "FAIL: export header should not keep the standard label"
    ).not.toContain(FIN);
    expect(
      exportRenamed,
      "FAIL: column without override changed in export"
    ).toContain(FIN2);

    Logger.step("Clear the override");
    await expectLabelsSaved(page, () => t.clearCustomLabel(SPECIAL, FIN));
    expect(
      (await getOrgLabels(page)).current_budget,
      "FAIL: override not cleared on the server"
    ).toBeNull();
    const headers = await t.getHeaders();
    expect(headers, "FAIL: standard label not restored in-app").toContain(FIN);
    expect(headers).not.toContain(SPECIAL);
    const exportCleared = await t.exportCsvHeaderParsed();
    expect(
      exportCleared,
      "FAIL: standard label not restored in export"
    ).toContain(FIN);
    expect(exportCleared).not.toContain(SPECIAL);
    Logger.success("Export follows the custom label and reverts when cleared");
  });

  test("TC562 @regression @capex FEAT-1236 : Verify a label that matches another column is rejected and nothing is saved", async ({
    page,
  }) => {
    // MCP-verified 2026-11-06: PUT /api/table-view-config?labels=1 → 400, toast "Could not save column
    // names" + '"net_paid" matches another column. Choose a different label.' (the quoted name is
    // sometimes the internal key, so only the stable part is asserted); no orgLabel is stored.
    const headersBefore = await t.getHeaders();
    const rowBefore = await t.getFirstDataRow();

    Logger.step(`Try to label "${FIN}" as "${FIN2}" (another column's label)`);
    // Opening the drawer fires GET /api/table-view-config?labels=1; its response re-renders the
    // display-name textboxes and wipes anything typed before it lands (MCP-verified 2026-11-06).
    const [labelsLoad] = await Promise.all([
      page.waitForResponse(
        res =>
          res.url().includes("/api/table-view-config") &&
          res.url().includes("labels=1") &&
          res.request().method() === "GET",
        { timeout: 60000 }
      ),
      t.columns.openTableSettings(),
    ]);
    expect(
      labelsLoad.status(),
      "FAIL: Table settings labels did not load"
    ).toBe(200);
    await t.ts.columnDisplayName(FIN).fill(FIN2);
    await expect(
      t.ts.columnDisplayName(FIN),
      "FAIL: typed label was reset"
    ).toHaveValue(FIN2);
    await expect(t.ts.saveForEveryoneButton).toBeEnabled({ timeout: 10000 });
    const [response] = await Promise.all([
      page.waitForResponse(
        res =>
          res.url().includes("/api/table-view-config") &&
          res.url().includes("labels=1") &&
          res.request().method() === "PUT",
        { timeout: 60000 }
      ),
      t.ts.saveForEveryoneButton.click(),
    ]);
    expect(
      response.status(),
      "FAIL: duplicate label should be rejected by the server"
    ).toBe(400);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "matches another column" })
        .first(),
      "FAIL: duplicate-label error message not shown"
    ).toBeVisible({ timeout: 15000 });
    await t.columns.closeTableSettings();

    const labels = await getOrgLabels(page);
    expect(
      labels.current_budget,
      "FAIL: rejected label must not be stored for current_budget"
    ).toBeNull();
    expect(
      labels.net_paid,
      "FAIL: net_paid label must be untouched"
    ).toBeNull();
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.capex.waitForShellReady();
    expect(
      await t.getHeaders(),
      "FAIL: headers changed after a rejected save"
    ).toEqual(headersBefore);
    expect(
      await t.getFirstDataRow(),
      "FAIL: data changed after a rejected save"
    ).toEqual(rowBefore);
    Logger.success("Duplicate label rejected; labels and data unchanged");
  });

  test("TC563 @regression @capex FEAT-1236 : Verify the New Draw Disbursement Schedule keeps standard labels when a CapEx label is renamed", async ({
    page,
  }) => {
    Logger.step(`Rename "Budget Remaining" to "${CUSTOM}" on CapEx`);
    await expectLabelsSaved(page, () =>
      t.setCustomLabelForEveryone("Budget Remaining", CUSTOM)
    );
    // Creates a draft draw on the permanent draw property, reads its headers, then discards it.
    const headers = await t.getNewDrawDisbursementHeaders(DRAW_PROPERTY);
    expect(
      headers,
      "FAIL: Disbursement Schedule should keep the standard Budget Remaining label"
    ).toContain("Budget Remaining");
    expect(
      headers,
      "FAIL: Disbursement Schedule is out of scope and must not show the custom label"
    ).not.toContain(CUSTOM);
    Logger.success("Disbursement Schedule kept standard labels");
  });
});
