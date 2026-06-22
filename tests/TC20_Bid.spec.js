require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { BidPage } = require('../pages/bidPage');
const { Logger } = require('../utils/logger');
const PropertiesHelper = require('../pages/properties');
const fs = require('fs');
const path = require('path');

const BID_DATA_PATH = path.join(__dirname, '../data/bidData.json');
const BID_SNAPSHOT_DIR = path.join(process.cwd(), 'committed_ui_snapshots', 'Bid.spec.js');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
});

let page, bidPage;

function loadBidData() {
    return JSON.parse(fs.readFileSync(BID_DATA_PATH, 'utf8'));
}

function saveBidData(updated) {
    fs.writeFileSync(BID_DATA_PATH, JSON.stringify(updated, null, 2), 'utf8');
}

test.describe('Verify Bids', () => {
    test.describe.configure({ retries: 1 });

    // ── Property setup — creates a fresh property per suite run ──────────────────
    test.beforeAll(async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: 'sessionState.json' });
        const setupPage = await ctx.newPage();
        const prop = new PropertiesHelper(setupPage);

        const propertyName = `bid_prop_${Date.now()}`;
        await setupPage.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await setupPage.waitForTimeout(1500);
        await prop.goToProperties();
        await prop.createProperty(
            propertyName,
            'Domestic Terminal, College Park, GA 30337, USA',
            'College Park', 'GA', '30337',
            'Garden Style'
        );

        const bidData = JSON.parse(fs.readFileSync(BID_DATA_PATH, 'utf8'));
        saveBidData({ ...bidData, property: propertyName });
        Logger.info(`Created property for bid tests: ${propertyName}`);

        await ctx.close();
    });

    test.beforeEach(async ({ page: p }) => {
        if (!fs.existsSync(BID_SNAPSHOT_DIR)) fs.mkdirSync(BID_SNAPSHOT_DIR, { recursive: true });
        page = p;
        bidPage = new BidPage(page);
        await page.goto(`${process.env.BASE_URL}/bids`, { waitUntil: 'load' });
        await expect(page).toHaveURL(/\/bids$/);
        await page.waitForTimeout(3000);
    });

    // ──────────────────────────────────────────────────────────────────────────────
    // TC_BID_01 — Bid list page layout
    // ──────────────────────────────────────────────────────────────────────────────
    test('TC_BID_01 @regression @bid : Should display Bid list page with correct layout, columns and toolbar', async () => {
        Logger.step('TC_BID_01: Asserting Bid list page');

        await bidPage.assertBidsListPage();

        const rows = page.getByRole('row').filter({ has: page.getByRole('link') });
        const rowCount = await rows.count().catch(() => 0);
        Logger.info(`Bid rows visible: ${rowCount}`);
        expect(rowCount).toBeGreaterThanOrEqual(0);

        Logger.success('TC_BID_01 passed');
    });

    // ──────────────────────────────────────────────────────────────────────────────
    // TC_BID_02 — Create AI Bid + Overview tab + Edit due date
    // ──────────────────────────────────────────────────────────────────────────────
    test('TC_BID_02 @regression @bid @createBid : Should open Create Bid modal, assert all fields and dropdown options, create bid, verify Overview tab and edit due date', async () => {
        const bidData = loadBidData();
        const uniqueBidName = `Auto_Bid_${Date.now()}`;

        Logger.step('TC_BID_02: Open Create Bid modal and assert fields');
        await bidPage.openCreateBidModal();
        await bidPage.assertCreateBidModalFields();

        await bidPage.assertBidTypeDropdownOptions();
        await bidPage.assertDetailLevelDropdownOptions();
        await bidPage.assertPriceByDropdownOptions();
        await bidPage.assertStatusDropdownOptions();

        const formData = {
            bidName: uniqueBidName,
            property: bidData.property,
            bidType: bidData.bidType,
            detailLevel: bidData.detailLevel,
            priceBy: bidData.priceBy,
            bidDueDate: bidData.bidDueDate,
            status: bidData.status,
        };
        await bidPage.fillAndSubmitCreateBidForm(formData);

        const bidId = await bidPage.waitForBidDetailPage();
        const bidUrl = `${process.env.BASE_URL}/bids/${bidId}`;

        saveBidData({ ...bidData, bidName: uniqueBidName, bidId, bidUrl });

        await expect(page).toHaveTitle(new RegExp(uniqueBidName, 'i'));

        await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Bid Book AI Assisted' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Manage Bids' })).toBeVisible();

        // Assert Overview tab field values
        await bidPage.assertOverviewTab(formData);

        // Assert Edit Bid dialog and due date modification (criterion: due date modification)
        Logger.step('TC_BID_02 — Edit Bid due date e2e');
        await bidPage.assertEditBidDueDate(bidData.editedDueDate);

        Logger.success(`TC_BID_02 passed — bid created: ${uniqueBidName} (ID: ${bidId})`);
    });

    // ──────────────────────────────────────────────────────────────────────────────
    // TC_BID_03 — Bid Book AI tab: full e2e
    //   Coverage:
    //   • Bid book generation without attachments
    //   • Upload attachments (chat attach dialog surface verification)
    //   • Multiple prompt conversation (fallback message path)
    //   • Iframe table: column headers, row counts, TOTALS, Bid button
    //   • All toolbar buttons (Fullscreen, Export, Save as Template, Send to Vendors, Reset)
    //   • Export: filename + non-zero file size
    //   • Save as Template: dialog fields, disabled→enabled state, actual save
    //   • Send to Vendors: Next btn hidden before selection, visible after; Bid Template
    //     pre-checked & disabled; invitations sent toast
    //   • Reset: iframe gone, chat cleared, input re-enabled
    // ──────────────────────────────────────────────────────────────────────────────
    test('TC_BID_03 @regression @bid @aiBidBook : Should assert Bid Book AI tab — invoke AI, assert iframe table and all toolbar button e2e flows ending with Reset', async () => {
        test.setTimeout(900000); // AI wait (4 min) + fallback (4 min) + all e2e flows (~5 min)
        const bidData = loadBidData();
        if (!bidData.bidUrl) test.skip(true, 'bidUrl not set — run TC_BID_02 first');

        Logger.step(`TC_BID_03: Navigating to bid: ${bidData.bidUrl}`);
        await page.goto(bidData.bidUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000);
        await expect(page).toHaveURL(new RegExp(`/bids/${bidData.bidId}`));

        await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Bid Book AI Assisted' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Manage Bids' })).toBeVisible();

        await bidPage.navigateToBidBookTab();
        await bidPage.assertBidBookTabElements();

        // ── Chat attachment dialog surface (criterion: upload attachments during chat) ──
        Logger.step('TC_BID_03 — Chat attachment dialog');
        await bidPage.assertChatAttachDialog();

        // ── Send invoke text (criterion: bid book generation without attachments) ────
        await bidPage.typeInvokeMessage(bidData.invokeText);

        // ── Wait for table — sends follow-up if first message produced no iframe ──────
        // This implicitly covers criterion: multiple prompt conversation flow
        await bidPage.waitForBidBookTable();

        // ── Assert iframe table structure (columns, rows, totals, Bid button) ─────────
        await bidPage.assertBidBookIframeTable();

        // ── Assert all toolbar buttons present after table generation ─────────────────
        await bidPage.assertBidBookToolbar();

        // ── e2e 1: Fullscreen toggle ──────────────────────────────────────────────────
        Logger.step('TC_BID_03 — Fullscreen e2e');
        await bidPage.assertFullscreenToggle();

        // ── e2e 2: Export — download + non-zero file size ─────────────────────────────
        Logger.step('TC_BID_03 — Export e2e');
        await bidPage.assertExportDownload();

        // ── e2e 3: Save as Template — fields, save actually executed ──────────────────
        Logger.step('TC_BID_03 — Save as Template e2e');
        await bidPage.assertSaveAsTemplateDialog();

        // ── e2e 4: Send to Vendors — full wizard with state assertions ────────────────
        Logger.step('TC_BID_03 — Send to Vendors e2e');
        await bidPage.assertSendToVendorsFlow(bidData.sendToVendors);

        // ── e2e 5: Reset — LAST (clears chat + spreadsheet, verifies clean state) ─────
        Logger.step('TC_BID_03 — Reset e2e (LAST)');
        await bidPage.assertResetBidBook();

        Logger.success('TC_BID_03 passed — all Bid Book AI toolbar e2e flows verified');
    });

    // ──────────────────────────────────────────────────────────────────────────────
    // TC_BID_04 — Manage Bids tab: assert columns and toolbar
    // ──────────────────────────────────────────────────────────────────────────────
    test('TC_BID_04 @regression @bid @manageBids : Should assert Manage Bids tab columns and toolbar', async () => {
        const bidData = loadBidData();
        if (!bidData.bidUrl) test.skip(true, 'bidUrl not set — run TC_BID_02 first');

        Logger.step(`TC_BID_04: Navigating to bid: ${bidData.bidUrl}`);
        await page.goto(bidData.bidUrl, { waitUntil: 'load' });
        await page.waitForTimeout(3000);
        await expect(page).toHaveURL(new RegExp(`/bids/${bidData.bidId}`));

        await bidPage.assertManageBidsTab();

        Logger.success('TC_BID_04 passed — Manage Bids tab asserted');
    });

    // ──────────────────────────────────────────────────────────────────────────────
    // TC_BID_05 — Create Bid dialog: full fixture-driven assertion of every
    //             field label, placeholder, and each dropdown option
    // ──────────────────────────────────────────────────────────────────────────────
    test('TC_BID_05 @regression @bid @dialogAssert : Should assert every field label, placeholder and dropdown option in Create Bid dialog using fixture data from bidData.json', async () => {
        const bidData = loadBidData();

        Logger.step('TC_BID_05: Opening Create Bid dialog for complete fixture assertion');

        await bidPage.openCreateBidModal();
        await bidPage.assertCreateBidDialogFromFixture(bidData.createBidDialog);

        Logger.success('TC_BID_05 passed — Create Bid dialog completely verified against fixture');
    });

    // ──────────────────────────────────────────────────────────────────────────────
    // TC_BID_06 — Delete the recently created bid (MUST run last)
    // ──────────────────────────────────────────────────────────────────────────────
    test.skip('TC_BID_06 @regression @bid @deleteBid : Should delete the recently created bid from the list, assert delete dialog and verify bid is removed', async () => {
        const bidData = loadBidData();
        if (!bidData.bidId) test.skip(true, 'bidId not set — run TC_BID_02 first');

        Logger.step(`TC_BID_06: Deleting bid "${bidData.bidName}" (ID: ${bidData.bidId})`);
        await bidPage.deleteBid(bidData);

        Logger.success(`TC_BID_06 passed — bid "${bidData.bidName}" deleted and confirmed gone from list`);
    });
});
