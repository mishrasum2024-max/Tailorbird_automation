require("dotenv").config();

const path = require("path");
const { test } = require("@playwright/test");
const { VendorDashboardPage } = require("../pages/vendorDashboardPage");
const { Logger } = require("../utils/logger");

const dashboardTextScanPath = path.join(
  __dirname,
  "../data/vendorDashboardTextScan.json"
);

test.describe("Vendor Dashboard — full page coverage", () => {
  // video/trace/screenshot are already configured project-wide (playwright.config.js) — only
  // storageState is overridden here, same pattern as tests/TC29_VendorBidAccepting.spec.js.
  test.use({ storageState: "vendorsession.json" });

  test("TC454 @regression @vendor @dashboard : Vendor Dashboard loads, text is scanned + stored, breadcrumb and KPI cards verified", async ({
    page,
  }) => {
    test.setTimeout(90000);

    const vendorDashboardPage = new VendorDashboardPage(page);

    Logger.step("TC454: Navigate to vendor Dashboard");
    await page.goto(process.env.BASE_URL, { waitUntil: "load" });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await vendorDashboardPage.navigateToDashboard();

    const snapshot = await vendorDashboardPage.scanAndStoreDashboardText(
      dashboardTextScanPath
    );
    await vendorDashboardPage.assertScannedTextMatchesLiveDom(snapshot);

    await vendorDashboardPage.assertBreadcrumbVisible();
    await vendorDashboardPage.assertKpiCardsVisible();

    Logger.success(
      "TC454: Dashboard text scan stored, breadcrumb and all 4 KPI cards verified."
    );
  });

  test("TC455 @regression @vendor @dashboard : Vendor Dashboard — New Bid Invitations, Awaiting Submission and Approvals & Notifications panels verified", async ({
    page,
  }) => {
    test.setTimeout(90000);

    const vendorDashboardPage = new VendorDashboardPage(page);

    Logger.step("TC455: Navigate to vendor Dashboard");
    await page.goto(process.env.BASE_URL, { waitUntil: "load" });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await vendorDashboardPage.navigateToDashboard();

    await vendorDashboardPage.assertNewBidInvitationsPanelVisible();
    await vendorDashboardPage.assertAwaitingSubmissionPanelVisible();
    await vendorDashboardPage.assertApprovalsNotificationsPanelVisible();

    Logger.success(
      "TC455: New Bid Invitations, Awaiting Submission and Approvals & Notifications panels verified."
    );
  });

  test("TC456 @regression @vendor @dashboard : Vendor Dashboard — Recent activity panel and sidebar chrome verified", async ({
    page,
  }) => {
    test.setTimeout(90000);

    const vendorDashboardPage = new VendorDashboardPage(page);

    Logger.step("TC456: Navigate to vendor Dashboard");
    await page.goto(process.env.BASE_URL, { waitUntil: "load" });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await vendorDashboardPage.navigateToDashboard();

    await vendorDashboardPage.assertRecentActivityPanelVisible();
    await vendorDashboardPage.assertSidebarChromeVisible();

    Logger.success(
      "TC456: Recent activity panel and sidebar chrome verified — Dashboard page fully covered across TC454-TC456."
    );
  });
});
