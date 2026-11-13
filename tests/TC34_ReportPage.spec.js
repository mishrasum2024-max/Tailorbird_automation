require("dotenv").config();

const { test, expect } = require("@playwright/test");
const { ReportPage } = require("../pages/reportPage");
const { Logger } = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const { UserRoleImportPage } = require("../pages/userRoleImportPage");

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
});

/**
 * Reports page suite — only the cases that do not need the AI report agent.
 * MCP-verified 2026-10-23 on beta.tailorbird.com (owner session) — see pages/reportPage.js.
 *
 * Cases that generated, regenerated or exported reports through the AI chat (TC545, TC547–TC555,
 * TC557 and the FEAT-1313 export cases) were removed on 2026-11-13 so the suite no longer calls
 * the LLM; see AI_Chat_Cases_Removal_Decision.csv. TC556 reads the newest existing report, so
 * the org needs at least one report in Recent Reports.
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

  test("TC546 @regression @reports : Validate Use a template button", async () => {
    await test.step("Go to report page and click Use a Template", async () => {
      await reportPage.gotoReportsPage();
      await reportPage.openTemplateModal();
    });
    await test.step("Assert everything in the modal", async () => {
      await reportPage.verifyTemplateModalContents();
    });
  });

  test("TC556 @regression @reports BUG-1569-TC01 : Reports - Dates mismatch logic", async () => {
    await test.step("Go to Reports and read the date of the first report in Recent Reports", async () => {
      await reportPage.gotoReportsPage();
    });
    await test.step("Open that report and assert the viewer date uses the same format as the card", async () => {
      await reportPage.verifyRecentCardDateMatchesViewerDate();
    });
  });
});

test.describe("FEAT-1313 User-role CSV import", () => {
  test.describe.configure({ mode: "serial", timeout: 300000 });
  test.use({ viewport: { width: 1920, height: 1600 } });

  let roleImport;
  const propertyData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/propertyData.json"), "utf8")
  );
  const chainPropertyName = propertyData.propertyName || propertyData.name;

  test.beforeEach(async ({ page }) => {
    roleImport = new UserRoleImportPage(page);
    await roleImport.goto();
  });

  test("TC010 @regression @userRoleImport FEAT-1313-TC010 : Verify user-role CSV import accepts Properties, Location and role columns in any order", async () => {
    // data/propertyData.json can be empty ({} is committed); fall back to a test-created property.
    const propertyName =
      await roleImport.resolvePropertyName(chainPropertyName);
    const stamp = Date.now();
    const role = `f1313role${stamp}`;
    const emailA = `f1313_a_${stamp}@yopmail.com`;
    const emailB = `f1313_b_${stamp}@yopmail.com`;
    const ordered = roleImport.writeCsv("ordered.csv", [
      ["Properties", "Location", role],
      [propertyName, "Austin, TX", emailA],
    ]);
    const first = await roleImport.importCsv(ordered);
    expect(
      first.succeeded,
      `FAIL: ordered CSV must import: ${first.text}`
    ).toBe(true);
    expect(first.text, "FAIL: invited user must be listed").toContain(emailA);
    await roleImport.closeResult();

    const reordered = roleImport.writeCsv("reordered.csv", [
      [role, "Location", "Properties"],
      [emailB, "Austin, TX", propertyName],
    ]);
    const second = await roleImport.importCsv(reordered);
    expect(
      second.succeeded,
      `FAIL: reordered CSV must import: ${second.text}`
    ).toBe(true);
    expect(second.text, "FAIL: invited user must be listed").toContain(emailB);
    await roleImport.closeResult();

    // Added: both imports must really assign the role — MCP-verified 2026-10-27: the grid
    // (GET /api/bird-table?table_name=user_role_management) has one column per role, and the
    // property's row holds the assigned user ids ("15538,15539"); ids map to emails through
    // GET /api/organization/users (invited users are "pending").
    Logger.info(
      `TC010: ordered CSV [Properties, Location, ${role}] — success=${first.succeeded}, lists ${emailA} (asserted)`
    );
    Logger.info(
      `TC010: reordered CSV [${role}, Location, Properties] — success=${second.succeeded}, lists ${emailB} (asserted)`
    );
    const api = roleImport.page.request;
    const grid = await (
      await api.get("/api/bird-table?table_name=user_role_management")
    ).json();
    const roleColumn = (grid.columns || []).find(c => c.label === role);
    expect(
      roleColumn,
      `FAIL: TC010: role column "${role}" must exist after the import`
    ).toBeTruthy();
    const propertyRow = (grid.rows || []).find(
      r => r.property_name === propertyName
    );
    expect(
      propertyRow,
      `FAIL: TC010: property "${propertyName}" must be in the role grid`
    ).toBeTruthy();
    const assignedIds = String(propertyRow[roleColumn.columnName] || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const users = await (await api.get("/api/organization/users")).json();
    const userList = Array.isArray(users)
      ? users
      : users.users || users.data || [];
    for (const email of [emailA, emailB]) {
      const user = userList.find(u => u.email === email);
      expect(
        user,
        `FAIL: TC010: invited user ${email} must exist in the organization`
      ).toBeTruthy();
      expect(
        assignedIds,
        `FAIL: TC010: ${email} must be assigned role "${role}" on "${propertyName}"`
      ).toContain(String(user.id));
      Logger.success(
        `TC010: ${email} (id ${user.id}, ${user.status}) holds role "${role}" on "${propertyName}"`
      );
    }
    Logger.info(
      `TC010: "${propertyName}" location in the grid: "${propertyRow.location}" (CSV gave "Austin, TX")`
    );
  });
});
