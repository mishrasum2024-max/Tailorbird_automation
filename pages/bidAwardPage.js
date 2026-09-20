const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { retryOperation, withExtendedTerminalWait } = require('../utils/resilientRetry');
const { BidPage } = require('./bidPage');
const { ProjectPage } = require('./projectPage');
const { bidLocators } = require('../locators/bidLocator');
const {
    manageBidsTabStrategies,
    manageBidsGridStrategies,
    manageBidsGridRowsStrategies,
    rowActionsMenuButtonStrategies,
    awardMenuItemStrategies,
    awardConfirmationDialogStrategies,
    awardProjectSelectStrategies,
    awardJobSelectStrategies,
    createNewProjectButtonStrategies,
    createProjectDialogStrategies,
    createProjectNameInputStrategies,
    createProjectSubmitButtonStrategies,
    createNewJobButtonStrategies,
    awardBidSubmitButtonStrategies,
} = require('../locators/bidAwardLocator');

const SUBMITTED_STATUS_RE = /^(Submitted|Re-submitted)$/i;

/**
 * Page object for the ADMIN "Manage Bids" tab / per-vendor Award flow — a new, separate file
 * from pages/bidPage.js. Navigation to the bid-list page and the bid-name row link are reused
 * as-is from the existing BidPage/bidLocators (no lines in those files are altered); everything
 * specific to the Manage Bids tab and the Award action is new.
 */
class BidAwardPage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        this.bidPage = new BidPage(page); // existing page object, reused unmodified
        this.projectPage = new ProjectPage(page); // existing page object, reused unmodified — for creating a fresh Job in awardRow()
        this.manageBidsTab = healingLocator(manageBidsTabStrategies(page)).first();
        this.manageBidsGrid = healingLocator(manageBidsGridStrategies(page));
    }

    /**
     * Navigates to the Bids list, searches by exact bid name, and opens it — composed entirely
     * from BidPage.navigateToBidsPage() and the existing bidLocators() factory functions.
     * @param {string} bidName
     */
    async searchAndOpenBid(bidName) {
        Logger.step(`BidAwardPage: searching for bid "${bidName}"...`);
        await this.bidPage.navigateToBidsPage();

        const loc = bidLocators(this.page);
        await expect(loc.listSearchInput).toBeVisible({ timeout: 10000 });
        await loc.listSearchInput.fill(bidName);
        await this.page.waitForTimeout(1200);

        const rowLink = loc.bidRowLink(bidName);
        await expect(rowLink).toBeVisible({ timeout: 10000 });
        await rowLink.click();
        await this.page.waitForURL(/\/bids\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`BidAwardPage: opened bid "${bidName}" — ${this.page.url()}`);
    }

    /**
     * Reads a bid's own aggregate Status (Draft / In Progress / Awarded) directly from the
     * Bids list. MCP/DOM-verified live 2026-09-14: the bid-name link's row and the parallel
     * Property/Status/Vendors/Linked Job panel row share the same `data-rgrow` index — the
     * same split-panel revo-grid pattern used elsewhere in this suite (e.g. the vendor Bids
     * grid, the Manage Bids grid). Must be called while the Bids list is already showing this
     * bid (i.e. after searching for it).
     * @param {string} bidName
     * @returns {Promise<string|null>} the Status text ("Draft"/"In Progress"/"Awarded"), or
     *   null if the bid isn't present in the currently-rendered list.
     */
    async getBidListStatus(bidName) {
        return this.page.evaluate((name) => {
            const rows = Array.from(document.querySelectorAll('[role="row"][data-rgrow]'));
            const nameRow = rows.find((r) => r.textContent.trim() === name);
            if (!nameRow) return null;
            const rgrow = nameRow.getAttribute('data-rgrow');
            const siblingRows = rows.filter((r) => r.getAttribute('data-rgrow') === rgrow && r !== nameRow);
            for (const r of siblingRows) {
                const m = r.textContent.match(/Draft|In Progress|Awarded/);
                if (m) return m[0];
            }
            return null;
        }, bidName);
    }

    /**
     * Same list search/navigation as searchAndOpenBid() above (left completely unmodified),
     * but first checks the bid's own list Status and only opens it (View Details) if that
     * Status is exactly "In Progress" — per explicit instruction: only view details and award
     * bids that are still In Progress (a Draft bid has no vendor invited yet to award; an
     * already-Awarded bid has nothing left to award). Returns false without opening the bid
     * for any other status, so the caller can skip gracefully instead of erroring.
     * @param {string} bidName
     * @returns {Promise<boolean>} true if the bid was "In Progress" and its detail page opened
     */
    async searchAndOpenBidIfInProgress(bidName) {
        Logger.step(`BidAwardPage: searching for bid "${bidName}" and checking its list Status is "In Progress"...`);
        await this.bidPage.navigateToBidsPage();

        const loc = bidLocators(this.page);
        await expect(loc.listSearchInput).toBeVisible({ timeout: 10000 });

        // A bid a vendor just submitted (TC452) can take a few seconds to reach this admin
        // search's backend index — a single fill+10s-wait was observed live to sometimes land
        // in that gap ("No ... bids added yet" even though the bid genuinely exists). Re-issuing
        // the same search a few times (not just waiting longer on one stale result) self-corrects
        // once the index catches up, without masking a truly missing bid (every attempt fails
        // identically if the bid really isn't there).
        const rowLink = loc.bidRowLink(bidName);
        await retryOperation(async () => {
            await loc.listSearchInput.fill('');
            await loc.listSearchInput.fill(bidName);
            await this.page.waitForTimeout(1500);
            await expect(rowLink, `FAIL: bid "${bidName}" must appear in the Bids list`).toBeVisible({ timeout: 10000 });
        }, { attempts: 4, delayMs: 3000, label: `search Bids list for "${bidName}"` });

        const status = await this.getBidListStatus(bidName);
        Logger.info(`BidAwardPage: bid "${bidName}" list Status = "${status}"`);

        if (status !== 'In Progress') {
            Logger.info(`BidAwardPage: bid "${bidName}" is not "In Progress" (status: "${status}") — skipping, not opening.`);
            return false;
        }

        await rowLink.click();
        await this.page.waitForURL(/\/bids\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`BidAwardPage: opened bid "${bidName}" (In Progress) — ${this.page.url()}`);
        return true;
    }

    async goToManageBidsTab() {
        Logger.step('BidAwardPage: opening Manage Bids tab...');
        await expect(this.manageBidsTab).toBeVisible({ timeout: 10000 });
        await this.manageBidsTab.click();
        await this.page.waitForURL(/tab=manage-bids/, { timeout: 15000 });
        await this.page.waitForTimeout(1500);
        Logger.success('BidAwardPage: on Manage Bids tab.');
    }

    static isDecoyRowText(text) {
        return !text || /:root|mantine-font-family|@media/i.test(text);
    }

    /**
     * Scans the Manage Bids grid for the first vendor row whose Status is "Submitted" or
     * "Re-submitted". Returns `{ rowGrow, vendorName, status }`, or `null` if none qualify.
     * @returns {Promise<{rowGrow: string, vendorName: string, status: string} | null>}
     */
    async findSubmittedVendorRow() {
        const rows = healingLocator(manageBidsGridRowsStrategies(this.manageBidsGrid));
        // The grid can still be fetching/hydrating right after the tab switch (observed live:
        // 0 rows on an isolated run vs. populated immediately after a preceding test in the
        // same session) — poll briefly for rows to appear before concluding there are none.
        await expect.poll(() => rows.count(), { timeout: 15000, message: 'Manage Bids grid rows never populated' }).toBeGreaterThan(0);
        const count = await rows.count();
        Logger.info(`BidAwardPage: scanning ${count} Manage Bids row(s) for a Submitted/Re-submitted vendor...`);

        for (let i = 0; i < count; i++) {
            const row = rows.nth(i);
            const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
            if (BidAwardPage.isDecoyRowText(text)) continue;

            const rowGrow = await row.getAttribute('data-rgrow').catch(() => null);
            if (!rowGrow) continue;

            const statusMatch = text.match(/(Re-submitted|Submitted|Invited|Awarded)/i);
            if (statusMatch && SUBMITTED_STATUS_RE.test(statusMatch[0])) {
                const vendorName = text.slice(0, statusMatch.index).trim();
                Logger.info(`BidAwardPage: found ${statusMatch[0]} vendor row — "${vendorName}" (row text: "${text}")`);
                return { rowGrow, vendorName, status: statusMatch[0] };
            }
        }

        Logger.info('BidAwardPage: no vendor row with Submitted/Re-submitted status found.');
        return null;
    }

    /**
     * Creates a brand-new Job via the Award Bid dialog's Job "Create New" button, reusing
     * ProjectPage.fillJobForm()/submitJob() UNMODIFIED — the identical "Create New Job" form
     * as the existing Add-Job flow. Called unconditionally (a fresh Job every award, alongside
     * a fresh Project) so this never collides with a Job already linked to an earlier bid.
     * @param {import('@playwright/test').Locator} confirmDialog
     * @param {import('@playwright/test').Locator} jobSelect
     * @returns {Promise<string>} the new Job's title
     */
    async _createNewJob(confirmDialog, jobSelect) {
        const createJobButton = healingLocator(createNewJobButtonStrategies(confirmDialog));
        await expect(createJobButton).toBeEnabled({ timeout: 10000 });
        await createJobButton.click();

        const jobName = `Award_Job_${Date.now()}`;
        await this.projectPage.fillJobForm({
            title: jobName,
            jobType: 'Capex',
            financialType: 'Contract',
            startDate: this.projectPage.formatDate(new Date()),
            endDate: this.projectPage.formatDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        });
        await this.projectPage.submitJob();
        await this.page.waitForTimeout(1500);

        await expect(confirmDialog, 'FAIL: Award Bid dialog must reappear after creating the new Job').toBeVisible({ timeout: 15000 });
        await expect(jobSelect, 'FAIL: newly-created Job must be auto-selected in the Award Bid dialog').toHaveValue(jobName, { timeout: 10000 });
        Logger.info(`BidAwardPage: created and selected new Job "${jobName}".`);
        return jobName;
    }

    /**
     * Clicks the (enabled) "Award Bid" submit button and captures the actual API response —
     * ground truth for whether the award really succeeded, not just UI state (MCP/network-
     * trace-verified live 2026-09-14 that this exact click POSTs to
     * /api/bids/:bidId/vendors/award, and that the SPA's own grid does not always proactively
     * refetch afterward — a real award once succeeded, verified by a fresh page load showing
     * Status "Awarded", while the in-page dialog/grid state still looked unchanged).
     * @param {import('@playwright/test').Locator} awardBidBtn
     * @returns {Promise<{status: number, body: any}>}
     */
    async _submitAwardAndGetResponse(awardBidBtn) {
        const [awardResponse] = await Promise.all([
            this.page.waitForResponse(
                (res) => /\/api\/bids\/\d+\/vendors\/award$/.test(new URL(res.url()).pathname) && res.request().method() === 'POST',
                { timeout: 20000 },
            ),
            awardBidBtn.click(),
        ]);
        const status = awardResponse.status();
        const body = await awardResponse.json().catch(() => null);
        Logger.info(`BidAwardPage: award API responded ${status} — ${JSON.stringify(body)}`);
        return { status, body };
    }

    /**
     * Opens a vendor row's action menu, asserts every expected menu option is present, then
     * clicks "Award" and completes the (optional) confirmation dialog. Finishes by asserting
     * the row's Status becomes "Awarded".
     * @param {string} rowGrow the row's `data-rgrow` attribute value, from findSubmittedVendorRow()
     * @param {string} vendorName used to re-locate the row after the grid re-renders post-award
     */
    async awardRow(rowGrow, vendorName) {
        Logger.step(`BidAwardPage: awarding vendor row (data-rgrow=${rowGrow}, vendor="${vendorName}")...`);

        const menuButton = healingLocator(rowActionsMenuButtonStrategies(this.page, rowGrow));
        await menuButton.scrollIntoViewIfNeeded();
        await expect(menuButton).toBeVisible({ timeout: 10000 });
        await menuButton.click();

        const menu = this.page.getByRole('menu');
        await expect(menu, 'Row action menu must open').toBeVisible({ timeout: 10000 });

        const expectedMenuItems = ['Resend Bid', 'Award', 'Remove from bid', 'Download Submission'];
        for (const itemName of expectedMenuItems) {
            await expect(
                menu.getByRole('menuitem', { name: itemName, exact: true }),
                `FAIL: row action menu must contain "${itemName}"`,
            ).toBeVisible({ timeout: 5000 });
        }
        Logger.success(`BidAwardPage: all ${expectedMenuItems.length} row action menu options verified — ${expectedMenuItems.join(', ')}`);

        // .first(): Mantine renders both the interactive menuitem <button> and its inner
        // label <div> matching role=menuitem/name=Award — the same "valid double hit, not a
        // real ambiguity" case documented in pages/vendorBidPage.js.
        const awardMenuItem = healingLocator(awardMenuItemStrategies(this.page)).first();
        await awardMenuItem.click();

        const confirmDialog = healingLocator(awardConfirmationDialogStrategies(this.page));
        const dialogVisible = await confirmDialog.isVisible({ timeout: 5000 }).catch(() => false);
        if (dialogVisible) {
            Logger.info('BidAwardPage: Award Bid dialog appeared — selecting Project and Job...');

            // MCP-verified live 2026-09-14: the dialog requires a Project and a Job to be
            // selected (Job is disabled until Project is chosen) before "Award Bid" enables.
            // Deterministic approach — a brand-new Project AND a brand-new Job are created
            // EVERY time, via this dialog's own "Create New" buttons (Property comes
            // pre-filled on the project form). This sidesteps two real, org-data-dependent
            // failure modes hit repeatedly trying to reuse existing records: (1) some
            // Projects have a genuinely BLANK display name (value="2864", MCP/DOM-verified)
            // that sorts first and silently left the field empty; (2) a Job can only ever
            // link to ONE bid, so any existing Job may already be consumed by an earlier
            // awarded bid (MCP/network-trace-verified: POST /api/bids/:id/vendors/award
            // returned 400 "This job is already linked to a different bid"). Always creating
            // fresh records guarantees a clean, never-before-linked pair every run. The new
            // Project's own dialog is scoped separately (createProjectDialogStrategies) rather
            // than reused from pages/projectPage.js's nameInput/addProjectBtn, because that
            // dialog is genuinely STACKED on top of the still-open Award Bid dialog — those
            // locators' page-wide positional fallback matched across both dialogs at once
            // (MCP/Playwright-verified live 2026-09-14, strict-mode violation). The new Job is
            // still created via ProjectPage.fillJobForm()/submitJob() UNMODIFIED (no such
            // stacking issue there — see _createNewJob()).
            const projectSelect = healingLocator(awardProjectSelectStrategies(confirmDialog));
            await expect(projectSelect).toBeVisible({ timeout: 10000 });
            const createProjectButton = healingLocator(createNewProjectButtonStrategies(confirmDialog));
            await expect(createProjectButton).toBeEnabled({ timeout: 10000 });
            await createProjectButton.click();

            const projectName = `Award_Project_${Date.now()}`;
            const createProjectDialog = healingLocator(createProjectDialogStrategies(this.page));
            const projectNameInput = healingLocator(createProjectNameInputStrategies(createProjectDialog));
            const createProjectSubmitBtn = healingLocator(createProjectSubmitButtonStrategies(createProjectDialog));
            await expect(projectNameInput).toBeVisible({ timeout: 10000 });
            await projectNameInput.fill(projectName);
            await createProjectSubmitBtn.click();

            // Live-verified 2026-09-20 (screenshot at failure): "Create New Project" can still
            // be mid-submit (its own spinner + a spinning submit button) well past the previous
            // fixed 1500ms+15s wait — real backend latency on project creation, not a broken
            // flow. Wait for ITS OWN terminal condition (the dialog actually closing) first,
            // with a realistic fallback, before expecting the Award Bid dialog to reappear.
            // Deliberately NOT reusing `createProjectDialog` (healingLocator) for this "must
            // disappear" check: its own last-resort fallback strategy is `getByRole('dialog')
            // .last()`, which — once Create New Project closes and the underlying Award Bid
            // dialog (already open the whole time, per the stacking note above) is the only
            // dialog left — still matches THAT dialog, so "not visible" could never resolve.
            // A narrow heading-text check has no such false-positive-match risk.
            const createProjectHeading = this.page.getByRole('heading', { name: 'Create New Project', exact: true });
            await withExtendedTerminalWait(
                async () => await expect(createProjectHeading, 'Create New Project dialog must close after submitting').not.toBeVisible({ timeout: 15000 }),
                createProjectHeading,
                { timeoutMs: 45000, visible: false, label: 'Create New Project dialog close' },
            );

            await expect(confirmDialog, 'FAIL: Award Bid dialog must reappear after creating the new Project').toBeVisible({ timeout: 15000 });
            await expect(projectSelect, 'FAIL: newly-created Project must be auto-selected in the Award Bid dialog').toHaveValue(projectName, { timeout: 10000 });
            Logger.info(`BidAwardPage: created and selected new Project "${projectName}".`);

            const jobSelect = healingLocator(awardJobSelectStrategies(confirmDialog));
            await expect(jobSelect).toBeEnabled({ timeout: 10000 });
            const jobName = await this._createNewJob(confirmDialog, jobSelect);

            const awardBidBtn = healingLocator(awardBidSubmitButtonStrategies(confirmDialog));
            await expect(awardBidBtn, 'FAIL: "Award Bid" button must be enabled once Project and Job are selected').toBeEnabled({ timeout: 10000 });

            const { status: awardStatus, body: awardBody } = await this._submitAwardAndGetResponse(awardBidBtn);

            expect(awardStatus, `FAIL: Award API must return 200 — got ${awardStatus} (${JSON.stringify(awardBody)})`).toBe(200);
            expect(
                awardBody && awardBody.success !== false,
                `FAIL: Award API response must indicate success — ${JSON.stringify(awardBody)}`,
            ).toBe(true);
            Logger.success(`BidAwardPage: Award API confirmed 200/success for vendor "${vendorName}" (Job "${jobName}").`);

            await expect(confirmDialog).not.toBeVisible({ timeout: 15000 });
            Logger.info('BidAwardPage: Award Bid dialog completed.');
        } else {
            Logger.info('BidAwardPage: no confirmation dialog appeared — menu click alone triggered the award.');
        }

        // Same grid-repopulation race as findSubmittedVendorRow() — the grid can briefly
        // show 0 rows while it refetches post-award (MCP/Playwright-verified live) before the
        // vendor row (with its now-updated Status) reappears. MCP-verified live 2026-09-14
        // that the underlying Award actually succeeds (a fresh page load confirmed the row
        // reading "Awarded") even when this in-page poll times out — the SPA's own grid
        // doesn't always proactively refetch after a nested Create-Job dialog round-trip — so
        // a single page reload is tried as a fallback before concluding the award failed.
        const rows = healingLocator(manageBidsGridRowsStrategies(this.manageBidsGrid));
        const awardedRow = rows.filter({ hasText: vendorName });
        const reappeared = await expect.poll(() => awardedRow.count(), { timeout: 20000 }).toBeGreaterThan(0).then(() => true).catch(() => false);
        if (!reappeared) {
            Logger.info('BidAwardPage: vendor row did not reappear in-page — reloading to force a fresh fetch...');
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);
            await this.goToManageBidsTab();
            await expect.poll(() => awardedRow.count(), { timeout: 20000, message: `Vendor row "${vendorName}" never reappeared after the award action, even after a reload` }).toBeGreaterThan(0);
        }
        await expect(
            awardedRow.first(),
            `FAIL: vendor row "${vendorName}" must show Status "Awarded" after the award action`,
        ).toContainText(/awarded/i, { timeout: 15000 });
        Logger.success(`BidAwardPage: vendor "${vendorName}" row confirmed Awarded.`);
    }
}

module.exports = { BidAwardPage };
