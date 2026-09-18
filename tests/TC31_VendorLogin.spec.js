
require('dotenv').config();

const path = require('path');
const { test } = require('@playwright/test');
const { VendorDashboardPage } = require('../pages/vendorDashboardPage');
const { VendorListingPage } = require('../pages/vendorListingPage');
const { Logger } = require('../utils/logger');

const dashboardTextScanPath = path.join(__dirname, '../data/vendorDashboardTextScan.json');

test.describe('Vendor Dashboard — full page coverage', () => {
    // video/trace/screenshot are already configured project-wide (playwright.config.js) — only
    // storageState is overridden here, same pattern as tests/TC30_VendorBidAccepting.spec.js.
    test.use({ storageState: 'vendorsession.json' });

    test('TC480 @regression @vendor @dashboard : Vendor Dashboard loads, text is scanned + stored, breadcrumb and KPI cards verified', async ({ page }) => {
        test.setTimeout(90000);

        const vendorDashboardPage = new VendorDashboardPage(page);

        Logger.step('TC480: Navigate to vendor Dashboard');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorDashboardPage.navigateToDashboard();

        const snapshot = await vendorDashboardPage.scanAndStoreDashboardText(dashboardTextScanPath);
        await vendorDashboardPage.assertScannedTextMatchesLiveDom(snapshot);

        await vendorDashboardPage.assertBreadcrumbVisible();
        await vendorDashboardPage.assertKpiCardsVisible();

        Logger.success('TC480: Dashboard text scan stored, breadcrumb and all 4 KPI cards verified.');
    });

    test('TC481 @regression @vendor @dashboard : Vendor Dashboard — New Bid Invitations, Awaiting Submission and Approvals & Notifications panels verified', async ({ page }) => {
        test.setTimeout(90000);

        const vendorDashboardPage = new VendorDashboardPage(page);

        Logger.step('TC481: Navigate to vendor Dashboard');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorDashboardPage.navigateToDashboard();

        await vendorDashboardPage.assertNewBidInvitationsPanelVisible();
        await vendorDashboardPage.assertAwaitingSubmissionPanelVisible();
        await vendorDashboardPage.assertApprovalsNotificationsPanelVisible();

        Logger.success('TC481: New Bid Invitations, Awaiting Submission and Approvals & Notifications panels verified.');
    });

    test('TC482 @regression @vendor @dashboard : Vendor Dashboard — Recent activity panel and sidebar chrome verified', async ({ page }) => {
        test.setTimeout(90000);

        const vendorDashboardPage = new VendorDashboardPage(page);

        Logger.step('TC482: Navigate to vendor Dashboard');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorDashboardPage.navigateToDashboard();

        await vendorDashboardPage.assertRecentActivityPanelVisible();
        await vendorDashboardPage.assertSidebarChromeVisible();

        Logger.success('TC482: Recent activity panel and sidebar chrome verified — Dashboard page fully covered across TC480-TC482.');
    });

    test('TC483 @regression @vendor @bids @contracts @invoices @changeorders : Vendor Bids, Contracts, Invoices and Change Orders listing pages fully verified', async ({ page }) => {
        test.setTimeout(180000);

        const vendorListingPage = new VendorListingPage(page);

        Logger.step('TC483: Navigate to vendor portal');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);

        for (const pageKey of VendorListingPage.pageKeys) {
            const label = VendorListingPage.labelFor(pageKey);

            await test.step(`${label} page — scan, store, and fully assert`, async () => {
                await vendorListingPage.navigateTo(pageKey);

                const outputPath = path.join(__dirname, `../data/vendor${label.replace(/\s+/g, '')}TextScan.json`);
                const snapshot = await vendorListingPage.scanAndStoreListingText(pageKey, outputPath);
                vendorListingPage.assertScannedTextNonEmpty(snapshot, label);

                await vendorListingPage.assertListingPageFullyVisible(pageKey);
            });
        }

        Logger.success('TC483: Bids, Contracts, Invoices and Change Orders listing pages fully verified in one pass.');
    });
});
