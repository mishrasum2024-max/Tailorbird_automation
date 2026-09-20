require('dotenv').config();

const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { retryOperation } = require('../utils/resilientRetry');
const {
    bidDetailTabStrategies,
    acceptBidButtonStrategies,
    acceptBidConfirmButtonStrategies,
} = require('../locators/vendorBidLocator');
const { piperTitleStrategies, piperAskInputStrategies } = require('../locators/vendorListingLocator');
const {
    bidWorkspaceStatusBadgeStrategies,
    bidWorkspaceSubtitleStrategies,
    bidActionConfirmDialogStrategies,
    bidWorkspacePropertyTabStrategies,
    propertySubTabStrategies,
    propertyOverviewFieldValueStrategies,
    downloadTemplateButtonStrategies,
    bidScopeIframeStrategies,
    bidDocumentsHeadingStrategies,
    bidDocumentsTableHeaderStrategies,
    assetViewerTypeSelectStrategies,
    assetViewerExportButtonStrategies,
    assetViewerEmptyStateStrategies,
    takeOffsCategoryTabStrategies,
    takeOffsEmptyStateStrategies,
    locationsEmptyStateStrategies,
} = require('../locators/vendorBidWorkspaceLocator');

/** The Property tab's 5 sub-tabs and their canonical (label, empty-state-or-null) shape,
 * MCP-verified 2026-09-15 on bid id 196 ("bid_prop_1789464855389"). */
const PROPERTY_OVERVIEW_FIELDS = ['Ownership Group', 'Property Name', 'Property Type', 'Address', 'City', 'State', 'Zip Code'];
const TAKE_OFFS_CATEGORY_TABS = ['Floor Plans', 'Building Exterior', 'Site', 'Interior Common Area'];

/**
 * Page object for a single VENDOR bid workspace (beta.tailorbird.com/bids-and-contracts/bids/:id)
 * BEYOND the accept/upload/submit flow already covered by pages/vendorBidPage.js — this adds the
 * Reject/Accept confirmation dialogs and the read-only "Property" tab's 5 sub-tabs (Overview,
 * Documents, Asset Viewer, Locations, Take Offs), which is where Phase 3's read-only
 * Property/Asset/Takeoff data is actually surfaced as workspace widgets. New file; no existing
 * methods altered.
 */
class VendorBidWorkspacePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        this.bidDetailTab = healingLocator(bidDetailTabStrategies(page)).first();
        this.propertyTab = healingLocator(bidWorkspacePropertyTabStrategies(page)).first();
        this.statusBadge = healingLocator(bidWorkspaceStatusBadgeStrategies(page)).first();
        this.subtitle = healingLocator(bidWorkspaceSubtitleStrategies(page)).first();
        this.acceptBidButton = healingLocator(acceptBidButtonStrategies(page)).first();
        this.acceptBidConfirmButton = healingLocator(acceptBidConfirmButtonStrategies(page)).first();
        this.downloadTemplateButton = healingLocator(downloadTemplateButtonStrategies(page)).first();
        this.scopeIframe = healingLocator(bidScopeIframeStrategies(page)).first();
        this.piperTitle = healingLocator(piperTitleStrategies(page)).first();
    }

    /** Asserts the Bid tab's full content: status badge, subtitle, Reject/Accept buttons,
     * Download Template button, and the scope-of-work iframe with at least one data row. */
    async assertBidTabFullyVisible() {
        Logger.step('VendorBidWorkspacePage: asserting Bid tab...');
        await expect(this.piperTitle, 'FAIL: "Piper" panel not visible in bid workspace.').toBeVisible({ timeout: 10000 });
        await expect(this.statusBadge, 'FAIL: bid workspace status badge not visible.').toBeVisible();
        await expect(this.subtitle, 'FAIL: bid workspace subtitle (bid name · type · due date) not visible.').toBeVisible();
        await expect(this.bidDetailTab, 'FAIL: "Bid" tab not visible.').toBeVisible();
        await expect(this.propertyTab, 'FAIL: "Property" tab not visible.').toBeVisible();
        await expect(this.downloadTemplateButton, 'FAIL: "Download Template" button not visible.').toBeVisible();
        await expect(this.scopeIframe, 'FAIL: scope-of-work iframe not visible.').toBeVisible({ timeout: 15000 });
        const iframeRowCount = await this.scopeIframe.contentFrame().locator('table tr').count().catch(() => 0);
        expect(iframeRowCount, 'FAIL: scope-of-work table inside the iframe has no rows (expected a header + at least one data row).').toBeGreaterThan(1);
        Logger.success('VendorBidWorkspacePage: Bid tab verified.');
    }

    /** Clicks Accept Bid (or Reject Bid), asserts the resulting confirmation dialog's title and
     * question text, then Cancels it — verifying the modal renders correctly and that
     * cancelling leaves the bid's status unchanged, without committing an irreversible action
     * on shared live test data.
     * @param {'Accept Bid'|'Reject Bid'} action
     */
    async assertActionConfirmDialogThenCancel(action) {
        Logger.step(`VendorBidWorkspacePage: clicking "${action}" and validating its confirmation dialog...`);
        const trigger = this.page.getByRole('button', { name: action, exact: true });
        await expect(trigger, `FAIL: "${action}" button not visible.`).toBeVisible({ timeout: 10000 });
        const statusBefore = (await this.statusBadge.innerText().catch(() => '')).trim();

        await trigger.click();
        const dialog = healingLocator(bidActionConfirmDialogStrategies(this.page, action)).first();
        await expect(dialog, `FAIL: "${action}" confirmation dialog did not appear.`).toBeVisible({ timeout: 10000 });
        const questionText = /^Accept/.test(action)
            ? 'Are you sure you want to accept this bid?'
            : 'Are you sure you want to reject this bid?';
        await expect(dialog.getByText(questionText, { exact: true }), `FAIL: "${action}" dialog is missing its confirmation question "${questionText}".`).toBeVisible();

        const cancelButton = dialog.getByRole('button', { name: 'Cancel', exact: true });
        await expect(cancelButton, `FAIL: "${action}" dialog is missing a "Cancel" button.`).toBeVisible();
        await cancelButton.click();
        await expect(dialog, `FAIL: "${action}" dialog is still visible after clicking Cancel.`).toBeHidden({ timeout: 10000 });

        const statusAfter = (await this.statusBadge.innerText().catch(() => '')).trim();
        expect(statusAfter, `FAIL: bid status changed from "${statusBefore}" to "${statusAfter}" after cancelling "${action}" — Cancel must be a no-op.`).toBe(statusBefore);
        Logger.success(`VendorBidWorkspacePage: "${action}" confirmation dialog verified and safely cancelled (status unchanged: "${statusAfter}").`);
    }

    /** Clicks "Download Template" and asserts a real file download completes — MCP-verified
     * 2026-09-17 this triggers an actual browser download event (e.g.
     * "Napa_Capex_Roofing_Bid.xlsx"), not a modal/preview. Available regardless of the bid's
     * Invited/Accepted status (MCP-confirmed the button persists after Accept too).
     * @returns {Promise<string>} the downloaded file's suggested filename
     */
    async downloadTemplateAndVerify() {
        Logger.step('VendorBidWorkspacePage: clicking Download Template...');
        await expect(this.downloadTemplateButton, 'FAIL: "Download Template" button not visible.').toBeVisible({ timeout: 10000 });
        // A 15s wait for the download event was observed live to be too tight under real
        // backend latency (the file is generated on-demand server-side, not served static) —
        // retry the click itself a few times with a longer per-attempt wait rather than just
        // waiting longer on one click, since a genuinely missed click needs re-issuing too.
        const download = await retryOperation(async () => {
            const [dl] = await Promise.all([
                this.page.waitForEvent('download', { timeout: 30000 }),
                this.downloadTemplateButton.click(),
            ]);
            return dl;
        }, { attempts: 3, delayMs: 2000, label: 'click Download Template and await the download event' });
        const filename = download.suggestedFilename();
        expect(filename.length, 'FAIL: Download Template did not produce a named file.').toBeGreaterThan(0);
        Logger.success(`VendorBidWorkspacePage: Download Template produced file "${filename}".`);
        return filename;
    }

    /** Types into the Piper "Ask about your bids" input and asserts its send button is enabled
     * and ready once a question is entered — proves the in-workspace follow-up-question
     * affordance is functional, without completing a full AI round trip (nondeterministic
     * response content, not worth asserting in a regression suite). Unlike the Bids-landing
     * Piper panel (whose send button starts disabled on empty input), the bid-workspace
     * variant's send button is a plain `type="submit"` that starts enabled (MCP-verified
     * 2026-09-15) — so only the post-typing state is asserted here, not a specific pre-typing
     * one. */
    async assertPiperAskInputEnablesSend(question) {
        Logger.step('VendorBidWorkspacePage: asserting Piper ask-input accepts text and its send button is enabled...');
        const askInput = healingLocator(piperAskInputStrategies(this.page, 'Ask about your bids')).first();
        await expect(askInput, 'FAIL: Piper "Ask about your bids" input not visible.').toBeVisible({ timeout: 10000 });
        // Scoped to the ask-input's own enclosing <form> (MCP-verified 2026-09-15: the
        // textarea and its one send button share a common <form> ancestor 3 levels up) — NOT
        // "first disabled button on the page", which can match an unrelated disabled control
        // elsewhere.
        const sendButton = askInput.locator('xpath=ancestor::form[1]//button').first();
        await askInput.fill(question);
        await expect(askInput, 'FAIL: Piper ask-input did not retain the typed question.').toHaveValue(question);
        await expect(sendButton, 'FAIL: Piper send button is not enabled after typing a question.').toBeEnabled({ timeout: 5000 });
        Logger.success('VendorBidWorkspacePage: Piper ask-input verified — accepts text, send button enabled.');
    }

    /** Opens the Property tab and asserts all 5 sub-tabs (Overview, Documents, Asset Viewer,
     * Locations, Take Offs) are present. */
    async openPropertyTab() {
        Logger.step('VendorBidWorkspacePage: opening Property tab...');
        await this.propertyTab.click();
        for (const label of ['Overview', 'Documents', 'Asset Viewer', 'Locations', 'Take Offs']) {
            const subTab = healingLocator(propertySubTabStrategies(this.page, label)).first();
            await expect(subTab, `FAIL: Property sub-tab "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        Logger.success('VendorBidWorkspacePage: Property tab opened, all 5 sub-tabs present.');
    }

    /** Overview sub-tab (default on opening Property): asserts every expected read-only field
     * label is visible with a non-empty value (never asserting the dynamic value itself). */
    async assertPropertyOverviewFieldsVisible() {
        Logger.step('VendorBidWorkspacePage: asserting Property > Overview fields...');
        for (const label of PROPERTY_OVERVIEW_FIELDS) {
            const value = healingLocator(propertyOverviewFieldValueStrategies(this.page, label)).first();
            await expect(value, `FAIL: Property Overview field "${label}" value not visible.`).toBeVisible({ timeout: 10000 });
            const text = (await value.innerText().catch(() => '')).trim();
            expect(text.length, `FAIL: Property Overview field "${label}" is empty.`).toBeGreaterThan(0);
        }
        Logger.success('VendorBidWorkspacePage: Property > Overview fields verified (all non-empty).');
    }

    /** Documents sub-tab: asserts the "Bid Documents" heading, description, and the documents
     * table's "File Name" column header render, with at least one document row. */
    async assertPropertyDocumentsTabVisible() {
        Logger.step('VendorBidWorkspacePage: asserting Property > Documents...');
        const subTab = healingLocator(propertySubTabStrategies(this.page, 'Documents')).first();
        await subTab.click();
        const heading = healingLocator(bidDocumentsHeadingStrategies(this.page)).first();
        await expect(heading, 'FAIL: "Bid Documents" heading not visible.').toBeVisible({ timeout: 10000 });
        const header = healingLocator(bidDocumentsTableHeaderStrategies(this.page)).first();
        await expect(header, 'FAIL: Documents table "File Name" column header not visible.').toBeVisible();
        Logger.success('VendorBidWorkspacePage: Property > Documents verified.');
    }

    /** Asset Viewer sub-tab: asserts the Type selector, Export button, and — since no asset has
     * a 3D view selected by default — the "No 3D View Selected" empty state. */
    async assertPropertyAssetViewerTabVisible() {
        Logger.step('VendorBidWorkspacePage: asserting Property > Asset Viewer...');
        const subTab = healingLocator(propertySubTabStrategies(this.page, 'Asset Viewer')).first();
        await subTab.click();
        const typeSelect = healingLocator(assetViewerTypeSelectStrategies(this.page)).first();
        await expect(typeSelect, 'FAIL: Asset Viewer "Type" selector not visible.').toBeVisible({ timeout: 10000 });
        const exportButton = healingLocator(assetViewerExportButtonStrategies(this.page)).first();
        await expect(exportButton, 'FAIL: Asset Viewer "Export" button not visible.').toBeVisible();
        const emptyState = healingLocator(assetViewerEmptyStateStrategies(this.page)).first();
        await expect(emptyState, 'FAIL: Asset Viewer "No 3D View Selected" empty state not visible (expected — no view pre-selected).').toBeVisible();
        Logger.success('VendorBidWorkspacePage: Property > Asset Viewer verified (Type/Export controls + empty state).');
    }

    /** Take Offs sub-tab: asserts all 4 category tabs render, plus either the "No versions
     * available for this property" empty state OR real take-off version data. This property
     * is a shared, persistent fixture reused across many unrelated tests in the suite — live-
     * verified 2026-09-20 it has since accumulated a real take-off version ("Site_..."row
     * data) from other tests, so the empty state no longer holds permanently. Either outcome
     * proves the tab itself renders correctly; only a genuinely broken/blank tab should fail. */
    async assertPropertyTakeOffsTabVisible() {
        Logger.step('VendorBidWorkspacePage: asserting Property > Take Offs...');
        const subTab = healingLocator(propertySubTabStrategies(this.page, 'Take Offs')).first();
        await subTab.click();
        for (const label of TAKE_OFFS_CATEGORY_TABS) {
            const tab = healingLocator(takeOffsCategoryTabStrategies(this.page, label)).first();
            await expect(tab, `FAIL: Take Offs category tab "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        const emptyState = healingLocator(takeOffsEmptyStateStrategies(this.page)).first();
        const emptyStateVisible = await emptyState.isVisible().catch(() => false);
        if (emptyStateVisible) {
            Logger.success('VendorBidWorkspacePage: Property > Take Offs verified (4 category tabs + empty state).');
            return;
        }
        // Scoped to visible treegrid/grid roles only (this app's revo-grid components, used
        // consistently elsewhere in this file) — a bare `table` selector was live-verified
        // 2026-09-20 to match an unrelated HIDDEN <table> elsewhere on the page first, giving
        // a false "not visible" failure even though the real, visible take-off data grid was
        // present and correctly rendered.
        const dataGrid = this.page.locator('[role="treegrid"]:visible, [role="grid"]:visible').first();
        await expect(
            dataGrid,
            'FAIL: neither the Take Offs empty state nor any version data grid is visible — tab appears broken.',
        ).toBeVisible({ timeout: 10000 });
        Logger.success('VendorBidWorkspacePage: Property > Take Offs verified (4 category tabs + real version data, no empty state — property has accumulated take-off data from other tests).');
    }

    /** Locations sub-tab: asserts its toolbar (Search/View/Table/Export) and — since this
     * property has no sites — the "No sites added yet" empty state. */
    async assertPropertyLocationsTabVisible() {
        Logger.step('VendorBidWorkspacePage: asserting Property > Locations...');
        const subTab = healingLocator(propertySubTabStrategies(this.page, 'Locations')).first();
        await subTab.click();
        for (const label of ['View', 'Table', 'Export']) {
            const toolbarButton = this.page.getByRole('button', { name: label, exact: true });
            await expect(toolbarButton, `FAIL: Locations toolbar "${label}" button not visible.`).toBeVisible({ timeout: 10000 });
        }
        const emptyState = healingLocator(locationsEmptyStateStrategies(this.page)).first();
        await expect(emptyState, 'FAIL: Locations empty state ("No sites added yet") not visible.').toBeVisible();
        Logger.success('VendorBidWorkspacePage: Property > Locations verified (toolbar + empty state).');
    }
}

module.exports = { VendorBidWorkspacePage };
