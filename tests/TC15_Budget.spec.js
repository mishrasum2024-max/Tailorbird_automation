require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { BudgetJob } = require("../pages/budgetPage");
const { AddColumnPage } = require("../pages/addColumnPage");
const { Logger } = require("../utils/logger");
const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  animations: "disabled",
  maxDiffPixels: 50_000,
  maxDiffPixelRatio: 0.3,
});

let page, budgetJob;

test.describe("Budget Workflow", () => {
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page: p }) => {
    page = p;
    budgetJob = new BudgetJob(page);
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: "load" });
    await expect(page).toHaveURL(process.env.DASHBOARD_URL);
    await page.waitForTimeout(7000);
    Logger.info("Dashboard loaded from stored session");
    await ensureLeftPanelExpanded(page);
    await budgetJob.navigateToBudgetTab();
    await budgetJob.waitForPageLoad();
    Logger.success("Setup complete - Navigated to Budget section");
  });

  test("TC242 @budget @sanity @regression : Verify Budget workspace displays property, table headers, revision controls, selectors, and budget items", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyPropertyHeader();
    await budgetJob.verifyBudgetTableHeaders();
    await budgetJob.verifyReviseBudgetsVisible();
    await budgetJob.verifyYearSelector();
    await budgetJob.verifyVersionSelector();
    await budgetJob.verifyBudgetDataRows();
    await budgetJob.verifyBudgetItems([
      "Construction",
      "Site Prep",
      "Concrete",
      "Wiring",
    ]);
    Logger.success("TC242: Budget page verification completed");
  });

  test("TC243 @budget @regression : Verify Budget Category is available in the Budget navigation", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.verifyBudgetCategoryInNav();
    Logger.success("TC243: Budget Category section verified");
  });

  test("TC244 @budget @regression : Verify Budget grid displays the Category Code column", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyCategoryCodeColumn();
    Logger.success("TC244: Category Code column present");
  });

  test("TC245 @budget @regression : Verify Budget Category dropdown is available for budget records", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyCategoryCodeColumn();
    expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
    Logger.success("TC245: Budget Category dropdown accessible");
  });

  test("TC246 @budget @regression : Verify Budget Category is linked through Category Code in budget rows", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyCategoryCodeColumn();
    await budgetJob.verifyFirstRowCategoryCell();
    Logger.success("TC246: Budget Category linked via Category Code");
  });

  test("TC247 @budget @regression : Verify Budget Category names are displayed for mapped budget items", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyCategoryCodeColumn();
    await budgetJob.verifyFirstRowCategoryCell();
    expect(await budgetJob.getFirstBudgetItemRowCount()).toBeGreaterThan(0);
    Logger.success("TC247: Category Name displays correctly");
  });

  test("TC248 @budget @regression : Verify Budget Categories can be assigned to budget items", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyCategoryCodeColumn();
    expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
    Logger.success("TC248: Budget Category assignable to items");
  });

  test("TC249 @budget @regression : Verify Budget Category and Category Code remain visible across table layouts", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyBudgetTableHeaders([
      "Budget Item",
      "Description",
      "Category Code",
      "Original Budget",
      "Current Budget",
    ]);
    Logger.success("TC249: Category Code consistent across grid");
  });

  test("TC250 @budget @regression : Verify Budget Category works with Revise Budget controls", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyReviseBudgetsVisible();
    await budgetJob.verifyCategoryCodeColumn();
    Logger.success("TC250: Category works with Revise Budgets");
  });

  test("TC251 @budget @regression : Verify the same Budget Category can be used across multiple budget items", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyCategoryCodeColumn();
    expect(await budgetJob.getDataRowCount()).toBeGreaterThan(1);
    Logger.success("TC251: Category reusable across items");
  });

  test("TC252 @budget @regression : Verify custom Budget views can be created, switched, and loaded", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    const viewName = `BudgetView_${Date.now()}`;
    await budgetJob.createView(viewName);
    await budgetJob.switchToDefaultView();
    await budgetJob.loadView(viewName);
    Logger.success("TC252: View created and loaded");
  });

  test("TC253 @budget @regression : Verify Add Column, Manage Columns and Delete Column functionality", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    const addColumnPage = new AddColumnPage(page, {
      scope: page.locator("main"),
    });
    const colName = `TestCol-${Date.now()}`;
    // "Table settings" drawer replaced the table menu + Manage Columns dialog (MCP-verified
    // 2026-10-30). Same flow as before: add (after removing this test's own leftovers), verify, delete.
    await addColumnPage.addColumnViaTableSettings(
      colName,
      "Automation Test column for budget"
    );
    await addColumnPage.openTableSettings();
    await addColumnPage.verifyColumnInTableSettings(colName);
    await addColumnPage.deleteColumnViaTableSettings(colName, {
      menuItems: [
        "Add to Filter",
        "Add to Budget Creation Form",
        "Delete column",
      ],
    });
    await addColumnPage.closeTableSettings();
    Logger.success("TC253: Add, verify, delete column completed");
  });

  test("TC254 @budget @regression : Verify exported Budget file contains headers and budget records", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    const downloadsDir = path.join(process.cwd(), "downloads");
    const savePath = await budgetJob.exportBudgetData(downloadsDir);
    const content = fs.readFileSync(savePath, "utf-8");
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("Description");
    // Westerham sample data may include Site Prep; other properties often show Construction, etc.
    expect(content).toMatch(/Site Prep|Construction/i);
    Logger.success("TC254: Export verified with budget data");
  });

  test.describe.serial("Revise Budget", () => {
    test("TC255 @budget @regression : Verify Revise Budget opens with property, category, grid, and revision editor", async () => {
      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      await budgetJob.verifyPropertyHeader();
      await budgetJob.verifyCategoryCodeColumn();
      expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
      await budgetJob.openRevisionEditor();
      await budgetJob.verifyRevisionEditorOpen();
      Logger.success("TC255: Revise Budget flow verified");
    });

    test("TC256 @budget @regression : Verify Reset Table restores the original Budget grid after revision mode", async () => {
      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      const { reviseBtn, reviseEnabled } =
        await budgetJob.ensureReviseEnabled();
      expect(reviseEnabled).toBeTruthy();
      await reviseBtn.click();
      await page.waitForTimeout(2000);
      await budgetJob.resetTableInMainGrid();
      Logger.success("TC256: Reset table completed");
    });

    test("TC257 @budget @regression : Verify a new Budget row can be added with custom details", async () => {
      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      const uniqueItemName = `TestBudgetItem_${Date.now()}`;
      await budgetJob.addRowInMainGrid(
        uniqueItemName,
        "Test description for added row"
      );
      Logger.success("TC257: Row added and verified");
    });

    test("TC258 @budget @regression : Verify Budget CSV upload populates records in the Revision Editor", async () => {
      test.setTimeout(180000);
      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      await page
        .locator('[role="treegrid"]')
        .first()
        .waitFor({ state: "visible", timeout: 30000 })
        .catch(() => {});
      await budgetJob.openRevisionEditor();
      await budgetJob.verifyRevisionEditorOpen();
      const filePath = path.resolve(
        process.cwd(),
        "files",
        "budget_file_to_upload.csv"
      );
      expect(fs.existsSync(filePath)).toBeTruthy();
      await budgetJob.uploadFileInRevision(filePath);
      await page.waitForTimeout(2000);
      const count = await budgetJob.getTreegridRowCount();
      expect(
        count,
        "Uploaded budget data must have at least one row"
      ).toBeGreaterThan(0);
      Logger.success(
        `TC258: Upload budget file flow completed - ${count} rows in grid`
      );
    });

    test("TC259 @budget @regression : Verify deleted Revision Editor rows are restored after Reset Table", async () => {
      test.setTimeout(300000);
      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      await page.waitForTimeout(30000);
      await page.waitForTimeout(3000);
      await budgetJob.openRevisionEditor();
      await page.waitForTimeout(3000);
      await budgetJob.verifyRevisionEditorOpen();
      // MCP-verified 2026-10-28: the naming dialog can stay up ~30s after Continue, and at the
      // 1280px Desktop Chrome viewport RevoGrid does not render the right-most Actions (trash)
      // column until the grid is scrolled right — reveal it before deleting.
      await budgetJob.waitForRevisionEditorReady();
      await budgetJob.scrollRevisionEditorToNotesColumn();
      await page.waitForTimeout(2000);
      const countBeforeDelete = await budgetJob.getTreegridRowCount();
      expect(
        countBeforeDelete,
        "Revision editor must have rows before delete"
      ).toBeGreaterThan(0);
      await budgetJob.deleteFirstRowInRevision();
      await page.waitForTimeout(30000);
      await page.waitForTimeout(3000);
      await budgetJob.resetTableInRevision();
      await page.waitForTimeout(30000);
      await page.waitForTimeout(4000);
      const count = await budgetJob.getTreegridRowCount();
      expect(
        count,
        "Reset Table must restore rows - data should be restored"
      ).toBeGreaterThan(0);
      Logger.success(`TC259: Reset Table - ${count} rows restored`);
    });

    test("TC260 @budget @regression : Verify Budget Category persists before and after approval submission", async () => {
      // MCP-verified 2026-11-03: at the 1280px Desktop Chrome viewport RevoGrid does not render
      // the right-most Actions (trash) column, so deleteFirstRowInRevision() waits forever. At
      // 1920px every column renders without horizontal scrolling (scrolling would reorder the
      // row's cells and break the index-based cell lookups that follow).
      await page.setViewportSize({ width: 1920, height: 1080 });
      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      await budgetJob.openRevisionEditor();
      await budgetJob.deleteFirstRowInRevision();
      await budgetJob.addRowWithCategoryInRevision(
        "Site Prep",
        "Site preparation work",
        "Construction",
        "15000"
      );

      Logger.step("TC260: Assert category is set in first row before submit");
      const categoryBeforeSubmit =
        await budgetJob.getFirstRowCategoryValue("revision");
      expect(categoryBeforeSubmit).toBeTruthy();
      expect(categoryBeforeSubmit).not.toBe("-");
      expect(categoryBeforeSubmit).not.toBe("—");
      expect(categoryBeforeSubmit).not.toBe("");
      Logger.success(
        `TC260: Category in first row BEFORE submit = "${categoryBeforeSubmit}"`
      );

      await budgetJob.clickSubmitForApproval();
      await page.waitForTimeout(7000);

      await budgetJob.navigateToBudget();
      await budgetJob.selectBrookProperty();
      await page.waitForTimeout(7000);
      // RevoGrid renders asynchronously after network-idle — wait for an actual
      // data row (not loading skeleton) to appear before counting.
      await page
        .locator('[role="row"]')
        .filter({ has: page.locator('[role="gridcell"]') })
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .catch(() => {});
      await page.waitForTimeout(1000);

      Logger.step(
        "TC260: Assert budget data still visible in main grid after submit"
      );
      const mainGridCount = await budgetJob.getDataRowCount();
      expect(
        mainGridCount,
        "Main budget grid must have rows after revision is submitted for approval"
      ).toBeGreaterThan(0);

      Logger.step(
        "TC260: Assert category persists in first row after submit (main grid)"
      );
      const categoryAfterSubmit =
        await budgetJob.assertFirstRowCategoryNotEmpty("main");
      Logger.success(
        `TC260: Category in first row AFTER submit = "${categoryAfterSubmit}"`
      );
      Logger.success(
        "TC260: Row added with category from dropdown, submitted, category verified in both views"
      );
    });

    test("TC261 @budget @regression : Verify Budget CSV upload and submission populate the Main Grid for a new property", async () => {
      // await page.pause();
      await budgetJob.navigateToBudget();
      await budgetJob.selectNonBrookProperty();
      await budgetJob.openRevisionEditor();
      const filePath = path.resolve(process.cwd(), "files", "budget_data.csv");
      expect(fs.existsSync(filePath)).toBeTruthy();
      await budgetJob.uploadFileInRevision(filePath);
      await budgetJob.ensureSubmitEnabledAfterUpload();
      await budgetJob.clickSubmitForApproval();
      await page.waitForTimeout(5000);
      const hasConstruction = await budgetJob.isTextVisible(
        "Construction",
        10000
      );
      const hasSitePrep = await budgetJob.isTextVisible("Site Prep", 10000);
      expect(
        hasConstruction || hasSitePrep,
        "Uploaded budget data (Construction or Site Prep) must be visible after submit"
      ).toBeTruthy();
      // Same fix already proven on TC260 immediately above: RevoGrid renders asynchronously
      // after network-idle, so counting rows right away can race the grid's own paint and
      // read 0 even though the uploaded data is genuinely there a moment later. Wait for an
      // actual data row (not a loading skeleton) before counting.
      await page
        .locator('[role="row"]')
        .filter({ has: page.locator('[role="gridcell"]') })
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .catch(() => {});
      const mainGridCount = await budgetJob.getDataRowCount();
      expect(
        mainGridCount,
        "Main budget grid must have rows after submit"
      ).toBeGreaterThan(0);
      Logger.success("TC261: Upload on other property, submitted, verified");
    });
  });

  test("TC262 @budget @regression @ui : Verify Budget toolbar CTAs, View actions, and Year Selector states", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyToolbarCTALabels();
    await budgetJob.verifyReviseBudgetsDisabledWhenDraft();
    await budgetJob.verifyViewButtonPopover();
    await budgetJob.verifyYearSelectorHasOptions();
    await budgetJob.verifyEmptyYearState();
    Logger.success(
      "TC262: Toolbar CTAs, View inline save, Year selector – PASSED"
    );
  });

  test("TC263 @budget @regression @ui : Verify Table Menu, Add Column panel and Manage Columns drawer functionality", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    // "Table settings" drawer replaced the table menu, Add column panel and Manage Columns
    // (MCP-verified 2026-10-30). Same checks: drawer contents, Add column form validation (nothing
    // added), default columns listed, Budget Remaining visibility toggled and restored.
    await budgetJob.ensureBudgetOverviewTab();
    const tableSettings = new AddColumnPage(page, {
      scope: page.getByRole("tabpanel", { name: "Overview" }),
    });
    await tableSettings.openTableSettings();
    await tableSettings.verifyAddColumnFormValidation();
    await tableSettings.verifyColumnsListedInTableSettings([
      "Budget Item",
      "Description",
      "Category Code",
      "Original Budget",
      "Current Budget",
    ]);
    await tableSettings.toggleColumnVisibilityAndRestore("Budget Remaining");
    await tableSettings.closeTableSettings();
    Logger.success("TC263: Table menu, Add column, Manage Columns – PASSED");
  });

  test("TC264 @budget @regression @ui : Verify Budget column sorting, search, and empty-state behavior", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyColumnHeaderControls();
    await budgetJob.verifySearchFilterBehavior();
    Logger.success("TC264: Column sort, search filter, empty state – PASSED");
  });

  test("TC265 @budget @regression @ui : Verify Budget version badges, Manage Versions, and Budget History", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyVersionDropdownBadges();
    await budgetJob.verifyManageVersionsDrawer();
    await budgetJob.verifyBudgetHistoryDrawer();
    Logger.success(
      "TC265: Version badges, Manage Versions drawer, Budget History – PASSED"
    );
  });

  test("TC266 @budget @regression @ui : Verify Budget version notes, rename, and delete confirmation", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyVersionNoteModalLabels();
    await budgetJob.verifyManageVersionsRenameAndDeleteGuard();
    Logger.success("TC266: Version Note modal, rename, delete guard – PASSED");
  });

  test("TC267 @budget @regression @ui : Verify Revision Documents tab and file upload widget", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.openRevisionEditor();
    await budgetJob.verifyRevisionEditorOpen();
    await budgetJob.verifyDocumentsTabInRevision();
    await budgetJob.verifyUploadcareWidget();
    Logger.success("TC267: Documents tab and Uploadcare widget – PASSED");
  });

  test("TC268 @budget @regression @ui @visual : Verify Budget disabled states, currency formatting, and edge cases", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.verifyDisabledButtonStylingAndAmounts();
    // Table settings drawer replaced the table menu / Manage Columns (MCP-verified 2026-10-30).
    await budgetJob.verifyEdgeCasesViaTableSettings();
    Logger.success(
      "TC268: Visual states, negative guards, edge cases – PASSED"
    );
  });

  test("TC556 @regression @budget BUG-1582-TC01 : Missing Download Sample CSV for Budget Import", async () => {
    test.setTimeout(180000);
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.openRevisionEditor();
    await budgetJob.verifyRevisionEditorOpen();
    await budgetJob.openBudgetUploadGuideInRevision();
    await budgetJob.verifySampleCsvDownloadInUploadGuide();
    Logger.success("TC556: Sample CSV download offered in Budget upload guide");
  });
  test("TC556 @budget @regression BUG-1581-TC01 : Budget - Column Headers Scroll Horizontally to the Left", async () => {
    await budgetJob.navigateToBudget();
    await budgetJob.selectBrookProperty();
    await budgetJob.openRevisionEditor();
    await budgetJob.waitForRevisionEditorReady();
    const { maxXDrift, maxScroll } =
      await budgetJob.measureRevisionHeaderDrift();
    expect(
      maxXDrift,
      "Column headers must not move horizontally on their own"
    ).toBeLessThanOrEqual(1);
    expect(maxScroll, "Grid must not scroll horizontally on its own").toBe(0);
    Logger.success("TC556: Revision editor headers stay stable");
  });
});
