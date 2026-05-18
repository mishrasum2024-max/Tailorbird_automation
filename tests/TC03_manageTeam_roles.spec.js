/**
 * TC18 — User Role Management + Organization tabs (MCP-aligned: `/user-role-management`, `/organization`).
 * Legacy `/manage-team` returns 404 on beta (MCP 2026-05-05).
 *
 * Prerequisite: `sessionState.json` from TC01 mandatory login.
 */
require("dotenv").config();

const { test, expect } = require("@playwright/test");
const {
  ManageTeamRolesHelper,
  manageTeamRolesBench: roleManagementUiLabels,
  orgUrls,
} = require("../pages/manageTeamRolesHelper");

const dashboardLandingUrl = process.env.DASHBOARD_URL || orgUrls.dashboardUrl;
const tailorbirdOrigin = process.env.BASE_URL || new URL(dashboardLandingUrl).origin;

test.describe("TC18 Manage Team — Roles (positive / negative / edge)", () => {
  test.describe("Authenticated (sessionState)", () => {
    test.use({
      storageState: "sessionState.json",
      viewport: { width: 1440, height: 900 },
    });

    test.beforeEach(() => {
      test.skip(!process.env.DASHBOARD_URL && !orgUrls.dashboardUrl, "DASHBOARD_URL or fixture dashboard required");
    });

    test("MT-roles-pos-01 @regression @manageTeam @roles Direct user-role-management lands with benchmark controls", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.gotoManageTeamRolesViaQuery();
      await expect(page).toHaveURL(/user-role-management/i);
      await userRoleManagement.expectRolesBenchmarkVisible();
    });

    test("MT-roles-pos-02 @regression @manageTeam @roles Menu path Manage User Roles shows benchmark", async ({ page }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.landManageTeamViaMenu(dashboardLandingUrl);
      await userRoleManagement.expectRolesBenchmarkVisible();
    });

    test("MT-roles-pos-03 @regression @manageTeam @roles Role matrix exposes Properties / Location columns", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.gotoManageTeamRolesViaQuery();
      await userRoleManagement.expectRolesColumnHeaders();
    });

    test("MT-roles-pos-04 @regression @manageTeam @roles Add role control is available", async ({ page }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.gotoManageTeamRolesViaQuery();
      await expect(page.getByRole("button", { name: roleManagementUiLabels.addRoleButtonText })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("MT-roles-pos-05 @regression @manageTeam @roles Built-in or automation roles visible as column headers", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.gotoManageTeamRolesViaQuery();
      await expect(
        page
          .getByRole("columnheader", {
            name: new RegExp(
              `${roleManagementUiLabels.builtInRoleEditor}|${roleManagementUiLabels.builtInRoleViewOnly}|E2E`,
              "i",
            ),
          })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("MT-roles-pos-06 @regression @manageTeam @roles Organization: Users ↔ Property access tabs switch cleanly", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.landOrganizationWorkspaceViaMenu(dashboardLandingUrl);
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabUsers })).toHaveAttribute("aria-selected", "true", {
        timeout: 15_000,
      });
      await page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess }).click();
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.getByRole("tab", { name: roleManagementUiLabels.tabUsers }).click();
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabUsers })).toHaveAttribute("aria-selected", "true");
    });

    test("MT-roles-neg-01 @regression @manageTeam @roles Invalid tab query still renders app shell on organization", async ({
      page,
    }) => {
      await page.goto(`${orgUrls.organizationUrl}?tab=__tb_invalid_tab__`, {
        waitUntil: "load",
        timeout: 90_000,
      });
      await expect(page.locator("body")).toBeVisible();
      await expect(page).toHaveURL(/\/organization/i);
      await expect(page.locator(".mantine-AppShell-root, main").first()).toBeVisible({ timeout: 25_000 });
    });

    test("MT-roles-edge-01 @regression @manageTeam @roles Reload keeps user-role-management usable", async ({ page }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.gotoManageTeamRolesViaQuery();
      await userRoleManagement.expectRolesBenchmarkVisible();
      await page.reload({ waitUntil: "load" });
      await expect(page).toHaveURL(/user-role-management/i);
      await userRoleManagement.expectRolesBenchmarkVisible();
    });

    test("MT-roles-edge-02 @regression @manageTeam @roles Organization: rapid Users ↔ Property access keeps shell stable", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.landOrganizationWorkspaceViaMenu(dashboardLandingUrl);
      await page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess }).click();
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.getByRole("tab", { name: roleManagementUiLabels.tabUsers }).click();
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabUsers })).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess }).click();
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    test("MT-roles-edge-03 @regression @manageTeam @roles Breadcrumb shows User Role Management on matrix page", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.gotoManageTeamRolesViaQuery();
      await userRoleManagement.expectManageTeamBreadcrumb();
    });

    test("MT-roles-edge-04 @regression @manageTeam @roles Organization Property access differs from Users tab", async ({
      page,
    }) => {
      const userRoleManagement = new ManageTeamRolesHelper(page);
      await userRoleManagement.landOrganizationWorkspaceViaMenu(dashboardLandingUrl);
      await page.getByRole("tab", { name: roleManagementUiLabels.tabUsers }).click();
      await expect(page.getByRole("textbox", { name: /user search|search by name/i })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess }).click();
      await expect(page.getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  test.describe("Unauthenticated", () => {
    test.use({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1440, height: 900 },
    });

    test("MT-roles-neg-02 @regression @manageTeam @roles user-role-management without session shows AuthKit Sign in", async ({
      page,
    }) => {
      test.skip(!dashboardLandingUrl, "DASHBOARD_URL / dashboard missing");
      const url = new URL("/user-role-management", tailorbirdOrigin).href;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 45_000 });
    });
  });
});
