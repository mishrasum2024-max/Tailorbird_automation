require('dotenv').config();

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/loginPage');
const { Logger } = require('../utils/logger');
const { InteractionLogger } = require('../utils/InteractionLogger');
const authKitMessages = require('../fixture/authKitMessages.json');

/**
 * Login UI visual regression (layout breakpoints, not pixel-perfect text).
 * Baseline PNGs: repo `committed_ui_snapshots/` (see playwright.config.js pathTemplate).
 */
const LOGIN_SCREENSHOT_OPTIONS = {
  fullPage: true,
  animations: 'disabled',
  // Headed + hosted auth UI can shift slightly between runs.
  maxDiffPixels: 9000,
  maxDiffPixelRatio: 0.08,
};

test.describe('Tailorbird Login Flow', () => {
  let context;
  let page;
  let login;

  test('TC01 @sanity @mandatory @login User should be able to submit credentials successfully', async ({ browser }) => {
    Logger.info('Starting Tailorbird login test...');

    context = await browser.newContext();
    page = await context.newPage();
    login = new LoginPage(page);

    await test.step('Go to login page', async () => {
      Logger.step('Navigating to login URL...');
      await page.goto(process.env.LOGIN_URL, { waitUntil: 'load' });
    });

    await test.step('Perform login', async () => {
      Logger.step('Using credentials from .env...');
      await login.login(process.env.TEST_EMAIL, process.env.TEST_PASSWORD);
    });

    await test.step('Store Session', async () => {
      await page.context().storageState({ path: 'sessionState.json' });
      Logger.success('💾 Session stored successfully at sessionState.json');
    });

    await test.step('Close Context', async () => {
      await context.close();
    });
  });

  test('TC02 @sanity User should be able to navigate to dashboard successfully', async ({ browser }) => {
    Logger.info('Verifying dashboard navigation after login...');

    context = await browser.newContext({ storageState: 'sessionState.json' });
    page = await context.newPage();
    login = new LoginPage(page);

    await test.step('Navigate to dashboard URL', async () => {
      Logger.step('Navigating to dashboard using stored session...');
      await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
      await expect(page).toHaveURL(process.env.DASHBOARD_URL);
      Logger.success('✅ User navigated to dashboard successfully!');
    });

    await test.step('Close Context', async () => {
      await context.close();
    });
  });

  test('TC @sanity @login Login with another user successfully', async ({ browser }) => {
    Logger.info('Starting Tailorbird login test...');

    context = await browser.newContext();
    page = await context.newPage();
    login = new LoginPage(page);

    await test.step('Go to login page', async () => {
      Logger.step('Navigating to login URL...');
      await page.goto(process.env.LOGIN_URL, { waitUntil: 'load' });
    });

    await test.step('Perform login', async () => {
      Logger.step('Using credentials from .env...');
      await login.login(process.env.NEW_TEST_EMAIL, process.env.NEW_TEST_PASSWORD);
    });

    await test.step('Store Session', async () => {
      await page.context().storageState({ path: 'OtherSessionState.json' });
      Logger.success('💾 Session stored successfully at OtherSessionState.json');
    });

    await test.step('Close Context', async () => {
      await context.close();
    });
  });
});

/**
 * Single consolidated regression run: former TC01b, TC03, TC01-neg/edge/vis/bench cases.
 * Each internal step uses a fresh context. Assertions use explicit failure messages for UI/copy drift.
 */
test.describe('Regression — login (consolidated)', () => {
  test('TC01-regression @regression @login Full login regression — negatives, edges, benchmarks, snapshots', async ({
    browser,
  }, testInfo) => {
  testInfo.setTimeout(600_000);
  const dashboardUrl = process.env.DASHBOARD_URL;
  const loginUrl = process.env.LOGIN_URL;

  await test.step('AuthKit email-step benchmark (heading, Email field, Continue)', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(loginUrl, { waitUntil: 'load' });
    await expect(
      page.getByRole('heading', { name: 'Sign in' }),
      'FAIL: UI benchmark — expected visible heading with accessible name exactly "Sign in" (AuthKit copy or role changed).',
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('textbox', { name: 'Email' }),
      'FAIL: UI benchmark — expected visible textbox with accessible name "Email"',
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Continue(\s|$)/ }),
      'FAIL: UI benchmark — primary submit must be named like "Continue" (MCP 2026-05-04: "Continue Last used"). Rename breaks login.',
    ).toBeVisible();
    await context.close();
  });

  await test.step('TC01b: Invalid credentials must not land on dashboard + invalid banner text', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.submitCredentials('tb_automation_invalid@invalid.local', 'NotARealPassword_99999');
    await expect(page, 'FAIL: Invalid credentials must not reach dashboard URL').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01b invalid creds');
    await context.close();
  });

  await test.step('TC03: Dashboard URL without stored session is not logged-in app home', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(dashboardUrl, { waitUntil: 'load', timeout: 60_000 });
    await expect(page, 'FAIL: Unauthenticated visit to dashboard should redirect away from dashboard URL').not.toHaveURL(
      dashboardUrl,
      { timeout: 45_000 },
    );
    await context.close();
  });

  await test.step('TC01-neg-01: Valid email with wrong password — banner + no dashboard', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.submitCredentials(process.env.TEST_EMAIL, '__WrongPassword_regression_999__');
    await expect(page, 'FAIL: Wrong password must not navigate to dashboard').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01-neg-01 wrong password');
    await context.close();
  });

  await test.step('TC01-neg-02: Empty email — stay on email step, required message', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStepNoNavigationWait('');
    const advanced = await loginPage.isPasswordStepVisibleWithin(4000);
    expect(advanced, 'FAIL: Continue with empty email must not show password field').toBe(false);
    await expect(loginPage.emailInput, 'FAIL: Email field should remain visible after empty submit').toBeVisible();
    await loginPage.expectAuthKitMessage(loginPage.authKit.emailRequired, 'TC01-neg-02 empty email');
    await context.close();
  });

  await test.step('TC01-neg-03: Empty password — no auth, password required message', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStep(process.env.TEST_EMAIL);
    await expect(
      page.getByRole('button', { name: 'Sign in' }),
      'FAIL: Password step — expected visible button with accessible name "Sign in" (label or AuthKit flow changed).',
    ).toBeVisible({ timeout: 15_000 });
    await loginPage.passwordInput.fill('');
    await loginPage.signInButton.click();
    await expect(page, 'FAIL: Empty password must not reach dashboard').not.toHaveURL(dashboardUrl, { timeout: 20_000 });
    await loginPage.expectAuthKitMessage(loginPage.authKit.passwordRequired, 'TC01-neg-03 empty password');
    await loginPage.expectPasswordStepChromeVisible();
    await context.close();
  });

  await test.step('TC01-neg-04: Whitespace-only email — no password step, invalid email message', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStepNoNavigationWait('   \t  \u00a0  ');
    const advanced = await loginPage.isPasswordStepVisibleWithin(4000);
    expect(advanced, 'FAIL: Whitespace-only email must not advance to password step').toBe(false);
    await expect(loginPage.emailInput, 'FAIL: Email field should stay visible').toBeVisible();
    await loginPage.expectAuthKitMessage(loginPage.authKit.emailInvalid, 'TC01-neg-04 whitespace email');
    await context.close();
  });

  await test.step('TC01-neg-05: Whitespace-only password — rejected, invalid credentials banner', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStep(process.env.TEST_EMAIL);
    await loginPage.submitPasswordStep('   \u00a0  ');
    await expect(page, 'FAIL: Whitespace-only password must not reach dashboard').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01-neg-05 whitespace password');
    await context.close();
  });

  await test.step('TC01-neg-06: Malformed email — blocked or rejected with expected copy', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStepNoNavigationWait('not-an-email');
    const reachedPassword = await loginPage.isPasswordStepVisibleWithin(12_000);
    if (reachedPassword) {
      await loginPage.submitPasswordStep('DoesNotMatter_Wrong_1!');
      await expect(page, 'FAIL: Malformed email path must not reach dashboard').not.toHaveURL(dashboardUrl, {
        timeout: 25_000,
      });
      await loginPage.expectInvalidCredentialsBanner('TC01-neg-06 malformed email → password');
    } else {
      await expect(page, 'FAIL: Malformed email must not reach dashboard').not.toHaveURL(dashboardUrl, {
        timeout: 25_000,
      });
      await loginPage.expectAuthKitMessage(loginPage.authKit.emailInvalid, 'TC01-neg-06 malformed email inline');
    }
    await context.close();
  });

  await test.step('TC01-neg-07: Extremely long email/password — blocked or invalid credentials', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    const longEmail = `${'a'.repeat(180)}@t.co`;
    const longPassword = `z`.repeat(3000);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStepNoNavigationWait(longEmail);
    const reachedPassword = await loginPage.isPasswordStepVisibleWithin(8000);
    if (reachedPassword) {
      await loginPage.submitPasswordStep(longPassword);
      await expect(page, 'FAIL: Long credentials path must not reach dashboard').not.toHaveURL(dashboardUrl, {
        timeout: 25_000,
      });
      await loginPage.expectInvalidCredentialsBanner('TC01-neg-07 long credentials');
    } else {
      await expect(page, 'FAIL: Long email must not reach dashboard').not.toHaveURL(dashboardUrl, { timeout: 25_000 });
      await loginPage.expectAuthKitMessage(loginPage.authKit.emailInvalid, 'TC01-neg-07 long email inline');
    }
    await context.close();
  });

  await test.step('TC01-neg-08: Unicode wrong password — invalid credentials banner', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.submitCredentials(process.env.TEST_EMAIL, 'wrong_パスw_🔑_test');
    await expect(page, 'FAIL: Unicode wrong password must not reach dashboard').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01-neg-08 unicode password');
    await context.close();
  });

  await test.step('TC01-neg-09: Injection-style strings — no dashboard, expected validation or banner', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    const injectionEmail = `"><img src=x onerror=alert(1)>@invalid.local`;
    const injectionPassword = `'+OR+'1'='1'--`;
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStepNoNavigationWait(injectionEmail);
    const reachedPassword = await loginPage.isPasswordStepVisibleWithin(10_000);
    if (reachedPassword) {
      await loginPage.submitPasswordStep(injectionPassword);
      await expect(page, 'FAIL: Injection path must not reach dashboard').not.toHaveURL(dashboardUrl, {
        timeout: 25_000,
      });
      await loginPage.expectInvalidCredentialsBanner('TC01-neg-09 injection → password');
    } else {
      await expect(page, 'FAIL: Injection email must not reach dashboard').not.toHaveURL(dashboardUrl, {
        timeout: 25_000,
      });
      await loginPage.expectAuthKitMessage(loginPage.authKit.emailInvalid, 'TC01-neg-09 injection inline');
    }
    await context.close();
  });

  await test.step('TC01-edge-01: Double-click Sign in with bad password — still rejected', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStep(process.env.TEST_EMAIL);
    await loginPage.submitPasswordStepDoubleClick('DoubleClickWrong_999');
    await expect(page, 'FAIL: Double-click submit must not authenticate with bad password').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01-edge-01 double-click');
    await context.close();
  });

  await test.step('TC01-edge-02: Browser back from password returns to email step', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.continueFromEmailStep(process.env.TEST_EMAIL);
    await expect(loginPage.passwordInput, 'FAIL: Password step should be visible before back').toBeVisible();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(loginPage.emailInput, 'FAIL: After back, email field should be visible again').toBeVisible({
      timeout: 15_000,
    });
    await expect(loginPage.passwordInput, 'FAIL: After back, password field should be hidden').not.toBeVisible();
    await context.close();
  });

  await test.step('TC01-edge-03: Padded email with wrong password — invalid credentials banner', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    const paddedEmail = `\t ${process.env.TEST_EMAIL} \n`;
    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.submitCredentials(paddedEmail, '__PaddedEmailWrongPass_777__');
    await expect(page, 'FAIL: Padded email wrong password must not reach dashboard').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01-edge-03 padded email');
    await context.close();
  });

  await test.step('TC01-vis-01: Visual snapshots — email, password, error states', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 790 },
    });
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    const maskSelectors = [page.locator('input[type="email"]'), page.locator('input[type="password"]')];

    await page.goto(loginUrl, { waitUntil: 'load' });
    await loginPage.emailInput.waitFor({ state: 'visible', timeout: 10_000 });

    await expect(page, 'FAIL: Visual baseline — email step screenshot mismatch (layout/branding changed)').toHaveScreenshot(
      'login-visual-01-email-step.png',
      {
        ...LOGIN_SCREENSHOT_OPTIONS,
        mask: maskSelectors,
      },
    );

    await loginPage.continueFromEmailStep(process.env.TEST_EMAIL);
    await loginPage.passwordInput.waitFor({ state: 'visible', timeout: 15_000 });

    await expect(
      page,
      'FAIL: Visual baseline — password step screenshot mismatch (layout/branding changed)',
    ).toHaveScreenshot('login-visual-02-password-step.png', {
      ...LOGIN_SCREENSHOT_OPTIONS,
      mask: maskSelectors,
    });

    await loginPage.submitPasswordStep('VisualSnapshotWrong_000');
    await expect(page, 'FAIL: After bad sign-in must not reach dashboard').not.toHaveURL(dashboardUrl, {
      timeout: 25_000,
    });
    await loginPage.expectInvalidCredentialsBanner('TC01-vis-01 after bad sign-in');

    await expect(
      page,
      'FAIL: Visual baseline — post-error screenshot mismatch (error UI/copy changed)',
    ).toHaveScreenshot('login-visual-03-after-failed-signin.png', {
      ...LOGIN_SCREENSHOT_OPTIONS,
      mask: maskSelectors,
    });

    await expect(page, 'FAIL: Error state must still not be dashboard').not.toHaveURL(dashboardUrl);
    await context.close();
  });
  });
});

// ─── Text Agent ───────────────────────────────────────────────────────────────
/**
 * Text Agent — one test, one browser context, sequential state machine.
 *
 * Full scan  (LoginPage.scanAllTextElements + logAndAssertSnapshot) runs ONCE
 * per genuine page-state change: email step and password step.
 *
 * Targeted error scan (LoginPage.scanErrorText + logErrorTextScan) runs for
 * each validation trigger — only the volatile regions (paragraphs, alerts,
 * inline text nodes) are fetched so the static chrome is never re-logged.
 *
 * Flow:
 *   email-step (full) → empty-email-err → malformed-email-err
 *   → password-step (full) → empty-pwd-err → wrong-pwd-err
 */
test.describe('TC01 Login — Text Agent (live MCP browser scan)', () => {
  test.setTimeout(300_000);

  const loginUrl = process.env.LOGIN_URL;
  const testEmail = process.env.TEST_EMAIL;

  test('TEXT-01 @login Full login text agent — email step, password step, all error states', async ({ browser }) => {
    Logger.info('[TEXT AGENT] Starting full login text scan — one context, sequential states');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // ── STATE 1: Email step — FULL scan ──────────────────────────────────────
    await test.step('STATE 1 | Email step — full scan of all text elements', async () => {
      InteractionLogger.logNavigation(loginUrl, 'Login — email step');
      await page.goto(loginUrl, { waitUntil: 'load' });
      await page.locator('input[type="email"], input[name="email"]').waitFor({ state: 'visible', timeout: 15_000 });

      const snapshot = await LoginPage.scanAllTextElements(page);
      const failures = LoginPage.logAndAssertSnapshot(snapshot, 'email-step');

      expect(snapshot.headings.length, `FAIL [email-step]: No heading found. Fetched: ${JSON.stringify(snapshot.headings)}`).toBeGreaterThan(0);
      expect(snapshot.headings.every((h) => h.text && h.text.trim().length > 0), `FAIL [email-step]: Heading has empty text. Fetched: ${JSON.stringify(snapshot.headings)}`).toBe(true);

      snapshot.buttons.filter((b) => b.visible).forEach((btn, i) => {
        const hasText = (btn.text && btn.text.trim().length > 0) || (btn.ariaLabel && btn.ariaLabel.trim().length > 0);
        if (!hasText && btn.type !== 'submit') Logger.info(`   ⚠️  Visible button[${i}] is icon-only (type="${btn.type || 'button'}") — warning only.`);
        else expect(hasText, `FAIL [email-step]: Submit button[${i}] has no CTA text. Button: ${JSON.stringify(btn)}`).toBe(true);
      });
      expect(snapshot.buttons.filter((b) => b.visible).length, `FAIL [email-step]: No visible buttons. All: ${JSON.stringify(snapshot.buttons)}`).toBeGreaterThan(0);

      const visibleInputs = snapshot.inputs.filter((inp) => inp.visible);
      expect(visibleInputs.length, `FAIL [email-step]: No visible inputs. All: ${JSON.stringify(snapshot.inputs)}`).toBeGreaterThan(0);
      visibleInputs.forEach((inp, i) => expect(inp.placeholder || inp.ariaLabel || inp.associatedLabel, `FAIL [email-step]: Input[${i}] has no accessible name. Input: ${JSON.stringify(inp)}`).toBeTruthy());

      expect(failures, `FAIL [email-step]: ${failures.length} properness issue(s):\n${failures.join('\n')}`).toHaveLength(0);
    });

    // ── ERROR 1: Empty email — TARGETED error scan ────────────────────────────
    await test.step('ERROR 1 | Empty email — targeted error text scan', async () => {
      InteractionLogger.logFormFill('Email input', '', false);
      const submitBtn = page.locator('button[type="submit"]').first();
      InteractionLogger.logButtonClick('Submit (empty email)', (await submitBtn.textContent().catch(() => '[unknown]')).trim());
      await submitBtn.click();
      await page.waitForTimeout(2_000);

      const entries = await LoginPage.scanErrorText(page);
      const { visibleTexts, failures } = LoginPage.logErrorTextScan(entries, 'error-empty-email');

      const expectedMsg = authKitMessages.emailRequired;
      const found = visibleTexts.some((t) => t === expectedMsg || t.includes(expectedMsg));
      InteractionLogger.logAuthMessage(found ? 'success' : 'error', expectedMsg, 'error-empty-email');
      InteractionLogger.logUIDrift('Empty-email validation message', expectedMsg, visibleTexts.join(' | '), found);

      expect(found, `FAIL [error-empty-email]: Expected "${expectedMsg}" (fixture/authKitMessages.json). Visible: ${JSON.stringify(visibleTexts)}.`).toBe(true);
      expect(failures, `FAIL [error-empty-email]: ${failures.length} properness issue(s):\n${failures.join('\n')}`).toHaveLength(0);
    });

    // ── ERROR 2: Malformed email — TARGETED error scan ────────────────────────
    await test.step('ERROR 2 | Malformed email — targeted error text scan', async () => {
      InteractionLogger.logFormFill('Email input', 'not-an-email', false);
      await page.locator('input[type="email"], input[name="email"]').first().fill('not-an-email');
      const submitBtn = page.locator('button[type="submit"]').first();
      InteractionLogger.logButtonClick('Submit (malformed email)', (await submitBtn.textContent().catch(() => '[unknown]')).trim());
      await submitBtn.click();
      await page.waitForTimeout(2_500);

      const entries = await LoginPage.scanErrorText(page);
      const { visibleTexts, failures } = LoginPage.logErrorTextScan(entries, 'error-malformed-email');

      const expectedInline = authKitMessages.emailInvalid;
      const expectedBanner = authKitMessages.credentialsInvalid;
      const foundInline = visibleTexts.some((t) => t === expectedInline || t.includes(expectedInline));
      const foundBanner = visibleTexts.some((t) => t === expectedBanner || t.includes(expectedBanner));
      const found = foundInline || foundBanner;
      InteractionLogger.logAuthMessage(found ? 'success' : 'error', foundInline ? expectedInline : expectedBanner, 'error-malformed-email');
      InteractionLogger.logUIDrift('Malformed-email message', `"${expectedInline}" OR "${expectedBanner}"`, visibleTexts.join(' | '), found);

      expect(found, `FAIL [error-malformed-email]: Expected "${expectedInline}" or "${expectedBanner}". Visible: ${JSON.stringify(visibleTexts)}.`).toBe(true);
      expect(failures, `FAIL [error-malformed-email]: ${failures.length} properness issue(s):\n${failures.join('\n')}`).toHaveLength(0);
    });

    // ── STATE 2: Password step — FULL scan ────────────────────────────────────
    await test.step('STATE 2 | Password step — full scan of all text elements', async () => {
      InteractionLogger.logFormFill('Email input', testEmail, false);
      await page.locator('input[type="email"], input[name="email"]').first().fill(testEmail);
      const submitBtn = page.locator('button[type="submit"]').first();
      InteractionLogger.logButtonClick('Submit (valid email)', (await submitBtn.textContent().catch(() => '[unknown]')).trim());
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), submitBtn.click()]);
      await page.locator('input[type="password"], input[name="password"]').waitFor({ state: 'visible', timeout: 15_000 });

      const snapshot = await LoginPage.scanAllTextElements(page);
      const failures = LoginPage.logAndAssertSnapshot(snapshot, 'password-step');

      expect(snapshot.headings.length, `FAIL [password-step]: No heading. Fetched: ${JSON.stringify(snapshot.headings)}`).toBeGreaterThan(0);

      const pwdInputs = snapshot.inputs.filter((inp) => inp.inputType === 'password' && inp.visible);
      expect(pwdInputs.length, `FAIL [password-step]: No visible password input. Inputs: ${JSON.stringify(snapshot.inputs)}`).toBeGreaterThan(0);
      pwdInputs.forEach((inp, i) => expect(inp.placeholder || inp.ariaLabel || inp.associatedLabel, `FAIL [password-step]: Password input[${i}] has no accessible name. Input: ${JSON.stringify(inp)}`).toBeTruthy());

      const visibleLinks = snapshot.links.filter((l) => l.visible && l.text && l.text.trim().length > 0);
      expect(visibleLinks.length, `FAIL [password-step]: No visible non-empty links. All: ${JSON.stringify(snapshot.links)}`).toBeGreaterThan(0);

      expect(failures, `FAIL [password-step]: ${failures.length} properness issue(s):\n${failures.join('\n')}`).toHaveLength(0);
    });

    // ── ERROR 3: Empty password — TARGETED error scan ─────────────────────────
    await test.step('ERROR 3 | Empty password — targeted error text scan', async () => {
      InteractionLogger.logFormFill('Password input', '', true);
      await page.locator('input[type="password"], input[name="password"]').first().fill('');
      const signInBtn = page.locator('button[type="submit"]').first();
      InteractionLogger.logButtonClick('Sign-in (empty password)', (await signInBtn.textContent().catch(() => '[unknown]')).trim());
      await signInBtn.click();
      await page.waitForTimeout(2_000);

      const entries = await LoginPage.scanErrorText(page);
      const { visibleTexts, failures } = LoginPage.logErrorTextScan(entries, 'error-empty-password');

      const expectedMsg = authKitMessages.passwordRequired;
      const found = visibleTexts.some((t) => t === expectedMsg || t.includes(expectedMsg));
      InteractionLogger.logAuthMessage(found ? 'success' : 'error', expectedMsg, 'error-empty-password');
      InteractionLogger.logUIDrift('Empty-password validation message', expectedMsg, visibleTexts.join(' | '), found);

      expect(found, `FAIL [error-empty-password]: Expected "${expectedMsg}" (MCP-verified). Visible: ${JSON.stringify(visibleTexts)}.`).toBe(true);
      expect(failures, `FAIL [error-empty-password]: ${failures.length} properness issue(s):\n${failures.join('\n')}`).toHaveLength(0);
    });

    // ── ERROR 4: Wrong password — TARGETED error scan ─────────────────────────
    await test.step('ERROR 4 | Wrong password — targeted error text scan (credentials banner)', async () => {
      InteractionLogger.logFormFill('Password input', '__TextAgent_WrongPass_9999__', true);
      await page.locator('input[type="password"], input[name="password"]').first().fill('__TextAgent_WrongPass_9999__');
      const signInBtn = page.locator('button[type="submit"]').first();
      InteractionLogger.logButtonClick('Sign-in (wrong password)', (await signInBtn.textContent().catch(() => '[unknown]')).trim());
      await signInBtn.click();
      await page.waitForTimeout(4_000);

      const entries = await LoginPage.scanErrorText(page);
      const { visibleTexts, failures } = LoginPage.logErrorTextScan(entries, 'error-wrong-password');

      const expectedBanner = authKitMessages.credentialsInvalid;
      const foundBanner = visibleTexts.some((t) => t === expectedBanner || t.includes(expectedBanner));
      InteractionLogger.logAuthMessage(foundBanner ? 'success' : 'error', expectedBanner, 'error-wrong-password');
      InteractionLogger.logUIDrift('Credentials-invalid banner', expectedBanner, visibleTexts.join(' | '), foundBanner);

      expect(foundBanner, `FAIL [error-wrong-password]: Expected "${expectedBanner}" (MCP-verified). Visible: ${JSON.stringify(visibleTexts)}.`).toBe(true);
      expect(failures, `FAIL [error-wrong-password]: ${failures.length} properness issue(s):\n${failures.join('\n')}`).toHaveLength(0);
    });

    await ctx.close();
  });
});
