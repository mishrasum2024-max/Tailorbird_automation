const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const authKitMessages = require('../fixture/authKitMessages.json');

class LoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Locators
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.continueButton = page.locator('button[type="submit"]:has-text("Continue")');
    this.signInButton = page.locator('button[name="intent"]:has-text("Sign in")');
    /** Broad locator for AuthKit / form validation failures */
    this.errorMessage = page.locator('.error, .form-error, [role="alert"]');
    // this.organizationSelect = page.locator("button:has-text('Tailorbird_QA_Automations')");
    this.organizationSelect = page
      .locator('.ak-OrgSelection')
      .getByRole('button', { name: 'Tailorbird_QA_Automations' });

    /** Exact strings from AuthKit (keep in sync with fixture/authKitMessages.json; verify via MCP if UI changes). */
    this.authKit = authKitMessages;
  }

  /**
   * Same extraction strategy as MCP `evaluate` diagnostics (tree walk + <p>), plus Playwright
   * a11y `[role=alert]` (often empty in DOM; see fixture `_mcpVerifiedScenarios`).
   * @returns {Promise<{ fromA11yAlerts: string[], fromDomScan: string[], fromParagraphs: string[] }>}
   */
  async captureAuthKitErrorTextsForLog() {
    const fromA11yAlerts = await this.page
      .getByRole('alert')
      .allInnerTexts()
      .then((arr) =>
        arr.map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean),
      )
      .catch(() => []);

    const { fromDomScan, fromParagraphs } = await this.page.evaluate(() => {
      const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
      const errorLike = (t) =>
        t &&
        t.length <= 400 &&
        (/Please enter|Please provide|Invalid email or password/i.test(t) || /^Invalid\b/i.test(t));

      const tree = new Set();
      if (document.body) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = w.nextNode())) {
          const t = norm(node.textContent);
          if (errorLike(t)) tree.add(t);
        }
      }

      const paras = [...document.querySelectorAll('p')]
        .map((e) => norm(e.textContent))
        .filter(errorLike);

      return { fromDomScan: [...tree], fromParagraphs: paras };
    });

    return { fromA11yAlerts, fromDomScan, fromParagraphs };
  }

  /**
   * Inline or banner copy shown by AuthKit — exact match on user-visible text.
   * Logs expected vs captured alert/DOM strings so CI logs show what changed when copy drifts.
   * @param {string} exactText
   * @param {string} [contextLabel] e.g. test step id for log prefix
   */
  async expectAuthKitMessage(exactText, contextLabel = 'AuthKit') {
    const failDetail = `Expected exact "${exactText}". Update fixture/authKitMessages.json after verifying LOGIN_URL (MCP browser).`;

    await expect(this.page.getByText(exactText, { exact: true })).toBeVisible({
      timeout: 15_000,
      message: `FAIL: AuthKit — ${failDetail}`,
    });

    if (exactText === this.authKit.credentialsInvalid) {
      await expect(this.page.locator('p', { hasText: exactText })).toBeVisible({
        timeout: 5_000,
        message: `FAIL: AuthKit — MCP-verified: "${exactText}" is emitted inside a <p>; banner structure changed.`,
      });
    }

    const { fromA11yAlerts, fromDomScan, fromParagraphs } = await this.captureAuthKitErrorTextsForLog();
    Logger.info(
      `[${contextLabel}] Verified: "${exactText}" | a11y [alert]: ${JSON.stringify(fromA11yAlerts)} | DOM tree: ${JSON.stringify(fromDomScan)} | <p>: ${JSON.stringify(fromParagraphs)}`,
    );

    const normalizedAlerts = fromA11yAlerts
      .map((t) => t.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (normalizedAlerts.length > 0) {
      const alertMatches = normalizedAlerts.some((t) => t === exactText || t.includes(exactText));
      expect(
        alertMatches,
        `FAIL: AuthKit — [role=alert] regions exist (${JSON.stringify(normalizedAlerts)}) but none contain exact "${exactText}". Announced text drifted vs visible copy.`,
      ).toBeTruthy();
      Logger.info(`[${contextLabel}] role=alert matches expected message (live region OK).`);
    }
  }

  /**
   * Stable password-step chrome from live AuthKit (verified via MCP browser, 2026-05-04).
   * Fails immediately if labels or secondary actions change.
   */
  async expectPasswordStepChromeVisible() {
    await expect(
      this.page.getByRole('link', { name: 'Forgot your password?' }),
      'FAIL: AuthKit password step — link "Forgot your password?" missing or renamed (verify LIVE UI / MCP).',
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      this.page.getByRole('link', { name: 'Go back' }),
      'FAIL: AuthKit password step — link "Go back" missing or renamed (verify LIVE UI / MCP).',
    ).toBeVisible();
    await expect(
      this.page.getByRole('button', { name: 'Email sign-in code' }),
      'FAIL: AuthKit password step — button "Email sign-in code" missing or renamed (verify LIVE UI / MCP).',
    ).toBeVisible();
  }

  /**
   * Banner after wrong password / unknown user (password step).
   * @param {string} [contextLabel]
   */
  async expectInvalidCredentialsBanner(contextLabel = 'AuthKit invalid credentials') {
    await this.expectAuthKitMessage(this.authKit.credentialsInvalid, contextLabel);
    await this.expectPasswordStepChromeVisible();
  }

  /**
   * Navigates to the login page.
   */
  async goto() {
    const LOGIN_URL = process.env.LOGIN_URL || 'https://stalwart-collection-11-staging.authkit.app/';
    Logger.step(`Navigating to login page: ${LOGIN_URL}`);
    await this.page.goto(LOGIN_URL, { waitUntil: 'load' });
  }

  /**
   * Fills email and clicks Continue. Does not assert password step.
   * @param {string} email
   */
  async continueFromEmailStep(email) {
    Logger.step('Email step: fill and Continue...');
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.emailInput.fill(email);
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      this.continueButton.click(),
    ]);
  }

  /**
   * Clicks Continue without waiting for navigation (e.g. HTML5 / client validation).
   * @param {string} email
   */
  async continueFromEmailStepNoNavigationWait(email) {
    Logger.step('Email step: fill and Continue (no nav wait)...');
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.emailInput.fill(email);
    await this.continueButton.click();
  }

  /**
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async isPasswordStepVisibleWithin(timeoutMs = 15000) {
    try {
      await this.passwordInput.waitFor({ state: 'visible', timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Assumes password field is visible. Submits password step once.
   * @param {string} password
   */
  async submitPasswordStep(password) {
    Logger.step('Password step: submit...');
    await this.passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  /**
   * Double-clicks Sign in (rapid submit / idempotency check).
   * @param {string} password
   */
  async submitPasswordStepDoubleClick(password) {
    Logger.step('Password step: double-click Sign in...');
    await this.passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.passwordInput.fill(password);
    await this.signInButton.dblclick();
  }

  /**
   * Submits email + password only (no org picker / dashboard assertion).
   * Use for negative-path or guard tests.
   * @param {string} email
   * @param {string} password
   */
  async submitCredentials(email, password) {
    Logger.step('Entering credentials (submit only)...');
    await this.continueFromEmailStep(email);
    await this.submitPasswordStep(password);
  }

  /**
   * Full happy-path login including org selection and dashboard URL.
   * @param {string} email
   * @param {string} password
   */
  async login(email, password) {
    Logger.step('Step 1: Entering Email...');
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.emailInput.fill(email);

    Logger.step('Step 2: Clicking Continue...');
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      this.continueButton.click()
    ]);

    Logger.step('Step 3: Waiting for password input...');
    await this.passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.passwordInput.fill(password);

    Logger.step('Step 4: Clicking Sign in...');
    // await Promise.all([
    //   this.page.waitForNavigation({ waitUntil: 'networkidle' }),
    //   this.signInButton.click()
    // ]);

    await this.signInButton.click();

    if (email !== 'admin_1771393239035@yopmail.com') {
      await this.page.waitForURL(/organization-selection/, { timeout: 30000 });
      Logger.step('Step 6: Verifying successful login...');
      await this.page.waitForTimeout(5000);
      await this.organizationSelect.click();
    }

    Logger.step('Step 6: Verifying successful login...');
    await this.page.waitForTimeout(25000);
    await expect(this.page).toHaveURL(process.env.DASHBOARD_URL || /financials\/capex/);
    Logger.success('✅ User successfully logged in and redirected to dashboard.');
  }

  /**
   * Checks if login error is visible.
   * @returns {Promise<boolean>}
   */
  async isLoginErrorVisible() {
    Logger.step('Checking for login error message...');
    return this.errorMessage.isVisible();
  }
}

module.exports = { LoginPage };
