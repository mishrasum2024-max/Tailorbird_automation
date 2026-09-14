const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const {
    vendorBidsNavLinkStrategies,
    vendorBidsGridStrategies,
    vendorBidsGridRowsStrategies,
    viewDetailsButtonStrategies,
    bidDetailTabStrategies,
    uploadDocumentButtonStrategies,
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
        this.bidsNavLink = healingLocator(vendorBidsNavLinkStrategies(page));
        this.bidsGrid = healingLocator(vendorBidsGridStrategies(page));
        this.bidDetailTab = healingLocator(bidDetailTabStrategies(page));
        this.uploadDocumentButton = healingLocator(uploadDocumentButtonStrategies(page));
        this.uploadcareFromDeviceButton = healingLocator(uploadcareFromDeviceButtonStrategies(page));
        this.uploadcareDoneButton = healingLocator(uploadcareDoneButtonStrategies(page));
        this.submitBidButton = healingLocator(submitBidButtonStrategies(page));
    }

    async navigateToBids() {
        Logger.step('VendorBidPage: navigating to Bids...');
        await this.bidsNavLink.click();
        await this.page.waitForURL(/\/bids-and-contracts\/bids/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2000);
        Logger.success('VendorBidPage: on Bids listing.');
    }

    /**
     * A row counts as real data only if its text contains a Status token AND does not look
     * like the revo-grid's raw injected-CSS decoy rows (MCP/DOM-verified quirk: some rgRow
     * elements contain literal stylesheet text instead of bid data).
     */
    static isDecoyRowText(text) {
        return !text || /:root|mantine-font-family|@media/i.test(text);
    }

    /**
     * Scans the Bids grid for the first row whose Status is NOT "Awarded". Returns
     * `{ row, bidName, status }` for that row, or `null` if every real bid row is Awarded.
     * @returns {Promise<{row: import('@playwright/test').Locator, bidName: string, status: string} | null>}
     */
    async findNonAwardedBidRow() {
        const rows = healingLocator(vendorBidsGridRowsStrategies(this.bidsGrid));
        const count = await rows.count();
        Logger.info(`VendorBidPage: scanning ${count} grid row(s) for a non-Awarded bid...`);

        for (let i = 0; i < count; i++) {
            const row = rows.nth(i);
            const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
            if (VendorBidPage.isDecoyRowText(text)) continue;

            const isAwarded = /\bAwarded\b/i.test(text);
            if (!isAwarded) {
                const bidNameMatch = text.match(/^(.+?)(Test Property|Property|—|\d)/);
                const bidName = bidNameMatch ? bidNameMatch[1].trim() : text;
                Logger.info(`VendorBidPage: found non-Awarded bid row — "${bidName}" (row text: "${text}")`);
                return { row, bidName, status: text };
            }
        }

        Logger.info('VendorBidPage: every real bid row is Awarded.');
        return null;
    }

    /**
     * Opens a bid row's detail page via its "View Details" action button.
     * @param {import('@playwright/test').Locator} row
     */
    async openBidRow(row) {
        const viewDetailsBtn = healingLocator(viewDetailsButtonStrategies(row));
        await viewDetailsBtn.scrollIntoViewIfNeeded();
        await expect(viewDetailsBtn).toBeVisible({ timeout: 10000 });
        await viewDetailsBtn.click();
        await this.page.waitForURL(/\/bids-and-contracts\/bids\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorBidPage: opened bid detail page — ${this.page.url()}`);
    }

    /**
     * Uploads the given local file as the bid's completed template via the Bid tab's
     * "Upload Document" button (Uploadcare widget: From device → auto-uploads → Done).
     * @param {string} filePath absolute path to the file to upload
     */
    async uploadBidDocument(filePath) {
        Logger.step(`VendorBidPage: uploading bid document "${filePath}"...`);
        await expect(this.bidDetailTab).toBeVisible({ timeout: 10000 });

        await expect(this.uploadDocumentButton).toBeVisible({ timeout: 10000 });
        await this.uploadDocumentButton.click();

        await expect(this.uploadcareFromDeviceButton).toBeVisible({ timeout: 10000 });
        const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout: 10000 }),
            this.uploadcareFromDeviceButton.click(),
        ]);
        await fileChooser.setFiles(filePath);
        Logger.info('VendorBidPage: file selected via native chooser.');

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
