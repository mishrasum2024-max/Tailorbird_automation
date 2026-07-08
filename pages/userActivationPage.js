const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { propertyLocators } = require('../locators/propertyLocator.js');

/**
 * Drives the full "accept invite" activation flow for a brand-new invited user:
 * yopmail inbox -> "Open Tailorbird" link -> AuthKit accept-invitation -> sign-up
 * (first/last name) -> password -> email OTP verification -> (optional) organization
 * selection -> landing on the dashboard.
 *
 * Runs in its own, unauthenticated BrowserContext (via create()) so it never touches
 * the admin session used elsewhere in the suite (sessionState.json).
 *
 * MCP-verified live (2026-07-08) against yopmail.com and
 * stalwart-collection-11-staging.authkit.app (QA Automations Org_2026 invite).
 */
class UserActivationPage {
    /**
     * @param {import('@playwright/test').BrowserContext} context
     * @param {import('@playwright/test').Page} yopmailPage
     */
    constructor(context, yopmailPage) {
        this.context = context;
        this.yopmailPage = yopmailPage;
        this.activationPage = null;
    }

    /** @param {import('@playwright/test').Browser} browser */
    static async create(browser) {
        const context = await browser.newContext();
        const yopmailPage = await context.newPage();
        return new UserActivationPage(context, yopmailPage);
    }

    inboxFrame() {
        return this.yopmailPage.frameLocator('iframe[name="ifinbox"]');
    }

    mailFrame() {
        return this.yopmailPage.frameLocator('iframe[name="ifmail"]');
    }

    async openInbox(email) {
        const localPart = email.split('@')[0];
        Logger.step(`[Activation] Opening yopmail inbox for ${email}`);
        await this.yopmailPage.goto(`https://yopmail.com/en/?login=${localPart}&d=1`, { waitUntil: 'load' });
    }

    /**
     * Polls the inbox (reloading) until a mail row matching subjectPattern is visible.
     * Yopmail's inbox iframe does not always reflect a just-arrived mail on first load.
     */
    async waitForMailRow(subjectPattern, timeoutMs = 60000) {
        const deadline = Date.now() + timeoutMs;
        const row = this.inboxFrame().getByRole('button', { name: subjectPattern }).first();
        while (Date.now() < deadline) {
            if (await row.isVisible().catch(() => false)) return row;
            await this.yopmailPage.reload({ waitUntil: 'load' }).catch(() => {});
            await this.yopmailPage.waitForTimeout(3000);
        }
        throw new Error(`[Activation] Mail matching "${subjectPattern}" did not arrive within ${timeoutMs}ms`);
    }

    /**
     * Opens the invite mail, clicks "Open Tailorbird" (which opens a new tab), and
     * returns that new page — the AuthKit "Accept invitation" screen.
     * @returns {Promise<import('@playwright/test').Page>}
     */
    async openInviteEmailAndLaunchActivation() {
        const inviteRow = await this.waitForMailRow(/invited you to Tailorbird/);
        Logger.step('[Activation] Opening invite email');
        await inviteRow.click();

        const openTailorbirdLink = this.mailFrame().getByRole('link', { name: 'Open Tailorbird' });
        await expect(openTailorbirdLink).toBeVisible({ timeout: 15000 });

        Logger.step('[Activation] Clicking "Open Tailorbird" — expecting a new tab');
        const [activationPage] = await Promise.all([
            this.context.waitForEvent('page'),
            openTailorbirdLink.click(),
        ]);
        await activationPage.waitForLoadState('load');
        this.activationPage = activationPage;
        return activationPage;
    }

    /** Accept-invitation screen: email is pre-filled, just confirm. */
    async acceptInvitation() {
        Logger.step('[Activation] Accepting invitation (email pre-filled)');
        await expect(this.activationPage.getByRole('heading', { name: 'Accept invitation' })).toBeVisible({ timeout: 15000 });
        await this.activationPage.getByRole('button', { name: 'Continue' }).click();
    }

    /** Sign-up screen: first name + last name (email stays pre-filled). */
    async fillNameAndContinue(firstName, lastName) {
        Logger.step(`[Activation] Sign-up: first name="${firstName}", last name="${lastName}"`);
        await this.activationPage.getByPlaceholder('Your first name').waitFor({ state: 'visible', timeout: 15000 });
        await this.activationPage.getByPlaceholder('Your first name').fill(firstName);
        await this.activationPage.getByPlaceholder('Your last name').fill(lastName);
        await this.activationPage.getByRole('button', { name: 'Continue' }).click();
    }

    /** Password screen. */
    async setPasswordAndContinue(password) {
        Logger.step('[Activation] Setting password');
        const passwordInput = this.activationPage.getByPlaceholder('Create a password');
        await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
        await passwordInput.fill(password);
        await this.activationPage.getByRole('button', { name: 'Continue', exact: true }).click();
    }

    /**
     * AuthKit does not always challenge with an email OTP after the password step —
     * live runs show it sometimes skips straight to /api/auth/callback (MCP-verified
     * manual run showed the OTP step; a subsequent automated run skipped it entirely).
     * Waits briefly for the heading; returns false without failing if it never appears.
     */
    async isEmailVerificationStepShown(timeoutMs = 10000) {
        return this.activationPage
            .getByRole('heading', { name: 'Verify your email' })
            .waitFor({ state: 'visible', timeout: timeoutMs })
            .then(() => true)
            .catch(() => false);
    }

    /** Runs the OTP round-trip only if AuthKit actually presented the verification step. */
    async completeEmailVerificationIfPrompted() {
        const shown = await this.isEmailVerificationStepShown();
        if (!shown) {
            Logger.info('[Activation] Email OTP step not shown for this session — AuthKit proceeded directly');
            return;
        }
        const code = await this.fetchEmailVerificationCode();
        await this.submitEmailVerificationCode(code);
    }

    /**
     * Reads the OTP mail from yopmail (separate mail from the original invite) and
     * returns the 6-digit code found in its body.
     */
    async fetchEmailVerificationCode() {
        Logger.step('[Activation] Fetching email verification code from yopmail');
        const otpRow = await this.waitForMailRow(/Verify your email address/);
        await otpRow.click();

        const bodyLocator = this.mailFrame().locator('body');
        await expect(bodyLocator).toBeVisible({ timeout: 15000 });
        const bodyText = (await bodyLocator.innerText()) || '';
        const match = bodyText.match(/\b(\d{6})\b/);
        if (!match) {
            throw new Error(`[Activation] Could not find a 6-digit verification code in mail body: "${bodyText}"`);
        }
        Logger.info(`[Activation] Verification code found: ${match[1]}`);
        return match[1];
    }

    /** Types the 6-digit code into the segmented OTP input; the app auto-submits on the last digit. */
    async submitEmailVerificationCode(code) {
        Logger.step('[Activation] Submitting email verification code');
        const otpBoxes = this.activationPage.getByRole('textbox');
        await otpBoxes.first().click();
        for (const digit of code) {
            await this.activationPage.keyboard.press(digit);
        }
    }

    /**
     * Some invited users belong to a single organization and are redirected straight to
     * the dashboard after OTP; others land on an organization-selection screen first.
     * Handles both — clicking the org whose name contains orgNameFragment when present.
     */
    async selectOrganizationIfPrompted(orgNameFragment = '2026') {
        await this.activationPage.waitForURL(/organization-selection|beta\.tailorbird\.com/, { timeout: 30000 });
        if (/organization-selection/.test(this.activationPage.url())) {
            Logger.step(`[Activation] Organization-selection screen shown — choosing org containing "${orgNameFragment}"`);
            await this.activationPage
                .locator('.ak-OrgSelection')
                .getByRole('button', { name: new RegExp(orgNameFragment) })
                .click();
        } else {
            Logger.info('[Activation] No organization-selection screen — user redirected directly (single-org invite)');
        }
    }

    async expectLandedOnDashboard(dashboardUrlPattern) {
        await this.activationPage.waitForURL(dashboardUrlPattern, { timeout: 30000 });
        await expect(this.activationPage).toHaveURL(dashboardUrlPattern);
        Logger.success(`[Activation] ✅ Landed on dashboard: ${this.activationPage.url()}`);
    }

    // ---------------------------------------------------------------------
    // Properties page — post-activation access check
    // ---------------------------------------------------------------------

    propertiesGrid() {
        return this.activationPage.locator('.mantine-SimpleGrid-root');
    }

    /** Each card is a direct child of the SimpleGrid; its first <p> is the property name (MCP-verified DOM: PropertyCard_card__*). */
    propertyCards() {
        return this.propertiesGrid().locator('> div');
    }

    /**
     * Directly invokes GET /api/properties (authenticated via the activated user's own
     * session/cookies) — the source of truth for which properties this user can see.
     * A direct invoke (like FgaUserManagementPage.getOrganizationUserByEmail) rather than
     * intercepting a UI-triggered fetch: the dashboard landing page already loads property
     * data, so the SPA can serve /properties from cache without firing a fresh request,
     * making page.waitForResponse() race and time out (MCP/live-run verified).
     */
    async fetchPropertiesApi() {
        Logger.step('[Activation] Invoking GET /api/properties');
        const response = await this.activationPage.request.get('/api/properties');
        const responseBody = await response.json().catch(() => null);
        const propertyNames = Array.isArray(responseBody) ? responseBody.map((p) => p.name) : [];
        Logger.info(`[Activation] GET /api/properties -> [${response.status()}] ${JSON.stringify(propertyNames)}`);

        return {
            status: response.status(),
            ok: response.ok(),
            responseBody,
            propertyNames,
        };
    }

    async gotoPropertiesPage() {
        Logger.step('[Activation] Navigating to Properties page');
        await this.activationPage.locator(propertyLocators.propertiesNavLink).first().click();
        await this.activationPage.waitForURL(/\/properties/, { timeout: 20000 });
        await expect(this.propertiesGrid().first()).toBeVisible({ timeout: 20000 });
    }

    /** Returns the property name (first <p> text) of every visible property card. */
    async getVisiblePropertyNames() {
        const cards = this.propertyCards();
        const count = await cards.count();
        const names = [];
        for (let i = 0; i < count; i++) {
            const name = ((await cards.nth(i).locator('p').first().innerText()) || '').trim();
            names.push(name);
        }
        return names;
    }

    async close() {
        await this.context.close().catch(() => {});
    }
}

module.exports = { UserActivationPage };
