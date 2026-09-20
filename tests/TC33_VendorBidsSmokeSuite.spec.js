require('dotenv').config();

const path = require('path');
const { test, expect } = require('@playwright/test');
const { VendorListingPage } = require('../pages/vendorListingPage');
const { VendorBidPage } = require('../pages/vendorBidPage');
const { VendorBidWorkspacePage } = require('../pages/vendorBidWorkspacePage');
const { viewDetailsButtonsStrategies } = require('../locators/vendorListingLocator');
const { healingLocator } = require('../utils/locatorHealer');
const { Logger } = require('../utils/logger');
const { ensureInvitedBidForVendor } = require('../utils/ensureVendorBidPool');

const smokeData = require('../data/vendorBidsSmokeSuiteData.json');

/**
 * Vendor Bids smoke suite — a specific 9-scenario list requested directly (Slack, 2026-09-17),
 * arranged in the exact given order as its own dedicated spec file (not folded into
 * tests/TC32_VendorAllTabs.spec.js). Almost every scenario here reuses page-object methods that
 * already existed before this file — VendorBidPage (navigateToBids, findNonAwardedBidRow/
 * findBidRowByStatus, openBidRow, acceptBidIfNeeded, uploadBidDocument) and
 * VendorBidWorkspacePage (assertBidTabFullyVisible, openPropertyTab,
 * assertPropertyOverviewFieldsVisible, assertPropertyAssetViewerTabVisible) — nothing here
 * duplicates that logic. The few genuinely new pieces (VendorBidPage.findBidRowByStatus,
 * VendorBidWorkspacePage.downloadTemplateAndVerify, VendorBidPage.askPiperAndAwaitAnswer) were
 * added as new methods on those same existing page objects, MCP-verified live before being
 * written, rather than invented.
 */
test.describe('Vendor Bids — requested smoke suite', () => {
    test.use({ storageState: 'vendorsession.json' });

    // TC527/TC528 below need at least one "Invited" bid in this vendor's queue — a shared,
    // persistent resource other tests elsewhere in the suite can permanently consume (e.g.
    // TC528's own real Accept). Ensure one exists once, up front, rather than failing or
    // skipping on a precondition the codebase already knows how to create.
    test.beforeAll(async ({ browser }) => {
        test.setTimeout(15 * 60 * 1000);
        await ensureInvitedBidForVendor(browser);
    });

    test('TC526 @vendor @bids @smoke : Verify vendor can see existing bid from Bids listing', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        await expect(vendorBidPage.bidsGrid, 'FAIL: Bids grid not visible.').toBeVisible({ timeout: 10000 });
        const viewDetailsButtons = healingLocator(viewDetailsButtonsStrategies(page));
        const count = await viewDetailsButtons.count();
        expect(count, 'FAIL: no existing bid rows are visible on the Bids listing.').toBeGreaterThan(0);

        Logger.success(`TC526: Bids listing shows ${count} existing bid(s).`);
    });

    test('TC527 @vendor @bids @smoke : Verify vendor can see new invited bid from Bids listing where status = Invited', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const invited = await vendorBidPage.findBidRowByStatus('Invited');
        expect(invited, 'FAIL: no "Invited" bid currently exists on the Bids listing to verify against.').not.toBeNull();

        const row = page.locator(`[data-rgrow="${invited.rowGrow}"]`).first();
        await expect(row, `FAIL: Invited bid row "${invited.bidName}" not visible in the live grid.`).toBeVisible({ timeout: 10000 });
        Logger.success(`TC527: Invited bid "${invited.bidName}" is visible on the Bids listing.`);
    });

    test('TC528 @vendor @bids @smoke @positive : Verify vendor can accept an eligible bid and verify success confirmation', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const invited = await vendorBidPage.findBidRowByStatus('Invited');
        expect(invited, 'FAIL: no "Invited" (eligible-to-accept) bid currently exists on the Bids listing.').not.toBeNull();

        await vendorBidPage.openBidRow(invited.rowGrow);
        const statusBadge = page.getByText('Invited', { exact: true }).first();
        await expect(statusBadge, 'FAIL: opened bid does not show "Invited" status before accepting.').toBeVisible({ timeout: 10000 });

        // Best-effort toast check: MCP-verified live that Accept Bid updates the status badge
        // to "Accepted" and reveals Upload Document/Submit Bid immediately and reliably — those
        // are asserted below as the definitive success signal. A Mantine toast MAY also appear
        // (this app shows one for Save/Submit actions elsewhere), but it is highly transient and
        // could not be conclusively caught via manual MCP inspection before it auto-dismissed,
        // so it is checked here without failing the test if none is caught in time (this does
        // NOT invent unverified toast wording).
        const toastRegion = page.getByRole('region', { name: 'Notifications' });
        let toastText = '';
        await vendorBidPage.acceptBidIfNeeded();
        try {
            const toast = toastRegion.locator('*').filter({ hasText: /accept/i }).first();
            toastText = await toast.innerText({ timeout: 2000 });
        } catch {
            toastText = '';
        }

        const acceptedBadge = page.getByText('Accepted', { exact: true }).first();
        await expect(acceptedBadge, 'FAIL: bid status did not change to "Accepted" after accepting.').toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('button', { name: 'Upload Document', exact: true }), 'FAIL: "Upload Document" button did not appear after accepting.').toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('button', { name: 'Submit Bid', exact: true }), 'FAIL: "Submit Bid" button did not appear after accepting.').toBeVisible();

        Logger.success(`TC528: bid "${invited.bidName}" accepted — status changed to "Accepted", Upload Document/Submit Bid available${toastText ? `, toast seen: "${toastText}"` : ' (no toast caught in time — see comment)'}.`);
    });

    test('TC529 @vendor @bids @property @smoke : Verify Data is available on Property Tab after clicking on View Detail', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const anyBid = await vendorBidPage.findNonAwardedBidRow() ?? await vendorBidPage.findBidRowByStatus('Awarded');
        expect(anyBid, 'FAIL: no bid at all found on the Bids listing to open.').toBeTruthy();
        await vendorBidPage.openBidRow(anyBid.rowGrow);

        await workspace.openPropertyTab();
        await workspace.assertPropertyOverviewFieldsVisible();

        Logger.success(`TC529: Property tab data verified for bid "${anyBid.bidName}".`);
    });

    test('TC530 @vendor @bids @property @smoke : Verify Data is available on Bid Tab and Sub tabs like (Overview, Asset) after clicking on View Detail', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const anyBid = await vendorBidPage.findNonAwardedBidRow() ?? await vendorBidPage.findBidRowByStatus('Awarded');
        expect(anyBid, 'FAIL: no bid at all found on the Bids listing to open.').toBeTruthy();
        await vendorBidPage.openBidRow(anyBid.rowGrow);

        await workspace.assertBidTabFullyVisible();
        await workspace.openPropertyTab();
        await workspace.assertPropertyOverviewFieldsVisible();
        await workspace.assertPropertyAssetViewerTabVisible();

        Logger.success(`TC530: Bid tab + Property sub-tabs (Overview, Asset Viewer) data verified for bid "${anyBid.bidName}".`);
    });

    test('TC531 @vendor @bids @smoke : Verify vendor can use listing search and open a matching record', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const search = page.getByRole('textbox', { name: 'Search...', exact: true });
        await expect(search, 'FAIL: Bids search input not visible.').toBeVisible({ timeout: 10000 });
        await search.fill(smokeData.searchValidTerm);
        await page.waitForTimeout(1000);

        const matchingRow = page.locator('revo-grid [role="row"][data-rgrow]').filter({ hasText: smokeData.searchValidTerm }).first();
        await expect(matchingRow, `FAIL: no row matching search term "${smokeData.searchValidTerm}" is visible.`).toBeVisible({ timeout: 10000 });
        const rowGrow = await matchingRow.getAttribute('data-rgrow');

        const viewDetailsBtn = page.locator(`[data-rgrow="${rowGrow}"]`).getByRole('button', { name: 'View Details', exact: true });
        await viewDetailsBtn.scrollIntoViewIfNeeded();
        await viewDetailsBtn.click();
        await page.waitForURL(/\/bids-and-contracts\/bids\/\d+/, { timeout: 15000 });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);

        await workspace.assertBidTabFullyVisible();
        Logger.success(`TC531: search "${smokeData.searchValidTerm}" found a matching record and opened it successfully.`);
    });

    test('TC532 @vendor @bids @smoke : Verify vendor can Download template and Export', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        Logger.step('TC532: verify Export on the Bids listing');
        const { columns, rowCount } = await vendorListingPage.exportAndReadColumns({ navLabel: 'Bids' });
        expect(columns.length, 'FAIL: Bids export produced no columns.').toBeGreaterThan(0);
        expect(rowCount, 'FAIL: Bids export produced zero data rows.').toBeGreaterThan(0);

        Logger.step('TC532: verify Download Template on a bid detail page');
        const anyBid = await vendorBidPage.findNonAwardedBidRow() ?? await vendorBidPage.findBidRowByStatus('Awarded');
        expect(anyBid, 'FAIL: no bid found to test Download Template on.').toBeTruthy();
        await vendorBidPage.openBidRow(anyBid.rowGrow);
        const filename = await workspace.downloadTemplateAndVerify();

        Logger.success(`TC532: Export verified (${columns.length} columns, ${rowCount} row(s)); Download Template produced "${filename}".`);
    });

    test('TC533 @vendor @bids @smoke : Verify vendor can upload a document', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        // Upload/Replace Document is only available once a bid has been Accepted (MCP-verified —
        // an "Invited" bid shows only Download Template) — find one in that state independently
        // of TC528, so this test does not depend on TC528 having run/succeeded first.
        const accepted = await vendorBidPage.findBidRowByStatus('Accepted');
        expect(accepted, 'FAIL: no "Accepted" bid (with Upload Document available) currently exists on the Bids listing.').not.toBeNull();

        await vendorBidPage.openBidRow(accepted.rowGrow);
        const filePath = path.join(__dirname, '..', smokeData.uploadDocumentFile);
        await vendorBidPage.uploadBidDocument(filePath);

        await expect(page.getByRole('button', { name: 'Replace Document', exact: true }), 'FAIL: header button did not switch to "Replace Document" after a successful upload.').toBeVisible({ timeout: 10000 });
        Logger.success(`TC533: document uploaded successfully to bid "${accepted.bidName}".`);
    });

    test('TC534 @vendor @bids @smoke : Verify "Can you check i hve any open bid ?" prompt and look for answer in AI Chat', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const vendorBidPage = new VendorBidPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const answerText = await vendorBidPage.askPiperAndAwaitAnswer(smokeData.piperOpenBidsQuestion);
        expect(answerText.toLowerCase(), 'FAIL: Piper answer does not mention "open bid(s)".').toContain('open bid');

        Logger.success('TC534: Piper answered the open-bids prompt in the AI chat.');
    });
});
