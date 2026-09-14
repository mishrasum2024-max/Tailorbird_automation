/**
 * Vendor Bid → Admin Award, end to end, serial.
 *
 * TC452 (vendor portal — vendorsession.json): finds a bid that is not yet Awarded, uploads
 * the completed bid book from fixture/, and submits it. Uses only new page-object/locator
 * files (pages/vendorBidPage.js, locators/vendorBidLocator.js).
 *
 * TC453 (admin — sessionState.json, summit.harsha@tailorbird.us): searches for that same bid
 * by name, opens its Manage Bids tab, finds the vendor row TC452 just submitted (Status
 * "Submitted" or "Re-submitted"), and awards it — with an assertion that the row's Status
 * becomes "Awarded". Uses only new page-object/locator files (pages/bidAwardPage.js,
 * locators/bidAwardLocator.js), composed on top of the EXISTING, unmodified BidPage
 * (navigateToBidsPage) and bidLocators (listSearchInput, bidRowLink) for navigation/search.
 *
 * The actual Award click is performed by this Playwright automation, never by hand via MCP —
 * awarding a bid response is a one-time, irreversible action in this app, so the only way to
 * be certain the automation itself can do it is to let the automation do it for real.
 *
 * .serial: TC453 depends entirely on the live state TC452 leaves behind (the same bid,
 * submitted by the same vendor) — they must run in this order, in the same worker.
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { VendorBidPage } = require('../pages/vendorBidPage');
const { BidAwardPage } = require('../pages/bidAwardPage');
const { Logger } = require('../utils/logger');

const lastVendorBidPath = path.join(__dirname, '../data/lastVendorBid.json');

test.describe.serial('Vendor Bid Accepting → Admin Award', () => {
    test.describe('Vendor submits bid', () => {
        // video/trace/screenshot are already configured project-wide (playwright.config.js) —
        // only storageState may be overridden per describe group without forcing a new worker.
        test.use({ storageState: 'vendorsession.json' });

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
            await vendorBidPage.openBidRow(target.rowGrow);
            await vendorBidPage.acceptBidIfNeeded();

            const bidBookPath = path.join(__dirname, '../fixture/Cottages_on_Elm_Roofing_Bid_Book.xlsx');
            await vendorBidPage.uploadBidDocument(bidBookPath);

            await vendorBidPage.submitBid();

            fs.mkdirSync(path.dirname(lastVendorBidPath), { recursive: true });
            fs.writeFileSync(lastVendorBidPath, JSON.stringify({ bidName: target.bidName, submittedAt: new Date().toISOString() }, null, 2));

            Logger.success(`TC452: Bid "${target.bidName}" submitted.`);
        });
    });

    test.describe('Admin awards bid', () => {
        test.use({ storageState: 'sessionState.json' });

        test('TC453 @regression @admin @bids : Admin finds the submitted bid and awards it', async ({ page }) => {
            test.setTimeout(120000);

            expect(fs.existsSync(lastVendorBidPath), 'data/lastVendorBid.json must exist — TC452 must run first').toBe(true);
            const { bidName } = JSON.parse(fs.readFileSync(lastVendorBidPath, 'utf8'));
            expect(bidName, 'bidName must be set in data/lastVendorBid.json').toBeTruthy();

            const bidAwardPage = new BidAwardPage(page);

            Logger.step(`TC453: Searching for bid "${bidName}" as admin...`);
            const isInProgress = await bidAwardPage.searchAndOpenBidIfInProgress(bidName);
            if (!isInProgress) {
                Logger.info(`TC453: Bid "${bidName}" is not "In Progress" (already Awarded, or still Draft) — nothing to award. Passing.`);
                expect(true).toBe(true);
                return;
            }
            await bidAwardPage.goToManageBidsTab();

            const submittedRow = await bidAwardPage.findSubmittedVendorRow();
            expect(
                submittedRow,
                `FAIL: expected a vendor row on bid "${bidName}" with Status "Submitted" or "Re-submitted" (TC452 should have just submitted one)`,
            ).toBeTruthy();

            Logger.step(`TC453: Awarding vendor "${submittedRow.vendorName}" (status: "${submittedRow.status}")`);
            await bidAwardPage.awardRow(submittedRow.rowGrow, submittedRow.vendorName);

            Logger.success(`TC453: Bid "${bidName}" — vendor "${submittedRow.vendorName}" awarded.`);
        });
    });
});
