require("dotenv").config();

const { test, expect } = require("@playwright/test");
const { ReportPage } = require("../pages/reportPage");
const { Logger } = require("../utils/logger");
const reportData = require("../fixture/reportPage.json");

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
});

/**
 * Reports page suite — exactly the 12 cases of "report page tetscases.xlsx" (Sheet1, rows 3–14),
 * in the same order; each test title carries the Excel test case name.
 *
 * MCP-verified 2026-10-23 on beta.tailorbird.com (owner session) — see pages/reportPage.js.
 * Agreed with the requester before automating:
 * - Delete is only ever exercised on a report the test itself generates (Excel prompt for
 *   "Test Property 1_Cottages on Elm"); existing reports are never deleted. Per the requester,
 *   the delete flow runs ONCE, in its own case (TC551); TC548–TC550 assert Delete is present and
 *   enabled on every report but do not delete. Every report a test generates is removed again in
 *   afterEach (cleanup only, not part of any assertion).
 * - A test finds its own new report by searching its name on the Reports page (reload + search
 *   again if it is not shown), never by scanning the grid.
 * - Explore by Module panels list READY and DRAFT reports; empty modules show
 *   "No <module> report versions yet." (TC549).
 * - "Calculations are accurate" = recompute from the generated report itself (TC552).
 * - Export: PDF = with graph, Excel = data without graph (TC555).
 * - TC552/TC555 need a report that has a graph; the agent only sometimes adds one for the plain
 *   prompt, so their setup asks for a chart explicitly (chartReportPrompt, MCP-verified).
 * - Save as Template adds one template per run (no delete in the UI) — accepted (TC554).
 */
test.describe("Reports page", () => {
  // Reports cases are capped at 5 minutes; slow page loads are reloaded after 60s instead of
  // waited on (see ReportPage.gotoReportsPage / gotoNewReportPage).
  test.describe.configure({ timeout: 300000 });
  let reportPage;

  test.beforeEach(async ({ page }) => {
    reportPage = new ReportPage(page);
  });

  test.afterEach(async () => {
    await reportPage.cleanupCreatedReports();
  });

  test("TC544 @regression @reports : User should be able to navigate report page", async () => {
    await test.step("Go to dashboard and click Reports in the left panel", async () => {
      await reportPage.gotoDashboard();
      await reportPage.openReportsFromLeftPanel();
    });
    await test.step("Assert URL, non-blank page and 'Generate a Report' header", async () => {
      await reportPage.verifyReportsPageLoaded();
    });
  });

  test("TC545 @regression @reports : Validate Report page should be loaded properly", async () => {
    await test.step("Go to dashboard and click Reports in the left panel", async () => {
      await reportPage.gotoDashboard();
      await reportPage.openReportsFromLeftPanel();
    });
    await test.step("Assert page headers and breadcrumbs text", async () => {
      await reportPage.verifyHeadersAndBreadcrumbs();
    });
    await test.step("Assert Use a Template and Generate Report are visible and enabled", async () => {
      await reportPage.verifyTopButtons();
    });
    await test.step("Assert search box is visible, enabled and working", async () => {
      await reportPage.verifySearchBox();
    });
    await test.step("Assert Continue, Explore by Module and Recent Reports have options", async () => {
      await reportPage.verifyBlocksHaveOptions();
    });
  });

  test("TC546 @regression @reports : Validate Use a template button", async () => {
    await test.step("Go to report page and click Use a Template", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.openTemplateModal();
    });
    await test.step("Assert everything in the modal", async () => {
      await reportPage.verifyTemplateModalContents();
    });
  });

  test("TC547 @regression @reports : Validate Generate Report button", async () => {
    let created;
    await test.step("Go to report page and click Generate Report", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.clickGenerateReport();
    });
    await test.step("Give the prompt in the chatbox and generate the report", async () => {
      created = await reportPage.generateReportFromChat(reportData.reportPrompt);
      expect(created.version.prompt, "FAIL: Report was not generated from the given prompt").toBe(reportData.reportPrompt);
    });
    await test.step("Assert the right panel: 3 enabled buttons and the report", async () => {
      await reportPage.verifyReportViewerPanel(created);
      await reportPage.verifyReportMentionsProperty(reportData.reportPropertyName);
    });
  });

  test("TC548 @regression @reports : Validate Continue blocks option", async () => {
    let created;
    await test.step("Setup: generate a draft report owned by this test", async () => {
      created = await reportPage.createReportForTest();
      expect(created.version.status, "FAIL: Newly generated report is not a draft").toBe("draft");
    });
    await test.step("Go to report page and check Draft Reports and Generating options", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.verifyContinueOptions();
    });
    await test.step("Click Draft Reports: every report has DRAFT tag, View and Delete", async () => {
      const drawer = await reportPage.openDraftDrawer();
      const count = await reportPage.verifyCardsHaveTagViewDelete(drawer, [reportData.tags.draft]);
      Logger.success(`${count} draft reports have DRAFT tag, View and Delete`);
    });
    await test.step("View works end to end (Delete is covered once, in TC551)", async () => {
      await reportPage.openOwnReportFromCard(reportPage.draftDrawer, created.reportId);
    });
  });

  test("TC549 @regression @reports : Validate Explore by Module blocks options", async () => {
    let created;
    const ownModule = reportData.modules.find((m) => m.key === reportData.ownReportModuleKey);
    await test.step(`Setup: generate a report owned by this test from the "New ${ownModule.label} report" chat`, async () => {
      created = await reportPage.createReportInModuleForTest(ownModule);
    });
    for (const module of reportData.modules) {
      await test.step(`${module.label}: panel lists reports with tag, View, Delete; New report opens the AI chatbox`, async () => {
        await reportPage.gotoReportsPage();
        await reportPage.verifyModuleDrawer(module);
      });
    }
    await test.step(`View works end to end in the ${ownModule.label} panel (Delete is covered once, in TC551)`, async () => {
      await reportPage.gotoReportsPage();
      const { drawer } = await reportPage.openModuleDrawer(ownModule);
      await reportPage.openOwnReportFromCard(drawer, created.reportId);
    });
  });

  test("TC550 @regression @reports : Validate Recent Reports block", async () => {
    let created;
    await test.step("Setup: generate a report owned by this test", async () => {
      created = await reportPage.createReportForTest();
    });
    await test.step("Go to report page: tags, creator name, date, View and Delete on every report", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.verifyRecentReportsCards();
      await reportPage.verifyOwnRecentCard(created);
    });
    await test.step("View works end to end (Delete is covered once, in TC551)", async () => {
      await reportPage.openOwnReportFromCard(reportPage.page.getByRole("main"), created.reportId);
    });
  });

  test("TC551 @regression @reports : Validate delete report button functionality", async () => {
    let created;
    await test.step("Setup: generate a report owned by this test", async () => {
      created = await reportPage.createReportForTest();
    });
    await test.step("Go to report page, search the report and delete it (API 200)", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.searchOwnReport(created.reportId, created.report.name);
      await reportPage.deleteOwnReportFromCard(reportPage.page.getByRole("main"), created.reportId, created.report.name);
    });
    await test.step("Search the same report: it is unavailable", async () => {
      await reportPage.verifyReportNotFoundBySearch(created.reportId, created.report.name);
    });
  });

  test("TC552 @regression @reports : Validate view button", async () => {
    let created;
    await test.step("Setup: generate a report (with a graph) owned by this test", async () => {
      created = await reportPage.createReportForTest(reportData.chartReportPrompt);
    });
    await test.step("Go to report page, search the report and click the view details icon", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.searchOwnReport(created.reportId, created.report.name);
      await reportPage.openOwnReportFromCard(reportPage.page.getByRole("main"), created.reportId);
    });
    await test.step("Assert report details, text, graph and accurate calculations/amounts", async () => {
      const content = await reportPage.verifyReportDetails(created);
      reportPage.verifyReportCalculations(content);
    });
  });

  test("TC553 @regression @reports : Validate regenerate button", async () => {
    let created;
    await test.step("Setup: generate a report owned by this test", async () => {
      created = await reportPage.createReportForTest();
    });
    await test.step("Go to report page, search the report and click the view details icon", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.searchOwnReport(created.reportId, created.report.name);
      await reportPage.openOwnReportFromCard(reportPage.page.getByRole("main"), created.reportId);
    });
    await test.step("Click Regenerate: report regenerated after the chatbox completes", async () => {
      await reportPage.regenerateAndVerify(created);
    });
  });

  test("TC554 @regression @reports : Validate Save as template button", async () => {
    let created;
    await test.step("Setup: generate a report owned by this test", async () => {
      created = await reportPage.createReportForTest();
    });
    await test.step("Go to report page, search the report and click the view details icon", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.searchOwnReport(created.reportId, created.report.name);
      await reportPage.openOwnReportFromCard(reportPage.page.getByRole("main"), created.reportId);
    });
    await test.step("Click Save as Template: template saved and available on the report page", async () => {
      const saved = await reportPage.saveAsTemplate(created);
      await reportPage.verifyTemplateAvailableOnReportsPage(saved);
    });
  });

  test("TC555 @regression @reports : Validate export button functionality", async () => {
    let created;
    let content;
    await test.step("Setup: generate a report (with a graph) owned by this test", async () => {
      created = await reportPage.createReportForTest(reportData.chartReportPrompt);
    });
    await test.step("Go to report page, search the report and click the view details icon", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.searchOwnReport(created.reportId, created.report.name);
      await reportPage.openOwnReportFromCard(reportPage.page.getByRole("main"), created.reportId);
      content = await reportPage.extractReportContent();
    });
    await test.step("Export PDF works with correct data and the graph", async () => {
      await reportPage.exportPdfAndVerify(created, content);
    });
    await test.step("Export data (Excel) works with correct data and no graph", async () => {
      await reportPage.exportExcelAndVerify(created, content);
    });
  });
});
