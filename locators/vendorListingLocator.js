/**
 * Locators shared by the vendor portal's 4 tabular "listing" pages — Bids
 * (bids-and-contracts/bids), Contracts (.../contracts), Invoices (.../invoices), and Change
 * Orders (.../change-orders). MCP-verified 2026-09-15 (vendor account VENDOR_LOGIN_EMAIL,
 * session restored from vendorsession.json) that all 4 share an IDENTICAL structural template:
 * a "Piper" AI-assistant panel (title + page-name "Assistance" subtitle + a fixed greeting + an
 * "Ask about your ..." chat input + a fixed footer line), a breadcrumb, a
 * Search/View/Table/Export toolbar, and a revo-grid listing with a page-specific column set and
 * a "View Details" action button per row (Invoices/Change Orders additionally show a
 * "New Invoice"/"New Change Order" button next to the breadcrumb — reuses toolbarButtonStrategies
 * below rather than a separate locator, since it is structurally the same kind of button).
 *
 * Deliberately reuses rather than re-derives what already exists elsewhere instead of
 * duplicating it:
 *   - sidebarNavItemStrategies / breadcrumbCrumbStrategies / getHelpLinkStrategies /
 *     vendorProfileEmailStrategies — locators/vendorDashboardLocator.js (all already
 *     page-agnostic, scoped to <nav>/<main>, not Dashboard-specific despite the file name).
 *   - vendorBidsGridStrategies / vendorBidsGridRowsStrategies — locators/vendorBidLocator.js
 *     (the revo-grid + its data rows; already generic, not Bids-specific despite the name).
 *
 * Every NEW element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js).
 */

/** "Piper" panel title — fixed text, identical on all 4 listing pages. */
function piperTitleStrategies(page) {
    return [
        { name: 'main >> text=Piper(exact,original)', locator: page.locator('main').getByText('Piper', { exact: true }) },
        { name: 'css:main span:text-is("Piper")', locator: page.locator('main span:text-is("Piper")').first() },
        { name: 'xpath://main//*[normalize-space(text())="Piper"]', locator: page.locator('xpath=//main//*[normalize-space(text())="Piper"]').first() },
        { name: 'css:main *:text-is("Piper")', locator: page.locator('main *:text-is("Piper")').first() },
    ];
}

/** Page-specific Piper subtitle, e.g. "Bids Assistance", "Change Orders Assistance". */
function piperAssistanceLabelStrategies(page, label) {
    return [
        { name: `main >> text=${label}(exact,original)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `css:main span:text-is("${label}")`, locator: page.locator(`main span:text-is("${label}")`).first() },
        { name: `xpath://main//*[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]`).first() },
        { name: `css:main *:text-is("${label}")`, locator: page.locator(`main *:text-is("${label}")`).first() },
    ];
}

/** Piper's fixed greeting line — identical on all 4 listing pages. */
function piperGreetingStrategies(page) {
    const text = "👋 I'm Piper";
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main p:text-is("${text}")`, locator: page.locator(`main p:text-is("${text}")`).first() },
        { name: `xpath://main//p[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${text}"]`).first() },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
    ];
}

/** Piper's "Ask about your ..." chat input — page-specific placeholder/accessible name. */
function piperAskInputStrategies(page, placeholder) {
    return [
        { name: `role:textbox[name=${placeholder}](exact,original)`, locator: page.getByRole('textbox', { name: placeholder, exact: true }) },
        { name: `placeholder=${placeholder}(exact)`, locator: page.getByPlaceholder(placeholder, { exact: true }) },
        { name: `css:main textarea[placeholder="${placeholder}"],main input[placeholder="${placeholder}"]`, locator: page.locator(`main textarea[placeholder="${placeholder}"], main input[placeholder="${placeholder}"]`) },
        { name: `xpath://main//*[@placeholder="${placeholder}"]`, locator: page.locator(`xpath=//main//*[@placeholder="${placeholder}"]`) },
    ];
}

/** Piper panel's fixed footer line — identical on all 4 listing pages. */
function piperFooterStrategies(page) {
    const text = 'Every workflow starts here — the workspace updates as you go.';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main p:text-is("${text}")`, locator: page.locator(`main p:text-is("${text}")`).first() },
        { name: `xpath://main//p[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${text}"]`).first() },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
    ];
}

/** A page-header button matched by exact visible text — the Search/View/Table/Export toolbar
 * buttons (present on every listing page) AND the "New Invoice"/"New Change Order" button
 * (Invoices/Change Orders only): structurally the same kind of control, so one strategy set
 * covers both call sites instead of duplicating it. */
function toolbarButtonStrategies(page, label) {
    return [
        { name: `role:button[name=${label}](exact,original)`, locator: page.getByRole('button', { name: label, exact: true }) },
        { name: `css:main button:has-text("${label}")`, locator: page.locator(`main button:has-text("${label}")`).first() },
        { name: `text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `css:main button:text-is("${label}")`, locator: page.locator(`main button:text-is("${label}")`).first() },
    ];
}

/** Listing toolbar "Search..." input. */
function searchInputStrategies(page) {
    return [
        { name: 'role:textbox[name=Search...](exact,original)', locator: page.getByRole('textbox', { name: 'Search...', exact: true }) },
        { name: 'placeholder=Search...(exact)', locator: page.getByPlaceholder('Search...', { exact: true }) },
        { name: 'css:main input[placeholder="Search..."]', locator: page.locator('main input[placeholder="Search..."]') },
        { name: 'xpath://main//input[@placeholder="Search..."]', locator: page.locator('xpath=//main//input[@placeholder="Search..."]') },
    ];
}

/** A listing grid's column header, by its exact visible label (e.g. "Bid Name",
 * "Change Order Date"). */
function gridColumnHeaderStrategies(page, label) {
    return [
        { name: `role:columnheader[name=${label}](exact,original)`, locator: page.getByRole('columnheader', { name: label, exact: true }) },
        { name: `css:revo-grid [role=columnheader]:has-text("${label}")`, locator: page.locator(`revo-grid [role="columnheader"]:has-text("${label}")`).first() },
        { name: `revo-grid >> text=${label}(exact)`, locator: page.locator('revo-grid').getByText(label, { exact: true }) },
        { name: `xpath://revo-grid//*[@role="columnheader" and normalize-space(.)="${label}"]`, locator: page.locator(`xpath=//revo-grid//*[@role="columnheader" and normalize-space(.)="${label}"]`).first() },
    ];
}

/** Every "View Details" action button on the current listing page — one per real data row.
 * Deliberately used as the row-count ground truth instead of counting raw grid rows: the
 * revo-grid also renders decoy rows containing injected CSS text (documented pitfall — see
 * vendorBidsGridRowsStrategies in locators/vendorBidLocator.js), which this button count does
 * not include. */
function viewDetailsButtonsStrategies(page) {
    return [
        { name: 'role:button[name=View Details](exact,original)', locator: page.getByRole('button', { name: 'View Details', exact: true }) },
        { name: 'css:revo-grid button:has-text("View Details")', locator: page.locator('revo-grid button:has-text("View Details")') },
        { name: 'text=View Details(exact)', locator: page.getByText('View Details', { exact: true }) },
        { name: 'css:revo-grid button:has(svg.lucide-eye)', locator: page.locator('revo-grid button:has(svg.lucide-eye)') },
    ];
}

module.exports = {
    piperTitleStrategies,
    piperAssistanceLabelStrategies,
    piperGreetingStrategies,
    piperAskInputStrategies,
    piperFooterStrategies,
    toolbarButtonStrategies,
    searchInputStrategies,
    gridColumnHeaderStrategies,
    viewDetailsButtonsStrategies,
};
