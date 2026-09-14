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

/** Icon-only "View Details" action button for a bid row. revo-grid renders the pinned
 * "Actions" column as a SEPARATE section, not a descendant of the data row (same quirk
 * documented in pages/projectJob.js for the admin Jobs grid) — so this must be matched by
 * the row's `data-rgrow` value against the whole grid/page, not scoped inside the row itself.
 * MCP-verified accessible name "View Details" (Mantine Tooltip-driven, not a plain
 * title/aria-label attribute — confirmed live via accessibility snapshot, not DOM textContent).
 * @param {import('@playwright/test').Page} page
 * @param {string} rowGrow the row's `data-rgrow` attribute value
 */
function viewDetailsButtonStrategies(page, rowGrow) {
    return [
        { name: 'css:[data-rgrow=X] >> role:button[name=View Details](original)', locator: page.locator(`[data-rgrow="${rowGrow}"]`).getByRole('button', { name: 'View Details' }) },
        { name: 'css:[data-rgrow=X] button:has(svg.lucide-eye)', locator: page.locator(`[data-rgrow="${rowGrow}"] button:has(svg.lucide-eye)`) },
        { name: 'css:div[role=gridcell][data-rgrow=X] button', locator: page.locator(`div[role="gridcell"][data-rgrow="${rowGrow}"] button`).first() },
        { name: 'css:[data-rgrow=X] button(last)', locator: page.locator(`[data-rgrow="${rowGrow}"] button`).last() },
    ];
}

/** Bids listing toolbar "Export" button — downloads the current list as a CSV
 * ("Bid Name","Property","Project","Job","Bid Due Date","Status","Created At", MCP-verified
 * 2026-09-14) via a real browser download event. Reading this file is far more reliable than
 * scanning the live revo-grid directly: the grid virtualizes both rows and columns, and was
 * observed (live, in an actual Playwright run) to return an incomplete/shifting set of column
 * headers on reads taken immediately after navigation — the exported CSV has no such issue. */
function exportButtonStrategies(page) {
    return [
        { name: 'role:button[name=Export](exact,original)', locator: page.getByRole('button', { name: 'Export', exact: true }) },
        { name: 'css:button:has-text("Export")', locator: page.locator('button:has-text("Export")').first() },
        { name: 'text=Export(exact)', locator: page.getByText('Export', { exact: true }).first() },
        { name: 'css:header button >> nth=-1', locator: page.locator('button').filter({ hasText: 'Export' }).last() },
    ];
}

/** Bid-detail page header: "Accept Bid" button — only present while the bid invitation is
 * still in the "Invited" state (MCP-verified 2026-09-14 on bid 186: header showed "Bid
 * invitation / Invited" with "Reject Bid"/"Accept Bid" buttons and only a "Download Template"
 * button — no Upload/Replace Document or Submit Bid button existed yet). Clicking it opens an
 * "Accept Bid" confirmation dialog; only after confirming does the page switch to the state
 * where uploadOrReplaceDocumentButtonStrategies/submitBidButtonStrategies become available. */
function acceptBidButtonStrategies(page) {
    return [
        { name: 'role:button[name=Accept Bid](exact,original)', locator: page.getByRole('button', { name: 'Accept Bid', exact: true }) },
        { name: 'css:button:has-text("Accept Bid")', locator: page.locator('button:has-text("Accept Bid")').first() },
        { name: 'text=Accept Bid(exact)', locator: page.getByText('Accept Bid', { exact: true }).first() },
        { name: 'css:header button(last-of-pair, near Reject Bid)', locator: page.locator('button').filter({ hasText: /^(Reject|Accept) Bid$/ }).last() },
    ];
}

/** The "Accept Bid" confirmation dialog's own "Accept" button (distinct from the header's
 * "Accept Bid" button and the dialog's "Cancel" button). MCP-verified 2026-09-14: dialog reads
 * "Are you sure you want to accept this bid?" with Cancel/Accept buttons. */
function acceptBidConfirmButtonStrategies(page) {
    return [
        { name: 'role:dialog >> role:button[name=Accept](exact,original)', locator: page.getByRole('dialog').getByRole('button', { name: 'Accept', exact: true }) },
        { name: 'css:[role=dialog] button:has-text("Accept")', locator: page.locator('[role="dialog"] button:has-text("Accept")').filter({ hasNotText: 'Bid' }) },
        { name: 'role:dialog[name=Accept Bid] >> role:button[name=Accept]', locator: page.getByRole('dialog', { name: 'Accept Bid' }).getByRole('button', { name: 'Accept', exact: true }) },
        { name: 'text=Accept(exact, in dialog)', locator: page.locator('[role="dialog"]').getByText('Accept', { exact: true }).first() },
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

/** Bid-detail page: the header action-bar button that opens the Uploadcare "From device"
 * widget used to attach the priced bid file. MCP-verified this button reads "Upload Document"
 * the first time, then "Replace Document" once a file is already attached (confirmed live on
 * bid 155 after a prior upload: header showed "Uploaded: Cottages_on_Elm_Roofing_Bid_Book.xlsx"
 * next to a "Replace Document" button, with "Submit Bid" now enabled) — match either label so
 * this works whether or not a document already exists on the bid. */
function uploadOrReplaceDocumentButtonStrategies(page) {
    const nameRe = /^(Upload|Replace) Document$/;
    return [
        { name: 'role:button[name=Upload|Replace Document](original)', locator: page.getByRole('button', { name: nameRe }).first() },
        { name: 'css:button:has-text("Upload Document"),button:has-text("Replace Document")', locator: page.locator('button:has-text("Upload Document"), button:has-text("Replace Document")').first() },
        { name: 'text=Upload|Replace Document(first)', locator: page.getByText(nameRe).first() },
        { name: 'css:header button near Submit Bid', locator: page.locator('button').filter({ hasText: nameRe }).first() },
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
    exportButtonStrategies,
    viewDetailsButtonStrategies,
    acceptBidButtonStrategies,
    acceptBidConfirmButtonStrategies,
    bidDetailTabStrategies,
    uploadOrReplaceDocumentButtonStrategies,
    uploadcareFromDeviceButtonStrategies,
    uploadcareDoneButtonStrategies,
    submitBidButtonStrategies,
};
