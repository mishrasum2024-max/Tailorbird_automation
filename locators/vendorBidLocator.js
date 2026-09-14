/**
 * Locators for the VENDOR portal's Bids workspace (beta.tailorbird.com/bids-and-contracts/bids
 * and its bid-detail pages, e.g. /bids-and-contracts/bids/:id). This is a completely separate
 * app surface from the admin/PM "Bids" module (pages/bidPage.js, locators/bidLocator.js) — no
 * existing vendor-portal coverage existed prior to this file (MCP-verified 2026-09-14, logged
 * in as the vendor account VENDOR_LOGIN_EMAIL).
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js), ordered most-specific/stable first. All strategies
 * were exercised live via MCP browser and/or Playwright against bid id 155
 * ("Automation test" / Test Property 1_Cottages on Elm) before being committed here.
 */

/** Left-nav "Bids" item. Vendor portal nav has no admin-side NavLink markup (MCP-verified:
 * plain clickable text, not an <a class="mantine-NavLink-root">) — it does resolve to a real
 * anchor accessibly (role=link) once expanded, confirmed via MCP-generated click code
 * `page.locator('a').nth(1)` landing on /bids-and-contracts/bids. */
function vendorBidsNavLinkStrategies(page) {
    return [
        { name: 'role:link[name=Bids](exact)', locator: page.getByRole('link', { name: 'Bids', exact: true }) },
        { name: 'css:nav a[href*="/bids-and-contracts/bids"]', locator: page.locator('nav a[href*="/bids-and-contracts/bids"]').first() },
        { name: 'nav>>text=Bids(exact)', locator: page.locator('nav').getByText('Bids', { exact: true }) },
        { name: 'css:nav >> text=Bids(loose)', locator: page.locator('nav').locator('text=Bids').first() },
    ];
}

/** The Bids listing revo-grid (MCP-verified tag: <revo-grid role="treegrid"> class
 * "bird-table-revogrid"), same virtualized-grid technology used elsewhere in this app
 * (see [[feedback_revogrid_pitfalls]] equivalent notes in pages/projectJob.js). */
function vendorBidsGridStrategies(page) {
    return [
        { name: 'role:treegrid(original)', locator: page.locator('revo-grid[role="treegrid"]').first() },
        { name: 'css:revo-grid.bird-table-revogrid', locator: page.locator('revo-grid.bird-table-revogrid').first() },
        { name: 'css:revo-grid', locator: page.locator('revo-grid').first() },
        { name: 'xpath://revo-grid[@role="treegrid"]', locator: page.locator('xpath=//revo-grid[@role="treegrid"]').first() },
    ];
}

/** Data rows within the Bids grid — MCP/DOM-verified as `div[role="row"][data-rgrow]` with
 * class "rgRow". The grid also renders decoy rows containing raw injected CSS text (a known
 * revo-grid quirk elsewhere in this suite) — callers must filter those out by content, not rely
 * on row count alone. */
function vendorBidsGridRowsStrategies(gridScope) {
    return [
        { name: 'css:div[role=row][data-rgrow](original)', locator: gridScope.locator('div[role="row"][data-rgrow]') },
        { name: 'css:div.rgRow[data-rgrow]', locator: gridScope.locator('div.rgRow[data-rgrow]') },
        { name: 'role:row', locator: gridScope.getByRole('row') },
        { name: 'css:[data-rgrow]', locator: gridScope.locator('[data-rgrow]') },
    ];
}

/** Icon-only "View Details" action button inside a bid row's pinned Actions column.
 * MCP-verified accessible name "View Details" (Mantine Tooltip-driven, not a plain
 * title/aria-label attribute — confirmed live via accessibility snapshot, not DOM textContent). */
function viewDetailsButtonStrategies(rowScope) {
    return [
        { name: 'role:button[name=View Details](original)', locator: rowScope.getByRole('button', { name: 'View Details' }) },
        { name: 'css:button:has(svg.lucide-eye)', locator: rowScope.locator('button:has(svg.lucide-eye)') },
        { name: 'css:[role=gridcell] button', locator: rowScope.locator('[role="gridcell"] button').first() },
        { name: 'css:button', locator: rowScope.locator('button').last() },
    ];
}

/** Bid-detail page: "Bid" tab (default active tab on a bid-detail page, distinct from the
 * "Property" tab). MCP-verified plain <button> with visible text "Bid". */
function bidDetailTabStrategies(page) {
    return [
        { name: 'role:button[name=Bid](exact)', locator: page.getByRole('button', { name: 'Bid', exact: true }) },
        { name: 'role:tab[name=Bid]', locator: page.getByRole('tab', { name: 'Bid', exact: true }) },
        { name: 'css:button:text-is("Bid")', locator: page.locator('button:text-is("Bid")').first() },
        { name: 'text=Bid(exact,first)', locator: page.getByText('Bid', { exact: true }).first() },
    ];
}

/** Bid-detail page: "Upload Document" button in the header action bar (Bid tab) — the button
 * that opens the Uploadcare "From device" widget used to attach the priced bid file.
 * MCP-verified plain <button> with visible text "Upload Document", paired with a disabled
 * "Submit Bid" button until a document is attached. */
function uploadDocumentButtonStrategies(page) {
    return [
        { name: 'role:button[name=Upload Document](original)', locator: page.getByRole('button', { name: 'Upload Document' }).first() },
        { name: 'css:button:has-text("Upload Document")', locator: page.locator('button:has-text("Upload Document")').first() },
        { name: 'text=Upload Document(first)', locator: page.getByText('Upload Document', { exact: true }).first() },
        { name: 'css:header button:near(:text("Submit Bid"))', locator: page.locator('button').filter({ hasText: 'Upload Document' }).first() },
    ];
}

/** Uploadcare widget "From device" option — MCP/DOM-verified: <button aria-label="From device">. */
function uploadcareFromDeviceButtonStrategies(page) {
    return [
        { name: 'role:button[name=From device](aria-label, original)', locator: page.getByRole('button', { name: 'From device' }) },
        { name: 'css:button[aria-label="From device"]', locator: page.locator('button[aria-label="From device"]') },
        { name: 'text=From device', locator: page.getByText('From device', { exact: true }) },
        { name: 'css:.uc-simple-btn[aria-label="From device"], [data-uc-el*="source-list"] button:has-text("device")', locator: page.locator('[data-uc-el*="source-list"] button, .uc-simple-btn').filter({ hasText: /device/i }).first() },
    ];
}

/** Uploadcare widget "Done" button — confirms/closes the file-uploaded confirmation dialog
 * after the file finishes auto-uploading (DOM-verified class "uc-done-btn uc-primary-btn"). */
function uploadcareDoneButtonStrategies(page) {
    return [
        { name: 'role:button[name=Done](original)', locator: page.getByRole('button', { name: 'Done', exact: true }) },
        { name: 'css:.uc-done-btn', locator: page.locator('.uc-done-btn') },
        { name: 'css:button.uc-done-btn.uc-primary-btn', locator: page.locator('button.uc-done-btn.uc-primary-btn') },
        { name: 'text=Done(exact)', locator: page.getByText('Done', { exact: true }).first() },
    ];
}

/** Bid-detail page: "Submit Bid" button — disabled until a document has been uploaded.
 * MCP-verified plain <button> with visible text "Submit Bid". */
function submitBidButtonStrategies(page) {
    return [
        { name: 'role:button[name=Submit Bid](original)', locator: page.getByRole('button', { name: 'Submit Bid' }) },
        { name: 'css:button:has-text("Submit Bid")', locator: page.locator('button:has-text("Submit Bid")').first() },
        { name: 'text=Submit Bid(exact)', locator: page.getByText('Submit Bid', { exact: true }) },
        { name: 'css:header button >> nth=-1', locator: page.locator('button').filter({ hasText: 'Submit Bid' }).last() },
    ];
}

module.exports = {
    vendorBidsNavLinkStrategies,
    vendorBidsGridStrategies,
    vendorBidsGridRowsStrategies,
    viewDetailsButtonStrategies,
    bidDetailTabStrategies,
    uploadDocumentButtonStrategies,
    uploadcareFromDeviceButtonStrategies,
    uploadcareDoneButtonStrategies,
    submitBidButtonStrategies,
};
