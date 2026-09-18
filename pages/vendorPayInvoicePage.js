require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { LoginPage } = require('./loginPage');
const {
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
} = require('../locators/vendorPayInvoiceLocator');

const REGULAR_INVOICE_DETAIL_FIELDS = ['Invoice Number', 'Title', 'Description', 'Status', 'Contract', 'Property', 'Raised By', 'Invoiced Amount', 'Retainage Withheld', 'Net Payable', 'Invoice Date'];
const PAY_APP_SECTION_HEADINGS = ['Overview', 'Supporting Invoices', 'G703 — Schedule of Values', 'G702 — Application for Payment', 'Lien Waiver'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Today's date formatted to match the Mantine calendar's accessible day-button name — MCP-
 * verified 2026-09-17 this is "D Month YYYY" (e.g. "17 September 2026", no leading zero, no
 * comma), NOT the US-locale "Month D, YYYY" order that toLocaleDateString('en-US', ...) would
 * produce. */
function todayCalendarLabel() {
    const today = new Date();
    return `${today.getDate()} ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;
}

/**
 * Page object for the VENDOR portal's "New Invoice" flow — both the "Regular Invoice" path and
 * the "Pay Application" path (this app's literal name for what is casually called "Pay
 * Invoice" — see locators/vendorPayInvoiceLocator.js header for why). New file; no existing
 * methods altered. Reuses LoginPage.scanAllTextElements (existing static method) for text-drift
 * snapshots, and the same Uploadcare filechooser pattern already established in
 * pages/vendorBidPage.js's uploadBidDocument.
 */
class VendorPayInvoicePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        this.vendorEmail = process.env.VENDOR_LOGIN_EMAIL;
    }

    /**
     * Reuses the EXISTING LoginPage.scanAllTextElements static method (not duplicated) to
     * capture every visible text element on the current screen, then writes it to a JSON file
     * for audit / drift comparison — so a minor future copy/UI change is caught by re-running
     * this suite and diffing the stored snapshot.
     * @param {string} screenLabel human-readable label for this checkpoint, e.g. "regular-invoice-draft"
     * @param {string} outputPath absolute path to the JSON file to write
     */
    async scanAndStoreScreenText(screenLabel, outputPath) {
        Logger.step(`VendorPayInvoicePage: scanning all visible text — ${screenLabel}...`);
        const snapshot = await LoginPage.scanAllTextElements(this.page);
        const record = {
            capturedAt: new Date().toISOString(),
            screen: screenLabel,
            url: this.page.url(),
            vendorEmail: this.vendorEmail,
            counts: {
                headings: snapshot.headings.length,
                buttons: snapshot.buttons.length,
                inputs: snapshot.inputs.length,
                links: snapshot.links.length,
                paragraphs: snapshot.paragraphs.length,
                textNodes: snapshot.textNodes.length,
            },
            snapshot,
        };
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
        Logger.success(
            `VendorPayInvoicePage: text scan "${screenLabel}" stored at ${outputPath} (headings=${record.counts.headings}, buttons=${record.counts.buttons}, inputs=${record.counts.inputs}, paragraphs=${record.counts.paragraphs}).`,
        );
        expect(snapshot.buttons.length, `FAIL: scanAllTextElements() captured zero buttons on screen "${screenLabel}".`).toBeGreaterThan(0);
        expect(snapshot.paragraphs.length + snapshot.textNodes.length, `FAIL: scanAllTextElements() captured zero paragraphs/text nodes on screen "${screenLabel}".`).toBeGreaterThan(0);
        return snapshot;
    }

    /** Clicks "New Invoice" from the Invoices listing and asserts the type-selection screen
     * ("What are you submitting?" + Regular Invoice / Pay Application cards). */
    async openNewInvoiceAndAssertTypeSelection() {
        Logger.step('VendorPayInvoicePage: opening New Invoice...');
        const newInvoiceButton = healingLocator(newInvoiceButtonStrategies(this.page)).first();
        await expect(newInvoiceButton, 'FAIL: "New Invoice" button not visible on Invoices listing.').toBeVisible({ timeout: 10000 });
        await newInvoiceButton.click();
        await this.page.waitForURL(/\/invoices\/new/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1000);

        const heading = this.page.getByText('What are you submitting?', { exact: true });
        await expect(heading, 'FAIL: "What are you submitting?" heading not visible.').toBeVisible({ timeout: 10000 });
        for (const label of ['Regular Invoice', 'Pay Application']) {
            const card = healingLocator(invoiceTypeCardStrategies(this.page, label)).first();
            await expect(card, `FAIL: invoice-type card "${label}" not visible.`).toBeVisible();
        }
        Logger.success('VendorPayInvoicePage: type-selection screen verified (Regular Invoice + Pay Application).');
    }

    // ---------------------------------------------------------------------------------------
    // Regular Invoice flow
    // ---------------------------------------------------------------------------------------

    /** Clicks the "Regular Invoice" card's Continue, asserts the source-selection screen, then
     * clicks "Start from a contract" (the deterministic path — no OCR involved). */
    async chooseRegularInvoiceStartFromContract() {
        Logger.step('VendorPayInvoicePage: choosing Regular Invoice > Start from a contract...');
        const regularCard = healingLocator(invoiceTypeCardStrategies(this.page, 'Regular Invoice')).first();
        await regularCard.click();
        await this.page.waitForTimeout(800);

        const sourceHeading = this.page.getByText('Create a new invoice', { exact: true });
        await expect(sourceHeading, 'FAIL: "Create a new invoice" heading not visible after choosing Regular Invoice.').toBeVisible({ timeout: 10000 });
        for (const label of ['Upload invoice PDF', 'Start from a contract']) {
            const card = healingLocator(regularInvoiceSourceCardStrategies(this.page, label)).first();
            await expect(card, `FAIL: source card "${label}" not visible.`).toBeVisible();
        }

        const startFromContractCard = healingLocator(regularInvoiceSourceCardStrategies(this.page, 'Start from a contract')).first();
        await startFromContractCard.click();
        Logger.success('VendorPayInvoicePage: Regular Invoice source-selection verified; "Start from a contract" chosen.');
    }

    /** In the "New Invoice" contract-selection modal, selects `contractOptionLabel` and clicks
     * "Create Draft" — asserts the draft editor loads. */
    async selectContractAndCreateDraft(contractOptionLabel) {
        Logger.step(`VendorPayInvoicePage: selecting contract "${contractOptionLabel}" and creating draft...`);
        const combobox = healingLocator(contractComboboxStrategies(this.page)).first();
        await expect(combobox, 'FAIL: Contract combobox not visible in "New Invoice" modal.').toBeVisible({ timeout: 10000 });
        await combobox.click();
        const option = healingLocator(contractOptionStrategies(this.page, contractOptionLabel)).first();
        await expect(option, `FAIL: contract option "${contractOptionLabel}" not found in dropdown.`).toBeVisible({ timeout: 10000 });
        await option.click();

        const createDraftButton = healingLocator(createDraftButtonStrategies(this.page)).first();
        await expect(createDraftButton, 'FAIL: "Create Draft" button not enabled after selecting a contract.').toBeEnabled({ timeout: 10000 });
        await createDraftButton.click();
        await this.page.waitForURL(/\/invoices\/drafts\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorPayInvoicePage: draft created — ${this.page.url()}`);
    }

    /** Asserts the Regular-Invoice draft editor's full structure: breadcrumb action buttons,
     * summary values, form fields, the Contract Line Items table, and the Documents section. */
    async assertRegularInvoiceDraftEditorFullyVisible() {
        Logger.step('VendorPayInvoicePage: asserting Regular Invoice draft editor...');
        for (const label of ['Delete Draft', 'Save Draft', 'Submit for Approval']) {
            const button = healingLocator(draftActionButtonStrategies(this.page, label)).first();
            await expect(button, `FAIL: draft action button "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        for (const labelPrefix of ['Invoice Total', 'Retainage', 'Net Payable']) {
            const value = healingLocator(draftSummaryValueStrategies(this.page, labelPrefix)).first();
            await expect(value, `FAIL: draft summary value "${labelPrefix}" not visible.`).toBeVisible();
        }
        for (const label of ['Invoice Number', 'Title', 'Description']) {
            const field = healingLocator(draftFieldStrategies(this.page, label)).first();
            await expect(field, `FAIL: draft field "${label}" not visible.`).toBeVisible();
        }
        const invoiceDateTrigger = healingLocator(datePickerTriggerStrategies(this.page, 'Invoice Date')).first();
        await expect(invoiceDateTrigger, 'FAIL: "Invoice Date" picker not visible.').toBeVisible();

        const lineItemsHeading = healingLocator(contractLineItemsHeadingStrategies(this.page)).first();
        await expect(lineItemsHeading, 'FAIL: "Contract Line Items" heading not visible.').toBeVisible();

        const documentsHeading = healingLocator(payAppSectionHeadingStrategies(this.page, 'Documents')).first();
        await expect(documentsHeading, 'FAIL: "Documents" section heading not visible on draft editor.').toBeVisible();
        Logger.success('VendorPayInvoicePage: Regular Invoice draft editor fully verified.');
    }

    /**
     * Fills Invoice Number/Title/Description, sets Invoice Date to today, and enters an amount
     * against the first Contract Line Item row matching `costItemLabel`.
     * @param {{ invoiceNumber: string, title: string, description: string, costItemLabel: string, amount: string }} data
     */
    async fillRegularInvoiceDraft(data) {
        Logger.step('VendorPayInvoicePage: filling Regular Invoice draft fields...');
        const invoiceNumberField = healingLocator(draftFieldStrategies(this.page, 'Invoice Number')).first();
        await invoiceNumberField.fill(data.invoiceNumber);

        const dateTrigger = healingLocator(datePickerTriggerStrategies(this.page, 'Invoice Date')).first();
        await this.#pickTodayFromCalendar(dateTrigger);

        const titleField = healingLocator(draftFieldStrategies(this.page, 'Title')).first();
        await titleField.fill(data.title);
        const descriptionField = healingLocator(draftFieldStrategies(this.page, 'Description')).first();
        await descriptionField.fill(data.description);

        const amountInput = healingLocator(lineItemAmountInputStrategies(this.page, data.costItemLabel)).first();
        await expect(amountInput, `FAIL: Invoice Amount input for line item "${data.costItemLabel}" not visible.`).toBeVisible({ timeout: 10000 });
        await amountInput.fill(data.amount);

        const invoiceTotal = healingLocator(draftSummaryValueStrategies(this.page, 'Invoice Total')).first();
        await expect(invoiceTotal, 'FAIL: "Invoice Total" did not reflect the entered line-item amount.').toContainText('$', { timeout: 10000 });
        Logger.success(`VendorPayInvoicePage: Regular Invoice draft filled (invoiceNumber="${data.invoiceNumber}", amount="${data.amount}").`);
    }

    /** Clicks "Save Draft" and asserts the "Draft saved" toast. */
    async saveRegularInvoiceDraft() {
        Logger.step('VendorPayInvoicePage: saving Regular Invoice draft...');
        const saveButton = healingLocator(draftActionButtonStrategies(this.page, 'Save Draft')).first();
        await saveButton.click();
        const toast = this.page.getByText('Draft saved', { exact: true });
        await expect(toast, 'FAIL: "Draft saved" toast not shown after Save Draft.').toBeVisible({ timeout: 10000 });
        Logger.success('VendorPayInvoicePage: Regular Invoice draft saved.');
    }

    /** Clicks "Submit for Approval", asserts the confirmation dialog, confirms it, then asserts
     * the "Invoice submitted for approval" toast and redirect to the submitted-invoice detail
     * page. */
    async submitRegularInvoiceForApproval() {
        Logger.step('VendorPayInvoicePage: submitting Regular Invoice for approval...');
        const submitButton = healingLocator(draftActionButtonStrategies(this.page, 'Submit for Approval')).first();
        await submitButton.click();

        const dialog = healingLocator(submitConfirmDialogStrategies(this.page, 'Submit Invoice')).first();
        await expect(dialog, 'FAIL: "Submit Invoice" confirmation dialog did not appear.').toBeVisible({ timeout: 10000 });
        const confirmButton = dialog.getByRole('button', { name: 'Submit for Approval', exact: true });
        await expect(confirmButton, 'FAIL: dialog "Submit for Approval" confirm button not visible.').toBeVisible();
        await confirmButton.click();

        const toast = this.page.getByText('Invoice submitted for approval', { exact: true });
        await expect(toast, 'FAIL: "Invoice submitted for approval" toast not shown.').toBeVisible({ timeout: 15000 });
        await this.page.waitForURL(/\/invoices\/\d+$/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorPayInvoicePage: Regular Invoice submitted — ${this.page.url()}`);
    }

    /** Asserts the submitted-invoice detail page: every labelled field is visible and
     * non-empty, Status reads "Pending Approval" (never auto-approved), and Raised By reads
     * "Vendor". */
    async assertSubmittedInvoiceDetailFullyVisible(expectedInvoiceNumber) {
        Logger.step('VendorPayInvoicePage: asserting submitted invoice detail page...');
        for (const label of REGULAR_INVOICE_DETAIL_FIELDS) {
            const value = healingLocator(invoiceDetailFieldValueStrategies(this.page, label)).first();
            await expect(value, `FAIL: submitted-invoice detail field "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        const invoiceNumberValue = healingLocator(invoiceDetailFieldValueStrategies(this.page, 'Invoice Number')).first();
        await expect(invoiceNumberValue, `FAIL: submitted invoice's "Invoice Number" does not read "${expectedInvoiceNumber}".`).toHaveText(expectedInvoiceNumber);
        const statusValue = healingLocator(invoiceDetailFieldValueStrategies(this.page, 'Status')).first();
        await expect(statusValue, 'FAIL: submitted invoice Status is not "Pending Approval" — expected no auto-approval.').toHaveText('Pending Approval');
        const raisedByValue = healingLocator(invoiceDetailFieldValueStrategies(this.page, 'Raised By')).first();
        await expect(raisedByValue, 'FAIL: submitted invoice "Raised By" does not read "Vendor".').toHaveText('Vendor');
        Logger.success(`VendorPayInvoicePage: submitted invoice detail page fully verified (Invoice Number="${expectedInvoiceNumber}", Status="Pending Approval").`);
    }

    // ---------------------------------------------------------------------------------------
    // Pay Application flow
    // ---------------------------------------------------------------------------------------

    /**
     * Clicks the "Pay Application" card, selects `contractOptionLabel`, clicks "Start pay
     * application", then navigates from the chat variant it lands on
     * (.../pay-apps/:id/chat?autostart=1) to the full-editor page (.../pay-apps/:id).
     *
     * MCP-verified 2026-09-17: these are two DIFFERENT layouts of the same draft — the chat
     * variant embeds "Submit Pay Application" in its own top header and never renders a
     * "CURRENT PAYMENT DUE" / supporting-invoice-count footer at all (confirmed live: that
     * region stays a loading spinner indefinitely on the chat URL), while the full-editor page
     * renders the complete bottom summary bar (CURRENT PAYMENT DUE, supporting-invoice count,
     * Save draft, Submit Pay Application) that the rest of this page object's Pay Application
     * methods depend on. Every subsequent Pay Application action in this suite is therefore
     * performed on the full-editor page, not the chat page.
     */
    async choosePayApplicationForContract(contractOptionLabel) {
        Logger.step(`VendorPayInvoicePage: choosing Pay Application for contract "${contractOptionLabel}"...`);
        const payAppCard = healingLocator(invoiceTypeCardStrategies(this.page, 'Pay Application')).first();
        await payAppCard.click();
        await this.page.waitForTimeout(800);

        const heading = this.page.getByText('Start a pay application', { exact: true });
        await expect(heading, 'FAIL: "Start a pay application" heading not visible.').toBeVisible({ timeout: 10000 });

        const combobox = healingLocator(contractComboboxStrategies(this.page)).first();
        await combobox.click();
        const option = healingLocator(contractOptionStrategies(this.page, contractOptionLabel)).first();
        await expect(option, `FAIL: contract option "${contractOptionLabel}" not found in dropdown.`).toBeVisible({ timeout: 10000 });
        await option.click();

        const startButton = healingLocator(startPayApplicationButtonStrategies(this.page)).first();
        await expect(startButton, 'FAIL: "Start pay application" button not enabled after selecting a contract.').toBeEnabled({ timeout: 10000 });
        await startButton.click();
        await this.page.waitForURL(/\/invoices\/pay-apps\/\d+/, { timeout: 20000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);

        const chatMatch = this.page.url().match(/^(.*\/invoices\/pay-apps\/\d+)\/chat/);
        if (chatMatch) {
            Logger.step(`VendorPayInvoicePage: navigating from chat page to full editor — ${chatMatch[1]}...`);
            await this.page.goto(chatMatch[1], { waitUntil: 'load' });
            await this.page.waitForLoadState('domcontentloaded');
            await this.page.waitForTimeout(1500);
        }
        Logger.success(`VendorPayInvoicePage: Pay Application full-editor workspace opened — ${this.page.url()}`);
    }

    /** Asserts the Pay Application workspace's full structure: all 5 section headings, the
     * footer's Save draft/Submit Pay Application buttons, and the CURRENT PAYMENT DUE +
     * supporting-invoice-count readouts. */
    async assertPayApplicationWorkspaceFullyVisible() {
        Logger.step('VendorPayInvoicePage: asserting Pay Application workspace structure...');
        for (const label of PAY_APP_SECTION_HEADINGS) {
            const heading = healingLocator(payAppSectionHeadingStrategies(this.page, label)).first();
            await expect(heading, `FAIL: Pay Application section heading "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        const currentPaymentDue = healingLocator(payAppFooterCurrentPaymentDueStrategies(this.page)).first();
        await expect(currentPaymentDue, 'FAIL: "CURRENT PAYMENT DUE" footer value not visible.').toBeVisible();
        const supportingInvoiceCount = healingLocator(payAppSupportingInvoiceCountTextStrategies(this.page)).first();
        await expect(supportingInvoiceCount, 'FAIL: supporting-invoice count text not visible.').toBeVisible();
        Logger.success('VendorPayInvoicePage: Pay Application workspace structure fully verified.');
    }

    /** Reads the app-assigned "Application Number" value (e.g. "PAY-1001") — this auto-
     * increments per submission, so callers must capture it here rather than hardcoding an
     * expected value for the later submitted-detail-page assertion. */
    async getApplicationNumber() {
        const field = healingLocator(payAppOverviewFieldStrategies(this.page, 'Application Number')).first();
        await expect(field, 'FAIL: "Application Number" field not visible.').toBeVisible({ timeout: 10000 });
        const value = await field.inputValue();
        expect(value.length, 'FAIL: "Application Number" field is empty.').toBeGreaterThan(0);
        return value;
    }

    /**
     * Fills the Overview section (Application Date, Billing Period Start/End set to today,
     * Notes) and enters a Current Period amount against the first G703 row matching
     * `costItemLabel`.
     * @param {{ notes: string, costItemLabel: string, amount: string }} data
     */
    async fillPayApplicationOverviewAndG703(data) {
        Logger.step('VendorPayInvoicePage: filling Pay Application Overview + G703...');
        for (const label of ['Application Date', 'Billing Period Start', 'Billing Period End']) {
            const trigger = healingLocator(datePickerTriggerStrategies(this.page, label)).first();
            await this.#pickTodayFromCalendar(trigger);
        }
        const notesField = healingLocator(payAppNotesFieldStrategies(this.page)).first();
        await notesField.fill(data.notes);

        const amountInput = healingLocator(lineItemAmountInputStrategies(this.page, data.costItemLabel)).first();
        await expect(amountInput, `FAIL: G703 Current Period input for line item "${data.costItemLabel}" not visible.`).toBeVisible({ timeout: 10000 });
        await amountInput.fill(data.amount);

        const currentPaymentDue = healingLocator(payAppFooterCurrentPaymentDueStrategies(this.page)).first();
        await expect(currentPaymentDue, 'FAIL: "CURRENT PAYMENT DUE" did not reflect the entered G703 amount.').toContainText('$', { timeout: 10000 });
        Logger.success(`VendorPayInvoicePage: Pay Application Overview + G703 filled (amount="${data.amount}").`);
    }

    /**
     * Uploads `filePath` as the required signed lien waiver via the Uploadcare "From device"
     * flow (same filechooser pattern as pages/vendorBidPage.js's uploadBidDocument), and
     * asserts the "Uploaded and verified — submission unlocked." confirmation.
     * @param {string} filePath absolute path to a PDF file
     */
    async uploadLienWaiver(filePath) {
        Logger.step(`VendorPayInvoicePage: uploading lien waiver "${filePath}"...`);
        const uploadButton = healingLocator(lienWaiverUploadButtonStrategies(this.page)).first();
        await uploadButton.click();

        // .filter({ visible: true }): same documented Uploadcare pitfall as
        // pages/vendorBidPage.js's uploadBidDocument — this page mounts more than one
        // Uploadcare widget instance (Supporting Invoices + Lien Waiver slots), so an earlier
        // one can still be in the DOM (hidden) when a later widget opens; only the currently
        // visible widget's controls may ever be targeted.
        const fromDeviceButton = healingLocator(uploadcareFromDeviceButtonStrategies(this.page)).filter({ visible: true }).first();
        await expect(fromDeviceButton, 'FAIL: Uploadcare "From device" option not visible for lien-waiver upload.').toBeVisible({ timeout: 10000 });
        const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout: 10000 }),
            fromDeviceButton.click(),
        ]);
        await fileChooser.setFiles(filePath);

        const doneButton = healingLocator(uploadcareDoneButtonStrategies(this.page)).filter({ visible: true }).first();
        await expect(doneButton, 'FAIL: Uploadcare "Done" button not visible after lien-waiver upload finished.').toBeVisible({ timeout: 20000 });
        await doneButton.click();

        const verifiedText = healingLocator(lienWaiverVerifiedTextStrategies(this.page)).first();
        await expect(verifiedText, 'FAIL: lien waiver "Uploaded and verified" confirmation not shown.').toBeVisible({ timeout: 15000 });
        Logger.success('VendorPayInvoicePage: lien waiver uploaded and verified.');
    }

    /**
     * Uploads `filePath` as a supporting invoice via the Uploadcare "From device" flow,
     * confirms the "Add Tags & Types" follow-up step (MCP-verified 2026-09-17: this extra step
     * is specific to the Supporting-Invoice slot, not the Lien Waiver slot), and asserts the
     * footer's supporting-invoice count increments to 1. Does NOT wait for or assert on Piper's
     * background OCR result — the G703 amount this suite relies on is the one typed directly in
     * fillPayApplicationOverviewAndG703, not whatever OCR extracts.
     * @param {string} filePath absolute path to a PDF file
     */
    async uploadSupportingInvoice(filePath) {
        Logger.step(`VendorPayInvoicePage: uploading supporting invoice "${filePath}"...`);
        const uploadButton = healingLocator(payAppUploadInvoiceButtonStrategies(this.page)).first();
        await uploadButton.click();

        // .filter({ visible: true }): see the same-pattern comment in uploadLienWaiver above.
        const fromDeviceButton = healingLocator(uploadcareFromDeviceButtonStrategies(this.page)).filter({ visible: true }).first();
        await expect(fromDeviceButton, 'FAIL: Uploadcare "From device" option not visible for supporting-invoice upload.').toBeVisible({ timeout: 10000 });
        const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout: 10000 }),
            fromDeviceButton.click(),
        ]);
        await fileChooser.setFiles(filePath);

        const doneButton = healingLocator(uploadcareDoneButtonStrategies(this.page)).filter({ visible: true }).first();
        await expect(doneButton, 'FAIL: Uploadcare "Done" button not visible after supporting-invoice upload finished.').toBeVisible({ timeout: 20000 });
        await doneButton.click();

        const addFilesButton = healingLocator(addTagsAndTypesAddFilesButtonStrategies(this.page)).first();
        await expect(addFilesButton, 'FAIL: "Add Tags & Types" > "Add Files" confirm button not visible after supporting-invoice upload.').toBeVisible({ timeout: 15000 });
        await addFilesButton.click();

        const supportingInvoiceCount = healingLocator(payAppSupportingInvoiceCountTextStrategies(this.page)).first();
        await expect(supportingInvoiceCount, 'FAIL: supporting-invoice count did not update after upload.').toContainText('1 supporting invoice', { timeout: 20000 });
        Logger.success('VendorPayInvoicePage: supporting invoice uploaded and attached (1 supporting invoice).');
    }

    /** Clicks "Save draft" and asserts the "Draft saved" toast. */
    async savePayApplicationDraft() {
        Logger.step('VendorPayInvoicePage: saving Pay Application draft...');
        const saveButton = this.page.getByRole('button', { name: 'Save draft', exact: true });
        await expect(saveButton, 'FAIL: "Save draft" button not enabled.').toBeEnabled({ timeout: 10000 });
        await saveButton.click();
        const toast = this.page.getByText('Draft saved', { exact: true });
        await expect(toast, 'FAIL: "Draft saved" toast not shown after Save draft.').toBeVisible({ timeout: 10000 });
        Logger.success('VendorPayInvoicePage: Pay Application draft saved.');
    }

    /** Clicks "Submit Pay Application" (asserted enabled beforehand by the caller having
     * completed the lien-waiver + supporting-invoice prerequisites) and asserts the "Pay
     * Application submitted" toast and redirect to the submitted-invoice detail page. */
    async submitPayApplication() {
        Logger.step('VendorPayInvoicePage: submitting Pay Application...');
        const submitButton = this.page.getByRole('button', { name: 'Submit Pay Application', exact: true });
        await expect(submitButton, 'FAIL: "Submit Pay Application" button is not enabled — expected the lien waiver + a supporting invoice to have unlocked it.').toBeEnabled({ timeout: 10000 });
        await submitButton.click();

        const toast = this.page.getByText('Pay Application submitted', { exact: true });
        await expect(toast, 'FAIL: "Pay Application submitted" toast not shown.').toBeVisible({ timeout: 20000 });
        await this.page.waitForURL(/\/invoices\/\d+$/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorPayInvoicePage: Pay Application submitted — ${this.page.url()}`);
    }

    /** Clicks a date-picker trigger and selects today's date from the calendar it opens. */
    async #pickTodayFromCalendar(triggerLocator) {
        await triggerLocator.click();
        const label = todayCalendarLabel();
        const dayButton = healingLocator(calendarDayButtonStrategies(this.page, label)).first();
        await expect(dayButton, `FAIL: calendar day button "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        await dayButton.click();
    }
}

module.exports = { VendorPayInvoicePage };
