/**
 * filterResetHelper.js
 *
 * A stuck/leftover filter from an earlier test (or a prior manual/exploratory session on
 * the same shared account) silently changes what a later test sees on its very first
 * assertion — MCP/CI-verified 2026-09-22 as the actual root cause behind several
 * "element not found" failures (e.g. TC51's "Reset Filters" button assertion) that had
 * nothing to do with the test's own logic. This utility clears whatever filter is
 * currently active on the CURRENT page, generically, before a test's real steps run.
 *
 * MCP-verified live 2026-09-22 across multiple, structurally different feature pages
 * (Properties, Vendor Directory, Approval Templates; CapEx/Bids/Dashboard as the no-op
 * case) that every page built on this app's shared BirdTable grid toolbar follows the
 * same underlying contract, regardless of what kind of filter controls it exposes
 * (checkbox groups on Properties/Vendor Directory, "OR logic" TagsInput pills on Approval
 * Templates, etc.):
 *   1. A toolbar button with the exact accessible name "Filter" opens a side panel/drawer
 *      containing the text "Filter Options".
 *   2. That panel renders a "Reset Filters" button IF AND ONLY IF at least one filter is
 *      currently active — confirmed present for both the checkbox-based and the
 *      TagsInput/pill-based filter styles, so this single button is a genuinely universal
 *      "a filter is applied" signal and a universal one-click way to clear it, without
 *      needing to know which specific filter type a given page uses.
 * A page with no filterable grid at all (verified: CapEx, Bids listing, Dashboard) simply
 * has no "Filter" button — this utility no-ops immediately in that case.
 *
 * This never throws: a filter-reset problem must never fail the real test that called it.
 *
 * Usage (call at the start of a test, or from beforeEach, on any page):
 *   const { resetActiveFilters } = require('../utils/filterResetHelper');
 *   await resetActiveFilters(page);
 */
const { Logger } = require('./logger');

const FILTER_BUTTON_NAME = 'Filter';
const FILTER_OPTIONS_TEXT = 'Filter Options';
const RESET_FILTERS_NAME = /reset filters/i;

/**
 * Clears any currently-active filter on whatever grid/page `page` is on, using the
 * generic Filter → Filter Options → Reset Filters contract shared across this app's
 * BirdTable-based pages. Safe to call unconditionally on any page, including one with no
 * filterable grid at all — it detects that case and does nothing.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} true if an active filter was found and reset, false otherwise
 * (including "no filter button on this page" and "filter button present but nothing to
 * reset") — callers that don't need the result can ignore it.
 */
async function resetActiveFilters(page) {
    try {
        // Exact match: several pages also have "Filters" (plural, a drawer heading, not a
        // button) or feature-specific buttons whose name merely contains "Filter" — exact
        // name matching is what already distinguishes these correctly elsewhere in this
        // framework (see locators/propertyLocator.js's own Filter-button strategy).
        const filterButton = page.getByRole('button', { name: FILTER_BUTTON_NAME, exact: true }).first();
        // MCP/CI-verified 2026-09-22: on Properties specifically, this check can race the
        // toolbar's own render right after navigation ("Properties page ready" fires on a
        // generic readiness signal, not specifically the Filter button), and 3000ms wasn't
        // always enough — 6000ms gave the toolbar room to finish without meaningfully slowing
        // down the common "this page has no Filter button at all" case (CapEx/Bids/Dashboard),
        // which resolves `false` immediately once the timeout elapses either way.
        const filterButtonVisible = await filterButton.isVisible({ timeout: 6000 }).catch(() => false);
        if (!filterButtonVisible) {
            Logger.info('[FilterReset] No "Filter" button on this page — nothing to reset.');
            return false;
        }

        let panelOpen = await page.getByText(FILTER_OPTIONS_TEXT, { exact: false }).first().isVisible({ timeout: 1000 }).catch(() => false);
        let openedByThisCall = false;
        if (!panelOpen) {
            await filterButton.click();
            panelOpen = await page.getByText(FILTER_OPTIONS_TEXT, { exact: false }).first()
                .waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
            openedByThisCall = panelOpen;
        }
        if (!panelOpen) {
            Logger.info('[FilterReset] "Filter" button found but its panel never opened — leaving page untouched.');
            return false;
        }

        const resetButton = page.getByRole('button', { name: RESET_FILTERS_NAME }).first();
        const hasActiveFilter = await resetButton.isVisible({ timeout: 2000 }).catch(() => false);
        let didReset = false;
        if (hasActiveFilter) {
            await resetButton.click();
            didReset = await resetButton.waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
            if (didReset) {
                Logger.success('[FilterReset] Active filter detected and reset.');
            } else {
                Logger.info('[FilterReset] Clicked "Reset Filters" but it did not disappear — filter state may be unchanged.');
            }
        } else {
            Logger.info('[FilterReset] Filter panel open — no active filter to reset.');
        }

        // Only close the panel if this call is the one that opened it — a panel the page
        // (or an earlier step) already had open before this call is left exactly as found.
        if (openedByThisCall) {
            const closeButton = page.locator('.mantine-CloseButton-root').first();
            if (await closeButton.isVisible({ timeout: 1500 }).catch(() => false)) {
                await closeButton.click().catch(() => { });
            } else {
                await filterButton.click().catch(() => { });
            }
            await page.getByText(FILTER_OPTIONS_TEXT, { exact: false }).first()
                .waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
        }

        return didReset;
    } catch (err) {
        Logger.info(`[FilterReset] Non-fatal error while checking/resetting filters: ${err.message.split('\n')[0]}`);
        return false;
    }
}

module.exports = { resetActiveFilters };
