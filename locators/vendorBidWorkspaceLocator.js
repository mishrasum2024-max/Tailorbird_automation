/**
 * Locators for the VENDOR portal's single-bid workspace (beta.tailorbird.com/bids-and-contracts/bids/:id)
 * BEYOND what locators/vendorBidLocator.js already covers (accept/upload/submit — the TC452
 * end-to-end flow). This file adds the surfaces that flow exercises but does not assert in
 * depth: the Reject Bid confirmation dialog, the Accept Bid confirmation dialog, and — the
 * larger addition — the "Property" tab's 5 read-only sub-tabs (Overview, Documents,
 * Asset Viewer, Locations, Take Offs), which is where Phase 3's read-only Property/Asset/Takeoff
 * "workspace widgets" actually live (MCP-verified 2026-09-15, vendor account VENDOR_LOGIN_EMAIL,
 * bid id 196 — "bid_prop_1789464855389"). These are NOT the admin app's standalone Properties
 * module (pages/properties.js, locators/propertyLocator.js) — same sub-tab naming, but a
 * completely different route/component embedded inside the vendor bid workspace, consistent
 * with the ticket's "Data is displayed through workspace/domain widgets" wording.
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js), ordered most-specific/stable first.
 */

/** Bid workspace header status badge, e.g. "Invited", "Awarded" — MCP-verified sits directly
 * beside the fixed "Bid invitation" label. */
function bidWorkspaceStatusBadgeStrategies(page) {
    return [
        { name: 'main >> "Bid invitation" following-sibling(original)', locator: page.locator('xpath=//main//*[normalize-space(text())="Bid invitation"]/following-sibling::*[1]') },
        { name: 'css:main *:text-is("Bid invitation") + *', locator: page.locator('main *:text-is("Bid invitation") + *') },
        { name: 'xpath:parent/*[2] of Bid invitation', locator: page.locator('xpath=//main//*[normalize-space(text())="Bid invitation"]/parent::*/*[2]') },
        { name: 'main >> text=Bid invitation(exact) >> xpath=../*[2]', locator: page.locator('main').getByText('Bid invitation', { exact: true }).locator('xpath=../*[2]') },
    ];
}

/** Bid workspace subtitle line, e.g. "AI_Bid_1789464905267 · Unit Interior · Due Dec 31, 2026" —
 * matched by the fixed " · " separator pattern rather than any specific bid's dynamic values. */
function bidWorkspaceSubtitleStrategies(page) {
    return [
        { name: 'css:main *:text-matches(sep)(original)', locator: page.locator('main').locator('text=/.+·.+·.+/').first() },
        { name: 'xpath://main//*[contains(text(),"·")][not(.//*)]', locator: page.locator('xpath=//main//*[contains(text(),"·")][not(.//*)]').first() },
        { name: 'css:main p:has-text("·"), main span:has-text("·")', locator: page.locator('main p:has-text("·"), main span:has-text("·")').first() },
        { name: 'xpath:sibling of bid name heading', locator: page.locator('xpath=//main//*[normalize-space(text())="Bid invitation"]/parent::*/parent::*/*[2]') },
    ];
}

/** "Reject Bid" / "Accept Bid" confirmation dialog (Mantine dialog), by its own heading text —
 * both dialogs share the same shape (title, one-sentence question, Cancel + primary button).
 * @param {import('@playwright/test').Page} page
 * @param {'Reject Bid'|'Accept Bid'} action
 */
function bidActionConfirmDialogStrategies(page, action) {
    return [
        { name: `role:dialog[name=${action}](exact,original)`, locator: page.getByRole('dialog', { name: action, exact: true }) },
        { name: `css:[role=dialog]:has-text("${action}")`, locator: page.locator(`[role="dialog"]:has-text("${action}")`).first() },
        { name: `role:dialog >> text=${action}(exact)`, locator: page.getByRole('dialog').filter({ hasText: action }) },
        { name: `xpath://*[@role="dialog"][.//*[normalize-space(text())="${action}"]]`, locator: page.locator(`xpath=//*[@role="dialog"][.//*[normalize-space(text())="${action}"]]`).first() },
    ];
}

/** "Property" tab within the bid workspace's own tab bar (distinct from the "Bid" tab, and from
 * the Bids-listing grid's "Property" COLUMN — this is scoped to the tab bar itself). */
function bidWorkspacePropertyTabStrategies(page) {
    return [
        { name: 'role:button[name=Property](exact,original)', locator: page.getByRole('button', { name: 'Property', exact: true }) },
        { name: 'css:main button:text-is("Property")', locator: page.locator('main button:text-is("Property")').first() },
        { name: 'main >> text=Property(exact) >> role=button', locator: page.locator('main').getByText('Property', { exact: true }).locator('xpath=self::button | ancestor-or-self::button') },
        { name: 'xpath://main//button[normalize-space(text())="Property"]', locator: page.locator('xpath=//main//button[normalize-space(text())="Property"]').first() },
    ];
}

/** One of the Property tab's 5 sub-tabs: "Overview", "Documents", "Asset Viewer", "Locations",
 * "Take Offs". MCP-verified plain <button> sub-tab bar, sibling to the Bid/Property tab bar. */
function propertySubTabStrategies(page, label) {
    return [
        { name: `role:button[name=${label}](exact,original)`, locator: page.getByRole('button', { name: label, exact: true }) },
        { name: `css:main button:text-is("${label}")`, locator: page.locator(`main button:text-is("${label}")`).first() },
        { name: `text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//button[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//button[normalize-space(text())="${label}"]`).first() },
    ];
}

/** Overview sub-tab read-only field, by its exact label (e.g. "Property Name", "Unit Count") —
 * value is the label's immediate next sibling paragraph. */
function propertyOverviewFieldValueStrategies(page, label) {
    return [
        { name: `xpath://main//p[normalize-space(text())="${label}"]/following-sibling::p[1](original)`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]/following-sibling::p[1]`) },
        { name: `css:main p:text-is("${label}") + p`, locator: page.locator(`main p:text-is("${label}") + p`) },
        { name: `main >> text=${label}(exact) >> xpath=../p[2]`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=../p[2]') },
        { name: `xpath://main//p[normalize-space(text())="${label}"]/parent::*/*[2]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]/parent::*/*[2]`) },
    ];
}

/** "Download Template" button on the Bid tab's scope-of-work header. */
function downloadTemplateButtonStrategies(page) {
    return [
        { name: 'role:button[name=Download Template](exact,original)', locator: page.getByRole('button', { name: 'Download Template', exact: true }) },
        { name: 'css:main button:has-text("Download Template")', locator: page.locator('main button:has-text("Download Template")') },
        { name: 'text=Download Template(exact)', locator: page.locator('main').getByText('Download Template', { exact: true }) },
        { name: 'css:main button:text-is("Download Template")', locator: page.locator('main button:text-is("Download Template")') },
    ];
}

/** The Bid tab's scope-of-work iframe (Uploadcare/embedded spreadsheet viewer rendering the
 * owner's bid template — MCP-verified a real same-origin-accessible <iframe> with a <table>). */
function bidScopeIframeStrategies(page) {
    return [
        { name: 'css:main iframe(original)', locator: page.locator('main iframe').first() },
        { name: 'css:iframe', locator: page.locator('iframe').first() },
        { name: 'xpath://main//iframe', locator: page.locator('xpath=//main//iframe').first() },
        { name: 'role:generic >> iframe', locator: page.locator('main').locator('iframe').first() },
    ];
}

/** Documents sub-tab: "Bid Documents" heading. */
function bidDocumentsHeadingStrategies(page) {
    return [
        { name: 'main >> text=Bid Documents(exact,original)', locator: page.locator('main').getByText('Bid Documents', { exact: true }) },
        { name: 'css:main *:text-is("Bid Documents")', locator: page.locator('main *:text-is("Bid Documents")').first() },
        { name: 'xpath://main//*[normalize-space(text())="Bid Documents"]', locator: page.locator('xpath=//main//*[normalize-space(text())="Bid Documents"]').first() },
        { name: 'role:heading[name=Bid Documents]', locator: page.getByRole('heading', { name: 'Bid Documents', exact: true }) },
    ];
}

/** Documents sub-tab: the documents table's "File Name" column header (proves the table
 * rendered with the expected columns). */
function bidDocumentsTableHeaderStrategies(page) {
    return [
        { name: 'role:columnheader[name=File Name](exact,original)', locator: page.getByRole('columnheader', { name: 'File Name', exact: true }) },
        { name: 'main >> text=File Name(exact)', locator: page.locator('main').getByText('File Name', { exact: true }) },
        { name: 'css:main th:text-is("File Name"), main [role=columnheader]:text-is("File Name")', locator: page.locator('main th:text-is("File Name"), main [role="columnheader"]:text-is("File Name")').first() },
        { name: 'xpath://main//*[normalize-space(text())="File Name"]', locator: page.locator('xpath=//main//*[normalize-space(text())="File Name"]').first() },
    ];
}

/** Asset Viewer sub-tab: the "Type" selector (MCP-verified always present and pre-filled with
 * "Site"; "Site"/"View" selectors stay disabled until a more specific Type is chosen). */
function assetViewerTypeSelectStrategies(page) {
    return [
        { name: 'role:textbox[name=Type](exact,original)', locator: page.getByRole('textbox', { name: 'Type', exact: true }) },
        { name: 'placeholder=Select Type(exact)', locator: page.getByPlaceholder('Select Type', { exact: true }) },
        { name: 'css:main input[placeholder="Select Type"]', locator: page.locator('main input[placeholder="Select Type"]') },
        { name: 'xpath://main//*[@placeholder="Select Type"]', locator: page.locator('xpath=//main//*[@placeholder="Select Type"]') },
    ];
}

/** Asset Viewer sub-tab: "Export" button in its own toolbar. */
function assetViewerExportButtonStrategies(page) {
    return [
        { name: 'role:button[name=Export](exact,original)', locator: page.getByRole('button', { name: 'Export', exact: true }) },
        { name: 'css:main button:has-text("Export")', locator: page.locator('main button:has-text("Export")').first() },
        { name: 'text=Export(exact)', locator: page.locator('main').getByText('Export', { exact: true }) },
        { name: 'css:main button:text-is("Export")', locator: page.locator('main button:text-is("Export")').first() },
    ];
}

/** Asset Viewer sub-tab's empty state, shown until a Type/Site/View combination is fully
 * selected: "No 3D View Selected". */
function assetViewerEmptyStateStrategies(page) {
    const text = 'No 3D View Selected';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
        { name: `xpath://main//*[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${text}"]`).first() },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

/** Take Offs sub-tab's own category tab, e.g. "Floor Plans", "Building Exterior", "Site",
 * "Interior Common Area". */
function takeOffsCategoryTabStrategies(page, label) {
    // MCP-verified 2026-09-15: switching Property sub-tabs (Overview/Documents/Asset
    // Viewer/Locations/Take Offs) does NOT unmount the other sub-tabs' content — it stays in
    // the DOM, hidden. "Site" in particular collides: it's both a Take Offs category tab AND
    // the Asset Viewer sub-tab's "Site" dropdown <label>. Every strategy here is therefore
    // scoped to `[role=tab]` explicitly (never a loose page-or-main-wide text match), so a
    // hidden same-named element from a sibling sub-tab can never win the .or() + .first() pick.
    return [
        { name: `role:tab[name=${label}](exact,original)`, locator: page.getByRole('tab', { name: label, exact: true }) },
        { name: `css:main [role=tab]:text-is("${label}")`, locator: page.locator(`main [role="tab"]:text-is("${label}")`).first() },
        { name: `xpath://main//*[@role="tab"][normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//*[@role="tab"][normalize-space(text())="${label}"]`).first() },
        { name: `role:tablist >> text=${label}(exact)`, locator: page.getByRole('tablist').getByText(label, { exact: true }) },
    ];
}

/** Take Offs sub-tab's empty state, shown when no takeoff version exists for the property:
 * "Please select a version to view takeoffs" / "No versions available for this property". */
function takeOffsEmptyStateStrategies(page) {
    const text = 'No versions available for this property';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
        { name: `xpath://main//*[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${text}"]`).first() },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

/** Locations sub-tab's empty state, shown when no sites have been added:
 * "No sites added yet" / "Use + or Create Button to create one" (same phrasing pattern used by
 * every empty grid across this app — e.g. the admin CapEx tracker list). */
function locationsEmptyStateStrategies(page) {
    const text = 'No sites added yet';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
        { name: `xpath://main//*[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${text}"]`).first() },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

/** Bids-listing empty state (search with no matches): "No bids and contracts added yet" / "Use
 * + or Create Button to create one" (MCP-verified 2026-09-15 on an intentionally-unmatched
 * search term). */
function bidsListEmptyStateStrategies(page) {
    const text = 'No bids and contracts added yet';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
        { name: `xpath://main//*[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${text}"]`).first() },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

module.exports = {
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
    bidsListEmptyStateStrategies,
};
