/**
 * Locators for the VENDOR portal's "New Invoice" flow — both the "Regular Invoice" path
 * (beta.tailorbird.com/bids-and-contracts/invoices/new -> /invoices/drafts/:id -> submitted
 * /invoices/:id) and the "Pay Application" path (.../invoices/new -> /invoices/pay-apps/:id/chat
 * -> /invoices/pay-apps/:id -> submitted /invoices/:id), MCP-verified 2026-09-17 (vendor account
 * VENDOR_LOGIN_EMAIL). "Pay Application" is this app's literal name for what is casually called
 * "Pay Invoice" — an AIA G702/G703 workflow (Piper-assisted OCR of supporting invoices, a
 * required signed lien-waiver upload, and an auto-generated Schedule of Values) — there is no
 * separate feature literally named "Pay Invoice".
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies (per project
 * convention — see utils/locatorHealer.js), scoped to <main> or a specific dialog wherever a
 * collision with unrelated same-text elements was found live (the same pitfall documented in
 * locators/vendorBidWorkspaceLocator.js and locators/vendorProfileLocator.js).
 */

/** "New Invoice" button on the Invoices listing page header. */
function newInvoiceButtonStrategies(page) {
    return [
        { name: 'role:button[name=New Invoice](exact,original)', locator: page.getByRole('button', { name: 'New Invoice', exact: true }) },
        { name: 'css:main button:has-text("New Invoice")', locator: page.locator('main button:has-text("New Invoice")').first() },
        { name: 'main >> text=New Invoice(exact)', locator: page.locator('main').getByText('New Invoice', { exact: true }) },
        { name: 'css:main button:text-is("New Invoice")', locator: page.locator('main button:text-is("New Invoice")').first() },
    ];
}

/** Invoice-type selection card ("Regular Invoice" or "Pay Application") on
 * /invoices/new, matched by its own heading paragraph text. */
function invoiceTypeCardStrategies(page, label) {
    return [
        { name: `role:button >> text=${label}(exact,original)`, locator: page.getByRole('button').filter({ has: page.getByText(label, { exact: true }) }) },
        { name: `css:main button:has-text("${label}")`, locator: page.locator(`main button:has-text("${label}")`).first() },
        { name: `main >> text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//button[.//*[normalize-space(text())="${label}"]]`, locator: page.locator(`xpath=//main//button[.//*[normalize-space(text())="${label}"]]`).first() },
    ];
}

/** Regular-Invoice source-selection card ("Upload invoice PDF" or "Start from a contract"),
 * shown after choosing "Regular Invoice". */
function regularInvoiceSourceCardStrategies(page, label) {
    return [
        { name: `role:button >> text=${label}(exact,original)`, locator: page.getByRole('button').filter({ has: page.getByText(label, { exact: true }) }) },
        { name: `css:main button:has-text("${label}")`, locator: page.locator(`main button:has-text("${label}")`).first() },
        { name: `main >> text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//button[.//*[normalize-space(text())="${label}"]]`, locator: page.locator(`xpath=//main//button[.//*[normalize-space(text())="${label}"]]`).first() },
    ];
}

/** "Contract" combobox textbox — appears both in the "New Invoice" modal (Regular Invoice ->
 * Start from a contract) and on the "Start a pay application" screen. Scoped generically since
 * only one is ever mounted/visible at a time. */
function contractComboboxStrategies(page) {
    return [
        { name: 'role:textbox[name=Contract](exact,original)', locator: page.getByRole('textbox', { name: 'Contract', exact: true }) },
        { name: 'placeholder~Select a contract|Select the contract', locator: page.locator('input[placeholder*="contract" i], textarea[placeholder*="contract" i]').first() },
        { name: 'role:combobox[name=Contract]', locator: page.getByRole('combobox', { name: 'Contract', exact: true }) },
        { name: 'xpath://label[normalize-space(text())="Contract" or normalize-space(text())="Contract *"]/following::input[1]', locator: page.locator('xpath=//*[normalize-space(text())="Contract" or normalize-space(text())="Contract *"]/following::input[1]') },
    ];
}

/** A contract option in the Contract combobox's open listbox, by its exact visible label
 * (e.g. "Automation_Job — Test Property 1_Cottages on Elm"). */
function contractOptionStrategies(page, label) {
    return [
        { name: `role:option[name=${label}](exact,original)`, locator: page.getByRole('option', { name: label, exact: true }) },
        { name: `role:listbox >> text=${label}(exact)`, locator: page.getByRole('listbox').getByText(label, { exact: true }) },
        { name: `css:[role=option]:text-is("${label}")`, locator: page.locator(`[role="option"]:text-is("${label}")`).first() },
        { name: `xpath://*[@role="option"][normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//*[@role="option"][normalize-space(text())="${label}"]`).first() },
    ];
}

/** "Create Draft" button in the "New Invoice" contract-selection modal. */
function createDraftButtonStrategies(page) {
    return [
        { name: 'role:dialog >> role:button[name=Create Draft](exact,original)', locator: page.getByRole('dialog').getByRole('button', { name: 'Create Draft', exact: true }) },
        { name: 'css:[role=dialog] button:has-text("Create Draft")', locator: page.locator('[role="dialog"] button:has-text("Create Draft")') },
        { name: 'role:dialog >> text=Create Draft(exact)', locator: page.getByRole('dialog').getByText('Create Draft', { exact: true }) },
        { name: 'css:[role=dialog] button:text-is("Create Draft")', locator: page.locator('[role="dialog"] button:text-is("Create Draft")') },
    ];
}

/** "Start pay application" button on the pay-application contract-selection screen. */
function startPayApplicationButtonStrategies(page) {
    return [
        { name: 'role:button[name=Start pay application](exact,original)', locator: page.getByRole('button', { name: 'Start pay application', exact: true }) },
        { name: 'css:main button:has-text("Start pay application")', locator: page.locator('main button:has-text("Start pay application")') },
        { name: 'main >> text=Start pay application(exact)', locator: page.locator('main').getByText('Start pay application', { exact: true }) },
        { name: 'css:main button:text-is("Start pay application")', locator: page.locator('main button:text-is("Start pay application")') },
    ];
}

/** Regular-Invoice draft editor: a top-level action button — "Delete Draft", "Save Draft", or
 * "Submit for Approval". */
function draftActionButtonStrategies(page, label) {
    return [
        { name: `main >> role:button[name=${label}](exact,original)`, locator: page.locator('main').getByRole('button', { name: label, exact: true }) },
        { name: `css:main button:has-text("${label}")`, locator: page.locator(`main button:has-text("${label}")`).first() },
        { name: `main >> text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `css:main button:text-is("${label}")`, locator: page.locator(`main button:text-is("${label}")`).first() },
    ];
}

/** Regular-Invoice draft editor: a labelled summary value at the top of the form — "Invoice
 * Total", "Retainage (0%)"/"Retainage", or "Net Payable". Matched by the label's fixed prefix
 * since the "(0%)" suffix on Retainage is itself dynamic (contract-configured). */
function draftSummaryValueStrategies(page, labelPrefix) {
    // No regex locators: XPath's starts-with() covers the "prefix" matching this needs
    // (Retainage's "(0%)" suffix is itself dynamic), and Playwright's hasText/getByText do a
    // plain substring match on an ordinary string without any regex syntax.
    return [
        { name: `xpath://main//p[starts-with(normalize-space(text()),"${labelPrefix}")]/following-sibling::p[1](original)`, locator: page.locator(`xpath=//main//p[starts-with(normalize-space(text()),"${labelPrefix}")]/following-sibling::p[1]`) },
        { name: `css:main p:has-text("${labelPrefix}") + p`, locator: page.locator('main p').filter({ hasText: labelPrefix }).locator('xpath=following-sibling::p[1]') },
        { name: `xpath://main//p[starts-with(normalize-space(text()),"${labelPrefix}")]/parent::*/*[2]`, locator: page.locator(`xpath=//main//p[starts-with(normalize-space(text()),"${labelPrefix}")]/parent::*/*[2]`) },
        { name: `main >> text=${labelPrefix}(substring)`, locator: page.locator('main').getByText(labelPrefix).first().locator('xpath=following-sibling::p[1]') },
    ];
}

/** Regular-Invoice draft editor: a labelled input field — "Invoice Number" or "Title" or
 * "Description" (plain textbox), matched by its accessible name. */
function draftFieldStrategies(page, label) {
    return [
        { name: `main >> role:textbox[name=${label}](exact,original)`, locator: page.locator('main').getByRole('textbox', { name: label, exact: true }) },
        { name: `css:main input[placeholder], main textarea[placeholder]`, locator: page.locator('main').getByLabel(label, { exact: true }) },
        { name: `xpath://main//*[normalize-space(text())="${label}"]/following::input[1] | //main//*[normalize-space(text())="${label}"]/following::textarea[1]`, locator: page.locator(`xpath=(//main//*[normalize-space(text())="${label}"]/following::input[1] | //main//*[normalize-space(text())="${label}"]/following::textarea[1])`) },
        { name: `main >> text=${label}(exact) >> xpath=following::*[self::input or self::textarea][1]`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=following::*[self::input or self::textarea][1]') },
    ];
}

/** A date-picker trigger button — shared shape across "Invoice Date" (Regular Invoice) and
 * "Application Date"/"Billing Period Start"/"Billing Period End" (Pay Application), matched by
 * accessible name (the button's own text is "Select a date" until a date is chosen, so the
 * NAME — not the text — is the stable identifier). */
function datePickerTriggerStrategies(page, label) {
    return [
        { name: `main >> role:button[name=${label}](exact,original)`, locator: page.locator('main').getByRole('button', { name: label, exact: true }) },
        { name: `xpath://main//*[normalize-space(text())="${label}"]/following-sibling::button[1]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]/following-sibling::button[1]`) },
        { name: `main >> text=${label}(exact) >> xpath=following::button[1]`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=following::button[1]') },
        { name: `xpath://main//*[normalize-space(text())="${label}"]/parent::*/*[2]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]/parent::*/*[2]`) },
    ];
}

/** The open date-picker calendar's day button, by its full accessible name (e.g.
 * "17 September 2026") — MCP-verified Mantine calendar always opens on the current month. */
function calendarDayButtonStrategies(page, fullDateLabel) {
    // No regex locators: CSS's :text-is() already does an EXACT match on its own, so the day
    // number can be isolated without building a RegExp around it.
    const dayNumber = fullDateLabel.split(' ')[0];
    return [
        { name: `role:dialog >> role:button[name=${fullDateLabel}](exact,original)`, locator: page.getByRole('dialog').getByRole('button', { name: fullDateLabel, exact: true }) },
        { name: `role:button[name=${fullDateLabel}](exact)`, locator: page.getByRole('button', { name: fullDateLabel, exact: true }) },
        { name: `css:[role=dialog] table button:text-is("${dayNumber}")`, locator: page.locator(`[role="dialog"] table button:text-is("${dayNumber}")`).first() },
        { name: `xpath://*[@role="dialog"]//button[@aria-label="${fullDateLabel}"]`, locator: page.locator(`xpath=//*[@role="dialog"]//button[@aria-label="${fullDateLabel}"]`).first() },
    ];
}

/** "Contract Line Items" (Regular Invoice) heading, or the G703 "Contract Line Item" column —
 * used to scope/verify the line-items table rendered. */
function contractLineItemsHeadingStrategies(page) {
    return [
        { name: 'role:heading[name=Contract Line Items](exact,original)', locator: page.getByRole('heading', { name: 'Contract Line Items', exact: true }) },
        { name: 'main >> text=Contract Line Items(exact)', locator: page.locator('main').getByText('Contract Line Items', { exact: true }) },
        { name: 'css:main h5:text-is("Contract Line Items")', locator: page.locator('main h5:text-is("Contract Line Items")') },
        { name: 'xpath://main//h5[normalize-space(text())="Contract Line Items"]', locator: page.locator('xpath=//main//h5[normalize-space(text())="Contract Line Items"]') },
    ];
}

/** Regular-Invoice draft editor: the "Invoice Amount" input textbox for a line item, matched
 * by that row's exact Cost Item text (e.g. "Vanity Light") — every row's amount input shares
 * the placeholder "0.00", so the row itself must disambiguate which one. */
function lineItemAmountInputStrategies(page, costItemLabel) {
    // No regex locators: Playwright's role `name` (without `exact: true`) already does a plain
    // substring match on a string, so the row can be found without building a RegExp.
    return [
        { name: `role:row[name~=${costItemLabel}] >> placeholder=0.00(original)`, locator: page.getByRole('row', { name: costItemLabel }).getByPlaceholder('0.00') },
        { name: `css:tr:has-text("${costItemLabel}") input`, locator: page.locator(`tr:has-text("${costItemLabel}") input, tr:has-text("${costItemLabel}") textarea`).first() },
        { name: `xpath://tr[.//*[contains(text(),"${costItemLabel}")]]//input`, locator: page.locator(`xpath=//tr[.//*[contains(text(),"${costItemLabel}")]]//input`).first() },
        { name: `main >> text=${costItemLabel} >> xpath=ancestor::tr[1]//input`, locator: page.locator('main').getByText(costItemLabel, { exact: true }).locator('xpath=ancestor::tr[1]//input') },
    ];
}

/** "Submit for Approval" / "Submit Pay Application" confirmation dialog, by its own heading. */
function submitConfirmDialogStrategies(page, headingLabel) {
    return [
        { name: `role:dialog[name=${headingLabel}](exact,original)`, locator: page.getByRole('dialog', { name: headingLabel, exact: true }) },
        { name: `css:[role=dialog]:has-text("${headingLabel}")`, locator: page.locator(`[role="dialog"]:has-text("${headingLabel}")`).first() },
        { name: `role:heading[name=${headingLabel}]`, locator: page.getByRole('heading', { name: headingLabel, exact: true }) },
        { name: `xpath://*[@role="dialog"][.//*[normalize-space(text())="${headingLabel}"]]`, locator: page.locator(`xpath=//*[@role="dialog"][.//*[normalize-space(text())="${headingLabel}"]]`).first() },
    ];
}

/** Submitted-invoice detail page: a labelled read-only field value (e.g. "Status", "Invoiced
 * Amount", "Raised By"), by its exact label — shared shape for both Regular Invoice and Pay
 * Application post-submission detail pages. */
function invoiceDetailFieldValueStrategies(page, label) {
    return [
        { name: `xpath://main//p[normalize-space(text())="${label}"]/following-sibling::p[1](original)`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]/following-sibling::p[1]`) },
        { name: `css:main p:text-is("${label}") + p`, locator: page.locator(`main p:text-is("${label}") + p`) },
        { name: `main >> text=${label}(exact) >> xpath=../p[2]`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=../p[2]') },
        { name: `xpath://main//p[normalize-space(text())="${label}"]/parent::*/*[2]`, locator: page.locator(`xpath=//main//p[normalize-space(text())="${label}"]/parent::*/*[2]`) },
    ];
}

/** Pay-Application workspace: an Overview-section field, e.g. "Application Number" (a plain
 * textbox, unlike the date-picker fields covered by datePickerTriggerStrategies). */
function payAppOverviewFieldStrategies(page, label) {
    return [
        { name: `main >> role:textbox[name=${label}](exact,original)`, locator: page.locator('main').getByRole('textbox', { name: label, exact: true }) },
        { name: `xpath://main//*[normalize-space(text())="${label}"]/following::input[1]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]/following::input[1]`) },
        { name: `main >> text=${label}(exact) >> xpath=following::input[1]`, locator: page.locator('main').getByText(label, { exact: true }).locator('xpath=following::input[1]') },
        { name: `xpath://main//*[normalize-space(text())="${label}"]/parent::*/*[2]//input`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${label}"]/parent::*/*[2]//input`) },
    ];
}

/** Pay-Application workspace: "Notes" textarea. */
function payAppNotesFieldStrategies(page) {
    return [
        { name: 'main >> role:textbox[name=Notes](exact,original)', locator: page.locator('main').getByRole('textbox', { name: 'Notes', exact: true }) },
        { name: 'css:main textarea[placeholder="Notes for the property owner"]', locator: page.locator('main textarea[placeholder="Notes for the property owner"]') },
        { name: 'main >> placeholder=Notes for the property owner', locator: page.locator('main').getByPlaceholder('Notes for the property owner', { exact: true }) },
        { name: 'xpath://main//*[normalize-space(text())="Notes"]/following::textarea[1]', locator: page.locator('xpath=//main//*[normalize-space(text())="Notes"]/following::textarea[1]') },
    ];
}

/** Pay-Application workspace section heading — "Overview", "Supporting Invoices", "G703 —
 * Schedule of Values", "G702 — Application for Payment", or "Lien Waiver". */
function payAppSectionHeadingStrategies(page, label) {
    return [
        { name: `role:heading[name=${label}](exact,original)`, locator: page.getByRole('heading', { name: label, exact: true }) },
        { name: `css:main h5:text-is("${label}")`, locator: page.locator(`main h5:text-is("${label}")`).first() },
        { name: `main >> text=${label}(exact)`, locator: page.locator('main').getByText(label, { exact: true }) },
        { name: `xpath://main//h5[normalize-space(text())="${label}"]`, locator: page.locator(`xpath=//main//h5[normalize-space(text())="${label}"]`).first() },
    ];
}

/** Pay-Application workspace: the "Upload invoice" button above the Supporting Invoices
 * table/drop-zone (distinct from the Lien Waiver upload button, which has different text). */
function payAppUploadInvoiceButtonStrategies(page) {
    return [
        { name: 'role:button[name=Upload invoice](exact,original)', locator: page.getByRole('button', { name: 'Upload invoice', exact: true }) },
        { name: 'css:main button:has-text("Upload invoice")', locator: page.locator('main button:has-text("Upload invoice")').first() },
        { name: 'main >> text=Upload invoice(exact)', locator: page.locator('main').getByText('Upload invoice', { exact: true }) },
        { name: 'css:main button:text-is("Upload invoice")', locator: page.locator('main button:text-is("Upload invoice")').first() },
    ];
}

/** Pay-Application workspace: the Lien Waiver section's upload trigger — reads "Lien waiver
 * required" before a file is attached. */
function lienWaiverUploadButtonStrategies(page) {
    // No regex locators: role `name` without `exact: true` does a plain substring match.
    return [
        { name: 'role:button[name~=Lien waiver required](original)', locator: page.getByRole('button', { name: 'Lien waiver required' }) },
        { name: 'css:main button:has-text("Lien waiver required")', locator: page.locator('main button:has-text("Lien waiver required")') },
        { name: 'main >> text=Lien waiver required(exact)', locator: page.locator('main').getByText('Lien waiver required', { exact: true }).locator('xpath=ancestor::button[1]') },
        { name: 'xpath://main//button[.//*[normalize-space(text())="Lien waiver required"]]', locator: page.locator('xpath=//main//button[.//*[normalize-space(text())="Lien waiver required"]]') },
    ];
}

/** Pay-Application workspace: the Lien Waiver section's confirmation text once a file has been
 * accepted — "Uploaded and verified — submission unlocked." */
function lienWaiverVerifiedTextStrategies(page) {
    const text = 'Uploaded and verified — submission unlocked.';
    return [
        { name: `main >> text=${text}(exact,original)`, locator: page.locator('main').getByText(text, { exact: true }) },
        { name: `css:main *:text-is("${text}")`, locator: page.locator(`main *:text-is("${text}")`).first() },
        { name: `xpath://main//*[normalize-space(text())="${text}"]`, locator: page.locator(`xpath=//main//*[normalize-space(text())="${text}"]`).first() },
        { name: `text=${text}(exact,page-wide)`, locator: page.getByText(text, { exact: true }) },
    ];
}

/** Uploadcare widget "From device" option (shared by both the lien-waiver and supporting-
 * invoice upload flows — same widget, different trigger button). */
function uploadcareFromDeviceButtonStrategies(page) {
    return [
        { name: 'role:button[name=From device](aria-label,original)', locator: page.getByRole('button', { name: 'From device' }) },
        { name: 'css:button[aria-label="From device"]', locator: page.locator('button[aria-label="From device"]') },
        { name: 'text=From device(exact)', locator: page.getByText('From device', { exact: true }) },
        { name: 'css:.uc-simple-btn, [data-uc-el*="source-list"] button', locator: page.locator('[data-uc-el*="source-list"] button, .uc-simple-btn').filter({ hasText: 'device' }).first() },
    ];
}

/** Uploadcare widget "Done" button (closes the upload/preview dialog once a file finishes). */
function uploadcareDoneButtonStrategies(page) {
    return [
        { name: 'role:button[name=Done](exact,original)', locator: page.getByRole('button', { name: 'Done', exact: true }) },
        { name: 'css:.uc-done-btn', locator: page.locator('.uc-done-btn') },
        { name: 'css:button.uc-done-btn.uc-primary-btn', locator: page.locator('button.uc-done-btn.uc-primary-btn') },
        { name: 'text=Done(exact)', locator: page.getByText('Done', { exact: true }).first() },
    ];
}

/** Uploadcare "Add Tags & Types" follow-up dialog's "Add Files" confirm button — MCP-verified
 * 2026-09-17 this extra step only appears for the Supporting-Invoice upload slot (not the
 * Lien Waiver slot). */
function addTagsAndTypesAddFilesButtonStrategies(page) {
    return [
        { name: 'role:dialog[name=Add Tags & Types] >> role:button[name=Add Files](exact,original)', locator: page.getByRole('dialog', { name: 'Add Tags & Types', exact: true }).getByRole('button', { name: 'Add Files', exact: true }) },
        { name: 'css:[role=dialog] button:has-text("Add Files")', locator: page.locator('[role="dialog"] button:has-text("Add Files")') },
        { name: 'role:dialog >> text=Add Files(exact)', locator: page.getByRole('dialog').getByText('Add Files', { exact: true }) },
        { name: 'css:[role=dialog] button:text-is("Add Files")', locator: page.locator('[role="dialog"] button:text-is("Add Files")') },
    ];
}

/** Pay-Application workspace's own top-bar footer strip: "CURRENT PAYMENT DUE" value, the
 * "N supporting invoice(s)" counter text, and the "Save draft" / "Submit Pay Application"
 * buttons — grouped here since they live in the same fixed footer. */
function payAppFooterCurrentPaymentDueStrategies(page) {
    return [
        { name: 'xpath://main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/following-sibling::p[1](original)', locator: page.locator('xpath=//main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/following-sibling::p[1]') },
        { name: 'css:main p:text-is("CURRENT PAYMENT DUE") + p', locator: page.locator('main p:text-is("CURRENT PAYMENT DUE") + p') },
        { name: 'main >> text=CURRENT PAYMENT DUE(exact) >> xpath=../p[2]', locator: page.locator('main').getByText('CURRENT PAYMENT DUE', { exact: true }).locator('xpath=../p[2]') },
        { name: 'xpath://main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/parent::*/*[2]', locator: page.locator('xpath=//main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/parent::*/*[2]') },
    ];
}

/** Pay-Application workspace footer: the "N supporting invoice(s)" counter paragraph.
 *
 * NOT a loose "supporting invoice" substring search: the Piper chat panel's own system-prompt
 * paragraph ("Process the supporting invoice PDF(s) I just uploaded...") also contains that
 * substring and sits earlier in the DOM, so a page-wide substring match reliably picks the
 * WRONG element (MCP/Playwright-verified 2026-09-17). Instead this is scoped structurally as
 * the sibling of the "CURRENT PAYMENT DUE" block — same fixed footer, same same-node-per-
 * strategy principle used throughout this file — never a different, loosely-matched node. */
function payAppSupportingInvoiceCountTextStrategies(page) {
    return [
        { name: 'xpath://main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/parent::*/parent::*/*[2](original)', locator: page.locator('xpath=//main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/parent::*/parent::*/*[2]') },
        { name: 'main >> text=CURRENT PAYMENT DUE(exact) >> xpath=../../*[2]', locator: page.locator('main').getByText('CURRENT PAYMENT DUE', { exact: true }).locator('xpath=../../*[2]') },
        { name: 'css:main p:text-is("CURRENT PAYMENT DUE")', locator: page.locator('main p:text-is("CURRENT PAYMENT DUE")').locator('xpath=../../*[2]') },
        { name: 'xpath:CURRENT PAYMENT DUE parent/parent/*[2] (dup)', locator: page.locator('xpath=//main//p[normalize-space(text())="CURRENT PAYMENT DUE"]/../../*[2]') },
    ];
}

module.exports = {
    newInvoiceButtonStrategies,
    invoiceTypeCardStrategies,
    regularInvoiceSourceCardStrategies,
    contractComboboxStrategies,
    contractOptionStrategies,
    createDraftButtonStrategies,
    startPayApplicationButtonStrategies,
    draftActionButtonStrategies,
    draftSummaryValueStrategies,
    draftFieldStrategies,
    datePickerTriggerStrategies,
    calendarDayButtonStrategies,
    contractLineItemsHeadingStrategies,
    lineItemAmountInputStrategies,
    submitConfirmDialogStrategies,
    invoiceDetailFieldValueStrategies,
    payAppOverviewFieldStrategies,
    payAppNotesFieldStrategies,
    payAppSectionHeadingStrategies,
    payAppUploadInvoiceButtonStrategies,
    lienWaiverUploadButtonStrategies,
    lienWaiverVerifiedTextStrategies,
    uploadcareFromDeviceButtonStrategies,
    uploadcareDoneButtonStrategies,
    addTagsAndTypesAddFilesButtonStrategies,
    payAppFooterCurrentPaymentDueStrategies,
    payAppSupportingInvoiceCountTextStrategies,
};
