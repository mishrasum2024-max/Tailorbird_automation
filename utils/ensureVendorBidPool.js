require('dotenv').config();
const { BidPage } = require('../pages/bidPage');
const { VendorBidPage } = require('../pages/vendorBidPage');
const { Logger } = require('./logger');

// Live-verified 2026-09-20: this property already carries multiple existing bids for this
// org and is a valid "Property" dropdown option in Create Bid, so it's safe to create more
// bids against it without needing a fresh property per run.
const STABLE_PROPERTY = 'Test Property 1_Cottages on Elm';

// IMPORTANT: `vendorsession.json` (the storageState every TC30-34 vendor-portal test runs
// as) does NOT belong to process.env.VENDOR_EMAIL — live-verified 2026-09-20 via a CI
// report's captured Profile page (TC498's error-context) that the actual logged-in vendor
// is "sumit corp" / oct30sumit@yopmail.com (Vendor ID 237). This is the SAME vendor
// contact TC454 (tests/TC20_Bid.spec.js) already invites via assertSendToVendorsFlowByEmail
// as part of its own normal flow — reusing that exact, already-proven identity here rather
// than the env var, which is only used for a separate, unrelated vendor login (TC01/TC31).
const VENDOR_EMAIL = 'oct30sumit@yopmail.com';
const VENDOR_SEARCH_TERM = 'sumit corp';
const VENDOR_NAME = 'sumit corp';

const AI_BID_BOOK_PROMPT = 'Create an interior paint bid book. Scopes: Wall Paint, Ceiling Paint, Trim & Doors — each with 1 Material row and 1 Labor row. Include EXACTLY these columns in this order: Scope, Location, Item, Cost Type, Description, # Units, Unit Price, Aggregate, Weighted Avg Price, Notes.';

/**
 * Ensures at least one bid with Status "Invited" exists on VENDOR_EMAIL's vendor Bids
 * listing, creating and inviting one via the existing admin Create-Bid → generate Bid
 * Book → Send to Vendors flow (all pre-existing BidPage methods, nothing new invented)
 * if none currently exists.
 *
 * Why this is needed: the vendor Bids queue is a shared, persistent resource across the
 * whole regression suite — some tests (e.g. TC528's real Accept) permanently consume an
 * "Invited" bid out of it, so a later test in the same run can find the queue empty even
 * though the underlying feature works fine. Per explicit instruction: don't skip (or
 * hard-fail) on a missing precondition when the code to create it already exists —
 * create it instead, and only fail for real if creation itself fails.
 *
 * Uses fresh browser contexts (not the calling test's own `page`) so it can run from a
 * `test.beforeAll` shared across every test in a file without disturbing per-test state.
 * @param {import('@playwright/test').Browser} browser
 * @returns {Promise<{bidName: string}>}
 */
async function ensureInvitedBidForVendor(browser) {
    const vendorContext = await browser.newContext({ storageState: 'vendorsession.json' });
    try {
        const vendorPage = await vendorContext.newPage();
        await vendorPage.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await vendorPage.waitForLoadState('domcontentloaded');
        await vendorPage.waitForTimeout(1500);
        const vendorBidPage = new VendorBidPage(vendorPage);
        await vendorBidPage.navigateToBids();
        const existing = await vendorBidPage.findBidRowByStatus('Invited');
        if (existing) {
            Logger.info(`ensureInvitedBidForVendor: "Invited" bid already exists — "${existing.bidName}". No action needed.`);
            return existing;
        }
    } finally {
        // Live-verified 2026-09-20: closing a manually-created extra context under this
        // project's project-wide `trace: 'retain-on-failure'` can throw a benign internal
        // trace-resource-export race (ENOENT on a temp .jpeg/.trace under
        // .playwright-artifacts-0) even though every real action already completed — never
        // let that artifact-cleanup noise fail the calling test.
        await vendorContext.close().catch((e) => Logger.info(`ensureInvitedBidForVendor: vendorContext.close() cleanup warning (ignored): ${e.message.split('\n')[0]}`));
    }

    Logger.info('ensureInvitedBidForVendor: no "Invited" bid found for this vendor — creating and inviting one via the admin flow (can take a couple of minutes: AI bid book generation + Send to Vendors).');
    const adminContext = await browser.newContext({ storageState: 'sessionState.json' });
    try {
        const adminPage = await adminContext.newPage();
        const bidPage = new BidPage(adminPage);
        await bidPage.navigateToBidsPage();
        await bidPage.openCreateBidModal();
        const bidName = `Auto_Invited_${Date.now()}`;
        await bidPage.fillAndSubmitCreateBidForm({
            bidName,
            property: STABLE_PROPERTY,
            bidType: 'Unit Interior',
            detailLevel: 'Short & Summarized',
            priceBy: 'Lump Sum: by Scope',
            bidDueDate: '2026-12-31',
        });
        await bidPage.waitForBidDetailPage();
        await bidPage.navigateToBidBookTab();
        await bidPage.assertBidBookTabElements();

        let tableGenerated = false;
        for (let ask = 1; ask <= 3 && !tableGenerated; ask++) {
            const message = ask === 1
                ? AI_BID_BOOK_PROMPT
                : `The bid book table has not appeared in the right-hand panel yet (attempt ${ask}). ${AI_BID_BOOK_PROMPT}`;
            tableGenerated = await bidPage.generateBidBookViaChat(message);
        }
        if (!tableGenerated) {
            throw new Error(`ensureInvitedBidForVendor: bid book table never generated for "${bidName}" after 3 AI chat attempts.`);
        }

        await bidPage.assertSendToVendorsFlowByEmail({
            searchTerm: VENDOR_SEARCH_TERM,
            vendorName: VENDOR_NAME,
            vendorEmail: VENDOR_EMAIL,
        });
        Logger.success(`ensureInvitedBidForVendor: created and invited "${bidName}" to ${VENDOR_EMAIL}.`);
        return { bidName };
    } finally {
        await adminContext.close().catch((e) => Logger.info(`ensureInvitedBidForVendor: adminContext.close() cleanup warning (ignored): ${e.message.split('\n')[0]}`));
    }
}

module.exports = { ensureInvitedBidForVendor };
