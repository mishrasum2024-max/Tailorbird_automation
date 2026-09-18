/**
 * Locators for the VENDOR portal's Dashboard page
 * (beta.tailorbird.com/bids-and-contracts/dashboard) — a separate app surface from both the
 * admin/PM app and the vendor portal's own Bids workspace (locators/vendorBidLocator.js). No
 * existing vendor-dashboard coverage existed prior to this file (MCP-verified 2026-09-15,
 * session restored from vendorsession.json — vendor account VENDOR_LOGIN_EMAIL,
 * oct30sumit@yopmail.com).
 *
 * The page is built on Mantine components with hashed, non-deterministic utility class names
 * (e.g. "m_8bffd616") and panel headers rendered as plain <span> with no heading role — MCP DOM
 * inspection confirmed there is nothing stable to select on besides the visible copy itself, so
 * every strategy below is text/role based, most of them additionally scoped to <main> to avoid
 * colliding with the identically-labelled left-nav item (e.g. the "Dashboard" nav link vs the
 * "Dashboard" breadcrumb crumb — both exact-text "Dashboard", one inside <nav>, one inside
 * <main>).
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js), ordered most-specific/stable first.
 */

/** Left-nav item inside the vendor portal's sidebar (<nav>), e.g. "Dashboard", "Bids",
 * "Contracts", "Invoices", "Change Orders" — MCP-verified only visible once the collapsed rail
 * is expanded (see utils/leftPanelExpander.js, reused as-is rather than duplicated here).
 * @param {import('@playwright/test').Page} page
 * @param {string} label exact nav item text, e.g. "Dashboard"
 */
function sidebarNavItemStrategies(page, label) {
    // MCP-verified 2026-09-15: the vendor nav's <a> wrappers carry no href attribute, so they
    // get no implicit ARIA "link" role (getByRole('link', ...) returns 0 matches) — every
    // strategy here is therefore text-based, not role-based. Each of the 2 live matches is a
    // real DOM node (a rail-state node plus the hover/pin-expanded one, same pattern documented
    // in pages/vendorBidPage.js's bidsNavLink) — callers should apply .first().
    return [
        { name: `nav >> text=${label}(exact,original)`, locator: page.locator('nav').getByText(label, { exact: true }) },
        { name: `css:nav span:text-is("${label}")`, locator: page.locator(`nav span:text-is("${label}")`) },
        { name: `css:nav :text-is("${label}")`, locator: page.locator(`nav :text-is("${label}")`) },
        { name: `xpath://nav//*[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//nav//*[normalize-space(text())="${label}"]`) },
    ];
}

/** Breadcrumb crumb inside the Dashboard page body, e.g. "Home" or "Dashboard" — MCP-verified
 * plain <p> elements inside <main>, distinct from the identically-labelled left-nav item. */
function breadcrumbCrumbStrategies(page, label) {
    return [
        { name: `main >> text=${label}(exact,original)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `css:main p:text-is("${label}")`, locator: page.locator(`main p:text-is("${label}")`).first() },
        { name: `xpath://main//p[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]`).first() },
        { name: `main >> role:link[name=${label}](exact)`, locator: page.locator('main').getByRole('link', { name: label, exact: true }) },
    ];
}

/** One of the 4 top KPI summary cards ("New bid invitations", "Awarded bids",
 * "Invoices in review", "Pending change orders") — matched by its exact label text, scoped to
 * <main> (MCP-verified 2026-09-15: card is a plain Mantine Flex with no stable class/testid). */
function kpiCardLabelStrategies(page, label) {
    return [
        { name: `main >> text=${label}(exact,original)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//*[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]`).first() },
        { name: `css:main div:text-is("${label}")`, locator: page.locator(`main div:text-is("${label}")`).first() },
        { name: `css:main >> text="${label}"(loose,first)`, locator: page.locator('main').locator(`text=${label}`).first() },
    ];
}

/** The KPI card's sibling sub-text line (e.g. "None due this week", "$3,211,310 now
 * contracted") — located relative to its own label so numeric/date content that changes
 * between runs never has to be hardcoded into the locator itself.
 * @param {import('@playwright/test').Page} page
 * @param {string} label the card's exact label text, e.g. "New bid invitations"
 */
function kpiCardContainerStrategies(page, label) {
    // MCP-verified 2026-09-15 DOM shape: <span>{label}</span> sits inside a 2-child <div>
    // (label + a second, empty element), which itself is the first of 3 children of the actual
    // card <div> (label-wrapper, count, sub-text) — i.e. exactly 2 <div> ancestors above the
    // label span. All 4 strategies below resolve to that SAME card node via different selector
    // mechanics; never mix ancestor levels here — healingLocator's .or() + .first() picks
    // whichever match starts first in document order, and an ancestor further up the tree
    // always opens before its own descendant, so a shallower/deeper fallback would silently win
    // over the intended card container instead of acting as a true same-node fallback.
    return [
        { name: `xpath://main//*[normalize-space(text())="${label}"]/ancestor::div[2](original)`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]/ancestor::div[2]`) },
        { name: `xpath://main//*[normalize-space(text())="${label}"]/parent::div/parent::div`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]/parent::div/parent::div`) },
        { name: `css:main div:has(> div > span:text-is("${label}"))`, locator: page.locator(`main div:has(> div > span:text-is("${label}"))`).first() },
        { name: `main >> text=${label}(exact) >> xpath=../..`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=../..') },
    ];
}

/** Panel section header rendered as a plain <span> (MCP-verified — no heading role/tag), e.g.
 * "New Bid Invitations", "Awaiting Submission", "Approvals & Notifications", "Recent activity".
 * Scoped to <main>. */
function panelHeaderStrategies(page, label) {
    return [
        { name: `main >> text=${label}(exact,original)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `css:main span:text-is("${label}")`, locator: page.locator(`main span:text-is("${label}")`).first() },
        { name: `xpath://main//span[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//span[normalize-space(text())="${label}"]`).first() },
        { name: `css:main *:text-is("${label}")`, locator: page.locator(`main *:text-is("${label}")`).first() },
    ];
}

/** Round badge showing an open count next to a panel header, e.g. the "2" beside
 * "New Bid Invitations" or the "0" beside "Awaiting Submission" — located as the header's
 * immediate next sibling rather than by value, since the count itself is live data. */
function panelHeaderCountBadgeStrategies(page, headerLabel) {
    // All 4 strategies resolve to the SAME node (the header's immediate next sibling) — see the
    // same-node rationale in kpiCardContainerStrategies above; a `following::` axis (any later
    // node in document order, not just a sibling) is deliberately avoided here for that reason.
    return [
        { name: `xpath://main//span[normalize-space(text())="${headerLabel}"]/following-sibling::*[1](original)`, locator: page.locator(`xpath=//main//span[normalize-space(text())="${headerLabel}"]/following-sibling::*[1]`) },
        { name: `xpath://main//*[normalize-space(text())="${headerLabel}"]/parent::*/*[2]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${headerLabel}"]/parent::*/*[2]`) },
        { name: `css:main >> text=${headerLabel} >> xpath=../*[2]`, locator: page.locator('main').getByText(headerLabel, { exact: true }).locator('xpath=../*[2]') },
        { name: `css:main span:text-is("${headerLabel}") + *`, locator: page.locator(`main span:text-is("${headerLabel}") + *`) },
    ];
}

/** "Review Bid" action button on a New Bid Invitations row — MCP-verified plain <button> with
 * exact visible text "Review Bid" (2 present on the dashboard as of 2026-09-15). */
function reviewBidButtonStrategies(page) {
    return [
        { name: 'role:button[name=Review Bid](exact,original)', locator: page.getByRole('button', { name: 'Review Bid', exact: true }) },
        { name: 'css:main button:has-text("Review Bid")', locator: page.locator('main button:has-text("Review Bid")') },
        { name: 'text=Review Bid(exact)', locator: page.locator('main').getByText('Review Bid', { exact: true }) },
        { name: 'css:main button:text-is("Review Bid")', locator: page.locator('main button:text-is("Review Bid")') },
    ];
}

/** Approvals & Notifications row action button — MCP-verified exact text "View Invoice" or
 * "View Change Order" depending on the update type. */
function approvalNotificationActionButtonStrategies(page) {
    const nameRe = /^View (Invoice|Change Order)$/;
    return [
        { name: 'role:button[name=View Invoice|View Change Order](original)', locator: page.getByRole('button', { name: nameRe }) },
        { name: 'css:main button:has-text("View Invoice"),main button:has-text("View Change Order")', locator: page.locator('main button:has-text("View Invoice"), main button:has-text("View Change Order")') },
        { name: 'text=View Invoice|View Change Order', locator: page.locator('main').getByText(nameRe) },
        { name: 'xpath://main//button[contains(text(),"View Invoice") or contains(text(),"View Change Order")]', locator: page.locator('xpath=//main//button[contains(text(),"View Invoice") or contains(text(),"View Change Order")]') },
    ];
}

/** "Get Help" link in the bottom of the sidebar — MCP-verified <a href="#"> wrapping a
 * paragraph with exact text "Get Help". */
function getHelpLinkStrategies(page) {
    return [
        { name: 'role:link[name=Get Help](exact,original)', locator: page.getByRole('link', { name: 'Get Help', exact: true }) },
        { name: 'css:nav a:has-text("Get Help")', locator: page.locator('nav a:has-text("Get Help")') },
        { name: 'text=Get Help(exact)', locator: page.getByText('Get Help', { exact: true }) },
        { name: 'xpath://nav//a[.//*[normalize-space(text())="Get Help"]]', locator: page.locator('xpath=//nav//a[.//*[normalize-space(text())="Get Help"]]') },
    ];
}

/** Profile menu trigger at the bottom of the sidebar, showing the signed-in vendor's email
 * (MCP-verified: rendered twice inside the trigger — once as the display-name fallback, once
 * as the email line — since this vendor account has no separate display name set).
 * @param {import('@playwright/test').Page} page
 * @param {string} email exact signed-in vendor email
 */
function vendorProfileEmailStrategies(page, email) {
    return [
        { name: `nav >> text=${email}(exact,original)`, locator: page.locator('nav').getByText(email, { exact: true }) },
        { name: `css:nav p:text-is("${email}")`, locator: page.locator(`nav p:text-is("${email}")`) },
        { name: `xpath://nav//p[normalize-space(text())="${email}"]`, locator: page.locator(`xpath=//nav//p[normalize-space(text())="${email}"]`) },
        { name: `text=${email}(exact,page-wide)`, locator: page.getByText(email, { exact: true }) },
    ];
}

module.exports = {
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
};
