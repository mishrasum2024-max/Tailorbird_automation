require("dotenv").config();
const { test, expect } = require("@playwright/test");
const { OOOPage } = require("../pages/oooPage");
const { Logger } = require("../utils/logger");
const { SimpleApprovalPage } = require("../pages/simpleApprovalPage");
const { BudgetJob } = require("../pages/budgetPage");
const PropertiesHelper = require("../pages/properties");
const path = require("path");
const fs = require("fs");
const { ApprovalJob } = require("../pages/approvalPage");
const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");
const { withExtendedTerminalWait } = require("../utils/resilientRetry");

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  animations: "disabled",
  maxDiffPixels: 50_000,
  maxDiffPixelRatio: 0.3,
});

test.describe.serial("Out of Office", () => {
  let oooPage;

  test.beforeEach(async ({ page }) => {
    oooPage = new OOOPage(page);

    await page.goto(process.env.DASHBOARD_URL, {
      waitUntil: "domcontentloaded",
    });
    await ensureLeftPanelExpanded(page);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await oooPage.ensureOooInactive();
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        Logger.error(
          `[beforeEach] Cleanup attempt ${attempt} failed: ${e.message} — retrying in 2 s`
        );
        await page.waitForTimeout(2000);
      }
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await oooPage.navigateToProfile();
        await oooPage.clickOooTab();
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        Logger.error(
          `[beforeEach] Navigation attempt ${attempt} failed: ${e.message} — retrying`
        );
        await page.waitForTimeout(2000);
      }
    }

    Logger.step("[beforeEach] OOO tab ready; state confirmed inactive");
  });

  test.afterEach(async ({ page }) => {
    const apiBase = new URL(process.env.DASHBOARD_URL).origin;
    await page.request
      .delete(`${apiBase}/api/ooo`)
      .catch(e =>
        Logger.error(`[afterEach] OOO cleanup DELETE failed: ${e.message}`)
      );
    Logger.step("[afterEach] OOO cleanup attempted");
  });

  test("TC271 @ooo @regression : Verify OOO tab opens via direct URL and user menu", async ({
    page,
  }) => {
    Logger.step(
      "TC271: Verify the OOO tab is reachable via two navigation paths"
    );

    // Path 1: already on OOO tab via beforeEach (direct /profile URL)
    await expect(
      oooPage.loc.tab_ooo,
      "OOO tab must be selected"
    ).toHaveAttribute("aria-selected", "true", { timeout: 8000 });
    await expect(
      oooPage.loc.oooTabpanel,
      "OOO tabpanel must be visible"
    ).toBeVisible({ timeout: 5000 });
    Logger.info("TC271: Path 1 — OOO tab opens via direct /profile URL ✓");

    // Path 2: dashboard → sidebar user block → Profile → OOO tab
    await page.goto(process.env.DASHBOARD_URL, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
    await oooPage.loc.sidebarUserBlock.waitFor({
      state: "visible",
      timeout: 20000,
    });
    await oooPage.loc.sidebarUserBlock.click();
    const profileMenuItem = page.getByRole("menuitem", { name: "Profile" });
    await profileMenuItem.waitFor({ state: "visible", timeout: 10000 });
    await profileMenuItem.click();
    await expect(page).toHaveURL(/\/profile/, { timeout: 15000 });

    await expect(oooPage.loc.tab_ooo, "OOO tab must be visible").toBeVisible({
      timeout: 10000,
    });
    await oooPage.clickOooTab();
    await expect(
      oooPage.loc.tab_ooo,
      "OOO tab must be selected after clicking"
    ).toHaveAttribute("aria-selected", "true", { timeout: 8000 });
    await expect(
      oooPage.loc.oooTabpanel,
      "OOO tabpanel must be visible"
    ).toBeVisible({ timeout: 5000 });
    Logger.info("TC271: Path 2 — OOO tab opens via sidebar user menu ✓");

    Logger.success("TC271 PASSED");
  });

  test("TC272 @ooo @regression : Verify OOO activation with role delegate and active banner", async ({
    page,
  }) => {
    // Activate can take up to 5 min, plus one retry of 5 min (pages/oooPage.js).
    test.setTimeout(900000); // 15 minutes max
    Logger.step("TC272: Activate with role delegate, verify UI and API");

    const roleName = await oooPage.getFirstRoleName();
    Logger.info(`TC272: Using role "${roleName}"`);

    await oooPage.activateWithRole(roleName, null);
    await oooPage.assertIsActive();
    const activeText = await oooPage.assertActiveBanner({
      roleName,
      isRole: true,
    });
    Logger.info(`TC272: Active banner: "${activeText}" ✓`);

    const dateVisible = await page
      .getByText(/Auto-deactivates on/i)
      .isVisible();
    expect(
      dateVisible,
      "Auto-deactivation date line must NOT appear when no date was set"
    ).toBe(false);

    const apiState = await oooPage.assertRoleDelegationApi({
      roleName,
      apiDate: null,
    });
    Logger.info(
      `TC272: API confirmed — id=${apiState.ooo.id}, role="${roleName}", deactivate_at=null ✓`
    );

    Logger.success("TC272 PASSED");
  });

  test("TC273 @ooo @regression : Verify OOO deactivation resets form and allows reactivation with another role", async ({
    page,
  }) => {
    // Activate → deactivate → activate: each can take up to 5 min, plus
    // one 5-min retry (pages/oooPage.js).
    test.setTimeout(1800000); // 30 minutes max
    Logger.step(
      "TC273: Activate Role A → deactivate → verify full reset → re-activate Role B"
    );

    const roleA = await oooPage.getFirstRoleName();
    const delegates = await oooPage.getDelegatesApiResponse();
    // If only one role exists, re-activate with the same role — still verifies
    // the full deactivate-and-re-activate flow and form reset behaviour.
    const hasTwoRoles = delegates.roles.length >= 2;
    const roleB = hasTwoRoles ? await oooPage.getSecondRoleName() : roleA;
    if (hasTwoRoles) {
      expect(roleA, "Role A and Role B must be different").not.toBe(roleB);
    } else {
      Logger.info(
        "TC273: Only one role in org — re-activating with same role (verifies reset, not role-switch)"
      );
    }

    await withExtendedTerminalWait(
      () => oooPage.activateWithRole(roleA),
      oooPage.loc.activeStatePara,
      { timeoutMs: 90000, visible: true, label: "TC273 — activate Role A" }
    );
    await oooPage.assertIsActive();
    await oooPage.assertActiveBanner({ roleName: roleA, isRole: true });
    Logger.info("TC273: OOO activated with Role A ✓");

    await withExtendedTerminalWait(
      () => oooPage.clickDeactivateOoo(),
      oooPage.loc.btn_activate,
      { timeoutMs: 90000, visible: true, label: "TC273 — deactivate" }
    );
    await oooPage.assertIsInactive();
    Logger.info("TC273: Full UI reset confirmed ✓");

    const apiAfterDeactivate = await oooPage.getOooApiState();
    expect(
      apiAfterDeactivate.ooo,
      "API ooo must be NULL after deactivation"
    ).toBeNull();
    Logger.info("TC273: API confirms ooo=null ✓");

    await withExtendedTerminalWait(
      () => oooPage.activateWithRole(roleB),
      oooPage.loc.activeStatePara,
      { timeoutMs: 90000, visible: true, label: "TC273 — activate Role B" }
    );
    const textB = await oooPage.assertActiveBanner({
      roleName: roleB,
      isRole: true,
    });
    if (hasTwoRoles) {
      expect(
        textB,
        "Active banner must NOT contain Role A (stale data)"
      ).not.toContain(roleA);
    }
    Logger.info(
      `TC273: Re-activated with Role B${hasTwoRoles ? " (different from A)" : " (same as A — 1-role env)"} — form reset confirmed ✓`
    );

    const finalApi = await oooPage.assertRoleDelegationApi({ roleName: roleB });
    Logger.info(
      `TC273: API confirmed delegate="${finalApi.ooo.delegate_role_name}" ✓`
    );

    Logger.success("TC273 PASSED");
  });
});
