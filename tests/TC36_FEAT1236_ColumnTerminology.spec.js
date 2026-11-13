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
 * - Save for everyone → PUT /api/table-column-labels 200; labels are stored per table
 *   (GET /api/table-column-labels?tableName=capex_tracker → columns[].orgLabel), and saving the
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
    "/api/table-column-labels?tableName=capex_tracker"
  );
  expect(
    response.status(),
    `FAIL: GET /api/table-column-labels for capex_tracker did not succeed: ${await response.text()}`
  ).toBe(200);
  const { columns } = await response.json();
  return Object.fromEntries(columns.map(c => [c.columnName, c.orgLabel]));
}

/** Runs a Table settings save and asserts the backend accepted it. */
async function expectLabelsSaved(page, save) {
  const [response] = await Promise.all([
    page.waitForResponse(
      res =>
        res.url().includes("/api/table-column-labels") &&
        res.request().method() === "PUT",
      { timeout: 60000 }
    ),
    save(),
  ]);
  expect(
    response.status(),
    "FAIL: PUT /api/table-column-labels did not succeed"
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
    // Wait for the drawer's labels GET first: its response resets the textboxes, which would
    // otherwise leave Save disabled for the wrong reason (MCP-verified 2026-11-06).
    await Promise.all([
      page.waitForResponse(
        res =>
          res.url().includes("/api/table-column-labels") &&
          res.request().method() === "GET",
        { timeout: 60000 }
      ),
      t.columns.openTableSettings(),
    ]);
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
    const rowBefore = await t.getFirstDataRow();
    const totalsBefore = await t.getTotals();
    const rowsBefore = await t.getGridRowTexts();
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
    // MCP-verified 2026-11-06: PUT /api/table-column-labels → 400, toast "Could not save column
    // names" + '"net_paid" matches another column. Choose a different label.' (the quoted name is
    // sometimes the internal key, so only the stable part is asserted); no orgLabel is stored.
    const headersBefore = await t.getHeaders();
    const rowBefore = await t.getFirstDataRow();

    Logger.step(`Try to label "${FIN}" as "${FIN2}" (another column's label)`);
    // Opening the drawer fires GET /api/table-column-labels; its response re-renders the
    // display-name textboxes and wipes anything typed before it lands (MCP-verified 2026-11-06).
    const [labelsLoad] = await Promise.all([
      page.waitForResponse(
        res =>
          res.url().includes("/api/table-column-labels") &&
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
          res.url().includes("/api/table-column-labels") &&
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
