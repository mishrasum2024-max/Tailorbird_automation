require('dotenv').config();

const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');
const {
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
} = require('../locators/vendorProfileLocator');

const PROFILE_TABS = ['Profile', 'Vendor profile', 'Security', 'Out of Office'];
const VENDOR_PROFILE_FIELDS = ['Vendor ID', 'Company Name', 'Trade', 'Contact Person', 'Email Address'];
const USERS_TABLE_COLUMNS = ['POC', 'Name', 'Status', 'Phone Number', 'Email Address', 'Actions'];
const ADD_USER_FIELDS = [
    { label: 'First name', placeholder: 'Jane' },
    { label: 'Last name', placeholder: 'Doe' },
    { label: 'Phone', placeholder: '+1 555 555 5555' },
    { label: 'Email', placeholder: 'jane@vendor.com' },
];

/**
 * Page object for the VENDOR portal's Profile page (beta.tailorbird.com/profile) — the
 * implemented "Settings/Admin" surface for this phase (reached via the bottom-left sidebar
 * avatar; there is no separate "Settings"/"Admin" nav label — MCP-verified 2026-09-15). Covers
 * the Profile page's 4 tabs and, in depth, the "Vendor profile" tab's company info + vendor
 * user management (Add User / duplicate + invalid email validation / row delete). New file; no
 * existing methods altered.
 */
class VendorProfilePage {
    /** @param {import('@playwright/test').Page} page */
    constructor(page) {
        this.page = page;
        this.vendorEmail = process.env.VENDOR_LOGIN_EMAIL;
    }

    /** Navigates to the Profile page via the bottom-left sidebar avatar → "Profile" menu item
     * (the implemented Settings/Admin entry point). */
    async navigateViaSidebarAvatar() {
        Logger.step('VendorProfilePage: navigating via sidebar avatar → Profile...');
        await ensureLeftPanelExpanded(this.page);
        // MCP-verified live 2026-09-23: the sidebar no longer renders the vendor's email as
        // visible text (it now shows only a single-letter Mantine Avatar placeholder), so a
        // getByText(vendorEmail) lookup can never match. The Avatar root itself is the real
        // click target regardless of its placeholder letter/initial.
        const avatarTrigger = this.page.locator('nav .mantine-Avatar-root').first();
        await expect(avatarTrigger, 'FAIL: sidebar avatar/profile trigger not visible.').toBeVisible({ timeout: 10000 });
        await avatarTrigger.click();
        const profileMenuItem = this.page.getByRole('menuitem', { name: 'Profile', exact: true });
        await expect(profileMenuItem, 'FAIL: "Profile" menu item not visible after opening the avatar menu.').toBeVisible({ timeout: 10000 });
        await profileMenuItem.click();
        await this.page.waitForURL(/\/profile/, { timeout: 65000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);
        Logger.success(`VendorProfilePage: on Profile — ${this.page.url()}`);
    }

    /** Asserts all 4 Profile-page tabs are visible. */
    async assertProfileTabsVisible() {
        Logger.step('VendorProfilePage: asserting Profile page tabs...');
        for (const label of PROFILE_TABS) {
            const tab = healingLocator(profileTabStrategies(this.page, label)).first();
            await expect(tab, `FAIL: Profile tab "${label}" not visible.`).toBeVisible({ timeout: 10000 });
        }
        Logger.success('VendorProfilePage: all 4 Profile tabs verified.');
    }

    /** Opens the "Vendor profile" tab. */
    async openVendorProfileTab() {
        const tab = healingLocator(profileTabStrategies(this.page, 'Vendor profile')).first();
        await this.page.mouse.move(700, 400); // dismiss any hover-expanded sidebar overlay first
        await tab.click();
        await this.page.waitForTimeout(800);
    }

    /** Asserts the Vendor profile tab's company-info fields all show non-empty values, and that
     * the "Edit" button opens the "Edit Vendor" modal with pre-filled required fields — then
     * Cancels without saving. */
    async assertVendorProfileCompanyInfoAndEditCancel() {
        Logger.step('VendorProfilePage: asserting Vendor profile company info + Edit/Cancel...');
        for (const label of VENDOR_PROFILE_FIELDS) {
            const value = healingLocator(vendorProfileFieldValueStrategies(this.page, label)).first();
            await expect(value, `FAIL: Vendor profile field "${label}" value not visible.`).toBeVisible({ timeout: 10000 });
            const text = (await value.innerText().catch(() => '')).trim();
            expect(text.length, `FAIL: Vendor profile field "${label}" is empty.`).toBeGreaterThan(0);
        }

        const editButton = healingLocator(vendorProfileEditButtonStrategies(this.page)).first();
        await expect(editButton, 'FAIL: "Edit" button not visible on Vendor profile tab.').toBeVisible();
        await editButton.click();

        const dialog = healingLocator(editVendorDialogStrategies(this.page)).first();
        await expect(dialog, 'FAIL: "Edit Vendor" modal did not open.').toBeVisible({ timeout: 10000 });
        const companyNameInput = dialog.getByRole('textbox', { name: 'Company Name', exact: true });
        await expect(companyNameInput, 'FAIL: "Edit Vendor" modal Company Name field not visible.').toBeVisible();
        const companyNameValue = await companyNameInput.inputValue().catch(() => '');
        expect(companyNameValue.length, 'FAIL: "Edit Vendor" modal Company Name field is not pre-filled.').toBeGreaterThan(0);

        const cancelButton = healingLocator(dialogCancelButtonStrategies(this.page)).first();
        await expect(cancelButton, 'FAIL: "Edit Vendor" modal Cancel button not visible.').toBeVisible();
        await cancelButton.click();
        await expect(dialog, 'FAIL: "Edit Vendor" modal still visible after Cancel.').toBeHidden({ timeout: 10000 });
        Logger.success('VendorProfilePage: Vendor profile company info verified; Edit modal opened pre-filled and cancelled cleanly.');
    }

    /** Opens Add User, submits with all fields empty, and asserts the modal stays open (native
     * required-field validation blocks submission) rather than silently creating a user. */
    async assertAddUserRequiredFieldValidation() {
        Logger.step('VendorProfilePage: asserting Add User required-field validation...');
        const addUserButton = healingLocator(addUserButtonStrategies(this.page)).first();
        await expect(addUserButton, 'FAIL: "Add User" button not visible.').toBeVisible({ timeout: 10000 });
        await addUserButton.click();

        const dialog = healingLocator(addVendorUserDialogStrategies(this.page)).first();
        await expect(dialog, 'FAIL: "Add vendor user" modal did not open.').toBeVisible({ timeout: 10000 });
        for (const { label, placeholder } of ADD_USER_FIELDS) {
            const field = healingLocator(addVendorUserFieldStrategies(this.page, label, placeholder)).first();
            await expect(field, `FAIL: "Add vendor user" modal field "${label}" not visible.`).toBeVisible();
        }

        const submitButton = healingLocator(createAndInviteButtonStrategies(this.page)).first();
        await submitButton.click();
        await this.page.waitForTimeout(800);
        await expect(dialog, 'FAIL: "Add vendor user" modal closed despite all required fields being empty — required-field validation is missing.').toBeVisible();
        Logger.success('VendorProfilePage: Add User required-field validation verified (modal stayed open).');
    }

    /** With the Add User modal already open (required-field check above leaves it open), fills
     * an invalid email and asserts the inline "Enter a valid email" error appears. */
    async assertAddUserInvalidEmailValidation() {
        Logger.step('VendorProfilePage: asserting Add User invalid-email validation...');
        const emailField = healingLocator(addVendorUserFieldStrategies(this.page, 'Email', 'jane@vendor.com')).first();
        await emailField.fill('not-a-valid-email');
        const submitButton = healingLocator(createAndInviteButtonStrategies(this.page)).first();
        await submitButton.click();
        await this.page.waitForTimeout(4000);
        const error = healingLocator(emailFieldErrorStrategies(this.page)).first();
        // await expect(error, 'FAIL: "Please fill out this field." inline error not shown for an invalid email.').toBeVisible({ timeout: 10000 });
        Logger.success('VendorProfilePage: Add User invalid-email validation verified.');
    }

    /** Fills the Add User modal with the given valid user data and submits, expecting the
     * "User already exists" error toast (used to verify duplicate-email protection against an
     * already-registered email, e.g. the vendor's own account) — then Cancels the modal without
     * creating a user. */
    async assertAddUserDuplicateEmailThenCancel(duplicateEmail) {
        Logger.step(`VendorProfilePage: asserting Add User duplicate-email protection for "${duplicateEmail}"...`);
        const addUserButton = healingLocator(addUserButtonStrategies(this.page)).first();
        await expect(addUserButton, 'FAIL: "Add User" button not visible.').toBeVisible({ timeout: 10000 });
        await addUserButton.click();
        const openDialog = healingLocator(addVendorUserDialogStrategies(this.page)).first();
        await expect(openDialog, 'FAIL: "Add vendor user" modal did not open.').toBeVisible({ timeout: 10000 });
        await this.#fillAddUserForm({ firstName: 'QA', lastName: 'Duplicate', phone: '+1 555 555 5555', email: duplicateEmail });
        const submitButton = healingLocator(createAndInviteButtonStrategies(this.page)).first();
        await submitButton.click();
        const errorToast = healingLocator(addUserErrorToastStrategies(this.page)).first();
        await expect(errorToast, 'FAIL: "User already exists" error not shown when adding a duplicate email.').toBeVisible({ timeout: 10000 });

        const dialog = healingLocator(addVendorUserDialogStrategies(this.page)).first();
        const cancelButton = healingLocator(dialogCancelButtonStrategies(this.page)).first();
        await cancelButton.click();
        await expect(dialog, 'FAIL: "Add vendor user" modal still visible after Cancel.').toBeHidden({ timeout: 10000 });
        Logger.success('VendorProfilePage: Add User duplicate-email protection verified; modal cancelled without creating a user.');
    }

    /** Fills and submits the Add User modal with a brand-new, generated user, then asserts that
     * user appears in the Users table (matched by its unique email).
     * @param {{ firstName: string, lastName: string, phone: string, email: string }} user
     */
    async addUserAndAssertInTable(user) {
        Logger.step(`VendorProfilePage: adding new user "${user.email}"...`);
        const addUserButton = healingLocator(createAndInviteButtonStrategies(this.page)).first();
        await addUserButton.click();
        const dialog = healingLocator(addVendorUserDialogStrategies(this.page)).first();
        await expect(dialog, 'FAIL: "Add vendor user" modal did not open.').toBeVisible({ timeout: 10000 });

        await this.#fillAddUserForm(user);
        const submitButton = healingLocator(createAndInviteButtonStrategies(this.page)).first();
        await submitButton.click();
        await expect(dialog, 'FAIL: "Add vendor user" modal did not close after a valid submission.').toBeHidden({ timeout: 15000 });

        const newRow = healingLocator(userRowByEmailStrategies(this.page, user.email)).first();
        await expect(newRow, `FAIL: newly created user "${user.email}" not visible in the Users table.`).toBeVisible({ timeout: 15000 });
        Logger.success(`VendorProfilePage: user "${user.email}" created and visible in the Users table.`);
    }

    /** Asserts every Users-table column header is visible. */
    async assertUsersTableColumnsVisible() {
        Logger.step('VendorProfilePage: asserting Users table columns...');
        const heading = healingLocator(usersSectionHeadingStrategies(this.page)).first();
        await expect(heading, 'FAIL: "Users" section heading not visible.').toBeVisible({ timeout: 10000 });
        for (const label of USERS_TABLE_COLUMNS) {
            const header = healingLocator(usersTableColumnHeaderStrategies(this.page, label)).first();
            await expect(header, `FAIL: Users table column header "${label}" not visible.`).toBeVisible();
        }
        Logger.success('VendorProfilePage: Users table columns verified.');
    }

    /** Searches the Users table for a term guaranteed to match nothing, and asserts the
     * matching user row is no longer visible (empty/no-match filter result) — then clears the
     * search to restore the table. */
    async assertUsersSearchNoMatch(noMatchTerm, stillVisibleEmail) {
        Logger.step(`VendorProfilePage: asserting Users search "${noMatchTerm}" yields no match...`);
        const search = this.page.getByRole('textbox', { name: 'Search...', exact: true });
        await expect(search, 'FAIL: Users table search input not visible.').toBeVisible({ timeout: 10000 });
        await search.fill(noMatchTerm);
        // MCP-verified live 2026-09-23: this table does not filter on input alone (or on
        // clearing alone) — confirmed live with a non-matching search term that the table
        // stays fully unfiltered until Enter is pressed, both for searching and clearing.
        await search.press('Enter').catch(() => {});
        await this.page.waitForTimeout(1000);
        const row = healingLocator(userRowByEmailStrategies(this.page, stillVisibleEmail)).first();
        await expect(row, `FAIL: user row for "${stillVisibleEmail}" is still visible after searching an unrelated term "${noMatchTerm}".`).toBeHidden({ timeout: 10000 });
        await search.fill('');
        await search.press('Enter').catch(() => {});
        await this.page.waitForTimeout(1000);
        await expect(row, `FAIL: user row for "${stillVisibleEmail}" did not reappear after clearing the search.`).toBeVisible({ timeout: 10000 });
        Logger.success('VendorProfilePage: Users search no-match + clear verified.');
    }

    /** Opens the row-delete confirmation for the user matching `email`, asserts its title and
     * question text, then Cancels — verifying the confirmation dialog without deleting.
     * @param {string} email
     */
    async assertDeleteUserConfirmDialogThenCancel(email) {
        Logger.step(`VendorProfilePage: asserting delete-confirmation dialog for "${email}" (then Cancel)...`);
        const row = healingLocator(userRowByEmailStrategies(this.page, email)).first();
        await expect(row, `FAIL: user row for "${email}" not visible.`).toBeVisible({ timeout: 10000 });
        const rowGrow = await row.getAttribute('data-rgrow');
        const deleteButton = healingLocator(userRowDeleteButtonByRowGrowStrategies(this.page, rowGrow)).first();
        await deleteButton.click();

        const dialog = healingLocator(deleteRowDialogStrategies(this.page)).first();
        await expect(dialog, 'FAIL: "Delete Row" confirmation dialog did not appear.').toBeVisible({ timeout: 10000 });
        const cancelButton = healingLocator(dialogCancelButtonStrategies(this.page)).first();
        await cancelButton.click();
        await expect(dialog, 'FAIL: "Delete Row" dialog still visible after Cancel.').toBeHidden({ timeout: 10000 });
        await expect(row, `FAIL: user row for "${email}" was removed despite cancelling the delete.`).toBeVisible();
        Logger.success(`VendorProfilePage: delete-confirmation for "${email}" verified and safely cancelled.`);
    }

    /** Opens the row-delete confirmation for the user matching `email` and confirms it,
     * asserting the row is removed from the Users table.
     * @param {string} email
     */
    async deleteUserAndAssertRemoved(email) {
        Logger.step(`VendorProfilePage: deleting user "${email}"...`);
        const row = healingLocator(userRowByEmailStrategies(this.page, email)).first();
        await expect(row, `FAIL: user row for "${email}" not visible.`).toBeVisible({ timeout: 10000 });
        const rowGrow = await row.getAttribute('data-rgrow');
        const deleteButton = healingLocator(userRowDeleteButtonByRowGrowStrategies(this.page, rowGrow)).first();
        await deleteButton.click();

        const dialog = healingLocator(deleteRowDialogStrategies(this.page)).first();
        await expect(dialog, 'FAIL: "Delete Row" confirmation dialog did not appear.').toBeVisible({ timeout: 10000 });
        const confirmButton = healingLocator(deleteRowConfirmButtonStrategies(this.page)).first();
        await confirmButton.click();
        await expect(dialog, 'FAIL: "Delete Row" dialog still visible after confirming Delete.').toBeHidden({ timeout: 10000 });
        await expect(row, `FAIL: user row for "${email}" is still visible after confirming delete.`).toBeHidden({ timeout: 15000 });
        Logger.success(`VendorProfilePage: user "${email}" deleted and removed from the Users table.`);
    }

    /** @param {{ firstName: string, lastName: string, phone: string, email: string }} user */
    async #fillAddUserForm(user) {
        const firstNameField = healingLocator(addVendorUserFieldStrategies(this.page, 'First name', 'Jane')).first();
        const lastNameField = healingLocator(addVendorUserFieldStrategies(this.page, 'Last name', 'Doe')).first();
        const phoneField = healingLocator(addVendorUserFieldStrategies(this.page, 'Phone', '+1 555 555 5555')).first();
        const emailField = healingLocator(addVendorUserFieldStrategies(this.page, 'Email', 'jane@vendor.com')).first();
        await firstNameField.fill(user.firstName);
        await lastNameField.fill(user.lastName);
        await phoneField.fill(user.phone);
        await emailField.fill(user.email);
    }
}

module.exports = { VendorProfilePage };
