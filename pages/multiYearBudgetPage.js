const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { multiYearBudgetLocators } = require('../locators/multiYearBudgetLocator');

let myb;

/**
 * Page object for the Multi-Year Budget module (Financials > Multi-Year Budget).
 * This is a brand-new module with no prior page object in the framework, so it is
 * created fresh here per the "only if absolutely necessary" rule. All property and
 * single-year budget setup is delegated to the existing ApprovalJob/BudgetJob
 * classes rather than duplicated here.
 *
 * The table is a virtualized revo-grid treegrid: pinned columns (Category, Budget
 * Item) and scrollable year columns render as separate [role="row"] groups, so a
 * plain text-filtered row locator cannot line up a year's Planned/Current/Variance
 * cell with its item row. Reading a specific cell therefore intersects the target
 * column header's bounding box with the item row's bounding box and resolves the
 * element at that point, mirroring the pattern already proven for this same grid
 * library in pages/budgetPage.js (enterRevisionAdjustmentByItemNameV2).
 */
exports.MultiYearBudgetJob = class MultiYearBudgetJob {
    constructor(page) {
        this.page = page;
        myb = multiYearBudgetLocators(page);
    }

    // ===================== Navigation =====================

    async navigateToMultiYearBudget() {
        await this.page.goto('/financials/multi-year-budget', { waitUntil: 'load' });
        await this.page.waitForTimeout(4000);
        await this.page.waitForURL('**/financials/multi-year-budget**', { timeout: 45000 }).catch(() => { });
        Logger.success('Navigated to Multi-Year Budget');
    }

    async selectPropertyByName(propertyName) {
        await myb.propertySwitcherButton.click();
        await this.page.waitForTimeout(800);
        const option = this.page.getByRole('menuitem', { name: new RegExp(propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
        await expect(option, `Property "${propertyName}" must appear in the property switcher`).toBeVisible({ timeout: 10000 });
        await option.click();
        await this.page.waitForTimeout(3000);
        Logger.success(`Selected property: ${propertyName}`);
    }

    // ===================== Empty state / Initialization =====================

    async verifyEmptyStateBeforePlan() {
        await expect(myb.createPlanHeading).toBeVisible({ timeout: 15000 });
        await expect(myb.createPlanBtn).toBeVisible();
        Logger.success('Multi-Year Budget empty state ("Create Your Multi-Year Budget") verified');
    }

    async openInitializationDialog() {
        await myb.createPlanBtn.click();
        await expect(myb.initDialog).toBeVisible({ timeout: 10000 });
        Logger.success('Multi-Year Budget initialization dialog opened');
    }

    async verifyInitializationDefaults(expectedStartYear, expectedEndYear) {
        await expect(myb.holdPeriodStartYear).toHaveValue(String(expectedStartYear));
        await expect(myb.holdPeriodEndYear).toHaveValue(String(expectedEndYear));
        Logger.success(`Initialization defaults verified: ${expectedStartYear}-${expectedEndYear}`);
    }

    async selectBudgetItemInInitDialog(itemLabelPattern) {
        const checkbox = myb.itemCheckbox(itemLabelPattern);
        await expect(checkbox, `Budget item matching "${itemLabelPattern}" must be selectable`).toBeVisible({ timeout: 10000 });
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        Logger.success(`Selected budget item "${itemLabelPattern}" in initialization dialog`);
    }

    async submitInitializationDialog() {
        await expect(myb.initSubmitBtn).toBeEnabled({ timeout: 10000 });
        await myb.initSubmitBtn.click();
        await expect(myb.initDialog).not.toBeVisible({ timeout: 15000 });
        await expect(myb.treegrid.first()).toBeVisible({ timeout: 20000 });
        Logger.success('Multi-year budget plan created — table view now visible');
    }

    // ===================== Plan Table View =====================

    async verifyPlanTableStructure(itemName) {
        await expect(myb.categoryColumnHeader).toBeVisible({ timeout: 15000 });
        await expect(myb.budgetItemColumnHeader).toBeVisible();
        await expect(this.page.getByRole('gridcell', { name: itemName })).toBeVisible({ timeout: 15000 });
        await expect(myb.totalRow.first()).toBeVisible();
        const plannedHeaders = await myb.plannedBudgetColumnHeaders.count();
        const currentHeaders = await myb.currentBudgetColumnHeaders.count();
        const varianceHeaders = await myb.varianceColumnHeaders.count();
        expect(plannedHeaders, 'Every hold-period year must have a Planned Budget column').toBeGreaterThan(0);
        expect(currentHeaders, 'Only the current year should have a Current Budget column').toBeGreaterThanOrEqual(1);
        expect(varianceHeaders, 'Only the current year should have a Variance column').toBeGreaterThanOrEqual(1);
        Logger.success(`Plan table structure verified for item "${itemName}" — Category/Budget Item rows, Total row, and year columns present`);
        return { plannedHeaders, currentHeaders, varianceHeaders };
    }

    async verifyYearVisible(year) {
        await expect(myb.yearGroupHeader(year).first()).toBeVisible({ timeout: 10000 });
    }

    /**
     * The plan table is a virtualized revo-grid: columns for years scrolled out of
     * view are not just visually hidden but entirely unmounted from the DOM, and
     * scrolling shifts which "Planned Budget"/"Current Budget"/"Variance" header
     * ends up at a given nth() position (MCP-verified: after enough horizontal
     * scroll, plannedBudgetColumnHeaders.nth(1) silently resolved to the Total
     * group's header instead of the intended future year). Locating a header by
     * its geometric alignment under that year's own label — after scrolling the
     * label into view — is immune to that, unlike a positional nth() index.
     */
    async _headerForYear(headersLocator, year) {
        const yearLabel = myb.yearGroupHeader(year).first();
        await yearLabel.scrollIntoViewIfNeeded();
        await expect(yearLabel).toBeVisible({ timeout: 15000 });
        const yearBox = await yearLabel.boundingBox();
        if (!yearBox) throw new Error(`Bounding box not available for year label: ${year}`);

        const count = await headersLocator.count();
        for (let i = 0; i < count; i++) {
            const box = await headersLocator.nth(i).boundingBox();
            if (!box) continue;
            const centerX = box.x + box.width / 2;
            if (centerX >= yearBox.x - 2 && centerX <= yearBox.x + yearBox.width + 2) {
                return headersLocator.nth(i);
            }
        }
        throw new Error(`Could not find a header aligned under year ${year} (checked ${count} candidates)`);
    }

    /**
     * Reads the text of the cell at the intersection of a given column header
     * and the single budget item's row, using the same bounding-box +
     * elementFromPoint technique already relied on elsewhere in this framework
     * for this exact virtualized grid.
     */
    async _readCellByHeaderAndItemRow(headerLocator, itemName) {
        await expect(headerLocator).toBeVisible({ timeout: 15000 });
        const headerBox = await headerLocator.boundingBox();
        if (!headerBox) throw new Error('Column header bounding box not available');

        const itemCell = this.page.getByRole('gridcell', { name: itemName }).first();
        await expect(itemCell).toBeVisible({ timeout: 15000 });
        const itemBox = await itemCell.boundingBox();
        if (!itemBox) throw new Error(`Bounding box not available for item row: "${itemName}"`);

        const x = headerBox.x + headerBox.width / 2;
        const y = itemBox.y + Math.min(itemBox.height / 2, 15);

        return this.page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return null;
            const cell = el.closest('[role="gridcell"]');
            return cell ? cell.textContent.trim() : null;
        }, { x, y });
    }

    async getCurrentYearRowValues(itemName, currentYear) {
        const plannedHeader = await this._headerForYear(myb.plannedBudgetColumnHeaders, currentYear);
        const currentHeader = await this._headerForYear(myb.currentBudgetColumnHeaders, currentYear);
        const varianceHeader = await this._headerForYear(myb.varianceColumnHeaders, currentYear);
        const planned = await this._readCellByHeaderAndItemRow(plannedHeader, itemName);
        const current = await this._readCellByHeaderAndItemRow(currentHeader, itemName);
        const variance = await this._readCellByHeaderAndItemRow(varianceHeader, itemName);
        return { planned, current, variance };
    }

    async getFutureYearPlannedValue(itemName, year) {
        const plannedHeader = await this._headerForYear(myb.plannedBudgetColumnHeaders, year);
        return this._readCellByHeaderAndItemRow(plannedHeader, itemName);
    }

    /**
     * Classifies the health-indicator colour of the Variance cell for the given
     * year by reading the computed CSS colour of the coloured text node at that
     * cell, rather than hardcoding a theme's exact RGB values.
     */
    async getVarianceColorCategory(itemName, year) {
        const headerLocator = await this._headerForYear(myb.varianceColumnHeaders, year);
        const headerBox = await headerLocator.boundingBox();
        const itemCell = this.page.getByRole('gridcell', { name: itemName }).first();
        const itemBox = await itemCell.boundingBox();
        const x = headerBox.x + headerBox.width / 2;
        const y = itemBox.y + Math.min(itemBox.height / 2, 15);

        // The health colour is applied to a specific descendant text node, not
        // necessarily the first child, and the default (uncoloured) text renders in a
        // neutral near-black (MCP-verified: rgb(33, 37, 41)). Scanning every descendant
        // for the first one whose colour differs from that default reliably finds the
        // actual coloured node regardless of exactly how deep it is nested.
        const NEUTRAL_TEXT_COLOR = 'rgb(33, 37, 41)';
        const color = await this.page.evaluate(({ x, y, neutral }) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return null;
            const cell = el.closest('[role="gridcell"]');
            if (!cell) return null;
            const candidates = [cell, ...cell.querySelectorAll('*')];
            for (const node of candidates) {
                const c = window.getComputedStyle(node).color;
                if (c && c !== neutral) return c;
            }
            return window.getComputedStyle(cell).color;
        }, { x, y, neutral: NEUTRAL_TEXT_COLOR });

        if (!color) return 'unknown';
        const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
        if (!match) return 'unknown';
        const [, r, g, b] = match.map(Number);
        if (g > r && g > b) return 'green';
        if (r > g && r > b && g < 100) return 'red';
        if (r > b && g > b) return 'orange';
        return 'neutral';
    }

    // ===================== Editing a Planned Budget cell =====================

    async openEditPlannedBudgetDialog(itemName, year) {
        const headerLocator = await this._headerForYear(myb.plannedBudgetColumnHeaders, year);
        const headerBox = await headerLocator.boundingBox();
        const itemCell = this.page.getByRole('gridcell', { name: itemName }).first();
        const itemBox = await itemCell.boundingBox();
        const x = headerBox.x + headerBox.width / 2;
        const y = itemBox.y + Math.min(itemBox.height / 2, 15);

        await this.page.mouse.dblclick(x, y);
        await expect(myb.editPlannedBudgetDialog).toBeVisible({ timeout: 10000 });
        Logger.success(`Opened "Edit planned budget" dialog for "${itemName}" (year ${year})`);
    }

    async setPlannedBudgetAmount(amount, reason) {
        // The underlying radio input is visually hidden by the Mantine SegmentedControl
        // styling, so it must be selected by clicking its visible label text instead of
        // the (non-actionable) input element itself.
        await myb.editPlannedBudgetDialog.getByText('Set amount', { exact: true }).click();
        await myb.plannedBudgetAmountInput.fill(String(amount));
        await myb.editReasonInput.fill(reason);
        await expect(myb.editSaveBtn).toBeEnabled({ timeout: 5000 });
        await myb.editSaveBtn.click();
        await expect(myb.editPlannedBudgetDialog).not.toBeVisible({ timeout: 10000 });
        const savedToast = this.page.getByText('Planned budget saved');
        await expect(savedToast).toBeVisible({ timeout: 10000 });
        // Let the toast auto-dismiss before returning — while visible it can overlap and
        // absorb clicks/dblclicks aimed at table cells underneath it (MCP-verified).
        await expect(savedToast).not.toBeVisible({ timeout: 15000 }).catch(() => { });
        Logger.success(`Set planned budget to ${amount} (reason: "${reason}")`);
    }

    async reallocatePlannedBudget(sourceLabelPattern, amount, reason) {
        // "Reallocate" is the dialog's default selection, but clicking its visible label
        // (rather than checking the visually-hidden radio input, see setPlannedBudgetAmount
        // above) keeps this correct even if "Set amount" was left selected from a prior edit.
        await myb.editPlannedBudgetDialog.getByText('Reallocate', { exact: true }).click();
        await myb.reallocateFromInput.click();
        await myb.reallocateFromOption(sourceLabelPattern).first().click();
        await myb.amountToReallocateInput.fill(String(amount));
        await myb.editReasonInput.fill(reason);
        await expect(myb.editSaveBtn).toBeEnabled({ timeout: 5000 });
        await myb.editSaveBtn.click();
        await expect(myb.editPlannedBudgetDialog).not.toBeVisible({ timeout: 10000 });
        const savedToast = this.page.getByText('Reallocation saved');
        await expect(savedToast).toBeVisible({ timeout: 10000 });
        await expect(savedToast).not.toBeVisible({ timeout: 15000 }).catch(() => { });
        Logger.success(`Reallocated ${amount} from "${sourceLabelPattern}" (reason: "${reason}")`);
    }

    // ===================== Toolbar: CSV Upload / Export =====================

    async openUploadCsvDialog() {
        await myb.uploadCsvBtn.click();
        await expect(myb.uploadCsvDialog).toBeVisible({ timeout: 10000 });
        Logger.success('Upload CSV dialog opened');
    }

    async downloadCsvTemplate(downloadsDir = './downloads') {
        const path = require('path');
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            myb.downloadTemplateBtn.click(),
        ]);
        const savePath = path.join(downloadsDir, await download.suggestedFilename());
        await download.saveAs(savePath);
        Logger.success(`Downloaded CSV template to ${savePath}`);
        return savePath;
    }

    async closeDialog() {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
    }

    async exportCsv(downloadsDir = './downloads') {
        const path = require('path');
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            myb.exportCsvBtn.click(),
        ]);
        const savePath = path.join(downloadsDir, await download.suggestedFilename());
        await download.saveAs(savePath);
        Logger.success(`Exported multi-year budget CSV to ${savePath}`);
        return savePath;
    }

    // ===================== Toolbar: Reset budget =====================

    async openResetBudgetDialog() {
        await myb.resetBudgetBtn.click();
        await expect(myb.resetBudgetDialog).toBeVisible({ timeout: 10000 });
        Logger.success('Reset budget dialog opened');
    }

    async verifyResetDisabledUntilDownload() {
        await expect(myb.resetConfirmBtn).toBeDisabled();
        Logger.success('Reset button confirmed disabled until table is downloaded');
    }

    async cancelResetBudgetDialog() {
        await myb.resetCancelBtn.click();
        await expect(myb.resetBudgetDialog).not.toBeVisible({ timeout: 5000 });
    }

    // ===================== Toolbar: Settings =====================

    async openSettingsDialog() {
        await myb.settingsBtn.click();
        await expect(myb.settingsDialog).toBeVisible({ timeout: 10000 });
        Logger.success('Settings dialog opened');
    }

    async verifyNoCapitalEnvelopeFieldInSettings() {
        await expect(myb.totalCapitalEnvelopeField).toHaveCount(0);
        Logger.success('Confirmed no "Total Capital Envelope" field exists in Settings dialog');
    }

    async cancelSettingsDialog() {
        await myb.settingsCancelBtn.click();
        await expect(myb.settingsDialog).not.toBeVisible({ timeout: 5000 });
    }

    // ===================== Toolbar: History =====================

    async openHistoryDialog() {
        await myb.historyBtn.click();
        await expect(myb.historyDialog).toBeVisible({ timeout: 10000 });
        Logger.success('Multi-year budget history dialog opened');
    }

    async verifyHistoryContainsText(text) {
        await expect(myb.historyDialog.getByText(text)).toBeVisible({ timeout: 10000 });
        Logger.success(`History log entry containing "${text}" verified`);
    }
};
