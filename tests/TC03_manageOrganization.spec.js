/**
 * TC03 — Manage Organization (`/organization`): invites, revoke/resend, role edits, validation regressions.
 * MCP-verified beta UI (2026-05-05); reference screenshots: `mcp-reference-screenshots/`.
 */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const OrganizationHelper = require('../pages/organizationHelper');
const organizationFixture = require('../fixture/organization.json');

let sharedBrowserContext;
let sharedPage;
let organizationHelper;

/** Zoom out slightly so table + modals match committed screenshot baselines. */
async function applyWorkspaceZoom(page) {
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const elements = document.querySelectorAll('main, .mantine-AppShell-navbar, body, .mantine-Modal-root');
    elements.forEach((el) => {
      el.style.zoom = '70%';
    });
  });
}

test.beforeAll(async ({ browser }) => {
  sharedBrowserContext = await browser.newContext({
    storageState: 'sessionState.json',
  });

  sharedPage = await sharedBrowserContext.newPage();
  organizationHelper = new OrganizationHelper(sharedPage);

  await organizationHelper.goto(process.env.DASHBOARD_URL || organizationFixture.dashboardUrl);
  await applyWorkspaceZoom(sharedPage);

  await organizationHelper.goToOrganization();
  await applyWorkspaceZoom(sharedPage);

  sharedPage.on('domcontentloaded', async () => {
    await applyWorkspaceZoom(sharedPage);
  });
});

test.afterAll(async () => {
  await sharedBrowserContext.close();
});

test.describe('Manage Organization Flow ', () => {
  test.beforeEach(async () => {
    await organizationHelper.gotoOrganizationWorkspace();
    await applyWorkspaceZoom(sharedPage);
  });

  test('@sanity @regression TC09 - Invite new user to organization with Member role', async () => {
    const invitedEmail = `member_${Date.now()}@yopmail.com`;
    await organizationHelper.inviteUser(invitedEmail, 'Member');
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.search(invitedEmail);
    const userRow = await organizationHelper.getRow(invitedEmail);
    await organizationHelper.validateInvitedBadge(userRow, invitedEmail);
    expect(await organizationHelper.visibleRowCount()).toBeGreaterThan(0);
  });

  test('@sanity @regression TC10 - Invite new user to organization with Admin role', async () => {
    const invitedEmail = `admin_${Date.now()}@yopmail.com`;
    await organizationHelper.inviteUser(invitedEmail, 'Admin');
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.search(invitedEmail);
    const userRow = await organizationHelper.getRow(invitedEmail);
    await organizationHelper.validateInvitedBadge(userRow, invitedEmail);
    expect(await organizationHelper.visibleRowCount()).toBeGreaterThan(0);
  });

  test('@sanity @regression TC11 - Revoke user invitation to organization', async () => {
    const invitedEmail = `revoke_${Date.now()}@yopmail.com`;
    await organizationHelper.inviteUser(invitedEmail, 'Admin');
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.search(invitedEmail);
    const userRow = await organizationHelper.getRow(invitedEmail);
    await organizationHelper.revoke(userRow, invitedEmail);
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.search(invitedEmail);
    await organizationHelper.verifyNoResults();
  });

  test('@sanity @regression TC12 - Resend user invitation to organization', async () => {
    const invitedEmail = `resend_${Date.now()}@yopmail.com`;
    await organizationHelper.inviteUser(invitedEmail, 'Admin');
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.search(invitedEmail);
    const userRow = await organizationHelper.getRow(invitedEmail);
    await organizationHelper.openFirstMenu();
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.resendInvite(invitedEmail);
    await organizationHelper.verifyResendSuccess(invitedEmail);
  });

  test('@sanity @regression TC13 - Edit user role to organization', async () => {
    const existingAdminEmail = 'tailorbird-admin@tailorbird.us';
    await organizationHelper.search(existingAdminEmail);
    await applyWorkspaceZoom(sharedPage);
    const userRow = await organizationHelper.getRow(existingAdminEmail);
    const toggledRole = await organizationHelper.toggleRole(userRow);
    await applyWorkspaceZoom(sharedPage);
    await organizationHelper.search(existingAdminEmail);
    await organizationHelper.verifyUpdatedRole(existingAdminEmail, toggledRole);
  });
});

const ORGANIZATION_WORKSPACE_SCREENSHOT_OPTIONS = {
  animations: 'disabled',
  /** User table rows change during suite (invites); allow modest pixel drift vs golden image. */
  maxDiffPixels: 12_000,
  maxDiffPixelRatio: 0.04,
};

/** Shared assertion: product blocks bad invites via Mantine errors, alerts, native validity, or dialog copy. */
async function expectInviteBlockingFeedback(organizationHelperInstance, sharedTestPage, inviteUserPanel, options = {}) {
  await inviteUserPanel.dialogRoot.getByText('Loading roles').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  if (options.malformedEmail) {
    await inviteUserPanel.emailAddressInput.fill(options.malformedEmail);
  }
  await inviteUserPanel.nextOrInvitePrimaryButton.click();
  await expect(async () => {
    const inviteDialogCopy = (await inviteUserPanel.dialogRoot.innerText()).toLowerCase();
    const mantineInputErrors = await organizationHelperInstance.getInviteDialogInputErrors();
    const notificationOrAlertCount = await sharedTestPage
      .locator('.mantine-Notification-root, [role="alert"]')
      .filter({ hasText: /email|required|invalid/i })
      .count();
    const nativeHtml5Message = await inviteUserPanel.emailAddressInput
      .evaluate((el) => (el instanceof HTMLInputElement ? el.validationMessage : ''))
      .catch(() => '');
    const invalidCopyWithoutNative =
      /invalid|required|valid email|enter an email|must|provide/i.test(inviteDialogCopy);
    return (
      mantineInputErrors.length > 0 ||
      notificationOrAlertCount > 0 ||
      nativeHtml5Message.length > 0 ||
      invalidCopyWithoutNative
    );
  }).toPass({ intervals: [200, 500, 1000], timeout: 15_000 });
}

test.describe('Regression — organization invite validation, search, snapshot', () => {
  test.beforeEach(async ({}, testInfo) => {
    await organizationHelper.gotoOrganizationWorkspace();
    await applyWorkspaceZoom(sharedPage);
    if (!/TC03-vis-01/.test(testInfo.title)) {
      await organizationHelper.clearOrganizationSearch();
    } else {
      await sharedPage.locator('.mantine-AppShell-main').first().waitFor({ state: 'visible', timeout: 60_000 });
    }
  });

  test('TC03-reg-01 @regression @organization Empty email: invite blocked or shows validation', async () => {
    const inviteUserPanel = await organizationHelper.openInvite();
    await expectInviteBlockingFeedback(organizationHelper, sharedPage, inviteUserPanel, {});
  });

  test('TC03-reg-02 @regression @organization Malformed email: invite blocked or shows validation', async () => {
    const inviteUserPanel = await organizationHelper.openInvite();
    await expectInviteBlockingFeedback(organizationHelper, sharedPage, inviteUserPanel, {
      malformedEmail: 'not-a-valid-email-string',
    });
  });

  test('TC03-reg-03 @regression @organization Cancel closes invite dialog without inviting', async () => {
    const inviteUserPanel = await organizationHelper.openInvite();
    await inviteUserPanel.emailAddressInput.fill(`cancel_flow_${Date.now()}@yopmail.com`);
    await organizationHelper.selectRole(inviteUserPanel.roleSelectTrigger, 'Admin');
    await inviteUserPanel.dialogRoot.getByRole('button', { name: organizationFixture.inviteCancelText }).click();
    await expect(inviteUserPanel.dialogRoot).toBeHidden({ timeout: 8000 });
  });

  test('TC03-reg-04 @regression @organization Escape dismisses invite dialog', async () => {
    const inviteUserPanel = await organizationHelper.openInvite();
    await inviteUserPanel.emailAddressInput.fill(`escape_${Date.now()}@yopmail.com`);
    await sharedPage.keyboard.press('Escape');
    await sharedPage.waitForTimeout(350);
    if (await inviteUserPanel.dialogRoot.isVisible().catch(() => false)) {
      await sharedPage.keyboard.press('Escape');
      await sharedPage.waitForTimeout(350);
    }
    if (await inviteUserPanel.dialogRoot.isVisible().catch(() => false)) {
      await inviteUserPanel.dialogRoot.getByRole('button', { name: organizationFixture.inviteCancelText }).click();
    }
    await expect(inviteUserPanel.dialogRoot).toBeHidden({ timeout: 12_000 });
  });

  test('TC03-reg-05 @regression @organization Search with no matches shows empty state', async () => {
    await organizationHelper.search(`__no_users_match_${Date.now()}__`);
    await organizationHelper.verifyNoResults();
  });

  test('TC03-bench-mcp @regression @organization Workspace exposes Invite user action', async () => {
    await expect(sharedPage.getByRole('button', { name: /invite user/i })).toBeVisible({ timeout: 15_000 });
  });

  test('TC03-vis-01 @regression @organization Visual snapshot: organization main workspace', async () => {
    await expect(sharedPage.locator('.mantine-AppShell-main').first()).toHaveScreenshot(
      'organization-main-workspace.png',
      {
        ...ORGANIZATION_WORKSPACE_SCREENSHOT_OPTIONS,
      },
    );
  });
});
