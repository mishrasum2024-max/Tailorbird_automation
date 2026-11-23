require("dotenv").config();

const path = require("path");
const { test } = require("@playwright/test");
const { VendorDashboardPage } = require("../pages/vendorDashboardPage");
const { VendorListingPage } = require("../pages/vendorListingPage");
const { Logger } = require("../utils/logger");
const { expect } = require("@playwright/test");
const { ReassignInvoicePage } = require("../pages/reassignInvoicePage");
const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");
const {
  waitForReadyRecoveringErrors,
} = require("../utils/errorLoadingDataRecovery");

// Seed property whose first job (Job1) holds a contract with vendor "sumit corp" and has no
// Invoice approval template, so a confirmed invoice is Approved immediately (MCP-verified
// 2026-11-23: TC24's $5 invoices #38826-#38828 on that job appear in the vendor's
// Approvals & Notifications panel).
const VENDOR_APPROVAL_SEED_PROPERTY = "Test Property5_Reassigning_Automation";

/**
 * Creates and approves a $5 invoice on the vendor's contract as the owner-side user, reusing
 * the existing TC24 flow (ReassignInvoicePage), so the vendor dashboard has an approval to show.
 * @param {import('@playwright/test').Browser} browser
 * @returns {Promise<string>} the invoice number
 */
async function seedApprovedVendorInvoice(browser) {
  const ctx = await browser.newContext({ storageState: "OtherSessionState.json" });
  try {
    const ownerPage = await ctx.newPage();
    const reassignInvoicePage = new ReassignInvoicePage(ownerPage);
    await ownerPage.goto(process.env.DASHBOARD_URL, { waitUntil: "load" });
    await expect(ownerPage).toHaveURL(process.env.DASHBOARD_URL);
    await ensureLeftPanelExpanded(ownerPage);

    await reassignInvoicePage.openFirstJobOfProperty(VENDOR_APPROVAL_SEED_PROPERTY);
    await reassignInvoicePage.openInvoiceTab();
    const invoiceNumber = await reassignInvoicePage.createFiveDollarInvoice(
      `VendorDash_Approval_${Date.now()}`,
      "Automation $5 invoice so the vendor dashboard has an approval to show"
    );
    await reassignInvoicePage.confirmAndApproveInvoice();
    const status = await reassignInvoicePage.getInvoiceStatus(invoiceNumber);
    expect(
      status,
      `FAIL: seeded invoice "${invoiceNumber}" should be Approved (no Invoice template on the seed property).`
    ).toMatch(/approved/i);
    Logger.success(`Seeded approved vendor invoice ${invoiceNumber}`);
    return invoiceNumber;
  } finally {
    await ctx.close();
  }
}

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
    // Added 2026-11-23 (insert-only): 2-worker run — the dashboard was still on its loading
    // spinner when the New Bid Invitations header check ran (screenshot). The panels render from
    // GET /api/vendor-dashboard, which aggregates 4 vendor tables (app/api/vendor-dashboard/
    // route.ts) and is slow on a loaded beta. Wait up to 80s for the panels, reloading (or
    // pressing "Error Loading Data" Retry) if they never appear.
    test.setTimeout(300000);
    await waitForReadyRecoveringErrors(
      page,
      page.locator("main").getByText("New Bid Invitations", { exact: true }).first(),
      { label: "Vendor dashboard panels" }
    );

    await vendorDashboardPage.assertNewBidInvitationsPanelVisible();
    await vendorDashboardPage.assertAwaitingSubmissionPanelVisible();

    // Approvals & Notifications only has rows when the vendor has an Approved/Rejected invoice
    // or change order — other specs' leftovers, gone after the daily cleanup. Create one if none.
    if ((await vendorDashboardPage.getApprovalsCountFromApi()) === 0) {
      test.setTimeout(300000);
      Logger.step("TC455: no vendor approvals — seeding an approved $5 invoice");
      await seedApprovedVendorInvoice(page.context().browser());
      await expect
        .poll(() => vendorDashboardPage.getApprovalsCountFromApi(), {
          message: "FAIL: seeded invoice never reached the vendor-dashboard approvals list.",
          timeout: 60000,
          intervals: [2000, 5000],
        })
        .toBeGreaterThan(0);
      await page.reload({ waitUntil: "load" });
    }
    // The panel's rows render from the dashboard API response; count() does not wait for them.
    await expect(
      vendorDashboardPage.approvalActionButtons.first(),
      "FAIL: Approvals & Notifications action buttons did not render."
    ).toBeVisible({ timeout: 30000 });
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

  test("TC457 @regression @vendor @bids @contracts @invoices @changeorders : Vendor Bids, Contracts, Invoices and Change Orders listing pages fully verified", async ({
    page,
  }) => {
    test.setTimeout(180000);

    const vendorListingPage = new VendorListingPage(page);

    Logger.step("TC457: Navigate to vendor portal");
    await page.goto(process.env.BASE_URL, { waitUntil: "load" });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    for (const pageKey of VendorListingPage.pageKeys) {
      const label = VendorListingPage.labelFor(pageKey);

      await test.step(`${label} page — scan, store, and fully assert`, async () => {
        await vendorListingPage.navigateTo(pageKey);

        const outputPath = path.join(
          __dirname,
          `../data/vendor${label.replace(/\s+/g, "")}TextScan.json`
        );
        const snapshot = await vendorListingPage.scanAndStoreListingText(
          pageKey,
          outputPath
        );
        vendorListingPage.assertScannedTextNonEmpty(snapshot, label);

        await vendorListingPage.assertListingPageFullyVisible(pageKey);
      });
    }

    Logger.success(
      "TC457: Bids, Contracts, Invoices and Change Orders listing pages fully verified in one pass."
    );
  });
});
