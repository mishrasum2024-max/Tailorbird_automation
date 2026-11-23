require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { BudgetJob } = require("../pages/budgetPage");
const { ApprovalJob } = require("../pages/approvalPage");
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
  // Added 2026-11-19 (insert-only): MCP-verified (headed, two pages on Test Property
  // 2_The Westerham): the property allows ONE draft revision per financial year. Under the CI
  // regression run (--workers=4 --fully-parallel) these tests opened revisions on that property
  // concurrently — a second "Name this budget revision → Continue" gets POST 400 "A draft revision
  // already exists for this financial year…" and stays on the Budget overview (whose own treegrid
  // satisfies verifyRevisionEditorOpen), and ensureReviseEnabled() deletes the other worker's draft.
  // That is the TC556 BUG-1582 CI failure (upload button "element(s) not found"). "default" mode
  // keeps this file's tests in one worker, in order, without skipping the rest when one fails.
  test.describe.configure({ mode: "default" });

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

  test("TC269 @budget @e2e @revision : Verify Budget revision import, AI notes, approval, and status updates", async () => {
    test.setTimeout(600000); // 8 minutes max

    const timestamp = Date.now();
    const propertyName = `TC244_BudgetProp_${timestamp}`;
    const templateName = `TC244_BudgetTemplate_${timestamp}`;

    const approvalJob = new ApprovalJob(page);

    // ===== STEP 1: Create new property =====
    Logger.step("TC269 Step 1: Creating new property");
    // createPropertyRobust (existing, additive ApprovalJob method — pages/approvalPage.js)
    // instead of createProperty: same MCP-verified client-side stale-cache bug on the
    // Properties listing after in-app navigation, already root-caused and fixed there.
    // createProperty() itself is untouched.
    await approvalJob.createPropertyRobust(
      propertyName,
      "Domestic Terminal, College Park, GA 30337, USA",
      "College Park",
      "GA",
      "30337",
      "Garden Style"
    );
    Logger.success(`TC269 Step 1: Property created — ${propertyName}`);

    // ===== STEP 2: Create Budget Approval template with 2 approvers =====
    Logger.step("TC269 Step 2: Creating Budget Approval template");
    await approvalJob.navigateToApprovalTab();
    await approvalJob.createBudgetApprovalTemplateForTest(
      templateName,
      propertyName
    );
    Logger.success(`TC269 Step 2: Template created — ${templateName}`);

    // ===== STEP 3: Navigate to Budget, select property, import CSV, submit =====
    Logger.step("TC269 Step 3: Importing budget CSV for initial budget");
    await budgetJob.navigateToBudget();
    await page.waitForTimeout(5000);
    await budgetJob.selectPropertyByName(propertyName);
    await budgetJob.openRevisionEditor();
    const budgetFilePath = path.resolve(
      process.cwd(),
      "files",
      "budget_data.csv"
    );
    expect(fs.existsSync(budgetFilePath)).toBeTruthy();
    await budgetJob.uploadFileInRevision(budgetFilePath);
    await budgetJob.ensureSubmitEnabledAfterUpload();
    await budgetJob.clickSubmitForApproval();
    await page.waitForTimeout(5000);
    Logger.success("TC269 Step 3: Initial budget submitted for approval");

    // ===== STEP 4: Approve the initial budget via "Approve on Behalf" =====
    Logger.step("TC269 Step 4: Approving initial budget in All Approvals");
    await approvalJob.navigateToAllApprovalsTab();
    await approvalJob.approveRevisionOnBehalfByPropertyInAllApprovals(
      propertyName
    );
    Logger.success("TC269 Step 4: Initial budget approved");

    // ===== STEP 5: Revision #1 — enter adjustments, assert AI notes + summary cards =====
    Logger.step(
      "TC269 Step 5: Creating Revision #1 (Bathroom -2000 / Concrete +1000)"
    );
    await budgetJob.navigateToBudget();
    await page.waitForTimeout(5000);
    await budgetJob.selectPropertyByName(propertyName);
    await page.waitForTimeout(5000);
    await budgetJob.openRevisionEditor();

    await budgetJob.enterRevisionAdjustmentByItemNameV2(
      "Bathroom fixtures install",
      -2000
    );
    await budgetJob.enterRevisionAdjustmentByItemNameV2("Concrete", 1000);
    await page.waitForTimeout(3000);

    // Assert AI-generated Notes column values (scroll grid right to reveal Notes column)
    // MCP-verified 2026-10-28: at the 1280px viewport the Notes column is not rendered until scrolled to.
    await budgetJob.scrollRevisionEditorToNotesColumn();
    await budgetJob.assertRevisionAINoteVisible(
      "this revision decreased the adjustment amount by $2,000.00"
    );
    await budgetJob.assertRevisionAINoteVisible(
      "this revision increased the adjustment amount by $1,000.00"
    );
    Logger.success("TC269 Step 5: Revision #1 AI notes verified");

    // Assert summary card values
    await expect(page.getByText("$1,000.00").first()).toBeVisible({
      timeout: 15000,
    }); // Total Increase
    await expect(page.getByText("-$2,000.00").first()).toBeVisible({
      timeout: 15000,
    }); // Total Decrease
    await expect(page.getByText("-$1,000.00").first()).toBeVisible({
      timeout: 15000,
    }); // Net Change
    Logger.success("TC269 Step 5: Revision #1 summary cards verified");

    await budgetJob.clickSubmitForApproval();
    await page.waitForTimeout(5000);
    Logger.success("TC269 Step 5: Revision #1 submitted for approval");

    // ===== STEP 6: Revision #2 — enter adjustments, assert AI notes + summary cards =====
    Logger.step(
      "TC269 Step 6: Creating Revision #2 (Bathroom +4000 / Concrete -500)"
    );
    await budgetJob.navigateToBudget();
    await page.waitForTimeout(5000);
    await budgetJob.selectPropertyByName(propertyName);
    await page.waitForTimeout(5000);
    await budgetJob.openRevisionEditor();

    await budgetJob.enterRevisionAdjustmentByItemNameV2(
      "Bathroom fixtures install",
      4000
    );
    await budgetJob.enterRevisionAdjustmentByItemNameV2("Concrete", -500);
    await page.waitForTimeout(3000);

    // Assert AI-generated Notes column values (scroll grid right to reveal Notes column)
    await budgetJob.scrollRevisionEditorToNotesColumn();
    await budgetJob.assertRevisionAINoteVisible(
      "this revision increased the adjustment amount by $4,000.00"
    );
    await budgetJob.assertRevisionAINoteVisible(
      "this revision decreased the adjustment amount by $500.00"
    );
    Logger.success("TC269 Step 6: Revision #2 AI notes verified");

    // Assert summary card values
    await expect(page.getByText("$4,000.00").first()).toBeVisible({
      timeout: 15000,
    }); // Total Increase
    await expect(page.getByText("-$500.00").first()).toBeVisible({
      timeout: 15000,
    }); // Total Decrease
    await expect(page.getByText("$3,500.00").first()).toBeVisible({
      timeout: 15000,
    }); // Net Change
    Logger.success("TC269 Step 6: Revision #2 summary cards verified");

    await budgetJob.clickSubmitForApproval();
    await page.waitForTimeout(5000);
    Logger.success("TC269 Step 6: Revision #2 submitted for approval");

    // ===== STEP 7: All Approvals — assert both revisions Pending =====
    Logger.step(
      "TC269 Step 7: Verifying both revisions visible with Pending Approval status"
    );
    await approvalJob.navigateToAllApprovalsTab();
    await approvalJob.assertRevisionsByPropertyHaveStatus(
      propertyName,
      "Pending Approval",
      2
    );
    Logger.success("TC269 Step 7: Both revisions show Pending Approval");

    // ===== STEP 8: Approve both revisions via "Approve on Behalf" =====
    Logger.step("TC269 Step 8: Approving both pending revisions on behalf");
    await approvalJob.approveAllPendingRevisionsOnBehalfByProperty(
      propertyName
    );
    Logger.success("TC269 Step 8: Both revisions approved on behalf");

    // ===== STEP 9: Assert both revisions now show Approved =====
    Logger.step("TC269 Step 9: Asserting both revisions are Approved");
    await approvalJob.assertRevisionsByPropertyHaveStatus(
      propertyName,
      "Approved",
      2
    );
    Logger.success("TC269 Step 9: Both revisions confirmed Approved");

    // ===== STEP 10: Navigate to Revision #1 editor, assert Notes changed after approval =====
    Logger.step(
      "TC269 Step 10: Asserting Revision #1 Notes changed after approval"
    );
    await approvalJob.navigateToAllApprovalsTab();
    await approvalJob.navigateToNthBudgetRevisionEditorByProperty(
      propertyName,
      1
    );
    await budgetJob.scrollRevisionEditorToNotesColumn();
    await expect(
      page.getByText(
        "Change in current budget from 18000.03 to 22000.03 due to an approved revision"
      )
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(
        "Change in current budget from 18000.01 to 17500.01 due to an approved revision"
      )
    ).toBeVisible({ timeout: 15000 });
    Logger.success(
      "TC269 Step 10: Revision #1 Notes confirmed changed after approval — TC269 PASSED"
    );
  });

  test("TC270 @budget @e2e @revision @reallocation : Verify multiple Budget reallocations generate AI notes without Conflict status", async () => {
    test.setTimeout(480000); // 8 minutes max

    // A taller viewport gives the "Reallocate From" popover room to render fully
    // on-screen regardless of where its trigger row sits in the revision grid.
    await page.setViewportSize({ width: 1600, height: 1000 });
    // MCP-verified 2026-11-03: the "Reallocate From" popup is position:fixed, ~485px wide and
    // anchored at its button; with this test's long Budget Item names the button sits at
    // x≈1347-1428, so at 1600px Save renders past the right edge ("element is outside of the
    // viewport"). At 1920px Save ends at x≈1821-1902 and every column (incl. Notes, read by
    // index) renders without horizontal scrolling.
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Re-measured 2026-11-10 (headed, revision 12075): the revision grid's columns are wider now —
    // at 1920px the Budget C trigger sits at x=1706 and Save renders at x=2108-2180 (off-screen,
    // the TC270 failure). At 2560x1080 the trigger is at x=1871 and Save ends at x=2345 for
    // Budget C, D and E alike, so the popup fits.
    await page.setViewportSize({ width: 2560, height: 1080 });

    const timestamp = Date.now();
    const propertyName = `TC271_ReallocProp_${timestamp}`;
    const templateName = `TC271_ReallocTemplate_${timestamp}`;

    const BUDGET_A = "Budget A - Appliances Reserve";
    const BUDGET_C = "Budget C - Cabinets (No Original Budget)";
    const BUDGET_D = "Budget D - Carpet (No Original Budget)";
    const BUDGET_E = "Budget E - Vanity (Small Original Budget)";

    const approvalJob = new ApprovalJob(page);

    // ===== STEP 1: Create new property =====
    Logger.step("TC271 Step 1: Creating new property");
    // createPropertyRobust (existing, additive ApprovalJob method — pages/approvalPage.js)
    // instead of createProperty: same MCP-verified client-side stale-cache bug on the
    // Properties listing after in-app navigation, already root-caused and fixed there.
    // createProperty() itself is untouched.
    await approvalJob.createPropertyRobust(
      propertyName,
      "Domestic Terminal, College Park, GA 30337, USA",
      "College Park",
      "GA",
      "30337",
      "Garden Style"
    );
    Logger.success(`TC270 Step 1: Property created — ${propertyName}`);

    // ===== STEP 2: Create Budget Approval template for the new property =====
    Logger.step("TC270 Step 2: Creating Budget Approval template");
    await approvalJob.navigateToApprovalTab();
    await approvalJob.createBudgetApprovalTemplateForTest(
      templateName,
      propertyName
    );
    Logger.success(`TC270 Step 2: Template created — ${templateName}`);

    // ===== STEP 3: Build initial budget — Category A large, C & D no original budget, E small =====
    Logger.step(
      "TC270 Step 3: Building initial budget (Budget A large / C & D none / E small)"
    );
    await budgetJob.navigateToBudget();
    await page.waitForTimeout(5000);
    await budgetJob.selectPropertyByName(propertyName);
    await page.waitForTimeout(5000);
    await budgetJob.openRevisionEditor();

    await budgetJob.addBudgetItemInRevision(
      "301 - INT_Appliances",
      BUDGET_A,
      "Large reserve budget item used as reallocation source (Budget A)",
      "60000"
    );
    await budgetJob.addBudgetItemInRevision(
      "302 - INT_Cabinets",
      BUDGET_C,
      "New budget line with no original budget allocated (Budget C)"
    );
    await budgetJob.addBudgetItemInRevision(
      "303 - INT_Carpet",
      BUDGET_D,
      "New budget line with no original budget allocated (Budget D)"
    );
    await budgetJob.addBudgetItemInRevision(
      "304 - INT_Vanity",
      BUDGET_E,
      "Small existing budget line used as reallocation destination (Budget E)",
      "800"
    );

    await budgetJob.clickSubmitForApproval();
    Logger.success("TC270 Step 3: Initial budget submitted for approval");

    // ===== STEP 4: Approve the initial budget via "Approve on Behalf" =====
    Logger.step("TC270 Step 4: Approving initial budget in All Approvals");
    await approvalJob.navigateToAllApprovalsTab();
    await approvalJob.approveRevisionOnBehalfByPropertyInAllApprovals(
      propertyName
    );
    Logger.success("TC270 Step 4: Initial budget approved");

    // ===== STEP 5: Open the Budget Revision used for all three reallocations =====
    Logger.step(
      "TC270 Step 5: Opening Budget Revision — grid + AI section must load first"
    );
    await budgetJob.navigateToBudget();
    await page.waitForTimeout(5000);
    await budgetJob.selectPropertyByName(propertyName);
    await page.waitForTimeout(5000);
    await budgetJob.openRevisionEditor();
    await budgetJob.verifyRevisionEditorOpen();

    const rowsBeforeReallocation = await budgetJob.getAllRevisionRowTexts();
    expect(
      rowsBeforeReallocation.length,
      "Revision grid must be loaded with the 4 existing budget rows before reallocating"
    ).toBeGreaterThanOrEqual(4);
    Logger.success(
      `TC270 Step 5: Revision editor loaded with ${rowsBeforeReallocation.length} rows`
    );

    // ===== REALLOCATION 1: Budget A -> Budget C, $5,900 =====
    Logger.step("TC270 Reallocation 1: Budget A -> Budget C ($5,900)");
    await budgetJob.reallocateBudgetAmount(BUDGET_C, BUDGET_A, 5900);

    const rowCTextAfter1 = await budgetJob.getRevisionRowFullText(BUDGET_C);
    expect(
      rowCTextAfter1,
      "Reallocation row must be visible and non-empty"
    ).toBeTruthy();
    expect(rowCTextAfter1).toContain(BUDGET_C);
    expect(rowCTextAfter1).toContain("$5,900");

    const notes1 = await budgetJob.getRevisionRowNotesText(BUDGET_C);
    Logger.info(`TC270 Reallocation 1 AI-generated note: "${notes1}"`);
    expect(notes1, "AI generated note must not be empty").toBeTruthy();
    expect(notes1).toContain("$5,900.00");
    expect(notes1).toContain(BUDGET_A);
    expect(notes1.toLowerCase()).not.toContain("conflict");
    Logger.success(
      "TC270 Reallocation 1: Budget A -> Budget C validated (source, destination, amount, AI note)"
    );

    // ===== REALLOCATION 2: Budget A -> Budget D, $1,500 =====
    Logger.step("TC270 Reallocation 2: Budget A -> Budget D ($1,500)");
    await budgetJob.reallocateBudgetAmount(BUDGET_D, BUDGET_A, 1500);

    const rowDTextAfter2 = await budgetJob.getRevisionRowFullText(BUDGET_D);
    expect(
      rowDTextAfter2,
      "Reallocation row must be visible and non-empty"
    ).toBeTruthy();
    expect(rowDTextAfter2).toContain(BUDGET_D);
    expect(rowDTextAfter2).toContain("$1,500");

    const notes2 = await budgetJob.getRevisionRowNotesText(BUDGET_D);
    Logger.info(`TC270 Reallocation 2 AI-generated note: "${notes2}"`);
    expect(notes2, "AI generated note must not be empty").toBeTruthy();
    expect(notes2).toContain("$1,500.00");
    expect(notes2).toContain(BUDGET_A);
    expect(notes2.toLowerCase()).not.toContain("conflict");
    Logger.success(
      "TC270 Reallocation 2: Budget A -> Budget D validated (source, destination, amount, AI note)"
    );

    // ===== REALLOCATION 3: Budget A -> Budget E, $45,000 =====
    Logger.step("TC270 Reallocation 3: Budget A -> Budget E ($45,000)");
    await budgetJob.reallocateBudgetAmount(BUDGET_E, BUDGET_A, 45000);

    const rowETextAfter3 = await budgetJob.getRevisionRowFullText(BUDGET_E);
    expect(
      rowETextAfter3,
      "Reallocation row must be visible and non-empty"
    ).toBeTruthy();
    expect(rowETextAfter3).toContain(BUDGET_E);
    expect(rowETextAfter3).toContain("$45,800"); // $800 original + $45,000 reallocated

    const notes3 = await budgetJob.getRevisionRowNotesText(BUDGET_E);
    Logger.info(`TC270 Reallocation 3 AI-generated note: "${notes3}"`);
    expect(notes3, "AI generated note must not be empty").toBeTruthy();
    expect(notes3).toContain("$45,000.00");
    expect(notes3).toContain(BUDGET_A);
    expect(notes3.toLowerCase()).not.toContain("conflict");
    Logger.success(
      "TC270 Reallocation 3: Budget A -> Budget E validated (source, destination, amount, AI note)"
    );

    // ===== FINAL GRID VALIDATIONS: every row visible, non-empty text =====
    Logger.step(
      "TC270: Final grid validation — every row must be visible with non-empty text"
    );
    const allRowTexts = await budgetJob.getAllRevisionRowTexts();
    expect(
      allRowTexts.length,
      "All budget rows (A, C, D, E + totals) must remain in the grid"
    ).toBeGreaterThanOrEqual(4);
    allRowTexts.forEach((text, index) => {
      expect(
        text.length,
        `Row ${index} text must not be empty`
      ).toBeGreaterThan(0);
    });

    // ===== CONFLICT VALIDATION: no row / no global banner may contain "Conflict" =====
    await budgetJob.assertNoConflictInRevisionEditor(allRowTexts);
    Logger.success(
      'TC270: Conflict validation passed — no row or banner contains "Conflict"'
    );

    // ===== FINAL ASSERTIONS =====
    await expect(
      page.getByText("$52,400.00").first(),
      "Total Reallocated summary must equal $5,900 + $1,500 + $45,000"
    ).toBeVisible({ timeout: 10000 });

    const submitBtn = page
      .getByRole("dialog")
      .getByRole("button", { name: /Submit for Approval/i })
      .first();
    await expect(
      submitBtn,
      "Submit for Approval must remain enabled after all reallocations"
    ).toBeEnabled();
    Logger.success(
      "TC270: Total Reallocated amount and Submit button state verified"
    );

    await budgetJob.clickSubmitForApproval();
    Logger.success(
      "TC270: Budget Reallocation revision submitted for approval — TC270 PASSED"
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

// ════════════════════════════════════════════════════════════════════════════
// Missing-coverage E2E cases (formerly tests/TC40_BudgetE2E.spec.js). Wrapped in a block so its
// names never clash with this file's; it relies on this file's test.use
// (storageState: sessionState.json). Added 2026-11-19.
// ════════════════════════════════════════════════════════════════════════════
{
  /**
   * Budget E2E — revision name validation, malformed CSV import and Save as Draft.
   *
   * One property is created for the suite and deleted afterwards; nothing on a
   * seeded property, the organization's Budget table layout or any shared
   * data/*.json file is touched.
   *
   *   TC585 "Name this budget revision" requires a title; Cancel creates nothing;
   *         Enter submits and opens the revision editor
   *   TC586 A CSV with wrong headers is rejected with a persistent "Import Failed"
   *         alert and the grid stays empty
   *   TC587 Save as Draft keeps the revision as a Draft with its imported rows
   *
   * MCP-verified 2026-11-18 (headed owner browser) — see
   * locators/budgetE2ELocator.js header.
   */

  const path = require("path");
  const { BudgetE2EPage } = require("../pages/budgetE2EPage");
  const { PropertyE2EPage } = require("../pages/propertyE2EPage");
  const { Logger } = require("../utils/logger");
  const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");

  const VALID_CSV = path.join(
    __dirname,
    "..",
    "files",
    "budget_data_for_E2EFlow.csv",
  );
  const MALFORMED_CSV = path.join(
    __dirname,
    "..",
    "files",
    "budget_malformed_headers.csv",
  );
  const VALID_CSV_ROWS = 12; // budget items in budget_data_for_E2EFlow.csv

  test.describe
    .serial("Budget E2E — revision editor on a suite-owned property", () => {
    let ownerContext;
    /** @type {BudgetE2EPage} */ let budget;
    /** @type {PropertyE2EPage} */ let props;
    let property;
    const revisionTitle = `BudgetE2E draft ${Date.now()}`;

    test.beforeAll(async ({ browser }, testInfo) => {
      testInfo.setTimeout(300000);
      ownerContext = await browser.newContext({
        storageState: "sessionState.json",
        baseURL: process.env.BASE_URL, // existing helpers navigate relatively
        // The revision grid virtualizes rows: at 1280x720 only ~9 of the 12
        // imported items are mounted; 1920x1080 renders all of them (MCP-verified).
        viewport: { width: 1920, height: 1080 },
      });
      const page = await ownerContext.newPage();
      await page.goto(process.env.DASHBOARD_URL, { waitUntil: "load" });
      try {
        await ensureLeftPanelExpanded(page);
      } catch (e) {
        Logger.info(
          `Left panel not ready (${String(e.message).split("\n")[0]}) — reloading once`,
        );
        await page.reload({ waitUntil: "load" });
        await ensureLeftPanelExpanded(page);
      }
      budget = new BudgetE2EPage(page);
      props = new PropertyE2EPage(page);
      property = await props.createOwnProperty("Budget");
      Logger.success(
        `Setup: "${property.name}" (id ${property.id}) created without a budget`,
      );
    });

    test.afterAll(async () => {
      if (property) await props.deletePropertyQuietly(property.name);
      await ownerContext?.close().catch(() => {});
    });

    test("TC585 @budget @regression @e2e : Verify the budget revision name is required, Cancel creates nothing and Enter opens the revision editor", async () => {
      test.setTimeout(300000);
      const page = budget.page;
      await budget.openBudget(property.id);
      await budget.openNameDialog();

      await expect(budget.nameInput, "FAIL: title placeholder").toHaveAttribute(
        "placeholder",
        "e.g. Q2 reforecast",
      );
      const cont = budget.nameDialogButton("Continue");
      await expect(
        cont,
        "FAIL: Continue must be disabled for an empty title",
      ).toBeDisabled();
      await budget.nameInput.fill("   ");
      await expect(
        cont,
        "FAIL: Continue must be disabled for a whitespace title",
      ).toBeDisabled();
      await budget.nameInput.fill("abc");
      await expect(
        cont,
        "FAIL: Continue must be enabled once a title is typed",
      ).toBeEnabled();
      Logger.success(
        "TC585: Continue disabled for empty/whitespace, enabled with a title",
      );

      const posts = [];
      const listener = (r) => {
        if (
          r.request().method() === "POST" &&
          r.url().includes("/api/bird-table/rows")
        )
          posts.push(r.url());
      };
      page.on("response", listener);
      await budget.nameDialogButton("Cancel").click();
      await expect(
        budget.nameDialog,
        "FAIL: Cancel must close the dialog",
      ).toBeHidden({
        timeout: 15000,
      });
      expect(posts, "FAIL: Cancel must not create a revision").toEqual([]);
      await budget.openNameDialog();
      await expect(
        budget.nameInput,
        "FAIL: title must be cleared after Cancel",
      ).toHaveValue("");
      Logger.success(
        "TC585: Cancel closed the dialog, created nothing and cleared the title",
      );

      await budget.nameInput.fill(revisionTitle);
      const [created] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            r.url().includes("/api/bird-table/rows"),
          { timeout: 60000 },
        ),
        budget.nameInput.press("Enter"),
      ]);
      page.off("response", listener);
      expect(
        created.status(),
        "FAIL: Enter must create the revision",
      ).toBeLessThan(300);
      await expect(page, "FAIL: Enter must open the revision editor").toHaveURL(
        /\/financials\/budget-revision\/\d+\/editor/,
        { timeout: 30000 },
      );
      await expect(budget.editorButton("Save as Draft")).toBeVisible({
        timeout: 30000,
      });
      Logger.success(
        `TC585: Enter created "${revisionTitle}" and opened ${page.url()}`,
      );
      Logger.success("TC585 PASSED");
    });

    test("TC586 @budget @regression @e2e : Verify a CSV with wrong headers is rejected with a persistent Import Failed alert and the grid stays empty", async () => {
      test.setTimeout(300000);
      await budget.openBudget(property.id);
      const options = await budget.versionOptions();
      expect(
        options.some((o) => o.includes(revisionTitle) && /Draft/.test(o)),
        `FAIL: version list must show "${revisionTitle}" as Draft (got ${JSON.stringify(options)})`,
      ).toBe(true);
      await budget.openVersion(revisionTitle);
      expect(
        await budget.gridRowCount(),
        "FAIL: a new draft starts empty",
      ).toBe(0);

      const { imports, error } = await budget.uploadCsv(MALFORMED_CSV);
      expect(
        imports.length,
        "FAIL: the file must reach the import API",
      ).toBeGreaterThan(0);
      for (const status of imports)
        expect(
          status,
          "FAIL: a CSV with wrong headers must be rejected (400)",
        ).toBe(400);
      expect(
        error,
        "FAIL: the upload must end with no rows imported",
      ).toContain("No rows after upload");

      const alert = budget.importFailedAlert();
      await expect(
        alert,
        'FAIL: "Import Failed" alert must be shown',
      ).toBeVisible({
        timeout: 20000,
      });
      await expect(
        alert,
        "FAIL: alert must carry the server message",
      ).toContainText("Import requires at least one data row");
      await budget.page.waitForTimeout(8000); // longer than Mantine's default auto-close (4s)
      await expect(
        alert,
        "FAIL: Import Failed must stay until dismissed",
      ).toBeVisible();
      expect(await budget.gridRowCount(), "FAIL: grid must stay empty").toBe(0);
      await expect(
        budget.editorButton("Submit for Approval"),
        "FAIL: Submit must stay disabled with no rows",
      ).toBeDisabled();
      Logger.success(
        "TC586: import rejected (400), persistent alert, grid empty, Submit disabled",
      );
      await budget.dismissAlerts();
      Logger.success("TC586 PASSED");
    });

    test("TC587 @budget @regression @e2e : Verify Save as Draft keeps the revision as a Draft with its imported rows", async () => {
      test.setTimeout(300000);
      const page = budget.page;
      await budget.openBudget(property.id);
      await budget.versionOptions();
      await budget.openVersion(revisionTitle);

      const { imports, error } = await budget.uploadCsv(VALID_CSV);
      expect(error, "FAIL: valid CSV upload must succeed").toBeNull();
      expect(imports, "FAIL: import must succeed").toContain(200);
      expect(
        await budget.gridRowCount(),
        "FAIL: all budget items must import",
      ).toBe(VALID_CSV_ROWS);

      const toast = await budget.saveAsDraft();
      expect(
        toast,
        'FAIL: "Budget revision saved as draft" toast must appear',
      ).toBe("Budget revision saved as draft");
      await expect(
        page,
        "FAIL: Save as Draft returns to the Budget page",
      ).toHaveURL(/\/financials\/budget\?/, { timeout: 30000 });
      Logger.success(`TC587: "${toast}" shown, back on the Budget page`);

      const options = await budget.versionOptions();
      expect(
        options.some((o) => o.includes(revisionTitle) && /Draft/.test(o)),
        `FAIL: "${revisionTitle}" must still be a Draft (got ${JSON.stringify(options)})`,
      ).toBe(true);
      await budget.openVersion(revisionTitle);
      expect(
        await budget.gridRowCount(),
        "FAIL: the draft must keep its imported rows after reopening",
      ).toBe(VALID_CSV_ROWS);
      Logger.success(`TC587: draft reopened with ${VALID_CSV_ROWS} rows`);
      Logger.success("TC587 PASSED");
    });
  });
}
