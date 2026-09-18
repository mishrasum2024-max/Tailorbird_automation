require('dotenv').config();

const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { toolbarButtonStrategies } = require('../locators/vendorListingLocator');
const {
    contractComboboxStrategies,
    contractOptionStrategies,
    createDraftButtonStrategies,
    draftActionButtonStrategies,
    draftSummaryValueStrategies,
    draftFieldStrategies,
    lineItemAmountInputStrategies,
    submitConfirmDialogStrategies,
    invoiceDetailFieldValueStrategies,
} = require('../locators/vendorPayInvoiceLocator');
const {
    changeOrderSectionHeadingStrategies,
    addLineItemButtonStrategies,
    noNewLineItemsTextStrategies,
    newLineItemFieldByPlaceholderStrategies,
    newLineItemAmountInputStrategies,
    removeNewLineItemRowButtonStrategies,
} = require('../locators/vendorChangeOrderLocator');

/** Every field shown on a submitted Change Order detail page, in display order — MCP-verified
 * 2026-09-17 against /bids-and-contracts/change-orders/8729. Same "label paragraph +
 * following-sibling value paragraph" DOM shape as the Invoice/Pay-Application/Contract detail
 * pages, so invoiceDetailFieldValueStrategies (not duplicated) is reused to read them. */
const CHANGE_ORDER_DETAIL_FIELDS = ['Change Order', 'Title', 'Status', 'Contract', 'Property', 'Raised By', 'Amount', 'Change Order Date'];

/**
 * Page object for the VENDOR portal's Change Order creation/draft/submit flow
 * (New Change Order modal -> /change-orders/drafts/:id -> submitted /change-orders/:id).
 * New file; no existing methods altered. MCP-verified 2026-09-17 (vendor account
 * VENDOR_LOGIN_EMAIL) this flow's Contract-selection modal, draft editor's action buttons/
 * Title-Description fields/Contract+Total summary/existing-line-item amount inputs, submit
 * confirmation dialog, and submitted-detail page all share the EXACT same DOM shape as the
 * already-automated Regular Invoice flow (pages/vendorPayInvoicePage.js) — those strategies
 * are reused directly rather than duplicated. Only the Change Order draft's own "Existing
 * Contract Line Items"/"New Line Items" section structure is genuinely new (see
 * locators/vendorChangeOrderLocator.js).
 */
class VendorChangeOrderPage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
    }

    /** From the Change Orders listing (caller must already be on it), clicks "New Change
     * Order" and asserts the contract-selection modal (heading, instruction text, Contract
     * combobox, Cancel + a disabled "Create Draft" button until a contract is chosen). */
    async openNewChangeOrderDialog() {
        Logger.step('VendorChangeOrderPage: opening New Change Order dialog...');
        const newButton = healingLocator(toolbarButtonStrategies(this.page, 'New Change Order')).first();
        await expect(newButton, 'FAIL: "New Change Order" button not visible on Change Orders listing.').toBeVisible({ timeout: 10000 });
        await newButton.click();

        const heading = this.page.getByRole('heading', { name: 'New Change Order', exact: true });
        await expect(heading, 'FAIL: "New Change Order" dialog heading not visible.').toBeVisible({ timeout: 10000 });
        const instruction = this.page.getByText('Select the contract you want to raise a change order against.', { exact: true });
        await expect(instruction, 'FAIL: New Change Order instruction text not visible.').toBeVisible();

        const combobox = healingLocator(contractComboboxStrategies(this.page)).first();
        await expect(combobox, 'FAIL: Contract combobox not visible in New Change Order dialog.').toBeVisible();

        const createDraftButton = healingLocator(createDraftButtonStrategies(this.page)).first();
        await expect(createDraftButton, 'FAIL: "Create Draft" button expected disabled before a contract is selected.').toBeDisabled();

        Logger.success('VendorChangeOrderPage: New Change Order dialog verified (Create Draft correctly disabled pre-selection).');
    }

    /** Clicks "Cancel" in the open New Change Order dialog — asserts it closes without
     * creating a draft (stays on the Change Orders listing URL). */
    async cancelNewChangeOrderDialog() {
        Logger.step('VendorChangeOrderPage: cancelling New Change Order dialog...');
        const dialog = this.page.getByRole('dialog', { name: 'New Change Order', exact: true });
        const cancelButton = dialog.getByRole('button', { name: 'Cancel', exact: true });
        await cancelButton.click();
        await expect(dialog, 'FAIL: New Change Order dialog still visible after Cancel.').not.toBeVisible({ timeout: 10000 });
        await expect(this.page).toHaveURL(/\/bids-and-contracts\/change-orders$/, { timeout: 10000 });
        Logger.success('VendorChangeOrderPage: New Change Order dialog cancelled — no draft created.');
    }

    /** In the open New Change Order dialog, selects `contractOptionLabel` and clicks "Create
     * Draft" — asserts the draft editor loads at /change-orders/drafts/:id. */
    async selectContractAndCreateDraft(contractOptionLabel) {
        Logger.step(`VendorChangeOrderPage: selecting contract "${contractOptionLabel}" and creating draft...`);
        const combobox = healingLocator(contractComboboxStrategies(this.page)).first();
        await combobox.click();
        const option = healingLocator(contractOptionStrategies(this.page, contractOptionLabel)).first();
        await expect(option, `FAIL: contract option "${contractOptionLabel}" not found in dropdown.`).toBeVisible({ timeout: 10000 });
        await option.click();

        const createDraftButton = healingLocator(createDraftButtonStrategies(this.page)).first();
        await expect(createDraftButton, 'FAIL: "Create Draft" button not enabled after selecting a contract.').toBeEnabled({ timeout: 10000 });
        await createDraftButton.click();
        await this.page.waitForURL(/\/change-orders\/drafts\/\d+/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorChangeOrderPage: draft created — ${this.page.url()}`);
    }

    /** Asserts the Change Order draft editor's full structure: action buttons, Contract +
     * Total Change Order Amount summary, Title/Description fields, the "Existing Contract
     * Line Items" table (heading + 3 known rows), and the "New Line Items" section (heading +
     * Add Line Item button + "No new line items." empty state). */
    async assertDraftEditorFullyVisible(existingLineItemLabels) {
        Logger.step('VendorChangeOrderPage: asserting Change Order draft editor...');
        for (const label of ['Delete Draft', 'Save Draft', 'Submit for Approval']) {
            const button = healingLocator(draftActionButtonStrategies(this.page, label)).first();
            await expect(button, `FAIL: draft action button "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        const contractValue = healingLocator(draftSummaryValueStrategies(this.page, 'Contract')).first();
        await expect(contractValue, 'FAIL: draft summary "Contract" value not visible.').toBeVisible();
        const totalValue = healingLocator(draftSummaryValueStrategies(this.page, 'Total Change Order Amount')).first();
        await expect(totalValue, 'FAIL: draft summary "Total Change Order Amount" not visible.').toBeVisible();
        await expect(totalValue, 'FAIL: "Total Change Order Amount" is not $0.00 on a fresh draft.').toHaveText('$0.00');

        for (const label of ['Title', 'Description']) {
            const field = healingLocator(draftFieldStrategies(this.page, label)).first();
            await expect(field, `FAIL: draft field "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }

        const existingHeading = healingLocator(changeOrderSectionHeadingStrategies(this.page, 'Existing Contract Line Items')).first();
        await expect(existingHeading, 'FAIL: "Existing Contract Line Items" heading not visible.').toBeVisible();
        for (const costItemLabel of existingLineItemLabels) {
            const amountInput = healingLocator(lineItemAmountInputStrategies(this.page, costItemLabel)).first();
            await expect(amountInput, `FAIL: Change Order Amount input for existing line item "${costItemLabel}" not visible.`).toBeVisible({ timeout: 10000 });
            // MCP-verified: a fresh row's input is genuinely EMPTY (value=""), with "0.00" only
            // as its placeholder text — not a pre-filled "0.00" value.
            await expect(amountInput, `FAIL: Change Order Amount input for "${costItemLabel}" is not empty on a fresh draft.`).toHaveValue('');
            await expect(amountInput, `FAIL: Change Order Amount input for "${costItemLabel}" is missing its "0.00" placeholder.`).toHaveAttribute('placeholder', '0.00');
        }

        const newHeading = healingLocator(changeOrderSectionHeadingStrategies(this.page, 'New Line Items')).first();
        await expect(newHeading, 'FAIL: "New Line Items" heading not visible.').toBeVisible();
        const addButton = healingLocator(addLineItemButtonStrategies(this.page)).first();
        await expect(addButton, 'FAIL: "Add Line Item" button not visible.').toBeVisible();
        const emptyState = healingLocator(noNewLineItemsTextStrategies(this.page)).first();
        await expect(emptyState, 'FAIL: "No new line items." empty state not visible on a fresh draft.').toBeVisible();

        Logger.success('VendorChangeOrderPage: Change Order draft editor fully verified.');
    }

    /** Fills the Title and Description fields. */
    async fillTitleAndDescription(title, description) {
        Logger.step('VendorChangeOrderPage: filling Title and Description...');
        const titleField = healingLocator(draftFieldStrategies(this.page, 'Title')).first();
        await titleField.fill(title);
        const descriptionField = healingLocator(draftFieldStrategies(this.page, 'Description')).first();
        await descriptionField.fill(description);
        Logger.success(`VendorChangeOrderPage: Title="${title}" filled.`);
    }

    /** Enters `amount` (may be negative, e.g. "-500") against the Existing Contract Line
     * Items row matching `costItemLabel`, and asserts "Total Change Order Amount" reflects
     * it. */
    async setExistingLineItemAmount(costItemLabel, amount) {
        Logger.step(`VendorChangeOrderPage: setting change order amount "${amount}" against "${costItemLabel}"...`);
        const amountInput = healingLocator(lineItemAmountInputStrategies(this.page, costItemLabel)).first();
        await amountInput.fill(amount);
        await this.page.keyboard.press('Tab');
        Logger.success(`VendorChangeOrderPage: "${costItemLabel}" change order amount set to "${amount}".`);
    }

    /** Asserts "Total Change Order Amount" reads exactly `expectedText` (e.g. "-$500.00"). */
    async assertTotalChangeOrderAmount(expectedText) {
        const totalValue = healingLocator(draftSummaryValueStrategies(this.page, 'Total Change Order Amount')).first();
        await expect(totalValue, `FAIL: "Total Change Order Amount" does not read "${expectedText}".`).toHaveText(expectedText, { timeout: 10000 });
    }

    /**
     * Clicks "Add Line Item", fills the new row's Scope/Schedule of Value/Description/
     * Quantity/Unit Cost fields, and asserts "Total Change Order Amount" reflects the
     * resulting Quantity x Unit Cost. `rowIndex` is 0-based (0 for the first added row).
     * @param {{ scope: string, scheduleOfValue: string, description: string, quantity: string, unitCost: string }} data
     */
    async addNewLineItem(data, rowIndex = 0) {
        Logger.step(`VendorChangeOrderPage: adding new line item "${data.scope}"...`);
        const addButton = healingLocator(addLineItemButtonStrategies(this.page)).first();
        await addButton.click();
        await this.page.waitForTimeout(500);

        const scopeField = healingLocator(newLineItemFieldByPlaceholderStrategies(this.page, 'Scope (e.g. Kitchen)')).last();
        await scopeField.fill(data.scope);
        const sovField = healingLocator(newLineItemFieldByPlaceholderStrategies(this.page, 'Schedule of value')).last();
        await sovField.fill(data.scheduleOfValue);
        const descriptionField = healingLocator(newLineItemFieldByPlaceholderStrategies(this.page, 'Description')).last();
        await descriptionField.fill(data.description);
        const qtyField = healingLocator(newLineItemFieldByPlaceholderStrategies(this.page, 'Qty')).last();
        await qtyField.fill(data.quantity);

        const unitCostInput = healingLocator(newLineItemAmountInputStrategies(this.page, rowIndex, 5)).first();
        await expect(unitCostInput, 'FAIL: New Line Item "Unit Cost" input not visible.').toBeVisible({ timeout: 10000 });
        await unitCostInput.fill(data.unitCost);
        await this.page.keyboard.press('Tab');

        // MCP-verified 2026-09-17: "Change Order Amount" is its own independent input, NOT
        // auto-computed from Quantity x Unit Cost — it must be filled explicitly.
        const changeOrderAmountInput = healingLocator(newLineItemAmountInputStrategies(this.page, rowIndex, 6)).first();
        await expect(changeOrderAmountInput, 'FAIL: New Line Item "Change Order Amount" input not visible.').toBeVisible({ timeout: 10000 });
        const computedAmount = data.changeOrderAmount ?? String(Number(data.quantity) * Number(data.unitCost));
        await changeOrderAmountInput.fill(computedAmount);
        await this.page.keyboard.press('Tab');

        Logger.success(`VendorChangeOrderPage: new line item "${data.scope}" added (qty=${data.quantity}, unitCost=${data.unitCost}, changeOrderAmount=${computedAmount}).`);
    }

    /** Clicks the trailing remove button on New Line Items row `rowIndex` (0-based) and
     * asserts the "No new line items." empty state reappears (only valid when this was the
     * only row). */
    async removeNewLineItem(rowIndex = 0) {
        Logger.step(`VendorChangeOrderPage: removing new line item row[${rowIndex}]...`);
        const removeButton = healingLocator(removeNewLineItemRowButtonStrategies(this.page, rowIndex)).first();
        await removeButton.click();
        const emptyState = healingLocator(noNewLineItemsTextStrategies(this.page)).first();
        await expect(emptyState, 'FAIL: "No new line items." empty state did not reappear after removing the only new line item.').toBeVisible({ timeout: 10000 });
        Logger.success('VendorChangeOrderPage: new line item removed.');
    }

    /** Clicks "Save Draft" and asserts the "Draft saved" toast. */
    async saveDraft() {
        Logger.step('VendorChangeOrderPage: saving Change Order draft...');
        const saveButton = healingLocator(draftActionButtonStrategies(this.page, 'Save Draft')).first();
        await saveButton.click();
        const toast = this.page.getByText('Draft saved', { exact: true });
        await expect(toast, 'FAIL: "Draft saved" toast not shown after Save Draft.').toBeVisible({ timeout: 10000 });
        Logger.success('VendorChangeOrderPage: Change Order draft saved.');
    }

    /** Clicks "Delete Draft" and asserts redirect back to the Change Orders listing (this app
     * deletes immediately, with no confirmation dialog — MCP-verified 2026-09-17). */
    async deleteDraft() {
        Logger.step('VendorChangeOrderPage: deleting Change Order draft...');
        const deleteButton = healingLocator(draftActionButtonStrategies(this.page, 'Delete Draft')).first();
        await deleteButton.click();
        await this.page.waitForURL(/\/bids-and-contracts\/change-orders$/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        Logger.success('VendorChangeOrderPage: Change Order draft deleted.');
    }

    /** Clicks "Submit for Approval" and asserts the "Submit Change Order" confirmation
     * dialog appears, containing the exact current total amount and an irreversibility
     * warning. Does NOT confirm — callers choose confirmSubmit() or cancelSubmitConfirm(). */
    async clickSubmitForApproval(expectedAmountText) {
        Logger.step('VendorChangeOrderPage: clicking Submit for Approval...');
        const submitButton = healingLocator(draftActionButtonStrategies(this.page, 'Submit for Approval')).first();
        await submitButton.click();

        const dialog = healingLocator(submitConfirmDialogStrategies(this.page, 'Submit Change Order')).first();
        await expect(dialog, 'FAIL: "Submit Change Order" confirmation dialog did not appear.').toBeVisible({ timeout: 10000 });
        await expect(dialog, `FAIL: confirmation dialog does not mention the expected amount "${expectedAmountText}".`).toContainText(expectedAmountText);
        await expect(dialog, 'FAIL: confirmation dialog missing the "cannot edit after submission" warning.').toContainText('You will not be able to edit it after submission');
        Logger.success('VendorChangeOrderPage: Submit Change Order confirmation dialog verified.');
    }

    /** Clicks "Cancel" in the open Submit Change Order confirmation dialog — asserts it
     * closes and the draft remains editable (still on the drafts/:id URL). */
    async cancelSubmitConfirm() {
        const dialog = healingLocator(submitConfirmDialogStrategies(this.page, 'Submit Change Order')).first();
        const cancelButton = dialog.getByRole('button', { name: 'Cancel', exact: true });
        await cancelButton.click();
        await expect(dialog, 'FAIL: Submit Change Order dialog still visible after Cancel.').not.toBeVisible({ timeout: 10000 });
        await expect(this.page).toHaveURL(/\/change-orders\/drafts\/\d+/, 'FAIL: navigated away from the draft after cancelling submission.');
        Logger.success('VendorChangeOrderPage: Submit confirmation cancelled — draft remains editable.');
    }

    /** Confirms the open Submit Change Order dialog and asserts the "Change order submitted
     * for approval" toast + redirect to the submitted Change Order detail page. */
    async confirmSubmit() {
        Logger.step('VendorChangeOrderPage: confirming Change Order submission...');
        const dialog = healingLocator(submitConfirmDialogStrategies(this.page, 'Submit Change Order')).first();
        const confirmButton = dialog.getByRole('button', { name: 'Submit for Approval', exact: true });
        await confirmButton.click();

        const toast = this.page.getByText('Change order submitted for approval', { exact: true });
        await expect(toast, 'FAIL: "Change order submitted for approval" toast not shown.').toBeVisible({ timeout: 15000 });
        await this.page.waitForURL(/\/bids-and-contracts\/change-orders\/\d+$/, { timeout: 15000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorChangeOrderPage: Change Order submitted — ${this.page.url()}`);
    }

    /** Asserts the submitted Change Order detail page: every labelled field visible and
     * non-empty, Status reads "Pending Approval" (never auto-approved), Raised By reads
     * "Vendor", and the read-only line-items grid (Search/View/Table toolbar, no Export)
     * shows a "Total" row. */
    async assertSubmittedChangeOrderDetailFullyVisible(expectedTitle) {
        Logger.step('VendorChangeOrderPage: asserting submitted Change Order detail page...');
        for (const label of CHANGE_ORDER_DETAIL_FIELDS) {
            const value = healingLocator(invoiceDetailFieldValueStrategies(this.page, label)).first();
            await expect(value, `FAIL: submitted Change Order detail field "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        const titleValue = healingLocator(invoiceDetailFieldValueStrategies(this.page, 'Title')).first();
        await expect(titleValue, `FAIL: submitted Change Order's Title does not read "${expectedTitle}".`).toHaveText(expectedTitle);
        const statusValue = healingLocator(invoiceDetailFieldValueStrategies(this.page, 'Status')).first();
        await expect(statusValue, 'FAIL: submitted Change Order Status is not "Pending Approval" — expected no auto-approval.').toHaveText('Pending Approval');
        const raisedByValue = healingLocator(invoiceDetailFieldValueStrategies(this.page, 'Raised By')).first();
        await expect(raisedByValue, 'FAIL: submitted Change Order "Raised By" does not read "Vendor".').toHaveText('Vendor');

        const totalRow = this.page.getByRole('row', { name: 'Total' });
        await expect(totalRow, 'FAIL: submitted Change Order line-items "Total" row not visible.').toBeVisible({ timeout: 10000 });

        Logger.success(`VendorChangeOrderPage: submitted Change Order detail page fully verified (Title="${expectedTitle}", Status="Pending Approval").`);
    }

    /** Asserts NO Edit/Approve/Reject action is available to the vendor on a submitted
     * Change Order detail page — it is read-only from this side once submitted (only Search
     * + View/Table toolbar buttons are present). */
    async assertSubmittedDetailIsReadOnly() {
        for (const label of ['Edit', 'Approve', 'Reject', 'Delete']) {
            const button = this.page.getByRole('button', { name: label, exact: true });
            await expect(button, `FAIL: unexpected "${label}" action button visible on a vendor's submitted Change Order detail page.`).toHaveCount(0);
        }
    }

    /** Reads a submitted-detail-page field's value as plain text. */
    async getDetailFieldValue(label) {
        const value = healingLocator(invoiceDetailFieldValueStrategies(this.page, label)).first();
        await expect(value, `FAIL: Change Order detail field "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        return (await value.textContent()).trim();
    }
}

module.exports = { VendorChangeOrderPage };
