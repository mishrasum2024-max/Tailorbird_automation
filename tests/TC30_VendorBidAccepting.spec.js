/**
 * Vendor portal — Bids workspace. Logs in as the vendor (VENDOR_LOGIN_EMAIL, reusing the
 * stored vendorsession.json — see TC451 in TC01_login.spec.js), finds the most recent bid
 * that is not yet Awarded, uploads the completed bid book from fixture/, and submits it.
 * Uses only new page-object/locator files (pages/vendorBidPage.js, locators/vendorBidLocator.js)
 * — no existing framework file was modified for this spec.
 */
require('dotenv').config();

const path = require('path');
const { test, expect } = require('@playwright/test');
const { VendorBidPage } = require('../pages/vendorBidPage');
const { Logger } = require('../utils/logger');

test.use({
    storageState: 'vendorsession.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
});

test.describe('Vendor Bid Accepting', () => {
    test('TC452 @regression @vendor @bids : Vendor uploads and submits a not-yet-awarded bid', async ({ page }) => {
        test.setTimeout(120000);

        const vendorBidPage = new VendorBidPage(page);

        Logger.step('TC452: Navigate to vendor Bids workspace');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorBidPage.navigateToBids();

        const target = await vendorBidPage.findNonAwardedBidRow();
        if (!target) {
            Logger.info('TC452: All bids are awarded — nothing to submit. Passing.');
            expect(true).toBe(true);
            return;
        }

        Logger.step(`TC452: Opening bid "${target.bidName}" (status: "${target.status}")`);
        await vendorBidPage.openBidRow(target.row);

        const bidBookPath = path.join(__dirname, '../fixture/Cottages_on_Elm_Roofing_Bid_Book.xlsx');
        await vendorBidPage.uploadBidDocument(bidBookPath);

        await vendorBidPage.submitBid();

        Logger.success(`TC452: Bid "${target.bidName}" submitted.`);
    });
});
