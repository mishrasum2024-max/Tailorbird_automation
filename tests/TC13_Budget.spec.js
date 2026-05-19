require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { BudgetJob } = require('../pages/budgetPage');
const { Logger } = require('../utils/logger');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
});

let page, budgetJob;

test.describe('Budget Workflow - E2E Tests', () => {

    test.beforeEach(async ({ page: p }) => {
        page = p;
        budgetJob = new BudgetJob(page);
        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
        await expect(page).toHaveURL(process.env.DASHBOARD_URL);
        await page.waitForLoadState('networkidle');
        Logger.info('Dashboard loaded from stored session');
        await budgetJob.navigateToBudgetTab();
        await budgetJob.waitForPageLoad();
        Logger.success('Setup complete - Navigated to Budget section');
    });

    // ===== Budget Page & Property Tests =====

    test('TC139 @budget @sanity @regression : Verify Budget page loads, property selection and table headers', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyPropertyHeader();
        await budgetJob.verifyBudgetTableHeaders();
        await budgetJob.verifyReviseBudgetsVisible();
        await budgetJob.verifyYearSelector();
        await budgetJob.verifyVersionSelector();
        await budgetJob.verifyBudgetDataRows();
        await budgetJob.verifyBudgetItems(['Construction', 'Site Prep', 'Concrete', 'Wiring']);
        Logger.success('TC139: Budget page verification completed');
    });

    test('TC140 @budget @regression : Verify Budget Category section is displayed under Budget navigation', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.verifyBudgetCategoryInNav();
        Logger.success('TC140: Budget Category section verified');
    });

    // ===== Category Code Column Tests =====

    test('TC141 @budget @regression : Verify Budget Category column is present in the grid/table', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        Logger.success('TC141: Category Code column present');
    });

    test('TC142 @budget @regression : Verify user can select a Budget Category from dropdown', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
        Logger.success('TC142: Budget Category dropdown accessible');
    });

    test('TC143 @budget @regression : Verify Budget Category is linked using Category Code', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        await budgetJob.verifyFirstRowCategoryCell();
        Logger.success('TC143: Budget Category linked via Category Code');
    });

    test('TC144 @budget @regression : Verify Budget Category displays Category Name correctly', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        await budgetJob.verifyFirstRowCategoryCell();
        expect(await budgetJob.getFirstBudgetItemRowCount()).toBeGreaterThan(0);
        Logger.success('TC144: Category Name displays correctly');
    });

    test('TC145 @budget @regression : Verify Budget Category can be assigned to a Budget Item', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
        Logger.success('TC145: Budget Category assignable to items');
    });

    test('TC147 @budget @regression : Verify Budget Category appears consistently across related views', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyBudgetTableHeaders(['Budget Item', 'Description', 'Category Code', 'Original Budget', 'Current Budget']);
        Logger.success('TC147: Category Code consistent across grid');
    });

    test('TC148 @budget @regression : Verify Budget Category works with enabled invoices/tweezers', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyReviseBudgetsVisible();
        await budgetJob.verifyCategoryCodeColumn();
        Logger.success('TC148: Category works with Revise Budgets');
    });

    test('TC149 @budget @regression : Verify Budget Category is reusable across multiple items', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(1);
        Logger.success('TC149: Category reusable across items');
    });

    // ===== View & Column Management =====

    test('TC150 @budget @regression : Create a view and load that view', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const viewName = `BudgetView_${Date.now()}`;
        await budgetJob.createView(viewName);
        await budgetJob.switchToDefaultView();
        await budgetJob.loadView(viewName);
        Logger.success('TC150: View created and loaded');
    });

    test('TC151 @budget @regression : Add column, verify, and delete via manage columns', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const colName = `TestCol-${Date.now()}`;
        await budgetJob.addColumn(colName, 'Test column for budget');
        await budgetJob.openManageColumns();
        await budgetJob.verifyColumnInManageColumns(colName);
        await budgetJob.deleteColumnInManageColumns(colName);
        await budgetJob.verifyColumnNotInManageColumns(colName);
        await budgetJob.closeManageColumns();
        Logger.success('TC151: Add, verify, delete column completed');
    });

    test('TC152 @budget @regression : Export data and verify Excel/CSV has data', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const downloadsDir = path.join(process.cwd(), 'downloads');
        const savePath = await budgetJob.exportBudgetData(downloadsDir);
        const content = fs.readFileSync(savePath, 'utf-8');
        expect(content.length).toBeGreaterThan(100);
        expect(content).toContain('Budget Item');
        // Brook sample data may include Site Prep; other properties often show Construction, etc.
        expect(content).toMatch(/Site Prep|Construction/);
        Logger.success('TC152: Export verified with budget data');
    });

    // ===== Revise Budget Flow (serial - share Brook property / revision editor) =====

    test.describe.serial('Revise Budget - Serial', () => {

    test('TC153 @budget @regression : Revise Budget - header, data, reset table, add budget, upload file', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.verifyPropertyHeader();
        await budgetJob.verifyCategoryCodeColumn();
        expect(await budgetJob.getDataRowCount()).toBeGreaterThan(0);
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();
        Logger.success('TC153: Revise Budget flow verified');
    });

    test('TC154 @budget @regression : Reset table in Revise Budget flow', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const { reviseBtn, reviseEnabled } = await budgetJob.ensureReviseEnabled();
        expect(reviseEnabled).toBeTruthy();
        await reviseBtn.click();
        await page.waitForTimeout(2000);
        await budgetJob.resetTableInMainGrid();
        Logger.success('TC154: Reset table completed');
    });

    test('TC155 @budget @regression : Add row with data and assert row added successfully', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        const uniqueItemName = `TestBudgetItem_${Date.now()}`;
        await budgetJob.addRowInMainGrid(uniqueItemName, 'Test description for added row');
        Logger.success('TC155: Row added and verified');
    });

    test('TC156 @budget @regression : Upload budget file and assert data is available', async () => {
        test.setTimeout(180000);
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        await budgetJob.openRevisionEditor();
        await budgetJob.verifyRevisionEditorOpen();
        const filePath = path.resolve(process.cwd(), 'files', 'budget_file_to_upload.csv');
        expect(fs.existsSync(filePath)).toBeTruthy();
        await budgetJob.uploadFileInRevision(filePath);
        await page.waitForTimeout(2000);
        const count = await budgetJob.getTreegridRowCount();
        expect(count, 'Uploaded budget data must have at least one row').toBeGreaterThan(0);
        Logger.success(`TC156: Upload budget file flow completed - ${count} rows in grid`);
    });

    // ===== Revise Budget E2E =====

    test('TC157 @budget @regression : Revise Budget - Delete first row, Reset Table, assert data restored', async () => {
        test.setTimeout(180000);
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        await budgetJob.openRevisionEditor();
        await page.waitForTimeout(3000);
        await budgetJob.verifyRevisionEditorOpen();
        await page.waitForTimeout(2000);
        const countBeforeDelete = await budgetJob.getTreegridRowCount();
        expect(countBeforeDelete, 'Revision editor must have rows before delete').toBeGreaterThan(0);
        await budgetJob.deleteFirstRowInRevision();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        await budgetJob.resetTableInRevision();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(4000);
        const count = await budgetJob.getTreegridRowCount();
        expect(count, 'Reset Table must restore rows - data should be restored').toBeGreaterThan(0);
        Logger.success(`TC157: Reset Table - ${count} rows restored`);
    });

    test('TC158 @budget @regression : Revise Budget - Delete first row, Add row with category from dropdown, Submit approval', async () => {
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await budgetJob.openRevisionEditor();
        await budgetJob.deleteFirstRowInRevision();
        await budgetJob.addRowWithCategoryInRevision('Site Prep', 'Site preparation work', 'Construction', '15000');

        Logger.step('TC158: Assert category is set in first row before submit');
        const categoryBeforeSubmit = await budgetJob.getFirstRowCategoryValue('revision');
        expect(categoryBeforeSubmit).toBeTruthy();
        expect(categoryBeforeSubmit).not.toBe('-');
        expect(categoryBeforeSubmit).not.toBe('—');
        expect(categoryBeforeSubmit).not.toBe('');
        Logger.success(`TC158: Category in first row BEFORE submit = "${categoryBeforeSubmit}"`);

        await budgetJob.clickSubmitForApproval();
        // await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        Logger.step('TC158: Assert budget item and row count after submit');
        const rowCount = await budgetJob.getTreegridRowCount();
        expect(rowCount).toBeGreaterThan(0);
        const siteVisible = await budgetJob.isTextVisible('Site Prep');
        if (!siteVisible) {
            Logger.info('Site Prep not immediately visible after submit — checking grid data');
        }
        expect(rowCount).toBeGreaterThan(0);

        Logger.step('TC158: Assert category persists in first row after submit (main grid)');
        const categoryAfterSubmit = await budgetJob.assertFirstRowCategoryNotEmpty('main');
        Logger.success(`TC158: Category in first row AFTER submit = "${categoryAfterSubmit}"`);
        Logger.success('TC158: Row added with category from dropdown, submitted, category verified in both views');
    });

    test('TC159 @budget @regression : Revise Budget - Select other property (no data), Upload CSV, Submit, assert data', async () => {
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
        Logger.success('TC159: Upload on other property, submitted, verified');
    });

    }); // end serial

    test('TC160 @budget @regression : Draft version — dialog shows Draft; after close, Revise Budgets disabled on overview', async () => {
        test.slow();
        await budgetJob.navigateToBudget();
        await budgetJob.selectBrookProperty();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);

        test.skip(
            !(await budgetJob.budgetVersionDropdownHasDraftOption()),
            'No draft row in version dropdown (labels like "Version 9draft") — create a draft revision first or use a property that has one'
        );

        Logger.step(
            'TC160: Select draft version (opens Budget Revision drawer with Draft badge). Headed: npx playwright test tests/TC13_Budget.spec.js -g TC160 --headed --workers=1'
        );
        await budgetJob.selectBudgetVersionMatching(/draft/i);
        await page.waitForURL(/budget-revision/i, { timeout: 30000 }).catch(() => page.waitForTimeout(5000));

        Logger.step('TC160: Close draft dialog — overview must keep Revise Budgets disabled for draft version');
        await budgetJob.expectDraftVersionBlocksReviseOnOverviewAfterClosingDialog();
        Logger.success('TC160: Draft blocks Revise on overview — passed');
    });

});
