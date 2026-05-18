require('dotenv').config();

const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/loginPage');
const { Logger } = require('../utils/logger');

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
