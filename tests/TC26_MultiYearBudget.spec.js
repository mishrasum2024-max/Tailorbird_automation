require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { ApprovalJob } = require('../pages/approvalPage');
const { BudgetJob } = require('../pages/budgetPage');
const { MultiYearBudgetJob } = require('../pages/multiYearBudgetPage');
const { Logger } = require('../utils/logger');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
});

let page, approvalJob, budgetJob, mybJob;

test.describe('Multi-Year Budget - Initialization, Plan Table, Real-Time Propagation, Cross-Year Reallocation', () => {
    test.describe.configure({ retries: 1 });

    test.beforeEach(async ({ page: p }) => {
        page = p;
        approvalJob = new ApprovalJob(page);
        budgetJob = new BudgetJob(page);
        mybJob = new MultiYearBudgetJob(page);
        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
        await expect(page).toHaveURL(process.env.DASHBOARD_URL);
        await page.waitForTimeout(7000);
        Logger.info('Dashboard loaded from stored session');
        await ensureLeftPanelExpanded(page);
    });

    test('MYB01 @multiYearBudget @sanity @regression @e2e : Multi-Year Budget — brand-new property, single-year budget setup, plan initialization, table structure, real-time propagation, health indicators, and cross-year reallocation', async () => {
        test.setTimeout(600000);

        const timestamp = Date.now();
        const propertyName = `TC26_MYBProp_${timestamp}`;
        const budgetItemName = `MYB_Item_${timestamp}`;
        const startYear = 2026;
        const endYear = 2036;

        // ===== STEP 1: Create a brand-new property (never reuse an existing one) =====
        await test.step('STEP 1: Create a brand-new property', async () => {
            Logger.step('MYB01 Step 1: Creating new property for Multi-Year Budget');
            await approvalJob.createProperty(
                propertyName,
                'Domestic Terminal, College Park, GA 30337, USA',
                'College Park',
                'GA',
                '30337',
                'Garden Style'
            );
            Logger.success(`MYB01 Step 1: Property created — ${propertyName}`);
        });

        // ===== STEP 2: Capture the new property's ID and persist property data for downstream reuse =====
        let propertyId;
        await test.step('STEP 2: Capture propertyId and persist property data for downstream reuse', async () => {
            // createProperty() leaves us back on the Properties list. Open the new
            // property's own card to read its propertyId off the resulting URL.
            await page.getByText(propertyName, { exact: true }).first().click();
            await page.waitForURL(/propertyId=/, { timeout: 20000 });
            propertyId = new URL(page.url()).searchParams.get('propertyId');
            expect(propertyId, 'propertyId must be extractable from the property detail URL').toBeTruthy();

            const propertyData = { propertyName, propertyId, budgetItemName, startYear, endYear, createdAt: timestamp };
            const filePath = path.join(__dirname, '../data/multiYearBudgetPropertyData.json');
            if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(propertyData, null, 2));
            const fromDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            expect(fromDisk.propertyName, 'multiYearBudgetPropertyData.json must round-trip the created property name').toBe(propertyName);
            Logger.success(`MYB01 Step 2: Persisted property data (propertyId=${propertyId}) to ${filePath}`);
        });

        // ===== STEP 3: Create the property's first single-year budget with one item =====
        await test.step('STEP 3: Create first single-year budget with one budget item ($50,000)', async () => {
            Logger.step('MYB01 Step 3: Creating first single-year budget');
            await budgetJob.navigateToBudget();
            await budgetJob.selectPropertyByName(propertyName);
            await budgetJob.openRevisionEditor();
            await budgetJob.addBudgetItemInRevision('300 - INT_ADA Modifications', budgetItemName, 'Multi-Year Budget automation test item', '50000');
            await budgetJob.clickSubmitForApproval();
            Logger.success(`MYB01 Step 3: Single-year budget submitted with item "${budgetItemName}" ($50,000)`);
        });

        // ===== STEP 4: Multi-Year Budget empty state before any plan exists =====
        await test.step('STEP 4: Verify Multi-Year Budget empty state', async () => {
            await mybJob.navigateToMultiYearBudget();
            await mybJob.selectPropertyByName(propertyName);
            await mybJob.verifyEmptyStateBeforePlan();
            Logger.success('MYB01 Step 4: Empty state ("Create Your Multi-Year Budget") verified for brand-new property');
        });

        // ===== STEP 5: Initialize the multi-year budget plan (AC01) =====
        await test.step('STEP 5: Initialize multi-year budget plan with default hold period and the new item', async () => {
            await mybJob.openInitializationDialog();
            await mybJob.verifyInitializationDefaults(startYear, endYear);
            await mybJob.selectBudgetItemInInitDialog(new RegExp(budgetItemName));
            await mybJob.submitInitializationDialog();
            Logger.success('MYB01 Step 5: Multi-year budget plan created (2026-2036) with the new budget item selected');
        });

        // ===== STEP 6: Verify Plan Table View structure (AC04/AC05/AC06) =====
        await test.step('STEP 6: Verify plan table structure — Category/Budget Item rows, Total row, year columns', async () => {
            await mybJob.verifyPlanTableStructure(budgetItemName);
            await mybJob.verifyYearVisible(startYear);
            await mybJob.verifyYearVisible(startYear + 1);
            Logger.success('MYB01 Step 6: Plan table structure verified');
        });

        // ===== STEP 7: Real-time current-year impact propagation (AC08) =====
        await test.step('STEP 7: Verify the $50,000 single-year budget flows into the current-year Current Budget column', async () => {
            const { current } = await mybJob.getCurrentYearRowValues(budgetItemName, startYear);
            expect(current, 'Current Budget column must reflect the active single-year budget total').toBe('$50,000');
            Logger.success('MYB01 Step 7: Real-time propagation confirmed — Current Budget shows $50,000');
        });

        // ===== STEP 8: Revise the single-year budget and confirm the Multi-Year table updates =====
        await test.step('STEP 8: Revise the single-year budget (+$10,000) and confirm Multi-Year Budget reflects it', async () => {
            await budgetJob.navigateToBudget();
            await budgetJob.selectPropertyByName(propertyName);
            await budgetJob.openRevisionEditor();
            await budgetJob.enterRevisionAdjustmentByItemNameV2(budgetItemName, '10000');
            await budgetJob.clickSubmitForApproval();

            await mybJob.navigateToMultiYearBudget();
            await mybJob.selectPropertyByName(propertyName);
            const { current } = await mybJob.getCurrentYearRowValues(budgetItemName, startYear);
            expect(current, 'Current Budget must update to $60,000 after the budget revision is submitted').toBe('$60,000');
            Logger.success('MYB01 Step 8: Multi-Year Budget Current Budget updated to $60,000 after single-year budget revision');
        });

        // ===== STEP 9: Health indicators — red / orange / green variance colouring (AC09, partial) =====
        await test.step('STEP 9: Verify health-indicator colouring for negative, zero, and positive variance', async () => {
            // Negative variance (Planned < Current) -> red
            await mybJob.openEditPlannedBudgetDialog(budgetItemName, startYear);
            await mybJob.setPlannedBudgetAmount('40000', 'MYB01 automation - negative variance check');
            let color = await mybJob.getVarianceColorCategory(budgetItemName, startYear);
            expect(color, 'Variance must render red when Planned Budget < Current Budget').toBe('red');

            // Zero variance (Planned == Current) -> orange
            await mybJob.openEditPlannedBudgetDialog(budgetItemName, startYear);
            await mybJob.setPlannedBudgetAmount('60000', 'MYB01 automation - zero variance check');
            color = await mybJob.getVarianceColorCategory(budgetItemName, startYear);
            expect(color, 'Variance must render orange/yellow when Planned Budget equals Current Budget').toBe('orange');

            // Positive variance (Planned > Current) -> green
            await mybJob.openEditPlannedBudgetDialog(budgetItemName, startYear);
            await mybJob.setPlannedBudgetAmount('80000', 'MYB01 automation - positive variance check');
            color = await mybJob.getVarianceColorCategory(budgetItemName, startYear);
            expect(color, 'Variance must render green when Planned Budget > Current Budget').toBe('green');

            Logger.success('MYB01 Step 9: Health-indicator colours verified for red/orange/green variance states');
        });

        // ===== STEP 10: Cross-Year Reallocation workflow (AC10/AC11; AC12 partial — see report) =====
        await test.step('STEP 10: Reallocate planned budget from the current year into the next hold-period year', async () => {
            await mybJob.openEditPlannedBudgetDialog(budgetItemName, startYear + 1);
            await mybJob.reallocatePlannedBudget(new RegExp(`${budgetItemName}.*\\(${startYear}\\)`), '10000', 'MYB01 automation - cross-year reallocation');
            const nextYearPlanned = await mybJob.getFutureYearPlannedValue(budgetItemName, startYear + 1);
            expect(nextYearPlanned, `Planned Budget for ${startYear + 1} must reflect the $10,000 reallocated in`).toBe('$10,000');
            Logger.success(`MYB01 Step 10: Cross-year reallocation confirmed — ${startYear + 1} Planned Budget is now $10,000`);
        });

        // ===== STEP 11: CSV Upload dialog and template download =====
        await test.step('STEP 11: Verify Upload CSV dialog and CSV template download', async () => {
            await mybJob.openUploadCsvDialog();
            const templatePath = await mybJob.downloadCsvTemplate(path.join(__dirname, '../downloads'));
            expect(fs.existsSync(templatePath), 'Downloaded CSV template file must exist on disk').toBeTruthy();
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            expect(templateContent, 'CSV template header must include Category and Budget Item columns').toMatch(/Category,Budget Item/);
            await mybJob.closeDialog();
            Logger.success('MYB01 Step 11: Upload CSV dialog and template download verified');
        });

        // ===== STEP 12: CSV Export =====
        await test.step('STEP 12: Verify CSV export produces a file matching the template column structure', async () => {
            const exportPath = await mybJob.exportCsv(path.join(__dirname, '../downloads'));
            expect(fs.existsSync(exportPath), 'Exported CSV file must exist on disk').toBeTruthy();
            const exportContent = fs.readFileSync(exportPath, 'utf-8');
            expect(exportContent, 'Exported CSV must include the budget item that was added').toContain(budgetItemName);
            Logger.success('MYB01 Step 12: CSV export verified');
        });

        // ===== STEP 13: Reset budget — backup-gated destructive action =====
        await test.step('STEP 13: Verify Reset budget requires a table download before it is enabled', async () => {
            await mybJob.openResetBudgetDialog();
            await mybJob.verifyResetDisabledUntilDownload();
            await mybJob.cancelResetBudgetDialog();
            Logger.success('MYB01 Step 13: Reset budget backup-gate verified (cancelled without resetting)');
        });

        // ===== STEP 14: Settings dialog — hold period + item selection, no Capital Envelope field =====
        await test.step('STEP 14: Verify Settings dialog fields and absence of a Total Capital Envelope field', async () => {
            await mybJob.openSettingsDialog();
            await mybJob.verifyInitializationDefaults(startYear, endYear);
            await mybJob.verifyNoCapitalEnvelopeFieldInSettings();
            await mybJob.cancelSettingsDialog();
            Logger.success('MYB01 Step 14: Settings dialog verified — no Total Capital Envelope field present (ticket/app gap)');
        });

        // ===== STEP 15: Multi-year budget history log =====
        await test.step('STEP 15: Verify the multi-year budget history log records the plan creation', async () => {
            await mybJob.openHistoryDialog();
            await mybJob.verifyHistoryContainsText('created this multi-year budget');
            await mybJob.closeDialog();
            Logger.success('MYB01 Step 15: History log entry for plan creation verified');
        });
    });

    test('MYB02 @multiYearBudget @regression : Multi-Year Budget — no Portfolio Roll-Up view exists (documents AC13 gap)', async () => {
        test.setTimeout(120000);
        await mybJob.navigateToMultiYearBudget();

        // The only property-switcher entry point available from Multi-Year Budget is the
        // single-property switcher (breadcrumb dropdown). There is no separate portfolio /
        // roll-up aggregate view or nav entry anywhere in Financials. This test documents
        // that gap so it fails loudly (rather than silently) once a Portfolio Roll-Up view
        // ships and this assertion needs to be replaced with real coverage.
        const portfolioNavEntry = page.locator('nav').getByText(/portfolio/i);
        await expect(portfolioNavEntry, 'No "Portfolio" navigation entry should currently exist (AC13 not implemented)').toHaveCount(0);
        Logger.success('MYB02: Confirmed no Portfolio Roll-Up navigation entry exists — AC13 remains unimplemented');
    });

    test('MYB03 @multiYearBudget @regression : Multi-Year Budget — second test account has full edit access (documents AC14 gap)', async ({ browser }) => {
        test.setTimeout(180000);
        const propertyDataPath = path.join(__dirname, '../data/multiYearBudgetPropertyData.json');
        test.skip(!fs.existsSync(propertyDataPath), 'Requires MYB01 to have run first and persisted a property');
        const { propertyId, propertyName } = JSON.parse(fs.readFileSync(propertyDataPath, 'utf-8'));

        // This documents CURRENT behaviour rather than the ticket's desired behaviour: both
        // available test accounts (sessionState.json and OtherSessionState.json) are full
        // Budget-Admin-equivalent users in this environment, so no view-only / restricted role
        // is available to genuinely exercise AC14. If a lower-privilege role becomes available,
        // this test should be rewritten to assert the edit controls are disabled/hidden for it.
        // Navigating directly by propertyId (rather than via the property-switcher UI) keeps
        // this test independent of the switcher's own behaviour under a second account/session.
        const otherContext = await browser.newContext({ storageState: 'OtherSessionState.json' });
        const otherPage = await otherContext.newPage();
        await otherPage.goto(`${process.env.BASE_URL.replace(/\/$/, '')}/financials/multi-year-budget?propertyId=${propertyId}`, { waitUntil: 'load' });
        await otherPage.waitForTimeout(4000);

        // The second account may belong to a different org/property scope than the primary
        // test account, in which case a direct deep-link redirects elsewhere (e.g. to the
        // default CapEx dashboard) rather than showing this property's Multi-Year Budget —
        // that is a property-visibility difference, not the role-based read-only restriction
        // AC14 asks for, so it is reported distinctly rather than mis-asserted as a pass/fail
        // on the edit controls.
        const landedOnProperty = await otherPage.getByText(propertyName, { exact: true }).first().isVisible({ timeout: 10000 }).catch(() => false);
        if (!landedOnProperty) {
            Logger.info(`MYB03: Second account (OtherSessionState.json) could not reach property "${propertyName}" directly — likely a separate org/property scope, not a role restriction. AC14 remains unverified rather than confirmed either way.`);
            test.skip(true, 'Second test account does not have visibility into the property created by the primary account');
            return;
        }

        await expect(otherPage.locator('button:has(svg.lucide-plus)').first(), 'Second account currently still has the Add Budget Item control visible/enabled').toBeVisible({ timeout: 15000 });
        Logger.success('MYB03: Confirmed second account has full edit access — no role-based read-only restriction is enforced yet (AC14 not implemented)');
    });
});
