/**
 * Locators for the VENDOR portal's Profile page (beta.tailorbird.com/profile) — the closest
 * implemented equivalent to the ticket's "Settings/Admin accessible from bottom-left
 * navigation": reached via the sidebar's bottom-left avatar → "Profile" menu item (there is no
 * separate, literally-labelled "Settings" or "Admin" entry in this phase — MCP-verified
 * 2026-09-15, vendor account VENDOR_LOGIN_EMAIL). The page has 4 tabs (Profile, Vendor profile,
 * Security, Out of Office); the "Vendor profile" tab is where this ticket's admin/compliance
 * scope actually lives today — company info + an "Edit Vendor" modal, and a "Users" section
 * (Add User / duplicate-email + invalid-email validation / per-row delete confirmation) that is
 * the real, implemented form of "vendor org admin can manage users". No compliance-document
 * (W-9/W-2/I-9/License/Insurance) UI exists anywhere on this page or in the Edit Vendor modal —
 * confirmed by inspecting all 4 tabs and the modal live; deliberately NOT modeled here.
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js).
 */

/** Profile page tab, e.g. "Profile", "Vendor profile", "Security", "Out of Office". */
function profileTabStrategies(page, label) {
    return [
        { name: `role:tab[name=${label}](exact,original)`, locator: page.getByRole('tab', { name: label, exact: true }) },
        { name: `css:main [role=tab]:text-is("${label}")`, locator: page.locator(`main [role="tab"]:text-is("${label}")`).first() },
        { name: `text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//*[@role="tab"][normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//*[@role="tab"][normalize-space(text())="${label}"]`).first() },
    ];
}

/** Vendor profile tab: a company-info read-only field's value, by its exact label (e.g.
 * "Company Name", "Trade", "Vendor ID"). */
function vendorProfileFieldValueStrategies(page, label) {
    return [
        { name: `xpath://main//p[normalize-space(text())="${label}"]/following-sibling::p[1](original)`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]/following-sibling::p[1]`) },
        { name: `css:main p:text-is("${label}") + p`, locator: page.locator(`main p:text-is("${label}") + p`) },
        { name: `main >> text=${label}(exact) >> xpath=../p[2]`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=../p[2]') },
        { name: `xpath://main//p[normalize-space(text())="${label}"]/parent::*/*[2]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]/parent::*/*[2]`) },
    ];
}

/** Vendor profile tab: "Edit" button that opens the "Edit Vendor" modal. */
function vendorProfileEditButtonStrategies(page) {
    // MCP-verified 2026-09-15: a third-party support/help widget (loaded asynchronously, INSIDE
    // <main>) injects its own hidden button with the exact same accessible name "Edit" —
    // identifiable by its stable `data-woswidgets-element` attribute. Every strategy here
    // explicitly excludes it, since an unscoped match can otherwise win the healingLocator
    // .or() + .first() pick over the real, visible Vendor-profile Edit button depending on DOM
    // order (plain <main> scoping alone does NOT separate them — both live inside <main>).
    return [
        { name: 'css:main button:text-is("Edit"):not([data-woswidgets-element])(original)', locator: page.locator('main button:text-is("Edit"):not([data-woswidgets-element])').first() },
        { name: 'css:main button:has-text("Edit"):not([data-woswidgets-element])', locator: page.locator('main button:has-text("Edit"):not([data-woswidgets-element])').first() },
        { name: 'xpath://main//button[normalize-space(text())="Edit" and not(@data-woswidgets-element)]', locator: page.locator('xpath=//main//button[normalize-space(text())="Edit" and not(@data-woswidgets-element)]').first() },
        { name: 'role:button[name=Edit]:not(woswidgets)', locator: page.getByRole('button', { name: 'Edit', exact: true }).filter({ hasNot: page.locator('[data-woswidgets-element]') }) },
    ];
}

/** "Edit Vendor" modal dialog (by its own heading). */
function editVendorDialogStrategies(page) {
    return [
        { name: 'role:dialog[name=Edit Vendor](exact,original)', locator: page.getByRole('dialog', { name: 'Edit Vendor', exact: true }) },
        { name: 'css:[role=dialog]:has-text("Edit Vendor")', locator: page.locator('[role="dialog"]:has-text("Edit Vendor")').first() },
        { name: 'role:heading[name=Edit Vendor]', locator: page.getByRole('heading', { name: 'Edit Vendor', exact: true }) },
        { name: 'xpath://*[@role="dialog"][.//*[normalize-space(text())="Edit Vendor"]]', locator: page.locator('xpath=//*[@role="dialog"][.//*[normalize-space(text())="Edit Vendor"]]').first() },
    ];
}

/** "Users" section heading (h4) on the Vendor profile tab. */
function usersSectionHeadingStrategies(page) {
    return [
        { name: 'role:heading[name=Users](exact,original)', locator: page.getByRole('heading', { name: 'Users', exact: true }) },
        { name: 'css:main h4:text-is("Users")', locator: page.locator('main h4:text-is("Users")').first() },
        { name: 'main >> text=Users(exact)', locator: page.locator('main').getByText('Users', { exact: true }) },
        { name: 'xpath://main//h4[normalize-space(text())="Users"]', locator: page.locator('xpath=//main//h4[normalize-space(text())="Users"]').first() },
    ];
}

/** "Add User" button above the vendor Users table. */
function addUserButtonStrategies(page) {
    return [
        { name: 'role:button[name=Add User](exact,original)', locator: page.getByRole('button', { name: 'Add User', exact: true }) },
        { name: 'css:main button:has-text("Add User")', locator: page.locator('main button:has-text("Add User")') },
        { name: 'text=Add User(exact)', locator: page.locator('main').getByText('Add User', { exact: true }) },
        { name: 'css:main button:text-is("Add User")', locator: page.locator('main button:text-is("Add User")') },
    ];
}

/** "Add vendor user" modal dialog. */
function addVendorUserDialogStrategies(page) {
    return [
        { name: 'role:dialog[name=Add vendor user](exact,original)', locator: page.getByRole('dialog', { name: 'Add vendor user', exact: true }) },
        { name: 'css:[role=dialog]:has-text("Add vendor user")', locator: page.locator('[role="dialog"]:has-text("Add vendor user")').first() },
        { name: 'role:heading[name=Add vendor user]', locator: page.getByRole('heading', { name: 'Add vendor user', exact: true }) },
        { name: 'xpath://*[@role="dialog"][.//*[normalize-space(text())="Add vendor user"]]', locator: page.locator('xpath=//*[@role="dialog"][.//*[normalize-space(text())="Add vendor user"]]').first() },
    ];
}

/** "Add vendor user" modal form field — MCP-verified each field's accessible name (via its
 * Mantine label) and its placeholder both resolve to the SAME <input>, e.g. name="First name"
 * / placeholder="Jane"; name="Email" / placeholder="jane@vendor.com".
 * @param {import('@playwright/test').Page} page
 * @param {string} label accessible name, e.g. "First name", "Last name", "Phone", "Email"
 * @param {string} placeholder that field's placeholder, e.g. "Jane", "jane@vendor.com"
 */
function addVendorUserFieldStrategies(page, label, placeholder) {
    return [
        { name: `role:dialog >> role:textbox[name=${label}](exact,original)`, locator: page.getByRole('dialog').getByRole('textbox', { name: label, exact: true }) },
        { name: `role:dialog >> placeholder=${placeholder}(exact)`, locator: page.getByRole('dialog').getByPlaceholder(placeholder, { exact: true }) },
        { name: `css:[role=dialog] input[placeholder="${placeholder}"]`, locator: page.locator(`[role="dialog"] input[placeholder="${placeholder}"]`) },
        { name: `xpath://*[@role="dialog"]//input[@placeholder="${placeholder}"]`, locator: page.locator(`xpath=//*[@role="dialog"]//input[@placeholder="${placeholder}"]`) },
    ];
}

/** "Add vendor user" modal: "Create & invite" submit button. */
function createAndInviteButtonStrategies(page) {
    return [
        { name: 'role:button[name=Create & invite](exact,original)', locator: page.getByRole('button', { name: 'Create & invite', exact: true }) },
        { name: 'css:[role=dialog] button:has-text("Create & invite")', locator: page.locator('[role="dialog"] button:has-text("Create & invite")') },
        { name: 'text=Create & invite(exact)', locator: page.getByText('Create & invite', { exact: true }) },
        { name: 'css:[role=dialog] button:text-is("Create & invite")', locator: page.locator('[role="dialog"] button:text-is("Create & invite")') },
    ];
}

/** A modal's "Cancel" button — reused across "Add vendor user", "Edit Vendor", and the "Delete
 * Row" confirmation, so scoped to the currently-open dialog rather than the page. */
function dialogCancelButtonStrategies(page) {
    return [
        { name: 'role:dialog >> role:button[name=Cancel](exact,original)', locator: page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }) },
        { name: 'css:[role=dialog] button:has-text("Cancel")', locator: page.locator('[role="dialog"] button:has-text("Cancel")').first() },
        { name: '[role=dialog] >> text=Cancel(exact)', locator: page.locator('[role="dialog"]').getByText('Cancel', { exact: true }) },
        { name: 'css:[role=dialog] button:text-is("Cancel")', locator: page.locator('[role="dialog"] button:text-is("Cancel")').first() },
    ];
}

/** Inline field-validation error text under the Email input, e.g. "Enter a valid email". */
function emailFieldErrorStrategies(page) {
    // const text = 'Enter a valid email';
    const text = 'Please fill out this field.';
    return [
        { name: `role:dialog >> text=${text}(exact,original)`, locator: page.getByRole('dialog').getByText(text, { exact: true }) },
        { name: `css:[role=dialog] p:text-is("${text}")`, locator: page.locator(`[role="dialog"] p:text-is("${text}")`) },
        { name: `xpath://*[@role="dialog"]//p[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//*[@role="dialog"]//p[normalize-space(text())="${text}"]`) },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

/** Toast/alert shown after a failed Add-User submission, e.g. "User already exists". */
function addUserErrorToastStrategies(page) {
    return [
        { name: 'role:alert(original)', locator: page.getByRole('alert').filter({ hasText: 'Error' }) },
        { name: 'css:[role=alert]:has-text("Error")', locator: page.locator('[role="alert"]:has-text("Error")').first() },
        { name: 'text=User already exists(exact)', locator: page.getByText('User already exists', { exact: true }) },
        { name: 'xpath://*[@role="alert"][.//*[normalize-space(text())="Error"]]', locator: page.locator('xpath=//*[@role="alert"][.//*[normalize-space(text())="Error"]]').first() },
    ];
}

/** Users table column header, by exact label — "POC", "Name", "Status", "Phone Number",
 * "Email Address", "Actions". */
function usersTableColumnHeaderStrategies(page, label) {
    return [
        { name: `role:columnheader[name=${label}](exact,original)`, locator: page.getByRole('columnheader', { name: label, exact: true }) },
        { name: `css:main [role=columnheader]:has-text("${label}")`, locator: page.locator(`main [role="columnheader"]:has-text("${label}")`).first() },
        { name: `main >> text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//*[@role="columnheader" and normalize-space(.)="${label}"]`, locator: page.locator(`xpath=//main//*[@role="columnheader" and normalize-space(.)="${label}"]`).first() },
    ];
}

/** A Users-table data row, matched by its exact email (via the mailto: link Name Address cell). */
function userRowByEmailStrategies(page, email) {
    return [
        { name: `role:row >> role:link[name=${email}](exact,original)`, locator: page.getByRole('row').filter({ has: page.getByRole('link', { name: email, exact: true }) }) },
        { name: `css:[role=row]:has(a[href="mailto:${email}"])`, locator: page.locator(`[role="row"]:has(a[href="mailto:${email}"])`) },
        { name: `main >> text=${email}(exact) >> xpath=ancestor::*[@role="row"][1]`, locator: page.locator('main').getByText(email, { exact: true }).locator('xpath=ancestor::*[@role="row"][1]') },
        { name: `xpath://*[@role="row"][.//a[@href="mailto:${email}"]]`, locator: page.locator(`xpath=//*[@role="row"][.//a[@href="mailto:${email}"]]`) },
    ];
}

/** Row delete ("trash") action button, matched by the row's `data-rgrow` — MCP-verified
 * 2026-09-15 this Users grid is the same revo-grid component used by the Bids/Contracts/
 * Invoices/Change Orders listings, where the pinned "Actions" column is a SEPARATE grid
 * section, not a descendant of the visible data row (same pattern as
 * viewDetailsButtonStrategies in locators/vendorBidLocator.js — the row to delete must first be
 * found via userRowByEmailStrategies, its `data-rgrow` attribute read, then passed here).
 * @param {import('@playwright/test').Page} page
 * @param {string} rowGrow the row's `data-rgrow` attribute value
 */
function userRowDeleteButtonByRowGrowStrategies(page, rowGrow) {
    // MCP-verified 2026-09-15: [data-rgrow="X"] also matches the POC column's 2 "Clear
    // selection" (✕) checkbox buttons on this grid — the real delete/trash control is a
    // distinct 3rd button: a Mantine ActionIcon with a red hover state
    // (--ai-hover: var(--mantine-color-red-light-hover)), always the LAST button among the
    // row's matches (its "Actions" column is pinned/rendered after the POC column).
    return [
        { name: 'css:[data-rgrow=X] button.mantine-ActionIcon-root(original)', locator: page.locator(`[data-rgrow="${rowGrow}"] button.mantine-ActionIcon-root`) },
        { name: 'css:[data-rgrow=X] button:not([aria-label="Clear selection"])', locator: page.locator(`[data-rgrow="${rowGrow}"] button:not([aria-label="Clear selection"])`) },
        { name: 'css:[data-rgrow=X] button(last)', locator: page.locator(`[data-rgrow="${rowGrow}"] button`).last() },
        { name: 'xpath:(//[data-rgrow=X]//button)[last()]', locator: page.locator(`xpath=(//*[@data-rgrow="${rowGrow}"]//button)[last()]`) },
    ];
}

/** "Delete Row" confirmation dialog opened by the row delete action. */
function deleteRowDialogStrategies(page) {
    return [
        { name: 'main >> text=Delete Row(exact,original)', locator: page.getByText('Delete Row', { exact: true }).first() },
        { name: 'css:[role=dialog]:has-text("Delete Row")', locator: page.locator('[role="dialog"]:has-text("Delete Row")').first() },
        { name: 'text=Are you sure you want to delete this row?', locator: page.getByText('Are you sure you want to delete this row?', { exact: true }) },
        { name: 'xpath://*[.//*[normalize-space(text())="Delete Row"]][.//button[normalize-space(text())="Delete"]]', locator: page.locator('xpath=//*[.//*[normalize-space(text())="Delete Row"]][.//button[normalize-space(text())="Delete"]]').first() },
    ];
}

/** "Delete Row" dialog's own "Delete" confirm button (exact text "Delete", distinct from the
 * dialog's own "Delete Row" title text since getByRole/text-is match full normalized text, not
 * substrings). */
function deleteRowConfirmButtonStrategies(page) {
    return [
        { name: 'role:button[name=Delete](exact,original)', locator: page.getByRole('button', { name: 'Delete', exact: true }) },
        { name: 'css:button:text-is("Delete")', locator: page.locator('button:text-is("Delete")').first() },
        { name: 'text=Delete(exact)', locator: page.getByText('Delete', { exact: true }) },
        { name: 'xpath://button[normalize-space(text())="Delete"]', locator: page.locator('xpath=//button[normalize-space(text())="Delete"]').first() },
    ];
}

module.exports = {
    profileTabStrategies,
    vendorProfileFieldValueStrategies,
    vendorProfileEditButtonStrategies,
    editVendorDialogStrategies,
    usersSectionHeadingStrategies,
    addUserButtonStrategies,
    addVendorUserDialogStrategies,
    addVendorUserFieldStrategies,
    createAndInviteButtonStrategies,
    dialogCancelButtonStrategies,
    emailFieldErrorStrategies,
    addUserErrorToastStrategies,
    usersTableColumnHeaderStrategies,
    userRowByEmailStrategies,
    userRowDeleteButtonByRowGrowStrategies,
    deleteRowDialogStrategies,
    deleteRowConfirmButtonStrategies,
};
