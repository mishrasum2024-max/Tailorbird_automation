const { expect } = require("@playwright/test");
const OrganizationHelper = require("./organizationHelper");
const organizationUrls = require("../fixture/organization.json");
const roleManagementUiLabels = require("../fixture/manageTeamRoles.json");

/**
 * Navigation + assertions for Approvers Management (`/user-role-management`) and Organization (`/organization`).
 * Legacy `/manage-team` routes 404 on beta (MCP 2026-05-05).
 */
class ManageTeamRolesHelper {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.organizationHelper = new OrganizationHelper(page);
  }

  /** Deep-link to roles matrix (session required). */
  async gotoManageTeamRolesViaQuery(dashboardUrl) {
    const start = dashboardUrl || process.env.DASHBOARD_URL || organizationUrls.dashboardUrl;
    const origin = new URL(start).origin;
    await this.page.goto(`${origin}/user-role-management`, { waitUntil: "load", timeout: 90_000 });
    await this.page.waitForLoadState("domcontentloaded");
  }

  /** Dashboard → user menu → Manage Approvers. */
  async landManageTeamViaMenu(dashboardUrl) {
    await this.organizationHelper.goto(dashboardUrl);
    await this.organizationHelper.goToUserRoleManagement();
    // Trace-verified 2026-10-05: /user-role-management treats ANY failed GET /api/profile as
    // "not admin" and router.replace("/")s back to the dashboard — an intermittent 400 from the
    // auth middleware bounced the page to CapEx right after the URL check above passed. If that
    // happens, take the same menu path once more.
    const addRoleButton = this.page.getByRole("button", { name: roleManagementUiLabels.addRoleButtonText });
    const stayedOnApprovers = await addRoleButton.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
    if (!stayedOnApprovers && !/user-role-management/i.test(this.page.url())) {
      await this.organizationHelper.goToUserRoleManagement();
    }
  }

  /** Dashboard → user menu → Manage Organization (Users / Property access). */
  async landOrganizationWorkspaceViaMenu(dashboardUrl) {
    await this.organizationHelper.goto(dashboardUrl);
    await this.organizationHelper.goToOrganization();
    // Trace-verified 2026-10-05: /organization renders only the breadcrumb + a skeleton until
    // GET /api/profile confirms admin, and router.replace("/")s on ANY failed response — an
    // intermittent 400 bounced the page to CapEx right after the breadcrumb/URL checks above
    // passed. The tabs render only once admin is confirmed, so wait for them and take the same
    // menu path once more if the page bounced.
    const usersTab = this.page.getByRole("tab", { name: roleManagementUiLabels.tabUsers });
    const stayedOnOrganization = await usersTab.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
    if (!stayedOnOrganization && !/\/organization/i.test(this.page.url())) {
      await this.organizationHelper.goToOrganization();
    }
  }

  async openRolesTab() {
    await this.page.getByRole("tab", { name: roleManagementUiLabels.tabRoles }).click();
  }

  async openUsersTab() {
    await this.page.getByRole("tab", { name: roleManagementUiLabels.tabUsers }).click();
  }

  async openPropertyAccessTab() {
    await this.page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess }).click();
  }

  async expectRolesBenchmarkVisible() {
    await expect(this.page.getByRole("button", { name: roleManagementUiLabels.addRoleButtonText })).toBeVisible({
      timeout: 25_000,
    });
    await expect(this.page.getByRole("textbox", { name: roleManagementUiLabels.searchBoxName })).toBeVisible({
      timeout: 15_000,
    });
  }

  /** Legacy name: ensures we are on the user-role-management route. */
  async expectRolesTabSelected() {
    await expect(this.page).toHaveURL(/user-role-management/i, { timeout: 15_000 });
  }

  /** Approvers Management grid exposes property/location columns (MCP-verified). */
  async expectRolesColumnHeaders() {
    await expect(
      this.page.getByRole("columnheader", { name: roleManagementUiLabels.gridColumnProperties, exact: true }).first(),
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      this.page.getByRole("columnheader", { name: roleManagementUiLabels.gridColumnLocation, exact: true }).first(),
    ).toBeVisible();
  }

  async expectManageTeamBreadcrumb() {
    await expect(
      this.page
        .locator(".mantine-Breadcrumbs-root")
        .getByText(roleManagementUiLabels.breadcrumbUserRoleManagement, { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  }
}

module.exports = {
  ManageTeamRolesHelper,
  manageTeamRolesBench: roleManagementUiLabels,
  orgUrls: organizationUrls,
};
