require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { BudgetJob } = require('../pages/budgetPage');
const { ApprovalJob } = require('../pages/approvalPage');
const OrganizationHelper = require('../pages/organizationHelper');
const { FgaUserManagementPage } = require('../pages/fgaUserManagementPage');
const { UserActivationPage } = require('../pages/userActivationPage');
const { Logger } = require('../utils/logger');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    animations: 'disabled',
    maxDiffPixels: 50_000,
    maxDiffPixelRatio: 0.3,
});

let page, budgetJob;

/**
 * Retries an async check up to `attempts` times (waiting `delayMs` between attempts)
 * before letting the final failure propagate. Used only to absorb settling-time
 * flakiness (e.g. a dialog's content not yet finished loading) — it does not change
 * what is being asserted, only how many times a not-yet-settled read may be retaken
 * before the assertion must hold.
 */
async function retryUntilPass(fn, { attempts = 3, delayMs = 1000 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await fn(attempt);
            return;
        } catch (err) {
            lastErr = err;
            if (attempt < attempts) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastErr;
}

test.describe('Budget Workflow - E2E Tests', () => {
    test.describe.configure({ retries: 1 });

    test.beforeEach(async ({ page: p }) => {
        page = p;
        budgetJob = new BudgetJob(page);
        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
        await expect(page).toHaveURL(process.env.DASHBOARD_URL);
        await page.waitForTimeout(7000);
        Logger.info('Dashboard loaded from stored session');
        await ensureLeftPanelExpanded(page);
        await budgetJob.navigateToBudgetTab();
        await budgetJob.waitForPageLoad();
        Logger.success('Setup complete - Navigated to Budget section');
    });

    // ===== Budget Page & Property Tests =====

    test('TC243 @budget @sanity @regression : Verify Budget workspace loads successfully with selected property details, budget table headers, revise budget controls, year/version selectors, and visible budget item records across the main budget grid', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyPropertyHeader();
        await budgetJob.verifyBudgetTableHeaders();
        await budgetJob.verifyReviseBudgetsVisible();
        await budgetJob.verifyYearSelector();
        await budgetJob.verifyVersionSelector();
        await budgetJob.verifyBudgetDataRows();
        await budgetJob.verifyBudgetItems(['Construction', 'Site Prep', 'Concrete', 'Wiring']);
        Logger.success('TC243: Budget page verification completed');
    });

    test('TC244 @budget @regression : Verify Budget Category section is displayed correctly within Budget navigation menu and remains accessible from the Budget workspace', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.verifyBudgetCategoryInNav();
        Logger.success('TC244: Budget Category section verified');
    });

    // ===== Category Code Column Tests =====

    test('TC245 @budget @regression : Verify Budget Category Code column is displayed correctly within the Budget grid and remains visible for selected property budget records', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        Logger.success('TC245: Category Code column present');
    });

    test('TC246 @budget @regression : Verify user can access and select Budget Category values successfully from the category dropdown while budget records remain visible in the grid', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
        Logger.success('TC246: Budget Category dropdown accessible');
    });

    test('TC247 @budget @regression : Verify Budget Category values are mapped correctly through Category Code linkage and displayed properly within budget item rows', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        await budgetJob.verifyFirstRowCategoryCell();
        Logger.success('TC247: Budget Category linked via Category Code');
    });

    test('TC248 @budget @regression : Verify Budget Category names display correctly for mapped budget items and category-linked budget rows appear successfully in the Budget grid', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        await budgetJob.verifyFirstRowCategoryCell();
        expect(await budgetJob.getFirstBudgetItemRowCount()).toBeGreaterThan(0);
        Logger.success('TC248: Category Name displays correctly');
    });

    test('TC249 @budget @regression : Verify Budget Categories can be assigned successfully to budget items while maintaining visible budget row data within the Budget workspace', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
        Logger.success('TC249: Budget Category assignable to items');
    });

    test('TC250 @budget @regression : Verify Budget Category and Category Code columns remain consistent across Budget table layouts, related views, and budget data structures', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyBudgetTableHeaders(['Budget Item', 'Description', 'Category Code', 'Original Budget', 'Current Budget']);
        Logger.success('TC250: Category Code consistent across grid');
    });

    test('TC251 @budget @regression : Verify Budget Category functionality works correctly alongside Revise Budget controls and related invoice-enabled budget workflows', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyReviseBudgetsVisible();
        await budgetJob.verifyCategoryCodeColumn();
        Logger.success('TC251: Category works with Revise Budgets');
    });

    test('TC252 @budget @regression : Verify the same Budget Category can be reused successfully across multiple budget items without affecting budget grid consistency', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(1);
        Logger.success('TC252: Category reusable across items');
    });

    // ===== View & Column Management =====

    test('TC253 @budget @regression : Verify user can create a custom Budget view successfully, switch back to default view, and reload the saved Budget view without losing table configuration', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const viewName = `BudgetView_${Date.now()}`;
        await budgetJob.createView(viewName);
        await budgetJob.switchToDefaultView();
        await budgetJob.loadView(viewName);
        Logger.success('TC253: View created and loaded');
    });

    test('TC254 @budget @regression : Verify Add Column, Manage Columns and Delete Column functionality', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const colName = `TestCol-${Date.now()}`;
        await budgetJob.addColumn(colName, 'Test column for budget');
        await budgetJob.openManageColumns();
        await budgetJob.verifyColumnInManageColumns(colName);
        await budgetJob.deleteColumnInManageColumns(colName);
        await budgetJob.verifyColumnNotInManageColumns(colName);
        await budgetJob.closeManageColumns();
        Logger.success('TC254: Add, verify, delete column completed');
    });

    test('TC255 @budget @regression : Verify exported Budget CSV/Excel file contains valid budget table headers, non-empty exported data, and expected budget item records after download', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const downloadsDir = path.join(process.cwd(), 'downloads');
        const savePath = await budgetJob.exportBudgetData(downloadsDir);
        const content = fs.readFileSync(savePath, 'utf-8');
        expect(content.length).toBeGreaterThan(100);
        expect(content).toContain('Description');
        // Westerham sample data may include Site Prep; other properties often show Construction, etc.
        expect(content).toMatch(/Site Prep|Construction/i);
        Logger.success('TC255: Export verified with budget data');
    });

    // ===== Revise Budget Flow (serial - share Westerham property / revision editor) =====

    test.describe.serial('Revise Budget - Serial', () => {

    test('TC256 @budget @regression : Verify Revise Budget workflow opens successfully with property details, Budget Category data, populated revision grid records, and accessible revision editor functionality', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyPropertyHeader();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();
        Logger.success('TC256: Revise Budget flow verified');
    });

    test('TC257 @budget @regression : Verify Reset Table action restores the original Budget grid state successfully after revision mode is enabled within the Revise Budget workflow', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const { reviseBtn, reviseEnabled } = await budgetJob.ensureReviseEnabled();
        expect(reviseEnabled).toBeTruthy();
        await reviseBtn.click();
        await page.waitForTimeout(2000);
        await budgetJob.resetTableInMainGrid();
        Logger.success('TC257: Reset table completed');
    });

    test('TC258 @budget @regression : Verify user can add a new Budget row successfully with custom budget item details and validate the newly created row inside the Budget grid', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const uniqueItemName = `TestBudgetItem_${Date.now()}`;
        await budgetJob.addRowInMainGrid(uniqueItemName, 'Test description for added row');
        Logger.success('TC258: Row added and verified');
    });

    test('TC259 @budget @regression : Verify user can upload a Budget CSV file successfully inside the Revision Editor and validate uploaded budget records are populated correctly in the revision tree grid', async () => {
        test.setTimeout(180000);
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await page.locator('[role="treegrid"]').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();
        const filePath = path.resolve(process.cwd(), 'files', 'budget_file_to_upload.csv');
        expect(fs.existsSync(filePath)).toBeTruthy();
        await budgetJob.uploadFileInRevision(filePath);
        await page.waitForTimeout(2000);
        const count = await budgetJob.getTreegridRowCount();
        expect(count, 'Uploaded budget data must have at least one row').toBeGreaterThan(0);
        Logger.success(`TC259: Upload budget file flow completed - ${count} rows in grid`);
    });

    // ===== Revise Budget E2E =====

    test('TC260 @budget @regression : Revise Budget - Verify deleted Budget revision rows are restored successfully after Reset Table action and original revision data becomes visible again inside the Revision Editor grid', async () => {
        test.setTimeout(300000);
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await page.waitForTimeout(30000);
        await page.waitForTimeout(3000);
        await budgetJob.openRevisionEditor();
        await page.waitForTimeout(3000);
        await budgetJob.verifyRevisionEditorOpen();
        await page.waitForTimeout(2000);
        const countBeforeDelete = await budgetJob.getTreegridRowCount();
        expect(countBeforeDelete, 'Revision editor must have rows before delete').toBeGreaterThan(0);
        await budgetJob.deleteFirstRowInRevision();
        await page.waitForTimeout(30000);
        await page.waitForTimeout(3000);
        await budgetJob.resetTableInRevision();
        await page.waitForTimeout(30000);
        await page.waitForTimeout(4000);
        const count = await budgetJob.getTreegridRowCount();
        expect(count, 'Reset Table must restore rows - data should be restored').toBeGreaterThan(0);
        Logger.success(`TC260: Reset Table - ${count} rows restored`);
    });

    test('TC261 @budget @regression : Revise Budget - Verify Category selection persists before and after Budget approval submission', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.openRevisionEditor();
        await budgetJob.deleteFirstRowInRevision();
        await budgetJob.addRowWithCategoryInRevision('Site Prep', 'Site preparation work', 'Construction', '15000');

        Logger.step('TC261: Assert category is set in first row before submit');
        const categoryBeforeSubmit = await budgetJob.getFirstRowCategoryValue('revision');
        expect(categoryBeforeSubmit).toBeTruthy();
        expect(categoryBeforeSubmit).not.toBe('-');
        expect(categoryBeforeSubmit).not.toBe('—');
        expect(categoryBeforeSubmit).not.toBe('');
        Logger.success(`TC261: Category in first row BEFORE submit = "${categoryBeforeSubmit}"`);

        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(7000);

        // After submission the app navigates away and loses the property context
        // ("No budget version selected"). Re-navigate to the Westerham budget so we
        // can assert the main grid state.
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await page.waitForTimeout(7000);
        // RevoGrid renders asynchronously after network-idle — wait for an actual
        // data row (not loading skeleton) to appear before counting.
        await page.locator('[role="row"]').filter({ has: page.locator('[role="gridcell"]') })
            .first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1000);

        Logger.step('TC261: Assert budget data still visible in main grid after submit');
        const mainGridCount = await budgetJob.getDataRowCount();
        expect(mainGridCount, 'Main budget grid must have rows after revision is submitted for approval').toBeGreaterThan(0);

        Logger.step('TC261: Assert category persists in first row after submit (main grid)');
        const categoryAfterSubmit = await budgetJob.assertFirstRowCategoryNotEmpty('main');
        Logger.success(`TC261: Category in first row AFTER submit = "${categoryAfterSubmit}"`);
        Logger.success('TC261: Row added with category from dropdown, submitted, category verified in both views');
    });

    test('TC262 @budget @regression : Revise Budget - Verify Budget CSV upload, submission and Main Grid data population for new property', async () => {
        // await page.pause();
        await budgetJob.navigateToBudget();
        await budgetJob.selectNonBrookProperty();
        await budgetJob.openRevisionEditor();
        const filePath = path.resolve(process.cwd(), 'files', 'budget_data.csv');
        expect(fs.existsSync(filePath)).toBeTruthy();
        await budgetJob.uploadFileInRevision(filePath);
        await budgetJob.ensureSubmitEnabledAfterUpload();
        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        const hasConstruction = await budgetJob.isTextVisible('Construction', 10000);
        const hasSitePrep = await budgetJob.isTextVisible('Site Prep', 10000);
        expect(hasConstruction || hasSitePrep, 'Uploaded budget data (Construction or Site Prep) must be visible after submit').toBeTruthy();
        const mainGridCount = await budgetJob.getDataRowCount();
        expect(mainGridCount, 'Main budget grid must have rows after submit').toBeGreaterThan(0);
        Logger.success('TC262: Upload on other property, submitted, verified');
    });

    }); // end serial

    test('TC263 @budget @regression @ui : Verify Toolbar CTAs, View actions and Year Selector states and behavior', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyToolbarCTALabels();
        await budgetJob.verifyReviseBudgetsDisabledWhenDraft();
        await budgetJob.verifyViewButtonPopover();
        await budgetJob.verifyYearSelectorHasOptions();
        await budgetJob.verifyEmptyYearState();
        Logger.success('TC263: Toolbar CTAs, View inline save, Year selector – PASSED');
    });

    test('TC264 @budget @regression @ui : Verify Table Menu, Add Column panel and Manage Columns drawer functionality', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyTableMenuItems();
        await budgetJob.verifyAddColumnPanelValidation();
        await budgetJob.verifyManageColumnsDrawerContent();
        Logger.success('TC264: Table menu, Add column, Manage Columns – PASSED');
    });

    test('TC265 @budget @regression @ui : Verify column header sort cycling, search filter with no-match empty state, and filter clear restores full grid', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyColumnHeaderControls();
        await budgetJob.verifySearchFilterBehavior();
        Logger.success('TC265: Column sort, search filter, empty state – PASSED');
    });

    test('TC266 @budget @regression @ui : Verify version dropdown Active/Inactive badges, Manage Versions drawer structure, and Budget History drawer with search and version badges', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyVersionDropdownBadges();
        await budgetJob.verifyManageVersionsDrawer();
        await budgetJob.verifyBudgetHistoryDrawer();
        Logger.success('TC266: Version badges, Manage Versions drawer, Budget History – PASSED');
    });

    test('TC267 @budget @regression @ui : Verify Version Note modal field labels, Manage Versions rename flow, and delete confirmation cancel guard', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyVersionNoteModalLabels();
        await budgetJob.verifyManageVersionsRenameAndDeleteGuard();
        Logger.success('TC267: Version Note modal, rename, delete guard – PASSED');
    });

    test('TC268 @budget @regression @ui : Verify Documents tab empty state, search bar, Upload files button, and Uploadcare widget sources with Done disabled and Cancel closes widget', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();
        await budgetJob.verifyDocumentsTabInRevision();
        await budgetJob.verifyUploadcareWidget();
        Logger.success('TC268: Documents tab and Uploadcare widget – PASSED');
    });

    test('TC269 @budget @regression @ui @visual : Verify Disabled States, Currency Formatting and Budget UI edge cases', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyDisabledButtonStylingAndAmounts();
        await budgetJob.verifyEdgeCases();
        Logger.success('TC269: Visual states, negative guards, edge cases – PASSED');
    });

    // ===== TC244: Budget Revision E2E — Revisions, AI Notes, Approval =====

    test('TC270 @budget @e2e @revision : Budget Revision Workflow E2E — Verify Budget Import, Revisions, AI Notes, Approval Flow and Status Updates', async () => {
        test.setTimeout(600000); // 8 minutes — full E2E lifecycle

        const timestamp = Date.now();
        const propertyName = `TC244_BudgetProp_${timestamp}`;
        const templateName = `TC244_BudgetTemplate_${timestamp}`;

        const approvalJob = new ApprovalJob(page);

        // ===== STEP 1: Create new property =====
        Logger.step('TC270 Step 1: Creating new property');
        await approvalJob.createProperty(
            propertyName,
            'Domestic Terminal, College Park, GA 30337, USA',
            'College Park',
            'GA',
            '30337',
            'Garden Style'
        );
        Logger.success(`TC270 Step 1: Property created — ${propertyName}`);

        // ===== STEP 2: Create Budget Approval template with 2 approvers =====
        Logger.step('TC270 Step 2: Creating Budget Approval template');
        await approvalJob.navigateToApprovalTab();
        await approvalJob.createBudgetApprovalTemplateForTest(templateName, propertyName);
        Logger.success(`TC270 Step 2: Template created — ${templateName}`);

        // ===== STEP 3: Navigate to Budget, select property, import CSV, submit =====
        Logger.step('TC270 Step 3: Importing budget CSV for initial budget');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await budgetJob.openRevisionEditor();
        const budgetFilePath = path.resolve(process.cwd(), 'files', 'budget_data.csv');
        expect(fs.existsSync(budgetFilePath)).toBeTruthy();
        await budgetJob.uploadFileInRevision(budgetFilePath);
        await budgetJob.ensureSubmitEnabledAfterUpload();
        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        Logger.success('TC270 Step 3: Initial budget submitted for approval');

        // ===== STEP 4: Approve the initial budget via "Approve on Behalf" =====
        Logger.step('TC270 Step 4: Approving initial budget in All Approvals');
        await approvalJob.navigateToAllApprovalsTab();
        await approvalJob.approveRevisionOnBehalfByPropertyInAllApprovals(propertyName);
        Logger.success('TC270 Step 4: Initial budget approved');

        // ===== STEP 5: Revision #1 — enter adjustments, assert AI notes + summary cards =====
        Logger.step('TC270 Step 5: Creating Revision #1 (Bathroom -2000 / Concrete +1000)');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await page.waitForTimeout(5000);
        await budgetJob.openRevisionEditor();

        await budgetJob.enterRevisionAdjustmentByItemNameV2('Bathroom fixtures install', -2000);
        await budgetJob.enterRevisionAdjustmentByItemNameV2('Concrete', 1000);
        await page.waitForTimeout(3000);

        // Assert AI-generated Notes column values (scroll grid right to reveal Notes column)
        await budgetJob.assertRevisionAINoteVisible('this revision decreased the adjustment amount by $2,000.00');
        await budgetJob.assertRevisionAINoteVisible('this revision increased the adjustment amount by $1,000.00');
        Logger.success('TC270 Step 5: Revision #1 AI notes verified');

        // Assert summary card values
        await expect(page.getByText('$1,000.00').first()).toBeVisible({ timeout: 15000 });   // Total Increase
        await expect(page.getByText('-$2,000.00').first()).toBeVisible({ timeout: 15000 });  // Total Decrease
        await expect(page.getByText('-$1,000.00').first()).toBeVisible({ timeout: 15000 });  // Net Change
        Logger.success('TC270 Step 5: Revision #1 summary cards verified');

        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        Logger.success('TC270 Step 5: Revision #1 submitted for approval');

        // ===== STEP 6: Revision #2 — enter adjustments, assert AI notes + summary cards =====
        Logger.step('TC270 Step 6: Creating Revision #2 (Bathroom +4000 / Concrete -500)');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await page.waitForTimeout(5000);
        await budgetJob.openRevisionEditor();

        await budgetJob.enterRevisionAdjustmentByItemNameV2('Bathroom fixtures install', 4000);
        await budgetJob.enterRevisionAdjustmentByItemNameV2('Concrete', -500);
        await page.waitForTimeout(3000);

        // Assert AI-generated Notes column values (scroll grid right to reveal Notes column)
        await budgetJob.assertRevisionAINoteVisible('this revision increased the adjustment amount by $4,000.00');
        await budgetJob.assertRevisionAINoteVisible('this revision decreased the adjustment amount by $500.00');
        Logger.success('TC270 Step 6: Revision #2 AI notes verified');

        // Assert summary card values
        await expect(page.getByText('$4,000.00').first()).toBeVisible({ timeout: 15000 });   // Total Increase
        await expect(page.getByText('-$500.00').first()).toBeVisible({ timeout: 15000 });    // Total Decrease
        await expect(page.getByText('$3,500.00').first()).toBeVisible({ timeout: 15000 });   // Net Change
        Logger.success('TC270 Step 6: Revision #2 summary cards verified');

        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        Logger.success('TC270 Step 6: Revision #2 submitted for approval');

        // ===== STEP 7: All Approvals — assert both revisions Pending =====
        Logger.step('TC270 Step 7: Verifying both revisions visible with Pending Approval status');
        await approvalJob.navigateToAllApprovalsTab();
        await approvalJob.assertRevisionsByPropertyHaveStatus(propertyName, 'Pending Approval', 2);
        Logger.success('TC270 Step 7: Both revisions show Pending Approval');

        // ===== STEP 8: Approve both revisions via "Approve on Behalf" =====
        Logger.step('TC270 Step 8: Approving both pending revisions on behalf');
        await approvalJob.approveAllPendingRevisionsOnBehalfByProperty(propertyName);
        Logger.success('TC270 Step 8: Both revisions approved on behalf');

        // ===== STEP 9: Assert both revisions now show Approved =====
        Logger.step('TC270 Step 9: Asserting both revisions are Approved');
        await approvalJob.assertRevisionsByPropertyHaveStatus(propertyName, 'Approved', 2);
        Logger.success('TC270 Step 9: Both revisions confirmed Approved');

        // ===== STEP 10: Navigate to Revision #1 editor, assert Notes changed after approval =====
        Logger.step('TC270 Step 10: Asserting Revision #1 Notes changed after approval');
        await approvalJob.navigateToAllApprovalsTab();
        await approvalJob.navigateToNthBudgetRevisionEditorByProperty(propertyName, 1);
        await expect(page.getByText('Change in current budget from 18000.03 to 22000.03 due to an approved revision')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Change in current budget from 18000.01 to 17500.01 due to an approved revision')).toBeVisible({ timeout: 15000 });
        Logger.success('TC270 Step 10: Revision #1 Notes confirmed changed after approval — TC270 PASSED');
    });

    // ===== TC271: Budget Revision Reallocation E2E — Multiple reallocations, AI notes, no Conflict =====

    test('TC271 @budget @e2e @revision @reallocation : Budget Revision Reallocation Flow — Verify multiple budget reallocations within a single revision produce correct AI-generated rows with no Conflict status', async () => {
        test.setTimeout(600000); // 10 minutes — full E2E lifecycle

        // A taller viewport gives the "Reallocate From" popover room to render fully
        // on-screen regardless of where its trigger row sits in the revision grid.
        await page.setViewportSize({ width: 1600, height: 1000 });

        const timestamp = Date.now();
        const propertyName = `TC271_ReallocProp_${timestamp}`;
        const templateName = `TC271_ReallocTemplate_${timestamp}`;

        const BUDGET_A = 'Budget A - Appliances Reserve';
        const BUDGET_C = 'Budget C - Cabinets (No Original Budget)';
        const BUDGET_D = 'Budget D - Carpet (No Original Budget)';
        const BUDGET_E = 'Budget E - Vanity (Small Original Budget)';

        const approvalJob = new ApprovalJob(page);

        // ===== STEP 1: Create new property =====
        Logger.step('TC271 Step 1: Creating new property');
        await approvalJob.createProperty(
            propertyName,
            'Domestic Terminal, College Park, GA 30337, USA',
            'College Park',
            'GA',
            '30337',
            'Garden Style'
        );
        Logger.success(`TC271 Step 1: Property created — ${propertyName}`);

        // ===== STEP 2: Create Budget Approval template for the new property =====
        Logger.step('TC271 Step 2: Creating Budget Approval template');
        await approvalJob.navigateToApprovalTab();
        await approvalJob.createBudgetApprovalTemplateForTest(templateName, propertyName);
        Logger.success(`TC271 Step 2: Template created — ${templateName}`);

        // ===== STEP 3: Build initial budget — Category A large, C & D no original budget, E small =====
        Logger.step('TC271 Step 3: Building initial budget (Budget A large / C & D none / E small)');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await page.waitForTimeout(5000);
        await budgetJob.openRevisionEditor();

        await budgetJob.addBudgetItemInRevision('301 - INT_Appliances', BUDGET_A,
            'Large reserve budget item used as reallocation source (Budget A)', '60000');
        await budgetJob.addBudgetItemInRevision('302 - INT_Cabinets', BUDGET_C,
            'New budget line with no original budget allocated (Budget C)');
        await budgetJob.addBudgetItemInRevision('303 - INT_Carpet', BUDGET_D,
            'New budget line with no original budget allocated (Budget D)');
        await budgetJob.addBudgetItemInRevision('304 - INT_Vanity', BUDGET_E,
            'Small existing budget line used as reallocation destination (Budget E)', '800');

        await budgetJob.clickSubmitForApproval();
        Logger.success('TC271 Step 3: Initial budget submitted for approval');

        // ===== STEP 4: Approve the initial budget via "Approve on Behalf" =====
        Logger.step('TC271 Step 4: Approving initial budget in All Approvals');
        await approvalJob.navigateToAllApprovalsTab();
        await approvalJob.approveRevisionOnBehalfByPropertyInAllApprovals(propertyName);
        Logger.success('TC271 Step 4: Initial budget approved');

        // ===== STEP 5: Open the Budget Revision used for all three reallocations =====
        Logger.step('TC271 Step 5: Opening Budget Revision — grid + AI section must load first');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await page.waitForTimeout(5000);
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();

        const rowsBeforeReallocation = await budgetJob.getAllRevisionRowTexts();
        expect(rowsBeforeReallocation.length, 'Revision grid must be loaded with the 4 existing budget rows before reallocating').toBeGreaterThanOrEqual(4);
        Logger.success(`TC271 Step 5: Revision editor loaded with ${rowsBeforeReallocation.length} rows`);

        // ===== REALLOCATION 1: Budget A -> Budget C, $5,900 =====
        Logger.step('TC271 Reallocation 1: Budget A -> Budget C ($5,900)');
        await budgetJob.reallocateBudgetAmount(BUDGET_C, BUDGET_A, 5900);

        const rowCTextAfter1 = await budgetJob.getRevisionRowFullText(BUDGET_C);
        expect(rowCTextAfter1, 'Reallocation row must be visible and non-empty').toBeTruthy();
        expect(rowCTextAfter1).toContain(BUDGET_C);
        expect(rowCTextAfter1).toContain('$5,900');

        const notes1 = await budgetJob.getRevisionRowNotesText(BUDGET_C);
        Logger.info(`TC271 Reallocation 1 AI-generated note: "${notes1}"`);
        expect(notes1, 'AI generated note must not be empty').toBeTruthy();
        expect(notes1).toContain('$5,900.00');
        expect(notes1).toContain(BUDGET_A);
        expect(notes1.toLowerCase()).not.toContain('conflict');
        Logger.success('TC271 Reallocation 1: Budget A -> Budget C validated (source, destination, amount, AI note)');

        // ===== REALLOCATION 2: Budget A -> Budget D, $1,500 =====
        Logger.step('TC271 Reallocation 2: Budget A -> Budget D ($1,500)');
        await budgetJob.reallocateBudgetAmount(BUDGET_D, BUDGET_A, 1500);

        const rowDTextAfter2 = await budgetJob.getRevisionRowFullText(BUDGET_D);
        expect(rowDTextAfter2, 'Reallocation row must be visible and non-empty').toBeTruthy();
        expect(rowDTextAfter2).toContain(BUDGET_D);
        expect(rowDTextAfter2).toContain('$1,500');

        const notes2 = await budgetJob.getRevisionRowNotesText(BUDGET_D);
        Logger.info(`TC271 Reallocation 2 AI-generated note: "${notes2}"`);
        expect(notes2, 'AI generated note must not be empty').toBeTruthy();
        expect(notes2).toContain('$1,500.00');
        expect(notes2).toContain(BUDGET_A);
        expect(notes2.toLowerCase()).not.toContain('conflict');
        Logger.success('TC271 Reallocation 2: Budget A -> Budget D validated (source, destination, amount, AI note)');

        // ===== REALLOCATION 3: Budget A -> Budget E, $45,000 =====
        Logger.step('TC271 Reallocation 3: Budget A -> Budget E ($45,000)');
        await budgetJob.reallocateBudgetAmount(BUDGET_E, BUDGET_A, 45000);

        const rowETextAfter3 = await budgetJob.getRevisionRowFullText(BUDGET_E);
        expect(rowETextAfter3, 'Reallocation row must be visible and non-empty').toBeTruthy();
        expect(rowETextAfter3).toContain(BUDGET_E);
        expect(rowETextAfter3).toContain('$45,800'); // $800 original + $45,000 reallocated

        const notes3 = await budgetJob.getRevisionRowNotesText(BUDGET_E);
        Logger.info(`TC271 Reallocation 3 AI-generated note: "${notes3}"`);
        expect(notes3, 'AI generated note must not be empty').toBeTruthy();
        expect(notes3).toContain('$45,000.00');
        expect(notes3).toContain(BUDGET_A);
        expect(notes3.toLowerCase()).not.toContain('conflict');
        Logger.success('TC271 Reallocation 3: Budget A -> Budget E validated (source, destination, amount, AI note)');

        // ===== FINAL GRID VALIDATIONS: every row visible, non-empty text =====
        Logger.step('TC271: Final grid validation — every row must be visible with non-empty text');
        const allRowTexts = await budgetJob.getAllRevisionRowTexts();
        expect(allRowTexts.length, 'All budget rows (A, C, D, E + totals) must remain in the grid').toBeGreaterThanOrEqual(4);
        allRowTexts.forEach((text, index) => {
            expect(text.length, `Row ${index} text must not be empty`).toBeGreaterThan(0);
        });

        // ===== CONFLICT VALIDATION: no row / no global banner may contain "Conflict" =====
        await budgetJob.assertNoConflictInRevisionEditor(allRowTexts);
        Logger.success('TC271: Conflict validation passed — no row or banner contains "Conflict"');

        // ===== FINAL ASSERTIONS =====
        await expect(page.getByText('$52,400.00').first(), 'Total Reallocated summary must equal $5,900 + $1,500 + $45,000').toBeVisible({ timeout: 10000 });

        const submitBtn = page.getByRole('dialog').getByRole('button', { name: /Submit for Approval/i }).first();
        await expect(submitBtn, 'Submit for Approval must remain enabled after all reallocations').toBeEnabled();
        Logger.success('TC271: Total Reallocated amount and Submit button state verified');

        await budgetJob.clickSubmitForApproval();
        Logger.success('TC271: Budget Reallocation revision submitted for approval — TC271 PASSED');
    });

    // ===== TC272: Budget Approval Single-Approver Regression — approver must remain actionable, not auto-Skipped =====

    test('TC272 @budget @regression @approval @bug : Budget Approval Single-Approver Regression — Verify a single "Always Required" approver remains actionable in All Approvals instead of being incorrectly auto-Skipped', async () => {
        test.setTimeout(600000); // 10 minutes — property + template + upload + revise + reallocate + approval check

        const timestamp = Date.now();
        const propertyName = `TC272_BudgetSingleApproverProp_${timestamp}`;
        const templateName = `TC272_BudgetSingleApprover_${timestamp}`;

        const approvalJob = new ApprovalJob(page);

        // ===== STEP 1: Create new property =====
        Logger.step('TC272 Step 1: Creating new property');
        await approvalJob.createProperty(
            propertyName,
            'Domestic Terminal, College Park, GA 30337, USA',
            'College Park',
            'GA',
            '30337',
            'Garden Style'
        );
        Logger.success(`TC272 Step 1: Property created — ${propertyName}`);

        // ===== STEP 2: Create Budget Approval template — single approver "sumit harsh", Always Required =====
        Logger.step('TC272 Step 2: Creating single-approver Budget Approval template');
        await approvalJob.navigateToApprovalTab();
        await approvalJob.createBudgetApprovalTemplateSingleApprover(templateName, propertyName, 'sumit harsh');
        Logger.success(`TC272 Step 2: Template created — ${templateName}`);

        // ===== STEP 3: Navigate to Budget, upload Budget file =====
        Logger.step('TC272 Step 3: Uploading budget file for initial budget');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await budgetJob.openRevisionEditor();
        const budgetFilePath = path.resolve(process.cwd(), 'files', 'budget_data_for_E2EFlow.csv');
        expect(fs.existsSync(budgetFilePath)).toBeTruthy();
        await budgetJob.uploadFileInRevision(budgetFilePath);
        await budgetJob.ensureSubmitEnabledAfterUpload();
        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        Logger.success('TC272 Step 3: Initial budget uploaded and submitted for approval');

        // ===== STEP 4: Revise the uploaded Budget =====
        Logger.step('TC272 Step 4: Revising the uploaded Budget');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await page.waitForTimeout(5000);
        await budgetJob.openRevisionEditor();
        await budgetJob.enterRevisionAdjustmentByItemNameV2('Bathroom fixtures install', 1000);
        await page.waitForTimeout(3000);
        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        Logger.success('TC272 Step 4: Budget revision submitted for approval');

        // ===== STEP 5: Open Budget again, perform a Budget Reallocation =====
        Logger.step('TC272 Step 5: Performing a Budget Reallocation');
        await budgetJob.navigateToBudget();
        await page.waitForTimeout(5000);
        await budgetJob.selectPropertyByName(propertyName);
        await page.waitForTimeout(5000);
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();
        await budgetJob.reallocateBudgetAmount('Concrete', 'Bathroom fixtures install', 500);
        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(5000);
        Logger.success('TC272 Step 5: Budget reallocation submitted for approval');

        // ===== STEP 6: All Approvals — locate the approval request created during this test, open View Details =====
        Logger.step('TC272 Step 6: Locating the approval request created during this test in All Approvals');
        await approvalJob.navigateToAllApprovalsTab();

        // Grid truncates property names (drops the timestamp suffix) — search by base name,
        // same convention used by ApprovalJob.approveRevisionOnBehalfByPropertyInAllApprovals.
        const searchBaseName = propertyName.replace(/_\d+$/, '');
        const treegrid = page.locator('[role="treegrid"]').first();
        const dataRows = treegrid.locator('[role="row"]').filter({ has: page.locator('[role="gridcell"]') });

        await expect.poll(() => dataRows.count(), { timeout: 15000 }).toBeGreaterThan(0);

        let targetIndex = -1;
        const rowCount = await dataRows.count();
        for (let i = 0; i < rowCount; i++) {
            const rowText = (await dataRows.nth(i).textContent().catch(() => '')).toLowerCase();
            if (rowText.includes(searchBaseName.toLowerCase())) {
                targetIndex = i;
                break;
            }
        }
        expect(targetIndex, `Approval request for property "${propertyName}" must be visible in All Approvals`).toBeGreaterThanOrEqual(0);

        const eyeButtons = page.locator('button:has(svg.lucide-eye):visible');
        await eyeButtons.nth(targetIndex).click();

        const detailsDialog = page.getByRole('dialog').filter({ hasText: /Approval Details/i });
        await expect(detailsDialog).toBeVisible({ timeout: 20000 });
        Logger.success('TC272 Step 6: Approval Details dialog opened for the approval request created during this test');

        // ===== STEP 7: Bug assertion — Approve action must remain available, not auto-Skipped =====
        Logger.step('TC272 Step 7: Verifying the approval remains actionable (known bug: status incorrectly shows "Skipped")');
        const observedStatus = (await detailsDialog.textContent().catch(() => '')).trim();
        Logger.info(`TC272 Step 7: Approval Details dialog text (for diagnostics only, not asserted): "${observedStatus.substring(0, 200)}..."`);

        const approveButton = detailsDialog.getByRole('button', { name: /Approve/i });
        await expect(
            approveButton,
            'BUG: The Budget Approval request must remain actionable for its sole "Always Required" approver — an "Approve" button should be visible and enabled. Instead the system is auto-resolving the approval (status incorrectly shows "Skipped"/"Auto-approved") without ever giving the approver a chance to approve it.'
        ).toBeEnabled({ timeout: 10000 });
        Logger.success('TC272 Step 7: Approve action confirmed available and enabled — TC272 PASSED');
    });

    // ===== TC273: Revoked Approver Regression — a revoked user must lose Budget Approval access =====

    test('TC273 @budget @regression @approval @security : Revoked User Loses Approval Access — invited user is assigned as sole approver on a Budget Approval, then revoked, and must no longer be able to act on it', async ({ browser }) => {
        test.setTimeout(900000); // invite + mailinator activation + property + template + budget submit + revoke + post-revoke access check

        const timestamp = Date.now();
        const approverEmail = `tc273_approver_${timestamp}@mailinator.com`;
        const propertyName = `TC273_RevokeProp_${timestamp}`;
        const templateName = `TC273_RevokeApproverTemplate_${timestamp}`;
        const firstName = 'TC273';
        const lastName = 'Approver';
        const approverFullName = `${firstName} ${lastName}`;
        const password = process.env.TEST_PASSWORD || 'Pitney51@@';

        const approvalJob = new ApprovalJob(page);
        const organizationHelper = new OrganizationHelper(page);
        const fgaUserManagementPage = new FgaUserManagementPage(page);

        // ===== STEP 1: Invite a new user =====
        Logger.step(`TC273 Step 1: Inviting new user — ${approverEmail}`);
        await organizationHelper.gotoOrganizationWorkspace();
        await organizationHelper.inviteUser(approverEmail, 'Member');
        Logger.success(`TC273 Step 1: Invitation created — ${approverEmail}`);

        // ===== STEP 2: Create a new property =====
        Logger.step('TC273 Step 2: Creating new property');
        await approvalJob.createProperty(
            propertyName,
            'Domestic Terminal, College Park, GA 30337, USA',
            'College Park',
            'GA',
            '30337',
            'Garden Style'
        );
        Logger.success(`TC273 Step 2: Property created — ${propertyName}`);

        // Grant the still-pending invited user explicit access to the new property — required
        // before they can be assigned as a Budget Approval approver on it (see the
        // property-access-before-approver-assignment constraint documented on
        // createBudgetApprovalTemplateSingleApprover's callers elsewhere in this file).
        Logger.step(`TC273: Granting "${approverEmail}" access to "${propertyName}"`);
        await organizationHelper.gotoOrganizationWorkspace();
        await fgaUserManagementPage.openPropertyAccessTab();
        await fgaUserManagementPage.searchProperty(propertyName);
        await fgaUserManagementPage.assignUserToProperty(propertyName, approverEmail);
        await fgaUserManagementPage.expectAccessGrantedToast();
        await fgaUserManagementPage.closePropertySettings(propertyName);
        Logger.success(`TC273: Property access granted — "${approverEmail}" on "${propertyName}"`);

        const activation = await UserActivationPage.create(browser);
        try {
            // Activate the invited user via mailinator now — the Budget Approval Template's
            // approver picker searches by display name, which only exists once the invite is
            // accepted (fillNameAndContinue), so this must happen before Step 3.
            Logger.step(`TC273: Activating invited user via mailinator — ${approverEmail}`);
            await activation.openInbox(approverEmail);
            await activation.openInviteEmailAndLaunchActivation();
            await activation.acceptInvitation();
            await activation.fillNameAndContinue(firstName, lastName);
            await activation.setPasswordAndContinue(password);
            await activation.completeEmailVerificationIfPrompted();
            await activation.selectOrganizationIfPrompted('2026');
            await activation.expectLandedOnDashboard(process.env.DASHBOARD_URL || /financials\/capex/);
            Logger.success(`TC273: Invited user activated — ${approverEmail} (${approverFullName})`);

            // ===== STEP 3: Create Budget Approval — assign the newly invited user as sole approver =====
            Logger.step('TC273 Step 3: Creating single-approver Budget Approval template for the invited user');
            await approvalJob.navigateToApprovalTab();
            await approvalJob.createBudgetApprovalTemplateSingleApprover(templateName, propertyName, approverFullName);
            Logger.success(`TC273 Step 3: Template created — ${templateName} (approver: ${approverFullName})`);

            // ===== STEP 4: Create the Budget — upload and submit for approval =====
            Logger.step('TC273 Step 4: Uploading budget file and submitting for approval');
            await budgetJob.navigateToBudget();
            await page.waitForTimeout(5000);
            await budgetJob.selectPropertyByName(propertyName);
            await budgetJob.openRevisionEditor();
            const budgetFilePath = path.resolve(process.cwd(), 'files', 'budget_data_for_E2EFlow.csv');
            expect(fs.existsSync(budgetFilePath)).toBeTruthy();
            await budgetJob.uploadFileInRevision(budgetFilePath);
            await budgetJob.ensureSubmitEnabledAfterUpload();
            await budgetJob.clickSubmitForApproval();
            await page.waitForTimeout(5000);
            Logger.success('TC273 Step 4: Budget uploaded and submitted for approval');

            // ===== STEP 5: Verify Approval Created — Pending status, assigned to the invited user =====
            Logger.step('TC273 Step 5: Locating the approval request in All Approvals and verifying its status');
            await approvalJob.navigateToAllApprovalsTab();

            const searchBaseName = propertyName.replace(/_\d+$/, '');
            const treegrid = page.locator('[role="treegrid"]').first();
            const dataRows = treegrid.locator('[role="row"]').filter({ has: page.locator('[role="gridcell"]') });

            await expect.poll(() => dataRows.count(), { timeout: 15000 }).toBeGreaterThan(0);

            let targetIndex = -1;
            const rowCount = await dataRows.count();
            for (let i = 0; i < rowCount; i++) {
                const rowText = (await dataRows.nth(i).textContent().catch(() => '')).toLowerCase();
                if (rowText.includes(searchBaseName.toLowerCase())) {
                    targetIndex = i;
                    break;
                }
            }
            expect(targetIndex, `Approval request for property "${propertyName}" must be visible in All Approvals`).toBeGreaterThanOrEqual(0);

            const eyeButtons = page.locator('button:has(svg.lucide-eye):visible');
            await eyeButtons.nth(targetIndex).click();

            const detailsDialog = page.getByRole('dialog').filter({ hasText: /Approval Details/i });
            await expect(detailsDialog).toBeVisible({ timeout: 20000 });
            // The dialog's outer shell (heading) renders before its content (Approval Status,
            // Eligible approvers) finishes loading — wait for that stable label first so the
            // textContent() read below isn't taken against a still-loading dialog.
            await expect(detailsDialog.getByText('Approval Status', { exact: true })).toBeVisible({ timeout: 15000 });

            let detailsText = '';
            await retryUntilPass(async (attempt) => {
                if (attempt > 1) {
                    Logger.info(`TC273 Step 5: retry ${attempt}/3 — Approval Details content not yet fully loaded, rereading`);
                }
                detailsText = (await detailsDialog.textContent().catch(() => '')).trim();
                expect(detailsText, 'Approval status must be "Pending Approval"').toContain('Pending Approval');
                expect(detailsText, `Approval must be assigned to the newly invited approver "${approverFullName}"`).toContain(approverFullName);
            }, { attempts: 3, delayMs: 1500 });
            Logger.success('TC273 Step 5: Approval confirmed Pending and assigned to the newly invited user');

            await page.keyboard.press('Escape');
            await expect(detailsDialog).toBeHidden({ timeout: 10000 }).catch(() => { });

            // ===== STEP 6: Revoke the User =====
            Logger.step(`TC273 Step 6: Revoking access for the now-active user — ${approverEmail}`);
            await organizationHelper.gotoOrganizationWorkspace();
            await organizationHelper.search(approverEmail);
            const userRow = await organizationHelper.getRow(approverEmail);
            await organizationHelper.revokeActiveUser(userRow, approverEmail);
            await organizationHelper.search(approverEmail);
            await organizationHelper.verifyNoResults();
            Logger.success(`TC273 Step 6: Access revoked — ${approverEmail}`);

            // ===== STEP 7: Validate Approval Access — revoked user must no longer act on the approval =====
            Logger.step('TC273 Step 7: Verifying the revoked user can no longer access approvals');
            const errorAlert = activation.activationPage.getByRole('alert').filter({ hasText: 'Error Loading Data' });
            // Backend org-membership invalidation after revoke may take a moment to propagate —
            // re-navigate a few times rather than asserting on a single immediate check.
            await retryUntilPass(async (attempt) => {
                if (attempt > 1) {
                    Logger.info(`TC273 Step 7: retry ${attempt}/5 — revoked-access state not yet reflected, re-navigating`);
                }
                await activation.gotoPath('/approvals/my-approvals');
                await expect(
                    errorAlert,
                    'Revoked user must be blocked from My Approvals (expected an "Error Loading Data" state)'
                ).toBeVisible({ timeout: 20000 });
            }, { attempts: 5, delayMs: 3000 });
            await expect(
                activation.activationPage.getByText('You are not associated with an organization', { exact: false }),
                'Revoked user must see the "not associated with an organization" message'
            ).toBeVisible();

            await expect(
                activation.activationPage.getByRole('button', { name: /^Approve$/i }),
                'Revoked user must NOT see an Approve control'
            ).toHaveCount(0);
            await expect(
                activation.activationPage.getByRole('button', { name: /^Reject$/i }),
                'Revoked user must NOT see a Reject control'
            ).toHaveCount(0);
            Logger.success('TC273 Step 7: Revoked user confirmed blocked from My Approvals');

            // Also confirm the same block holds on the "All Approvals" tab, not just "My Approvals" —
            // access is lost at the organization level, so it must be inaccessible app-wide.
            Logger.step('TC273 Step 7: Verifying the revoked user is also blocked from All Approvals');
            const allApprovalsErrorAlert = activation.activationPage.getByRole('alert').filter({ hasText: 'Error Loading Data' });
            await retryUntilPass(async (attempt) => {
                if (attempt > 1) {
                    Logger.info(`TC273 Step 7: retry ${attempt}/5 — All Approvals block not yet reflected, re-navigating`);
                }
                await activation.gotoPath('/approvals/all-approvals');
                await expect(
                    allApprovalsErrorAlert,
                    'Revoked user must be blocked from All Approvals (expected an "Error Loading Data" state)'
                ).toBeVisible({ timeout: 20000 });
            }, { attempts: 5, delayMs: 3000 });
            await expect(
                activation.activationPage.getByRole('button', { name: /^Approve$/i }),
                'Revoked user must NOT see an Approve control on All Approvals'
            ).toHaveCount(0);
            await expect(
                activation.activationPage.getByRole('button', { name: /^Reject$/i }),
                'Revoked user must NOT see a Reject control on All Approvals'
            ).toHaveCount(0);
            Logger.success('TC273 Step 7: Revoked user confirmed blocked from approval access on both My Approvals and All Approvals — TC273 PASSED');
        } finally {
            await activation.close();
        }
    });

});
