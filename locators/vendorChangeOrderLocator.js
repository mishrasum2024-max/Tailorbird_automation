/**
 * Locators for the VENDOR portal's Change Order draft editor
 * (beta.tailorbird.com/bids-and-contracts/change-orders/drafts/:id -> submitted
 * /change-orders/:id), MCP-verified 2026-09-17 (vendor account VENDOR_LOGIN_EMAIL).
 *
 * The "New Change Order" modal, draft Title/Description fields, Contract/Total summary,
 * draft action buttons ("Delete Draft"/"Save Draft"/"Submit for Approval"), the existing-
 * line-item amount inputs, the "Submit Change Order" confirmation dialog, and the submitted
 * Change Order detail page's labelled fields all share the EXACT same DOM shape as the
 * already-automated Regular Invoice / Pay Application flow (MCP-confirmed live) — those
 * strategies are reused directly from locators/vendorPayInvoiceLocator.js in
 * pages/vendorChangeOrderPage.js rather than duplicated here. Only the elements genuinely
 * unique to the Change Order draft editor — the "Existing Contract Line Items"/"New Line
 * Items" section headings and the "New Line Items" table's own add/remove/field controls —
 * are defined in this file.
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js).
 */

/** A Change Order draft editor section heading (h5) — "Existing Contract Line Items" or
 * "New Line Items". */
function changeOrderSectionHeadingStrategies(page, label) {
    return [
        { name: `role:heading[name=${label}](exact,original)`, locator: page.getByRole('heading', { name: label, exact: true }) },
        { name: `css:main h5:text-is("${label}")`, locator: page.locator(`main h5:text-is("${label}")`).first() },
        { name: `main >> text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//h5[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//h5[normalize-space(text())="${label}"]`).first() },
    ];
}

/** "Add Line Item" button above the New Line Items table. */
function addLineItemButtonStrategies(page) {
    return [
        { name: 'role:button[name=Add Line Item](exact,original)', locator: page.getByRole('button', { name: 'Add Line Item', exact: true }) },
        { name: 'css:main button:has-text("Add Line Item")', locator: page.locator('main button:has-text("Add Line Item")').first() },
        { name: 'main >> text=Add Line Item(exact)', locator: page.locator('main').getByText('Add Line Item', { exact: true }) },
        { name: 'css:main button:text-is("Add Line Item")', locator: page.locator('main button:text-is("Add Line Item")').first() },
    ];
}

/** "No new line items." empty-state paragraph shown before any row has been added. */
function noNewLineItemsTextStrategies(page) {
    const text = 'No new line items.';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main p:text-is("${text}")`, locator: page.locator(`main p:text-is("${text}")`).first() },
        { name: `xpath://main//p[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${text}"]`).first() },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

/** A New Line Item row's own input, matched by its placeholder — "Scope (e.g. Kitchen)",
 * "Schedule of value", "Description", or "Qty". Scoped to the most recently added (last) row
 * via .last() at call sites since multiple rows can exist. */
function newLineItemFieldByPlaceholderStrategies(page, placeholder) {
    return [
        { name: `main >> role:textbox[placeholder=${placeholder}](exact,original)`, locator: page.locator('main').getByPlaceholder(placeholder, { exact: true }) },
        { name: `css:main input[placeholder="${placeholder}"]`, locator: page.locator(`main input[placeholder="${placeholder}"]`) },
        { name: `xpath://main//input[@placeholder="${placeholder}"]`, locator: page.locator(`xpath=//main//input[@placeholder="${placeholder}"]`) },
        { name: `main >> placeholder=${placeholder}`, locator: page.locator('main').locator(`input[placeholder="${placeholder}"]`) },
    ];
}

/** The New Line Items table's own "Unit Cost" or "Change Order Amount" input — both share the
 * placeholder "0.00", so they are disambiguated by column position (Unit Cost = 5th cell,
 * Change Order Amount = 6th cell) within a given row, scoped under the "New Line Items"
 * heading so it never collides with the Existing Contract Line Items table's own "0.00"
 * inputs (which are matched separately via lineItemAmountInputStrategies + a Cost Item
 * label). `rowIndex` is 0-based (0 = the first/only New Line Item row in this suite).
 *
 * All 4 strategies below resolve to the exact same DOM node (the `nth`-th <td>'s own input),
 * only varying HOW that same cell is located — same-node principle (see utils/locatorHealer.js
 * / project convention): an earlier version of this function had a strategy that counted
 * INPUTS instead of CELLS (`.nth(nth - 3)`), which silently resolved to the Description input
 * two columns earlier and caused every fill to land on the wrong field. */
function newLineItemAmountInputStrategies(page, rowIndex, columnPosition) {
    const nth = columnPosition; // 5 = Unit Cost, 6 = Change Order Amount (1-based td position)
    const rowLocator = page.locator('xpath=//h5[normalize-space(text())="New Line Items"]/following::table[1]//tbody/tr').nth(rowIndex);
    return [
        { name: `xpath:New Line Items row[${rowIndex}] td[${nth}] input(original)`, locator: rowLocator.locator(`td:nth-child(${nth}) input`) },
        { name: `css:New Line Items row[${rowIndex}] td:nth-child(${nth}) input`, locator: rowLocator.locator(`xpath=./td[${nth}]//input`) },
        { name: `xpath:New Line Items table row[${rowIndex}] td[${nth}] input (absolute)`, locator: page.locator(`xpath=(//h5[normalize-space(text())="New Line Items"]/following::table[1]//tbody/tr)[${rowIndex + 1}]/td[${nth}]//input`) },
        { name: `New Line Items row[${rowIndex}] td[${nth}] input fallback`, locator: rowLocator.locator('td').nth(nth - 1).locator('input') },
    ];
}

/** The "remove row" icon-only button at the end of a New Line Items row (`rowIndex` 0-based). */
function removeNewLineItemRowButtonStrategies(page, rowIndex) {
    return [
        {
            name: `xpath:New Line Items row[${rowIndex}] last-cell button(original)`,
            locator: page.locator('xpath=//h5[normalize-space(text())="New Line Items"]/following::table[1]//tbody/tr').nth(rowIndex).locator('td:last-child button'),
        },
        {
            name: `New Line Items row[${rowIndex}] trailing button`,
            locator: page.locator('xpath=//h5[normalize-space(text())="New Line Items"]/following::table[1]').locator('tbody tr').nth(rowIndex).locator('button').last(),
        },
        {
            name: `xpath:New Line Items row[${rowIndex}] last-cell button (dup)`,
            locator: page.locator(`xpath=(//h5[normalize-space(text())="New Line Items"]/following::table[1]//tbody/tr)[${rowIndex + 1}]/td[last()]//button`),
        },
        {
            name: `New Line Items row[${rowIndex}] last button fallback`,
            locator: page.locator('xpath=//h5[normalize-space(text())="New Line Items"]/following::table[1]//tbody/tr').nth(rowIndex).locator('button').last(),
        },
    ];
}

module.exports = {
    changeOrderSectionHeadingStrategies,
    addLineItemButtonStrategies,
    noNewLineItemsTextStrategies,
    newLineItemFieldByPlaceholderStrategies,
    newLineItemAmountInputStrategies,
    removeNewLineItemRowButtonStrategies,
};
