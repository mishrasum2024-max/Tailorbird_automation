const path = require('path');
const fs = require('fs');
const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');
const {
    vendorBidsNavLinkStrategies,
    vendorBidsGridStrategies,
    vendorBidsGridRowsStrategies,
    exportButtonStrategies,
    viewDetailsButtonStrategies,
    acceptBidButtonStrategies,
    acceptBidConfirmButtonStrategies,
    bidDetailTabStrategies,
    uploadOrReplaceDocumentButtonStrategies,
    uploadcareFromDeviceButtonStrategies,
    uploadcareDoneButtonStrategies,
    submitBidButtonStrategies,
} = require('../locators/vendorBidLocator');

/**
 * Page object for the VENDOR portal's Bids workspace — a separate app surface from the
 * admin/PM Bids module (pages/bidPage.js). New file; no existing methods altered.
 */
class VendorBidPage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        // MCP/Playwright-verified: the expanded nav renders two DOM nodes with an identical
        // "Bids" NavLink label (a rail-state node plus the expanded one) — .first() picks the
        // interactable one without treating this as a real ambiguity.
        this.bidsNavLink = healingLocator(vendorBidsNavLinkStrategies(page)).first();
        this.bidsGrid = healingLocator(vendorBidsGridStrategies(page));
        this.exportButton = healingLocator(exportButtonStrategies(page)).first();
        this.bidDetailTab = healingLocator(bidDetailTabStrategies(page)).first();
        // .first() throughout below: a text-based strategy can independently match both a
        // <button> and its inner label <span> — both are valid hits on the same control, not
        // a real ambiguity (see bidsNavLink above).
        this.acceptBidButton = healingLocator(acceptBidButtonStrategies(page)).first();
        this.acceptBidConfirmButton = healingLocator(acceptBidConfirmButtonStrategies(page)).first();
        this.uploadDocumentButton = healingLocator(uploadOrReplaceDocumentButtonStrategies(page)).first();
        // .filter({visible:true}): repeated upload/replace runs on the same live bid can leave
        // stale, hidden Uploadcare widget instances in the DOM (MCP/Playwright-verified) — only
        // the currently-open dialog's controls should ever be targeted.
        this.uploadcareFromDeviceButton = healingLocator(uploadcareFromDeviceButtonStrategies(page)).filter({ visible: true }).first();
        this.uploadcareDoneButton = healingLocator(uploadcareDoneButtonStrategies(page)).filter({ visible: true }).first();
        this.submitBidButton = healingLocator(submitBidButtonStrategies(page)).first();
    }

    async navigateToBids() {
        Logger.step('VendorBidPage: navigating to Bids...');
        // Vendor portal nav uses the same collapsed/hover-to-expand rail as the admin app
        // (MCP/Playwright-verified 2026-09-14: width=68px in a 1280x720 viewport, no visible
        // "Bids" label until expanded) — reuse the existing shared utility rather than
        // duplicating its hover+pin logic here.
        await ensureLeftPanelExpanded(this.page);
        await this.bidsNavLink.click();
        await this.page.waitForURL(/\/bids-and-contracts\/bids/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2000);
        Logger.success('VendorBidPage: on Bids listing.');
    }

    /** Quote-aware CSV line splitter for the Bids export (MCP-verified 2026-09-14: every field
     * in that export is double-quoted, e.g. `"Bid Name","Property",...` — no embedded/escaped
     * quotes observed in real data), so pulling out each `"..."` group in order is sufficient. */
    static _parseCsvLine(line) {
        return Array.from(line.matchAll(/"([^"]*)"/g)).map((m) => m[1]);
    }

    /**
     * Finds the first bid that is NOT "Awarded" (i.e. still active from the vendor's side —
     * "Invited", "Submitted", or "Re-submitted") by exporting the Bids list to CSV and reading
     * that file, rather than scanning the live grid directly.
     *
     * The live revo-grid virtualizes both rows AND columns — MCP/Playwright-verified 2026-09-14
     * that scanning it directly right after navigation is unreliable: one read returned an
     * entire row's flattened text in place of a header label, and later reads returned an
     * incomplete/shifting set of column headers (one had no "Status" column, the next had no
     * "Bid Name" column) because only currently-scrolled-into-view columns are mounted. The
     * exported CSV has a fixed, complete header row and no such virtualization, decoy rows, or
     * digit-in-bid-name ambiguity (bid names here are timestamp-suffixed, e.g.
     * "AI_Bid_1789384139162", which separately broke an earlier whole-row-text-regex approach).
     *
     * Once the target bid name is known from the file, the corresponding LIVE row is found by
     * filtering on that exact bid name text (not by column position), which is what actually
     * needs to be clicked.
     * @returns {Promise<{rowGrow: string, bidName: string, status: string} | null>}
     */
    async findNonAwardedBidRow() {
        Logger.step('VendorBidPage: exporting Bids list to find a non-Awarded bid...');
        const downloadDir = path.join(__dirname, '../downloads');
        fs.mkdirSync(downloadDir, { recursive: true });
        const [download] = await Promise.all([
            this.page.waitForEvent('download', { timeout: 15000 }),
            this.exportButton.click(),
        ]);
        const csvPath = path.join(downloadDir, `vendor-bids-export-${Date.now()}.csv`);
        await download.saveAs(csvPath);
        const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);

        const header = VendorBidPage._parseCsvLine(lines[0]);
        const bidNameIdx = header.findIndex((h) => /^bid name$/i.test(h));
        const statusIdx = header.findIndex((h) => /^status$/i.test(h));
        if (bidNameIdx === -1 || statusIdx === -1) {
            throw new Error(`VendorBidPage.findNonAwardedBidRow: could not locate "Bid Name"/"Status" columns in export header [${header.join(', ')}]`);
        }

        const bids = lines.slice(1).map((line) => {
            const cols = VendorBidPage._parseCsvLine(line);
            return { bidName: (cols[bidNameIdx] || '').trim(), status: (cols[statusIdx] || '').trim() };
        }).filter((b) => b.bidName && b.status);
        Logger.info(`VendorBidPage: ${bids.length} bid(s) in export — ${JSON.stringify(bids)}`);

        const target = bids.find((b) => !/^awarded$/i.test(b.status));
        if (!target) {
            Logger.info('VendorBidPage: every bid in the export is Awarded.');
            return null;
        }

        const row = healingLocator(vendorBidsGridRowsStrategies(this.bidsGrid)).filter({ hasText: target.bidName }).first();
        await expect(row).toBeVisible({ timeout: 10000 });
        const rowGrow = await row.getAttribute('data-rgrow');
        if (!rowGrow) {
            throw new Error(`VendorBidPage.findNonAwardedBidRow: found "${target.bidName}" in the export but its live grid row has no data-rgrow`);
        }
        Logger.info(`VendorBidPage: found non-Awarded bid — "${target.bidName}" (status: "${target.status}", data-rgrow="${rowGrow}")`);
        return { rowGrow, bidName: target.bidName, status: target.status };
    }

    /**
     * Opens a bid's detail page via its "View Details" action button, matched by the row's
     * `data-rgrow` (the Actions column lives in a separate pinned revo-grid section, not
     * nested inside the row itself).
     * @param {string} rowGrow the row's `data-rgrow` attribute value, from findNonAwardedBidRow()
     */
    async openBidRow(rowGrow) {
        const viewDetailsBtn = healingLocator(viewDetailsButtonStrategies(this.page, rowGrow));
        await viewDetailsBtn.scrollIntoViewIfNeeded();
        await expect(viewDetailsBtn).toBeVisible({ timeout: 10000 });
        await viewDetailsBtn.click();
        await this.page.waitForURL(/\/bids-and-contracts\/bids\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorBidPage: opened bid detail page — ${this.page.url()}`);
    }

    /**
     * A freshly-"Invited" bid's detail page shows a "Bid invitation / Invited" header with
     * "Reject Bid"/"Accept Bid" buttons and only a "Download Template" button — no Upload/Replace
     * Document or Submit Bid button exists yet (MCP-verified 2026-09-14 on bid 186). The vendor
     * must Accept the bid (via a confirmation dialog) before those become available. A bid that
     * was accepted earlier (or is past "Invited" already) has no "Accept Bid" button at all, so
     * this is a no-op in that case — both cases handled, zero assumptions about which state the
     * bid found by findNonAwardedBidRow() is actually in.
     */
    async acceptBidIfNeeded() {
        const needsAccept = await this.acceptBidButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (!needsAccept) {
            Logger.info('VendorBidPage: no "Accept Bid" button — bid was already accepted.');
            return;
        }
        Logger.step('VendorBidPage: bid is still "Invited" — accepting it...');
        await this.acceptBidButton.click();
        await expect(this.acceptBidConfirmButton).toBeVisible({ timeout: 10000 });
        await this.acceptBidConfirmButton.click();
        await this.page.waitForTimeout(2000);
        Logger.success('VendorBidPage: bid accepted.');
    }

    /**
     * Uploads the given local file as the bid's completed template via the Bid tab's header
     * button (Uploadcare widget: From device → auto-uploads → Done). That button reads
     * "Upload Document" the first time and "Replace Document" once a file is already attached
     * to the bid (MCP-verified live) — both are handled by the same locator.
     *
     * Attach strategy mirrors the @mandatory-tagged, CI-green pattern already established for
     * this exact Uploadcare widget elsewhere in the suite (pages/budgetPage.js's
     * uploadFileInRevision / tryDirectFileInput, copied verbatim into
     * pages/multiYearBudgetPage.js's uploadCsvFile with the same documented reasoning):
     * `page.waitForEvent('filechooser')` after a "From device"-style click works locally but
     * is not reliably supported by GitHub Actions' headless CI runner for Uploadcare, so the
     * direct hidden `<input type="file">` is tried FIRST, with the native filechooser event as
     * a fallback (and one more direct-input attempt after that) rather than the other way
     * round. Neither budgetPage.js nor multiYearBudgetPage.js is modified — this is a new,
     * independent copy scoped to the vendor bid-detail page's own Uploadcare instance.
     * @param {string} filePath absolute path to the file to upload
     */
    async uploadBidDocument(filePath) {
        Logger.step(`VendorBidPage: uploading bid document "${filePath}"...`);
        await expect(this.bidDetailTab).toBeVisible({ timeout: 10000 });

        await expect(this.uploadDocumentButton).toBeVisible({ timeout: 10000 });
        Logger.info(`VendorBidPage: header button reads "${(await this.uploadDocumentButton.textContent().catch(() => '')).trim()}"`);
        await this.uploadDocumentButton.click();

        const tryDirectFileInput = async (maxMs = 20000) => {
            const deadline = Date.now() + maxMs;
            const buildCandidates = () => [
                this.page.locator('uc-file-uploader-regular input[type="file"]'),
                this.page.locator('uc-file-uploader-regular').locator('input[type="file"]'),
                this.page.locator('uc-file-uploader-inline input[type="file"]'),
                this.page.locator('uc-file-uploader-inline').locator('input[type="file"]'),
                this.page.locator('.mantine-FileButton-root input[type="file"]').first(),
                this.page.locator('input[type="file"][accept*="xls"]'),
                this.page.locator('input[type="file"]'),
            ];
            while (Date.now() < deadline) {
                for (const loc of buildCandidates()) {
                    try {
                        const n = await loc.count();
                        if (n === 0) continue;
                        await loc.first().setInputFiles(filePath, { timeout: 15000 });
                        Logger.success('VendorBidPage: attached file via hidden <input type="file"> (Uploadcare).');
                        return true;
                    } catch {
                        /* try next locator / next poll slice */
                    }
                }
                await this.page.waitForTimeout(450);
            }
            return false;
        };

        if (!(await tryDirectFileInput(3000))) {
            const fromDeviceVisible = await this.uploadcareFromDeviceButton.isVisible({ timeout: 5000 }).catch(() => false);
            let attachedViaFileChooser = false;
            if (fromDeviceVisible) {
                try {
                    const [fileChooser] = await Promise.all([
                        this.page.waitForEvent('filechooser', { timeout: 10000 }),
                        this.uploadcareFromDeviceButton.click(),
                    ]);
                    await fileChooser.setFiles(filePath);
                    attachedViaFileChooser = true;
                    Logger.info('VendorBidPage: file selected via native chooser.');
                } catch {
                    Logger.info('VendorBidPage: no native filechooser event (expected in some CI environments) — falling back to direct <input type="file">.');
                }
            }
            if (!attachedViaFileChooser && !(await tryDirectFileInput())) {
                throw new Error('VendorBidPage.uploadBidDocument: neither the native filechooser event nor a direct <input type="file"> attach succeeded');
            }
        }

        await expect(this.uploadcareDoneButton).toBeVisible({ timeout: 15000 });
        await this.uploadcareDoneButton.click();
        await this.page.waitForTimeout(1500);
        Logger.success('VendorBidPage: document uploaded and widget closed.');
    }

    async submitBid() {
        Logger.step('VendorBidPage: submitting bid...');
        await expect(this.submitBidButton).toBeEnabled({ timeout: 10000 });
        await this.submitBidButton.click();
        await this.page.waitForTimeout(2000);
        Logger.success('VendorBidPage: Submit Bid clicked.');
    }
}

module.exports = { VendorBidPage };
