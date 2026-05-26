require('dotenv').config();
const { expect } = require('@playwright/test');
const { oooLocators } = require('../locators/oooLocator');
const { Logger } = require('../utils/logger');

class OOOPage {
    constructor(page) {
        this.page = page;
        this.loc = oooLocators(page);
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /** Returns the API origin derived from DASHBOARD_URL env var. Nothing hardcoded. */
    get apiBase() {
        return new URL(process.env.DASHBOARD_URL).origin;
    }

    async waitForDomLoad(ms = 1500) {
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(ms);
    }

    // ── Navigation ───────────────────────────────────────────────────────

    async navigateToProfile() {
        Logger.step('[OOO] Navigating to /profile');
        await this.page.goto(`${this.apiBase}/profile`, { waitUntil: 'domcontentloaded' });
        await this.loc.tab_profile.waitFor({ state: 'visible', timeout: 20000 });
        Logger.success('[OOO] Profile page loaded');
    }

    async clickOooTab() {
        Logger.step('[OOO] Clicking Out of Office tab');
        await this.loc.tab_ooo.click();
        await this.loc.oooTabpanel.waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(800);
        Logger.success('[OOO] OOO tabpanel visible');
    }

    async goToOooTab() {
        await this.navigateToProfile();
        await this.clickOooTab();
    }

    // ── API helpers ──────────────────────────────────────────────────────

    /**
     * GET /api/ooo
     * Returns: { success, ooo: null|{id, delegate_user_id, delegate_role_id, deactivate_at, started_at, delegate_role_name}, delegatedFrom, currentUserId }
     */
    async getOooApiState() {
        const res = await this.page.request.get(`${this.apiBase}/api/ooo`);
        expect(res.status(), `GET /api/ooo expected HTTP 200, got ${res.status()}`).toBe(200);
        const body = await res.json();
        Logger.info(`[OOO API State] ${JSON.stringify(body)}`);
        return body;
    }

    /**
     * GET /api/ooo/delegates
     * Returns: { success, members: [{id, label}], roles: [{id, label}] }
     */
    async getDelegatesApiResponse() {
        const res = await this.page.request.get(`${this.apiBase}/api/ooo/delegates`);
        expect(res.status(), `GET /api/ooo/delegates expected HTTP 200, got ${res.status()}`).toBe(200);
        const body = await res.json();
        Logger.info(`[OOO Delegates] members=${body.members.length}, roles=${body.roles.length}`);
        return body;
    }

    /**
     * POST /api/ooo with a raw arbitrary payload.
     * Used for negative/backend-validation tests only.
     * Returns the raw Response object — caller asserts status.
     */
    async postOooDirect(payload) {
        Logger.info(`[POST /api/ooo] payload=${JSON.stringify(payload)}`);
        const res = await this.page.request.post(`${this.apiBase}/api/ooo`, { data: payload });
        Logger.info(`[POST /api/ooo] → HTTP ${res.status()}`);
        return res;
    }

    /**
     * DELETE /api/ooo — used for cleanup.
     * Returns the raw Response object.
     */
    async deleteOooDirect() {
        Logger.info('[DELETE /api/ooo] Sending deactivation request');
        const res = await this.page.request.delete(`${this.apiBase}/api/ooo`);
        Logger.info(`[DELETE /api/ooo] → HTTP ${res.status()}`);
        return res;
    }

    // ── State management ─────────────────────────────────────────────────

    /** Returns true if the active state paragraph is currently visible in the UI. */
    async isOooActiveInUi() {
        return this.loc.activeStatePara.isVisible().catch(() => false);
    }

    /**
     * Ensures OOO is inactive via API. Idempotent — safe to call even if already inactive.
     * Asserts the DELETE returns 200 if a deactivation was needed.
     */
    async ensureOooInactive() {
        const state = await this.getOooApiState();
        if (state.ooo !== null) {
            Logger.info('[OOO] Currently active — deactivating via API');
            const res = await this.deleteOooDirect();
            expect(res.status(), `Cleanup DELETE /api/ooo expected HTTP 200`).toBe(200);
            Logger.success('[OOO] Deactivated successfully');
        } else {
            Logger.info('[OOO] Already inactive — no cleanup needed');
        }
    }

    // ── UI interactions ──────────────────────────────────────────────────

    async selectDelegateToRole() {
        Logger.step('[OOO] Selecting "Delegate to role" radio');
        await this.loc.radio_delegateToRole.click();
        await expect(this.loc.radio_delegateToRole, '"Delegate to role" must be checked after click').toBeChecked({ timeout: 5000 });
        Logger.success('[OOO] "Delegate to role" radio is checked');
    }

    async selectDelegateToUser() {
        Logger.step('[OOO] Selecting "Delegate to user" radio');
        await this.loc.radio_delegateToUser.click();
        await expect(this.loc.radio_delegateToUser, '"Delegate to user" must be checked after click').toBeChecked({ timeout: 5000 });
        Logger.success('[OOO] "Delegate to user" radio is checked');
    }

    async pickRoleFromDropdown(roleName) {
        Logger.step(`[OOO] Opening role dropdown and selecting "${roleName}"`);
        await this.loc.input_role.click();
        await this.loc.roleOption(roleName).waitFor({ state: 'visible', timeout: 10000 });
        await this.loc.roleOption(roleName).click();
        await expect(this.loc.input_role, `Role input must show "${roleName}" after selection`).toHaveValue(roleName, { timeout: 5000 });
        Logger.success(`[OOO] Role "${roleName}" selected`);
    }

    async pickMemberFromDropdown(memberName) {
        Logger.step(`[OOO] Opening team member dropdown and selecting "${memberName}"`);
        await this.loc.input_teamMember.click();
        await this.loc.memberOption(memberName).waitFor({ state: 'visible', timeout: 10000 });
        await this.loc.memberOption(memberName).click();
        await expect(this.loc.input_teamMember, `Team member input must show "${memberName}" after selection`).toHaveValue(memberName, { timeout: 5000 });
        Logger.success(`[OOO] Team member "${memberName}" selected`);
    }

    async openDatePicker() {
        Logger.step('[OOO] Opening date picker');
        await this.loc.input_deactivateDate.click();
        await this.loc.calendar_monthLabel.waitFor({ state: 'visible', timeout: 10000 });
        Logger.success('[OOO] Date picker calendar is open');
    }

    /**
     * Fills the date input with a future date N days from today.
     * Returns the date string in MM/DD/YYYY format (as shown in the UI).
     */
    async setFutureDate(daysFromToday = 3) {
        const target = new Date();
        target.setDate(target.getDate() + daysFromToday);
        const mm = String(target.getMonth() + 1).padStart(2, '0');
        const dd = String(target.getDate()).padStart(2, '0');
        const yyyy = target.getFullYear();
        const uiDate = `${mm}/${dd}/${yyyy}`;
        // Also compute API format YYYY-MM-DD for comparison assertions
        const apiDate = `${yyyy}-${mm}-${dd}`;

        Logger.step(`[OOO] Setting deactivate date: ${uiDate} (API: ${apiDate})`);
        await this.loc.input_deactivateDate.fill(uiDate);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(500);

        Logger.success(`[OOO] Deactivate date set to ${uiDate}`);
        return { uiDate, apiDate };
    }

    /** Clicks today's date in the already-open calendar popup. */
    async clickTodayInCalendar() {
        const todayDay = String(new Date().getDate());
        Logger.step(`[OOO] Clicking today (${todayDay}) in open calendar`);
        // Use :not() in the CSS selector itself — chaining .locator(':not(...)') would look for
        // children of the day button (a leaf node), finding nothing.
        const todayBtn = this.page
            .locator('.mantine-DateInput-day:not([data-disabled="true"])')
            .filter({ hasText: new RegExp(`^${todayDay}$`) })
            .first();
        await todayBtn.waitFor({ state: 'visible', timeout: 5000 });
        await todayBtn.click();
        Logger.success(`[OOO] Today (${todayDay}) clicked in calendar`);
    }

    /**
     * Clears the selected deactivation date using the × (CloseButton) icon.
     * The button only exists when a date has been set.
     */
    async clearDeactivateDate() {
        Logger.step('[OOO] Clearing deactivate date via × button');
        await this.loc.btn_clearDate.waitFor({ state: 'visible', timeout: 8000 });
        await this.loc.btn_clearDate.click();
        await expect(
            this.loc.input_deactivateDate,
            'Date input must be empty after clearing'
        ).toHaveValue('', { timeout: 5000 });
        Logger.success('[OOO] Date cleared — input is empty');
    }

    async clickActivateOoo() {
        Logger.step('[OOO] Clicking "Activate OOO mode"');
        await expect(
            this.loc.btn_activate,
            '"Activate OOO mode" must be enabled before clicking'
        ).toBeEnabled({ timeout: 5000 });
        await this.loc.btn_activate.click();
        await this.loc.activeStatePara.waitFor({ state: 'visible', timeout: 15000 });
        Logger.success('[OOO] OOO activated — active state banner is visible');
    }

    async clickDeactivateOoo() {
        Logger.step('[OOO] Clicking "Deactivate OOO mode"');
        await expect(
            this.loc.btn_deactivate,
            '"Deactivate OOO mode" button must be visible'
        ).toBeVisible({ timeout: 10000 });
        await this.loc.btn_deactivate.click();
        await this.loc.btn_activate.waitFor({ state: 'visible', timeout: 15000 });
        Logger.success('[OOO] OOO deactivated — activate form is visible again');
    }

    /** Returns the full text content of the active state paragraph. */
    async getActiveStateText() {
        const text = await this.loc.activeStatePara.textContent();
        Logger.info(`[OOO] Active state text: "${text}"`);
        return text;
    }

    // ── Convenience: full activation workflows ───────────────────────────

    /** Activates OOO with a role delegate. Optionally sets a deactivation date. */
    async activateWithRole(roleName, dateStr = null) {
        Logger.step(`[OOO] Activating with role="${roleName}", date="${dateStr || 'none'}"`);
        await this.selectDelegateToRole();
        await this.pickRoleFromDropdown(roleName);
        if (dateStr) {
            await this.loc.input_deactivateDate.fill(dateStr);
            await this.page.keyboard.press('Enter');
            await this.page.waitForTimeout(500);
        }
        await this.clickActivateOoo();
        Logger.success(`[OOO] Activated with role "${roleName}"`);
    }

    // ── Data helpers (use API — nothing hardcoded) ────────────────────────

    /** Returns the first available role label from /api/ooo/delegates. */
    async getFirstRoleName() {
        const d = await this.getDelegatesApiResponse();
        expect(d.roles.length, 'At least one role must exist for OOO role-delegation tests').toBeGreaterThan(0);
        return d.roles[0].label;
    }

    /** Returns a second distinct role label (for re-activation tests). */
    async getSecondRoleName() {
        const d = await this.getDelegatesApiResponse();
        expect(d.roles.length, 'At least 2 roles required for this test').toBeGreaterThanOrEqual(2);
        return d.roles[1].label;
    }

    /** Returns all role labels from /api/ooo/delegates. */
    async getAllRoleNames() {
        const d = await this.getDelegatesApiResponse();
        return d.roles.map(r => r.label);
    }

    /**
     * Returns the current user's display name by cross-referencing
     * the members array in /api/ooo/delegates with currentUserId from /api/ooo.
     */
    async getCurrentUserName() {
        const [state, delegates] = await Promise.all([
            this.getOooApiState(),
            this.getDelegatesApiResponse(),
        ]);
        const currentId = String(state.currentUserId);
        const self = delegates.members.find(m => m.id === currentId);
        expect(self, `Current user id=${currentId} not found in members array`).toBeTruthy();
        Logger.info(`[OOO] Current user: id=${currentId}, name="${self.label}"`);
        return self.label;
    }

    /**
     * Returns the current user's numeric id from /api/ooo.
     */
    async getCurrentUserId() {
        const state = await this.getOooApiState();
        Logger.info(`[OOO] currentUserId=${state.currentUserId}`);
        return state.currentUserId;
    }
}

module.exports = { OOOPage };
