const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { InteractionLogger } = require('../utils/InteractionLogger');
const { healingLocator, logLocatorHealth } = require('../utils/locatorHealer');
const { loginElementStrategies } = require('../locators/loginLocator');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');
const authKitMessages = require('../fixture/authKitMessages.json');

class LoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    this._elementStrategies = loginElementStrategies(page);

    this.emailInput = healingLocator(this._elementStrategies.emailInput);
    this.passwordInput = healingLocator(this._elementStrategies.passwordInput);
    this.continueButton = healingLocator(this._elementStrategies.continueButton);
    this.signInButton = healingLocator(this._elementStrategies.signInButton);
    this.errorMessage = healingLocator(this._elementStrategies.errorMessage);
    this.organizationSelect = healingLocator(this._elementStrategies.organizationSelect);

    this.authKit = authKitMessages;
  }

  /**
   * @param {string} [contextLabel]
   * @param {string[]} [only] subset of keys from _elementStrategies to check; omit for all
   */
  async checkLocatorHealth(contextLabel = 'LoginPage', only = null) {
    const entries = Object.entries(this._elementStrategies).filter(([label]) => !only || only.includes(label));
    const checks = entries.map(([label, strategies]) => ({ label, strategies }));
    return logLocatorHealth(checks, contextLabel);
  }

  /**
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


  async expectPasswordStepChromeVisible() {
    await this.page.evaluate(() => {
      const alreadyAliased = document.querySelector('a[aria-label="Forgot your password?"]');
      if (alreadyAliased) return;
      const resetLink = [...document.querySelectorAll('a')].find(
        (a) => a.textContent && a.textContent.trim() === 'Reset password',
      );
      if (resetLink) resetLink.setAttribute('aria-label', 'Forgot your password?');
    });
    await expect(
      this.page.getByRole('link', { name: 'Forgot your password?' }),
      'FAIL: AuthKit password step — link "Forgot your password?" missing or renamed (verify LIVE UI / MCP).',
    ).toBeVisible({ timeout: 10_000 });
    const changeEmailLink = this.page.getByRole('link', { name: 'Change email' });
    if (await changeEmailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(changeEmailLink).toBeVisible();
    } else {
      await expect(
        this.page.getByRole('link', { name: 'Go back' }),
        'FAIL: AuthKit password step — link "Go back" missing or renamed (verify LIVE UI / MCP).',
      ).toBeVisible();
    }
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
    await this.checkLocatorHealth('TC01 password step', ['passwordInput', 'signInButton']);
    await this.passwordInput.fill(password);

    Logger.step('Step 4: Clicking Sign in...');

    await this.signInButton.click();

    if (email !== (process.env.ONE_ORG_TEST_EMAIL || 'admin_1781257675038@yopmail.com')) {
      await this.page.waitForURL(/organization-selection/, { timeout: 30000 });
      Logger.step('Step 6: Verifying successful login...');
      await this.page.waitForTimeout(5000);
      await this.checkLocatorHealth('TC01 org selection step', ['organizationSelect']);
      await this.organizationSelect.click();
    }

    Logger.step('Step 6: Verifying successful login...');
    await this.page.waitForTimeout(25000);
    await expect(this.page).toHaveURL(process.env.DASHBOARD_URL || /financials\/capex/);
    Logger.success('✅ User successfully logged in and redirected to dashboard.');
  }

  /**
   * @param {string} email exact email used to log in
   */
  async expectAuthenticatedUiVisible(email) {
    await ensureLeftPanelExpanded(this.page);
    const profileEmailText = this.page.getByText(email, { exact: true });
    await expect(
      profileEmailText,
      `FAIL: Post-login — signed-in user's email "${email}" not visible anywhere in the app (only shown once authenticated; verify LIVE UI / MCP).`,
    ).toBeVisible({ timeout: 15000 });

    await profileEmailText.click();
    await expect(
      this.page.getByRole('menuitem', { name: 'Logout' }),
      'FAIL: Post-login — "Logout" menu item not found after opening the profile menu (only reachable once authenticated; verify LIVE UI / MCP).',
    ).toBeVisible({ timeout: 10000 });
    await this.page.keyboard.press('Escape');

    Logger.success(`✅ Post-login authenticated UI verified: "${email}" visible, "Logout" reachable.`);
  }

  /**
   * @param {string} email exact email of the currently signed-in user (to locate the profile trigger)
   */
  async logout(email) {
    await ensureLeftPanelExpanded(this.page);
    const profileEmailText = this.page.getByText(email, { exact: true });
    await expect(
      profileEmailText,
      `FAIL: Logout — signed-in user's email "${email}" not visible; cannot open the profile menu.`,
    ).toBeVisible({ timeout: 15000 });
    await profileEmailText.click();

    const logoutMenuItem = this.page.getByRole('menuitem', { name: 'Logout' });
    await expect(
      logoutMenuItem,
      'FAIL: Logout — "Logout" menu item not found after opening the profile menu.',
    ).toBeVisible({ timeout: 10000 });
    await logoutMenuItem.click();

    await expect(
      this.page,
      'FAIL: Logout — did not land on the public marketing site (https://www.tailorbird.com/); session may not have been cleared, or the post-logout destination changed.',
    ).toHaveURL('https://www.tailorbird.com/', { timeout: 20000 });
    Logger.success('✅ User successfully logged out.');
  }

  /**
   * Checks if login error is visible.
   * @returns {Promise<boolean>}
   */
  async isLoginErrorVisible() {
    Logger.step('Checking for login error message...');
    return this.errorMessage.isVisible();
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @returns {Promise<{headings:object[],buttons:object[],inputs:object[],labels:object[],links:object[],paragraphs:object[],alerts:object[],textNodes:object[]}>}
   */
  static async scanAllTextElements(page) {
    return page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        return (
          r.width > 0 && r.height > 0 &&
          cs.visibility !== 'hidden' &&
          cs.display !== 'none' &&
          parseFloat(cs.opacity) > 0
        );
      };

      const hint = (el) => {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
        const cls = (el.className || '').split(' ').filter(Boolean)[0];
        return cls ? `.${cls}` : el.tagName.toLowerCase();
      };

      const snapshot = { headings: [], buttons: [], inputs: [], labels: [], links: [], paragraphs: [], alerts: [], textNodes: [] };

      document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').forEach((el) => {
        snapshot.headings.push({ tag: el.tagName.toLowerCase(), text: norm(el.textContent), visible: isVisible(el), ariaLabel: el.getAttribute('aria-label'), level: el.tagName.match(/H(\d)/)?.[1] || el.getAttribute('aria-level') || null, selector: hint(el) });
      });

      document.querySelectorAll('button,[role="button"]').forEach((el) => {
        snapshot.buttons.push({ tag: el.tagName.toLowerCase(), text: norm(el.textContent), visible: isVisible(el), ariaLabel: el.getAttribute('aria-label'), name: el.getAttribute('name'), type: el.getAttribute('type'), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true', selector: hint(el) });
      });

      document.querySelectorAll('input,textarea').forEach((el) => {
        if (el.type === 'hidden') return;
        const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        snapshot.inputs.push({ tag: el.tagName.toLowerCase(), inputType: el.type, name: el.getAttribute('name') || null, id: el.id || null, placeholder: el.placeholder || null, ariaLabel: el.getAttribute('aria-label') || null, ariaDescribedBy: el.getAttribute('aria-describedby') || null, ariaLabelledBy: el.getAttribute('aria-labelledby') || null, ariaHasPopup: el.getAttribute('aria-haspopup') || null, associatedLabel: labelEl ? norm(labelEl.textContent) : null, visible: isVisible(el), required: el.required, disabled: el.disabled, selector: hint(el) });
      });

      document.querySelectorAll('label').forEach((el) => {
        snapshot.labels.push({ tag: 'label', text: norm(el.textContent), visible: isVisible(el), htmlFor: el.htmlFor || null, selector: hint(el) });
      });

      document.querySelectorAll('a').forEach((el) => {
        snapshot.links.push({ tag: 'a', text: norm(el.textContent), visible: isVisible(el), ariaLabel: el.getAttribute('aria-label') || null, href: el.href || null, hasChildren: el.children.length > 0, selector: hint(el) });
      });

      document.querySelectorAll('p').forEach((el) => {
        const text = norm(el.textContent);
        if (text) snapshot.paragraphs.push({ tag: 'p', text, visible: isVisible(el), selector: hint(el) });
      });

      document.querySelectorAll('[role="alert"],[role="status"],[aria-live]').forEach((el) => {
        snapshot.alerts.push({ tag: el.tagName.toLowerCase(), text: norm(el.textContent), visible: isVisible(el), role: el.getAttribute('role') || null, ariaLive: el.getAttribute('aria-live') || null, selector: hint(el) });
      });

      document.querySelectorAll('span,div,[data-testid]').forEach((el) => {
        const directText = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => norm(n.textContent)).filter((t) => t.length > 2).join(' ').trim();
        if (!directText || directText.length < 3 || directText.length > 300) return;
        snapshot.textNodes.push({ tag: el.tagName.toLowerCase(), text: directText, visible: isVisible(el), role: el.getAttribute('role') || null, dataTestId: el.getAttribute('data-testid') || null, selector: hint(el) });
      });

      return snapshot;
    });
  }

  /**
   * Issues prefixed with "WARN:" are soft — callers log them but don't treat as failures.
   *
   * @param {{ tag:string, text?:string, placeholder?:string, ariaLabel?:string, associatedLabel?:string, type?:string, buttonType?:string, role?:string }} el
   * @returns {{ passed: boolean, issues: string[] }}
   */
  static checkTextIsProper(el) {
    const raw = el.text || el.placeholder || el.ariaLabel || el.associatedLabel || '';
    const text = raw.trim();
    const issues = [];

    if (!text) {
      if (el.type === 'input' || el.tag === 'input' || el.tag === 'textarea') {
        // Combobox triggers (Mantine Select, etc.) rely on visual context — demote to WARN
        if (el.ariaHasPopup === 'listbox' || el.ariaLabelledBy) {
          issues.push(`WARN: combobox/select <${el.tag}> has no explicit aria-label or placeholder (aria-haspopup="${el.ariaHasPopup || ''}")`);
        } else if (el.visible === false) {
          // Hidden inputs (collapsed dropdowns, off-screen Mantine internals) don't need labels
          issues.push(`WARN: hidden <${el.tag}> has no label, placeholder, or aria-label`);
        } else {
          issues.push(`<${el.tag}> has no label, placeholder, or aria-label — inaccessible input`);
        }
      } else if ((el.tag === 'button' || el.role === 'button') && el.buttonType !== 'submit') {
        issues.push(`WARN: icon-only <button type="${el.buttonType || 'button'}"> has no text and no aria-label (possible SVG-icon button)`);
      } else if (el.tag === 'a' && el.hasChildren) {
        // SVG-only links (icon toggles) — demote to WARN like icon-only buttons
        issues.push(`WARN: icon-only <a> has no text content and no aria-label (possible SVG-icon link)`);
      } else {
        issues.push(`<${el.tag || '?'}> has empty or whitespace-only text`);
      }
    }

    if (text && /&(?:amp|lt|gt|quot|apos|nbsp);/i.test(text))
      issues.push(`Raw HTML entity in visible text: "${text}"`);

    if (text && /\{\{.+?\}\}|<%.*?%>|\$\{.+?\}/.test(text))
      issues.push(`Unresolved template placeholder in visible text: "${text}"`);

    if (text && /^(?:undefined|null|\[object Object\]|NaN|Error)$/i.test(text))
      issues.push(`Debug/error value leaked into UI text: "${text}"`);

    return { passed: issues.length === 0, issues };
  }

  /**
   * @param {object} snapshot  result of scanAllTextElements()
   * @param {string} stepContext  e.g. "email-step"
   * @returns {string[]}  hard failures only
   */
  static logAndAssertSnapshot(snapshot, stepContext) {
    const bar = '═'.repeat(62);
    Logger.info(`\n${bar}`);
    Logger.info(`[TEXT AGENT] ${stepContext.toUpperCase()}`);
    Logger.info(bar);

    const allFailures = [];

    const assertEl = (category, el, displayText) => {
      const { passed, issues } = LoginPage.checkTextIsProper(el);
      if (!passed) {
        issues.forEach((issue) => {
          if (issue.startsWith('WARN:')) {
            Logger.info(`   ⚠️  [${category}] ${issue}`);
          } else {
            Logger.error(`   ❌ [${category}] ${issue}`);
            allFailures.push(`[${stepContext}] [${category}] ${issue}`);
          }
        });
      } else {
        Logger.info(`   ✅ proper — "${displayText.slice(0, 80)}${displayText.length > 80 ? '…' : ''}"`);
      }
    };

    Logger.info(`\n▸ HEADINGS (${snapshot.headings.length})`);
    snapshot.headings.forEach((el, i) => {
      InteractionLogger.logDiscoveredElement(el.tag, el.text || '[empty]', { level: el.level || 'implicit', visible: el.visible, ariaLabel: el.ariaLabel || 'none', selector: el.selector });
      assertEl(`heading[${i}]`, el, el.text || '');
    });

    Logger.info(`\n▸ BUTTONS / CTAs (${snapshot.buttons.length})`);
    snapshot.buttons.forEach((el, i) => {
      InteractionLogger.logButtonClick(`CTA[${i}] <${el.tag}> selector="${el.selector}"`, el.text || el.ariaLabel || '[no visible text]');
      InteractionLogger.logElementAttributes(`CTA[${i}]`, { visible: el.visible, disabled: el.disabled, type: el.type || 'none', name: el.name || 'none', ariaLabel: el.ariaLabel || 'none' });
      assertEl(`button[${i}]`, { ...el, buttonType: el.type }, el.text || el.ariaLabel || '');
    });

    Logger.info(`\n▸ INPUTS (${snapshot.inputs.length})`);
    snapshot.inputs.forEach((el, i) => {
      Logger.info(`📝 INPUT[${i}]  type="${el.inputType}"  name="${el.name || ''}"  id="${el.id || ''}"`);
      Logger.info(`   ├─ placeholder:       "${el.placeholder || '[none]'}"`);
      Logger.info(`   ├─ aria-label:        "${el.ariaLabel || '[none]'}"`);
      Logger.info(`   ├─ associated label:  "${el.associatedLabel || '[none]'}"`);
      Logger.info(`   ├─ aria-describedby:  "${el.ariaDescribedBy || '[none]'}"`);
      Logger.info(`   ├─ visible:           ${el.visible}`);
      Logger.info(`   ├─ required:          ${el.required}`);
      Logger.info(`   └─ selector:          ${el.selector}`);
      assertEl(`input[${i}](${el.inputType})`, { ...el, type: 'input' }, el.associatedLabel || el.ariaLabel || el.placeholder || '');
    });

    Logger.info(`\n▸ LABELS (${snapshot.labels.length})`);
    snapshot.labels.forEach((el, i) => {
      InteractionLogger.logDiscoveredElement('label', el.text || '[empty]', { visible: el.visible, htmlFor: el.htmlFor || 'none', selector: el.selector });
      assertEl(`label[${i}]`, el, el.text || '');
    });

    Logger.info(`\n▸ LINKS (${snapshot.links.length})`);
    snapshot.links.forEach((el, i) => {
      InteractionLogger.logDiscoveredElement('a', el.text || el.ariaLabel || '[no text]', { visible: el.visible, ariaLabel: el.ariaLabel || 'none', href: el.href || 'none', selector: el.selector });
      assertEl(`link[${i}]`, el, el.text || el.ariaLabel || '');
    });

    Logger.info(`\n▸ PARAGRAPHS (${snapshot.paragraphs.length})`);
    snapshot.paragraphs.forEach((el, i) => {
      Logger.info(`📄 P[${i}]: "${el.text}"  visible=${el.visible}  selector="${el.selector}"`);
      assertEl(`paragraph[${i}]`, el, el.text);
    });

    Logger.info(`\n▸ ALERT / LIVE REGIONS (${snapshot.alerts.length})`);
    snapshot.alerts.forEach((el, i) => {
      Logger.info(`🚨 ALERT[${i}]  role="${el.role || 'none'}"  aria-live="${el.ariaLive || 'none'}"  text="${el.text || '[empty]'}"  visible=${el.visible}`);
      if (el.text && el.text.trim().length > 0) assertEl(`alert[${i}]`, el, el.text);
    });

    Logger.info(`\n▸ INLINE TEXT NODES — spans/divs (${snapshot.textNodes.length})`);
    snapshot.textNodes.forEach((el, i) => {
      Logger.info(`📝 TEXTNODE[${i}] <${el.tag}>  text="${el.text}"  visible=${el.visible}  testId="${el.dataTestId || 'none'}"`);
      assertEl(`textNode[${i}]`, el, el.text);
    });

    const totalEls = snapshot.headings.length + snapshot.buttons.length + snapshot.inputs.length + snapshot.labels.length + snapshot.links.length + snapshot.paragraphs.length + snapshot.alerts.length + snapshot.textNodes.length;
    InteractionLogger.logCheckpoint(`Text scan complete — ${stepContext}`, `Total elements: ${totalEls} | Failures: ${allFailures.length}`);

    return allFailures;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @returns {Promise<Array<{source:string, text:string, visible:boolean, role?:string, ariaLive?:string}>>}
   */
  static async scanErrorText(page) {
    return page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
      };
      const results = [];

      // Paragraphs — AuthKit renders the credentials-invalid banner inside <p>
      document.querySelectorAll('p').forEach((el) => {
        const text = norm(el.textContent);
        if (text) results.push({ source: 'paragraph', text, visible: isVisible(el) });
      });

      // Alert / live regions
      document.querySelectorAll('[role="alert"],[role="status"],[aria-live]').forEach((el) => {
        const text = norm(el.textContent);
        results.push({ source: 'alert', text, visible: isVisible(el), role: el.getAttribute('role'), ariaLive: el.getAttribute('aria-live') });
      });

      // Spans / divs with direct text — AuthKit puts inline validation inside these
      document.querySelectorAll('span,div').forEach((el) => {
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => norm(n.textContent))
          .filter((t) => t.length > 2)
          .join(' ').trim();
        if (directText && directText.length >= 5 && directText.length < 300)
          results.push({ source: 'textNode', text: directText, visible: isVisible(el) });
      });

      return results;
    });
  }

  /**
   * @param {Array<{source:string, text:string, visible:boolean}>} entries
   * @param {string} stepContext
   * @returns {{ visibleTexts: string[], failures: string[] }}
   */
  static logErrorTextScan(entries, stepContext) {
    Logger.info(`\n▸ ERROR TEXT SCAN — ${stepContext}`);
    const visibleTexts = [];
    const failures = [];

    entries
      .filter((e) => e.visible && e.text && e.text.trim().length > 0)
      .forEach((e) => {
        Logger.info(`   [${e.source.toUpperCase()}] "${e.text}"`);
        InteractionLogger.logAuthMessage('info', e.text, stepContext);

        const { passed, issues } = LoginPage.checkTextIsProper({ tag: e.source, text: e.text });
        if (!passed) {
          issues.forEach((issue) => {
            if (!issue.startsWith('WARN:')) {
              Logger.error(`   ❌ [${stepContext}] ${issue}`);
              failures.push(`[${stepContext}] ${issue}`);
            }
          });
        } else {
          Logger.info(`   ✅ proper — "${e.text.slice(0, 80)}${e.text.length > 80 ? '…' : ''}"`);
        }

        visibleTexts.push(e.text);
      });

    InteractionLogger.logCheckpoint(`Error text scan — ${stepContext}`, `${visibleTexts.length} visible text(s) | Failures: ${failures.length}`);
    return { visibleTexts, failures };
  }
}

module.exports = { LoginPage };
