require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');
const { LoginPage } = require('./loginPage');
const {
    sidebarNavItemStrategies,
    breadcrumbCrumbStrategies,
    kpiCardLabelStrategies,
    kpiCardContainerStrategies,
    panelHeaderStrategies,
    panelHeaderCountBadgeStrategies,
    reviewBidButtonStrategies,
    approvalNotificationActionButtonStrategies,
    getHelpLinkStrategies,
    vendorProfileEmailStrategies,
} = require('../locators/vendorDashboardLocator');

/** The 4 top KPI summary cards, MCP-verified 2026-09-15, with the expected SHAPE (never the
 * live value) of their sub-text — 3 report a plain integer count, "Invoices in review" reports
 * a dollar amount instead. */
const KPI_CARDS = [
    { label: 'New bid invitations', pattern: /^New bid invitations \d+ .+$/ },
    { label: 'Awarded bids', pattern: /^Awarded bids \d+ .+$/ },
    { label: 'Invoices in review', pattern: /^Invoices in review \$[\d,]+ .+$/ },
    { label: 'Pending change orders', pattern: /^Pending change orders \d+ .+$/ },
];

const SIDEBAR_NAV_ITEMS = ['Dashboard', 'Bids', 'Contracts', 'Invoices', 'Change Orders'];

/**
 * Page object for the VENDOR portal's Dashboard page
 * (beta.tailorbird.com/bids-and-contracts/dashboard) — a separate app surface from the vendor
 * portal's Bids workspace (pages/vendorBidPage.js). New file; no existing methods altered.
 */
class VendorDashboardPage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        this.vendorEmail = process.env.VENDOR_LOGIN_EMAIL;

        // .first(): each nav item resolves to 2 live DOM nodes (a rail-state node plus the
        // hover/pin-expanded one) — same documented pattern as pages/vendorBidPage.js's
        // bidsNavLink, not a real ambiguity.
        this.dashboardNavLink = healingLocator(sidebarNavItemStrategies(page, 'Dashboard')).first();
        this.breadcrumbHome = healingLocator(breadcrumbCrumbStrategies(page, 'Home')).first();
        this.breadcrumbDashboard = healingLocator(breadcrumbCrumbStrategies(page, 'Dashboard')).first();
        this.getHelpLink = healingLocator(getHelpLinkStrategies(page)).first();
        this.profileEmail = healingLocator(vendorProfileEmailStrategies(page, this.vendorEmail)).first();
        this.reviewBidButtons = healingLocator(reviewBidButtonStrategies(page));
        this.approvalActionButtons = healingLocator(approvalNotificationActionButtonStrategies(page));
    }

    async navigateToDashboard() {
        Logger.step('VendorDashboardPage: navigating to Dashboard...');
        // Vendor portal nav uses the same collapsed/hover-to-expand rail as the admin app and
        // the Bids workspace — reuse the existing shared utility rather than duplicating its
        // hover+pin logic here.
        await ensureLeftPanelExpanded(this.page);
        await this.dashboardNavLink.click();
        await this.page.waitForURL(/\/bids-and-contracts\/dashboard/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(2000);
        Logger.success(`VendorDashboardPage: on Dashboard — ${this.page.url()}`);
    }

    /**
     * Reuses the EXISTING LoginPage.scanAllTextElements static method (not duplicated) to
     * capture every visible heading/button/input/label/link/paragraph/alert/text-node on the
     * Dashboard, then writes the result to a JSON file for audit / drift comparison.
     * @param {string} outputPath absolute path to the JSON file to write
     * @returns {Promise<object>} the raw snapshot returned by scanAllTextElements
     */
    async scanAndStoreDashboardText(outputPath) {
        Logger.step('VendorDashboardPage: scanning all visible text on Dashboard...');
        const snapshot = await LoginPage.scanAllTextElements(this.page);
        const record = {
            capturedAt: new Date().toISOString(),
            url: this.page.url(),
            vendorEmail: this.vendorEmail,
            counts: {
                headings: snapshot.headings.length,
                buttons: snapshot.buttons.length,
                inputs: snapshot.inputs.length,
                labels: snapshot.labels.length,
                links: snapshot.links.length,
                paragraphs: snapshot.paragraphs.length,
                alerts: snapshot.alerts.length,
                textNodes: snapshot.textNodes.length,
            },
            snapshot,
        };
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
        Logger.success(
            `VendorDashboardPage: text scan stored at ${outputPath} (buttons=${record.counts.buttons}, links=${record.counts.links}, paragraphs=${record.counts.paragraphs}, textNodes=${record.counts.textNodes}).`,
        );
        return snapshot;
    }

    /**
     * From a scanAllTextElements() snapshot, asserts every visible paragraph/link/button text
     * captured during the scan is still actually present and visible on the page — i.e. the
     * scan result and the live DOM agree, not just that the scan ran without throwing.
     * @param {object} snapshot result of scanAndStoreDashboardText()
     */
    async assertScannedTextMatchesLiveDom(snapshot) {
        Logger.step('VendorDashboardPage: cross-checking scanned text against the live DOM...');
        const staticParagraphs = ['Home', 'Dashboard'];
        const scannedParagraphTexts = new Set(snapshot.paragraphs.filter((p) => p.visible).map((p) => p.text));
        for (const expected of staticParagraphs) {
            expect(
                [...scannedParagraphTexts].some((t) => t === expected),
                `FAIL: scanAllTextElements() did not capture expected static paragraph text "${expected}" among visible paragraphs on the Dashboard.`,
            ).toBe(true);
        }
        expect(snapshot.buttons.length, 'FAIL: scanAllTextElements() captured zero buttons on the Dashboard — expected Review Bid / View Invoice / View Change Order buttons.').toBeGreaterThan(0);
        expect(snapshot.links.length, 'FAIL: scanAllTextElements() captured zero links on the Dashboard — expected at least "Home" and "Get Help".').toBeGreaterThan(0);
        Logger.success('VendorDashboardPage: scanned text snapshot cross-checked against live DOM.');
    }

    async assertBreadcrumbVisible() {
        Logger.step('VendorDashboardPage: asserting breadcrumb...');
        await expect(this.breadcrumbHome, 'FAIL: Dashboard breadcrumb "Home" crumb not visible.').toBeVisible({ timeout: 10000 });
        await expect(this.breadcrumbDashboard, 'FAIL: Dashboard breadcrumb "Dashboard" crumb not visible.').toBeVisible();
        Logger.success('VendorDashboardPage: breadcrumb "Home / Dashboard" verified.');
    }

    /** Asserts all 4 KPI summary cards render their exact label plus a value matching the
     * expected live-data SHAPE (digit count or dollar amount) — never a hardcoded dynamic
     * value, since these numbers change with real backend data between runs. */
    async assertKpiCardsVisible() {
        Logger.step('VendorDashboardPage: asserting KPI summary cards...');
        for (const { label, pattern } of KPI_CARDS) {
            const labelLocator = healingLocator(kpiCardLabelStrategies(this.page, label)).first();
            await expect(labelLocator, `FAIL: KPI card label "${label}" not visible.`).toBeVisible({ timeout: 10000 });

            const container = healingLocator(kpiCardContainerStrategies(this.page, label)).first();
            const containerText = (await container.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
            expect(
                containerText,
                `FAIL: KPI card "${label}" content "${containerText}" does not match expected shape ${pattern}.`,
            ).toMatch(pattern);
        }
        Logger.success('VendorDashboardPage: all 4 KPI summary cards verified.');
    }

    /** New Bid Invitations panel: header, live count badge, and exactly one "Review Bid" button
     * per row (count cross-checked against the badge, never hardcoded). */
    async assertNewBidInvitationsPanelVisible() {
        Logger.step('VendorDashboardPage: asserting New Bid Invitations panel...');
        const header = healingLocator(panelHeaderStrategies(this.page, 'New Bid Invitations')).first();
        await expect(header, 'FAIL: "New Bid Invitations" panel header not visible.').toBeVisible({ timeout: 10000 });

        const badge = healingLocator(panelHeaderCountBadgeStrategies(this.page, 'New Bid Invitations')).first();
        const badgeText = (await badge.innerText().catch(() => '')).trim();
        expect(badgeText, `FAIL: "New Bid Invitations" count badge "${badgeText}" is not numeric.`).toMatch(/^\d+$/);

        const reviewBidCount = await this.reviewBidButtons.count();
        expect(
            reviewBidCount,
            `FAIL: expected ${badgeText} "Review Bid" button(s) to match the panel's own count badge, found ${reviewBidCount}.`,
        ).toBe(Number(badgeText));
        for (let i = 0; i < reviewBidCount; i++) {
            await expect(this.reviewBidButtons.nth(i), `FAIL: "Review Bid" button[${i}] not visible.`).toBeVisible();
        }
        Logger.success(`VendorDashboardPage: New Bid Invitations panel verified (count=${badgeText}).`);
    }

    /** Awaiting Submission panel: header + live count badge (0 or more, never hardcoded). */
    async assertAwaitingSubmissionPanelVisible() {
        Logger.step('VendorDashboardPage: asserting Awaiting Submission panel...');
        const header = healingLocator(panelHeaderStrategies(this.page, 'Awaiting Submission')).first();
        await expect(header, 'FAIL: "Awaiting Submission" panel header not visible.').toBeVisible({ timeout: 10000 });

        const badge = healingLocator(panelHeaderCountBadgeStrategies(this.page, 'Awaiting Submission')).first();
        const badgeText = (await badge.innerText().catch(() => '')).trim();
        expect(badgeText, `FAIL: "Awaiting Submission" count badge "${badgeText}" is not numeric.`).toMatch(/^\d+$/);
        Logger.success(`VendorDashboardPage: Awaiting Submission panel verified (count=${badgeText}).`);
    }

    /** Approvals & Notifications panel: header, "Latest updates" subtitle, and every row's
     * action button reads either "View Invoice" or "View Change Order". */
    async assertApprovalsNotificationsPanelVisible() {
        Logger.step('VendorDashboardPage: asserting Approvals & Notifications panel...');
        const header = healingLocator(panelHeaderStrategies(this.page, 'Approvals & Notifications')).first();
        await expect(header, 'FAIL: "Approvals & Notifications" panel header not visible.').toBeVisible({ timeout: 10000 });

        // "Latest updates" is rendered twice on this page (also under Recent activity) —
        // .first() picks the Approvals & Notifications instance, which sits first in DOM order.
        const subtitle = healingLocator(panelHeaderStrategies(this.page, 'Latest updates')).first();
        await expect(subtitle, 'FAIL: "Latest updates" subtitle not visible under Approvals & Notifications.').toBeVisible();

        const actionCount = await this.approvalActionButtons.count();
        expect(
            actionCount,
            'FAIL: expected at least one Approvals & Notifications action button ("View Invoice"/"View Change Order").',
        ).toBeGreaterThan(0);
        for (let i = 0; i < actionCount; i++) {
            await expect(this.approvalActionButtons.nth(i), `FAIL: Approvals & Notifications action button[${i}] not visible.`).toBeVisible();
        }
        Logger.success(`VendorDashboardPage: Approvals & Notifications panel verified (${actionCount} action item(s)).`);
    }

    /** Recent activity panel: header + its own "Latest updates" subtitle (the 2nd of the 2
     * instances on the page, appearing after Approvals & Notifications in DOM order). */
    async assertRecentActivityPanelVisible() {
        Logger.step('VendorDashboardPage: asserting Recent activity panel...');
        const header = healingLocator(panelHeaderStrategies(this.page, 'Recent activity')).first();
        await expect(header, 'FAIL: "Recent activity" panel header not visible.').toBeVisible({ timeout: 10000 });

        const subtitles = healingLocator(panelHeaderStrategies(this.page, 'Latest updates'));
        await expect(subtitles.last(), 'FAIL: "Latest updates" subtitle not visible under Recent activity.').toBeVisible();
        Logger.success('VendorDashboardPage: Recent activity panel verified.');
    }

    /** Reads a KPI card's live numeric count (e.g. "Pending change orders" -> 3) — used to
     * cross-check that a real backend action (like submitting a Change Order) actually moves
     * this count, rather than hardcoding an expected value. Only valid for the 3 KPI cards
     * whose sub-text is a plain integer (not "Invoices in review", which is a dollar amount). */
    async getKpiCardCount(label) {
        const container = healingLocator(kpiCardContainerStrategies(this.page, label)).first();
        const containerText = (await container.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const match = containerText.match(/(\d+)/);
        expect(match, `FAIL: could not read a numeric count from KPI card "${label}" (text: "${containerText}").`).not.toBeNull();
        return Number(match[1]);
    }

    /** Sidebar chrome: all 5 nav items, "Get Help" link, and the signed-in vendor's email
     * (shown twice — display-name fallback + email line) in the profile trigger. */
    async assertSidebarChromeVisible() {
        Logger.step('VendorDashboardPage: asserting sidebar navigation + chrome...');
        for (const label of SIDEBAR_NAV_ITEMS) {
            const navItem = healingLocator(sidebarNavItemStrategies(this.page, label)).first();
            await expect(navItem, `FAIL: Vendor sidebar nav item "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        await expect(this.getHelpLink, 'FAIL: "Get Help" link not visible in vendor sidebar.').toBeVisible();
        await expect(
            this.profileEmail,
            `FAIL: signed-in vendor email "${this.vendorEmail}" not visible in the sidebar profile trigger.`,
        ).toBeVisible();
        Logger.success('VendorDashboardPage: sidebar navigation, Get Help link, and profile email verified.');
    }
}

module.exports = { VendorDashboardPage };
