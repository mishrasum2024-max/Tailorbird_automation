require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { VendorDirectoryPage } = require('../pages/vendorDirectoryPage');
const { Logger } = require('../utils/logger');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
});

let page, vendorPage;

test.describe('Vendors Directory - E2E', () => {
    test.beforeEach(async ({ page: p }) => {
        page = p;
        vendorPage = new VendorDirectoryPage(page);
        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(process.env.DASHBOARD_URL);
        await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20000 });
    });

    test('TC160 @vendor @sanity : Verify user can navigate successfully to the Vendor Directory workspace, validate breadcrumb visibility, and ensure the Vendor module loads without console, UI, or application errors', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.assertBreadcrumbAndNoErrors();
        Logger.success('TC160 passed');
    });

    test('TC161 @vendor @regression : Verify Vendor Directory workspace loads successfully with Invite Vendor action, vendor search functionality, vendor grid rendering, and accessible View Details workflow for vendor records', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.assertDirectoryPageUI();
        Logger.success('TC161 passed');
    });

    test.skip('TC162 @vendor @regression : Verify user can search vendor records successfully using filter keywords, view filtered vendor results correctly, and restore the complete Vendor Directory grid after clearing search filters', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.searchAndAssertFiltered('TOM');
        Logger.success('TC162 passed');
    });

    test('TC164 @vendor @regression : Verify user can manage Vendor Directory table views, add custom columns, access Manage Columns configuration, and export vendor data successfully without affecting grid functionality', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.viewColumnExportFlow();
        Logger.success('TC164 passed');
    });

    test('TC165 @vendor @regression : Verify user can open Vendor Details successfully from Vendor Directory grid and validate Overview tab content, vendor information rendering, and details page accessibility', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.assertOverviewTabContent();
        Logger.success('TC165 passed');
    });

    test('TC166 @vendor @regression : Verify user can edit vendor details successfully from Vendor Details workspace and save updated vendor information without validation, navigation, or data persistence issues', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.editVendorAndSave();
        Logger.success('TC166 passed');
    });

    test('TC167 @vendor @regression : Verify Vendor Activity tab loads successfully, activity data remains accessible, and tab switching works correctly across Vendor Details workspaces without breaking page state', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.assertActivityTabAndSwitch();
        Logger.success('TC167 passed');
    });

    test('TC168 @vendor @regression : Verify user can navigate back successfully from Vendor Details workspace to Vendor Directory grid while preserving Vendor Directory accessibility and navigation flow continuity', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.navigateBackToDirectory();
        Logger.success('TC168 passed');
    });

    test('TC169 @vendor @regression : Verify Invite Vendor form displays proper validation behavior for incomplete, invalid, or missing vendor invitation details before submission', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.assertInviteFormValidation();
        Logger.success('TC169 passed');
    });

    test('TC170 @vendor @sanity : Verify user can complete the full Vendor Invitation workflow successfully by entering organization details, contact information, and submitting a valid vendor invitation request from Vendor Directory workspace', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        const orgName = `AutoVendor_${Date.now()}`;
        await vendorPage.inviteVendorComplete(orgName, 'Test Contact', 'test@example.com');
        Logger.success('TC170 passed');
    });

});
