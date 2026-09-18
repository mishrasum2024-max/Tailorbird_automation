require('dotenv').config();

const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { breadcrumbCrumbStrategies } = require('../locators/vendorDashboardLocator');
const { invoiceDetailFieldValueStrategies } = require('../locators/vendorPayInvoiceLocator');

/** Every field shown on a Contract detail page's header, in display order — MCP-verified
 * 2026-09-17 against /bids-and-contracts/contracts/4229. Shares the exact same "label
 * paragraph + following-sibling value paragraph" DOM shape as the Regular Invoice / Pay
 * Application / Change Order detail pages, so invoiceDetailFieldValueStrategies (not
 * duplicated) is reused to read them. */
const CONTRACT_DETAIL_FIELDS = ['Contract', 'Status', 'Property', 'Project', 'Financial Type', 'Term', 'Retainage', 'Original Contract', 'Approved Change Orders', 'Current Contract', 'Invoiced to Date', 'Outstanding Balance', 'Executed Date'];

/** Contract line-items table columns actually mounted in the live DOM without scrolling. This
 * table has NO Export button (unlike the Contracts/Invoices/Change Orders listing grids —
 * confirmed absent, only Search/View/Table), so unlike those pages there is no CSV-export
 * ground truth to fall back on here. Playwright-verified 2026-09-17: even this "always
 * mounted" prefix is CONTRACT-SPECIFIC, not a fixed fact — contract 4229 mounted 8 columns
 * (through "Original Contract Amount") pre-scroll, but a differently-laid-out contract only
 * mounted 7 (through "Contract Amount Per"). Trimmed to the 7-column common prefix that held
 * on both, rather than the wider list that only worked for one contract. The full column set
 * also includes "Approved Change Orders", "Current Contract Amount", and "Invoiced Amount"
 * (confirmed present via MCP browser inspection with manual scrolling), but they sit outside
 * this revo-grid's default horizontal viewport and are intentionally NOT asserted here rather
 * than asserted unreliably. */
const CONTRACT_LINE_ITEMS_COLUMNS = ['Scope', 'Schedule of Value', 'Cost Item', 'FP Type', 'Unit Count', 'Unit', 'Contract Amount Per'];

/**
 * Page object for the VENDOR portal's read-only Contract detail page
 * (/bids-and-contracts/contracts/:id). New file; no existing methods altered. Reuses
 * invoiceDetailFieldValueStrategies (locators/vendorPayInvoiceLocator.js) and
 * viewDetailsButtonsStrategies/breadcrumbCrumbStrategies (already-automated listing-page
 * locators) rather than duplicating them — MCP confirmed the same DOM shapes apply here.
 */
class VendorContractPage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    /** From the Contracts listing (caller must already be on it), opens the contract whose
     * "Contract" column contains `contractRowText` (e.g. a contract or job name) by typing it
     * into the listing's own Search box, then clicking that (now-narrowed) row's "View
     * Details" button, and waits for the /contracts/:id detail page to load.
     *
     * Playwright-verified 2026-09-17: the Contracts grid virtualizes rows VERTICALLY once the
     * list is long enough — a direct, unfiltered `[role=row]` text lookup found only 1 of 16
     * live rows mounted, and `scrollIntoViewIfNeeded()` cannot help since the target row is not
     * in the DOM at all yet, not merely scrolled out of view. Searching first (the same
     * Search box already asserted by VendorListingPage.assertListingPageFullyVisible) narrows
     * the grid down to the matching row(s), which reliably mounts it — Playwright-verified this
     * resolves the issue where the CSV-export-then-scroll pattern (correct for the Bids grid,
     * whose short list stays fully mounted) did not. */
    async openContractByRowText(contractRowText) {
        Logger.step(`VendorContractPage: searching Contracts listing for "${contractRowText}"...`);
        const search = this.page.getByRole('textbox', { name: 'Search...', exact: true });
        await expect(search, 'FAIL: Contracts search input not visible.').toBeVisible({ timeout: 10000 });
        await search.fill(contractRowText);
        await this.page.waitForTimeout(1000);

        const row = this.page.locator('[role="row"][data-rgrow]').filter({ hasText: contractRowText }).first();
        await expect(row, `FAIL: no contract row containing "${contractRowText}" found after searching.`).toBeVisible({ timeout: 10000 });
        const rowGrow = await row.getAttribute('data-rgrow');
        if (!rowGrow) {
            throw new Error(`VendorContractPage.openContractByRowText: row for "${contractRowText}" has no data-rgrow attribute.`);
        }
        const viewDetailsButton = this.page.locator(`[data-rgrow="${rowGrow}"]`).getByRole('button', { name: 'View Details', exact: true });
        await expect(viewDetailsButton, `FAIL: "View Details" button not found for contract row "${contractRowText}" (data-rgrow="${rowGrow}").`).toBeVisible({ timeout: 10000 });
        await viewDetailsButton.click();
        await this.page.waitForURL(/\/bids-and-contracts\/contracts\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorContractPage: contract detail opened — ${this.page.url()}`);
    }

    /** Asserts the Contract detail page's full structure: breadcrumb (Home / Contracts /
     * {name}), every header field visible and non-empty, the line-items table's expected
     * columns (read live — no Export button exists on this page), and at least one data row
     * plus a "Total" row. */
    async assertContractDetailFullyVisible(expectedContractRowText) {
        Logger.step('VendorContractPage: asserting Contract detail page content...');
        const breadcrumbHome = healingLocator(breadcrumbCrumbStrategies(this.page, 'Home')).first();
        await expect(breadcrumbHome, 'FAIL: breadcrumb "Home" crumb not visible on Contract detail.').toBeVisible({ timeout: 10000 });
        const breadcrumbContracts = healingLocator(breadcrumbCrumbStrategies(this.page, 'Contracts')).first();
        await expect(breadcrumbContracts, 'FAIL: breadcrumb "Contracts" crumb not visible on Contract detail.').toBeVisible();

        for (const label of CONTRACT_DETAIL_FIELDS) {
            const value = healingLocator(invoiceDetailFieldValueStrategies(this.page, label)).first();
            await expect(value, `FAIL: Contract detail field "${label}" not visible.`).toBeVisible({ timeout: 10000 });
            await expect(value, `FAIL: Contract detail field "${label}" is empty.`).not.toHaveText('');
        }

        for (const column of CONTRACT_LINE_ITEMS_COLUMNS) {
            const header = this.page.getByRole('columnheader', { name: column, exact: true });
            await expect(header, `FAIL: Contract line-items column "${column}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        const totalRow = this.page.getByRole('row', { name: 'Total' });
        await expect(totalRow, 'FAIL: Contract line-items "Total" row not visible.').toBeVisible({ timeout: 10000 });

        Logger.success('VendorContractPage: Contract detail page fully verified.');
    }

    /** Reads a header field's value as text (e.g. "Approved Change Orders" or "Current
     * Contract") — used to cross-check that a Pending-Approval Change Order has NOT yet
     * altered the contract's totals. */
    async getDetailFieldValue(label) {
        const value = healingLocator(invoiceDetailFieldValueStrategies(this.page, label)).first();
        await expect(value, `FAIL: Contract detail field "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        return (await value.textContent()).trim();
    }
}

module.exports = { VendorContractPage };
