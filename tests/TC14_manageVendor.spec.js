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

    test('TC160 @vendor @sanity : Navigation, breadcrumb, no errors', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.assertBreadcrumbAndNoErrors();
        Logger.success('TC160 passed');
    });

    test('TC161 @vendor @regression : Directory page UI - Invite, Search, grid, View Details', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.assertDirectoryPageUI();
        Logger.success('TC161 passed');
    });

    test.skip('TC162 @vendor @regression : Search filter and clear', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.searchAndAssertFiltered('TOM');
        Logger.success('TC162 passed');
    });

    test('TC164 @vendor @regression : View, Add Column, Manage Columns, Export', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.viewColumnExportFlow();
        Logger.success('TC164 passed');
    });

    test('TC165 @vendor @regression : View Details and Overview tab', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.assertOverviewTabContent();
        Logger.success('TC165 passed');
    });

    test('TC166 @vendor @regression : Edit vendor and save', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.editVendorAndSave();
        Logger.success('TC166 passed');
    });

    test('TC167 @vendor @regression : Activity tab and tab switching', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.assertActivityTabAndSwitch();
        Logger.success('TC167 passed');
    });

    test('TC168 @vendor @regression : Navigation back to directory', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.openFirstVendorDetails();
        await vendorPage.navigateBackToDirectory();
        Logger.success('TC168 passed');
    });

    test('TC169 @vendor @regression : Invite form validation', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        await vendorPage.assertInviteFormValidation();
        Logger.success('TC169 passed');
    });

    test('TC170 @vendor @sanity : Invite vendor complete flow', async () => {
        await vendorPage.goToDirectory();
        await vendorPage.waitForDirectoryReady();
        const orgName = `AutoVendor_${Date.now()}`;
        await vendorPage.inviteVendorComplete(orgName, 'Test Contact', 'test@example.com');
        Logger.success('TC170 passed');
    });

});
