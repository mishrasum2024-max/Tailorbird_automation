require("dotenv").config();

const { test, expect } = require("@playwright/test");
const { UnitTrackerPage } = require("../pages/unitTrackerPage");
const { resetActiveFilters } = require("../utils/filterResetHelper");
const { Logger } = require("../utils/logger");
const unitTrackerData = require("../fixture/unitTracker.json");

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
});

/**
 * Unit Tracker suite — exactly the 6 cases of "unit tracker testcases.xlsx" (Sheet1, rows 3–8),
 * in the same order; each title carries the Excel test case name.
 *
 * MCP-verified 2026-10-26 on beta.tailorbird.com (owner session) — see pages/unitTrackerPage.js.
 * - Property: the Excel's "Test property 2_The westarham" is the app's "Test Property 2_The Westerham".
 * - Left panel: "Unit Tracker" is under "More" when the nav is collapsed into it, otherwise directly
 *   under "Trackers" (depends on window height) — the existing leftPanel helper handles both.
 * - Status case: agreed with the requester — target unit 106 and never apply "Not in Reno" to any
 *   record (it removes the job's scope from the unit and the row can no longer be selected).
 *   Sub records 2 and 3 are asserted "Released"; only record 2 ("june11 FP type practice") is
 *   cycled and ends back on "Released". Record 3 (job 3828, TC18's seed) is never changed: a
 *   job-level update rewrites every scope of the unit on that job, which would end 106's
 *   "In Progress" state.
 * - Filters, views and statuses are saved server-side, so afterEach puts back anything a test
 *   changed (cleanup only, not part of any assertion).
 */
test.describe("Unit Tracker", () => {
  let unitTracker;
  let createdViewName = null;
  let changedRowId = null;

  test.beforeEach(async ({ page }) => {
    unitTracker = new UnitTrackerPage(page);
    createdViewName = null;
    changedRowId = null;
  });

  test.afterEach(async ({ page }) => {
    if (changedRowId)
      await unitTracker
        .restoreRowStatus(changedRowId, unitTrackerData.subRecordExpectedStatus)
        .catch(e => Logger.info(`Cleanup failed: ${e.message}`));
    if (createdViewName)
      await unitTracker
        .deleteViewIfPresent(createdViewName)
        .catch(e => Logger.info(`Cleanup failed: ${e.message}`));
    await resetActiveFilters(page);
  });

  test("TC496 @regression @unitTracker : User should be able to navigate Unit tracker page", async () => {
    await test.step("Go to dashboard and in left panel click on more option and click on Unit tracker", async () => {
      await unitTracker.navigateToUnitTracker();
    });
    await test.step("Assert the URL", async () => {
      await unitTracker.verifyUnitTrackerUrl();
    });
    await test.step(`Select "${unitTrackerData.propertyName}" from Select a property dropdown`, async () => {
      await unitTracker.selectProperty();
    });
    await test.step("Assert breadcrumbs, page not blank, Search/Filter/View/Table/Export enabled, grid has data (logged)", async () => {
      await unitTracker.verifyPageLoaded();
    });
  });

  test("TC497 @regression @unitTracker : Validate Search page is working as expected", async () => {
    await test.step(`Open Unit tracker and select "${unitTrackerData.propertyName}"`, async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
    });
    await test.step(`Search ${unitTrackerData.unitLabel}: grid has only ${unitTrackerData.unitLabel}`, async () => {
      await unitTracker.searchUnit();
      await unitTracker.verifySearchResult();
    });
    await test.step("Expand button works and shows data", async () => {
      await unitTracker.expandUnit();
    });
    await test.step("Checkbox of the expanded data works", async () => {
      await unitTracker.verifySubRecordCheckbox();
    });
  });

  test("TC498 @regression @unitTracker : Validate filter option", async () => {
    let allRows;
    await test.step(`Open Unit tracker, select "${unitTrackerData.propertyName}" and click Filter`, async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
      allRows = await unitTracker.fetchAllRowsFromApi();
      await unitTracker.openFilterPanel();
    });
    await test.step("Assert everything appears in the filter", async () => {
      await unitTracker.verifyFilterPanelContents();
    });
    for (const f of unitTrackerData.filter.checkboxFilters) {
      await test.step(`${f.group} = ${f.option}: only matching data is shown`, async () => {
        await unitTracker.applyCheckboxFilter(f.group, f.option);
        await unitTracker.verifyFilterResult(
          `${f.group} = ${f.option}`,
          r => String(r[f.field] ?? "") === f.option,
          allRows
        );
        await unitTracker.resetFilters();
      });
    }
    const d = unitTrackerData.filter.dateFilter;
    await test.step(`${unitTrackerData.filter.dateGroup} ${d.fromText} – ${d.toText}: only matching data is shown`, async () => {
      await unitTracker.applyDateFilter(d.fromText, d.toText);
      await unitTracker.verifyFilterResult(
        `${unitTrackerData.filter.dateGroup} ${d.fromIso}..${d.toIso}`,
        r => !!r[d.field] && r[d.field] >= d.fromIso && r[d.field] <= d.toIso,
        allRows
      );
      await unitTracker.resetFilters();
    });
  });

  test("TC499 @regression @unitTracker : Validate create a view option is working fine", async () => {
    const viewName = `${unitTrackerData.view.namePrefix}${Date.now()}`;
    await test.step(`Open Unit tracker and select "${unitTrackerData.propertyName}"`, async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
    });
    await test.step("Create a new view", async () => {
      createdViewName = viewName;
      await unitTracker.createView(viewName);
    });
    await test.step("Reset to default view", async () => {
      await unitTracker.resetToDefaultView(viewName);
    });
    await test.step("Switch back to the newly created view", async () => {
      await unitTracker.switchToView(viewName);
    });
  });

  test("TC500 @regression @unitTracker : Validate Export option", async () => {
    let csv;
    await test.step(`Open Unit tracker and select "${unitTrackerData.propertyName}"`, async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
    });
    await test.step("Click Export: a csv file is exported", async () => {
      csv = await unitTracker.exportCsv();
    });
    await test.step("The csv has the same data as the grid", async () => {
      await unitTracker.verifyCsvMatchesGrid(csv);
    });
  });

  test("TC501 @regression @unitTracker : Validate user can change status of any unit records", async () => {
    // Verified 2026-11-11 (API, property 5759): all 62 unit rows of job #3906 ("june11 FP type
    // practice", also the FEAT-1278 vendor pay-app seed job) were "In Progress" — a job-wide change
    // TC501 never makes (it only cycles record 2 under unit 106 and ends it on "Released"). That
    // left this test's own record failing the "Released" precondition. Put ONLY that row back to
    // its documented starting status first (same single-row API restoreRowStatus uses in afterEach).
    await test.step(`Precondition: "${unitTrackerData.subRecordToUpdate}" under ${unitTrackerData.unitLabel} starts as "${unitTrackerData.subRecordExpectedStatus}"`, async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
      const apiRows = await unitTracker.fetchAllRowsFromApi();
      const unitRow = apiRows.find(
        r =>
          String(r.hierarchy_label) === unitTrackerData.unitLabel &&
          r.__treeRowKind === "unit"
      );
      expect(
        unitRow,
        `FAIL: Unit ${unitTrackerData.unitLabel} not returned by the API`
      ).toBeTruthy();
      const ownedRow = apiRows.find(
        r =>
          r.parentId === unitRow.id &&
          r.hierarchy_label === unitTrackerData.subRecordToUpdate
      );
      expect(
        ownedRow,
        `FAIL: "${unitTrackerData.subRecordToUpdate}" not under ${unitTrackerData.unitLabel}`
      ).toBeTruthy();
      if (ownedRow.status !== unitTrackerData.subRecordExpectedStatus) {
        Logger.info(
          `"${unitTrackerData.subRecordToUpdate}" was "${ownedRow.status}" — restoring it to "${unitTrackerData.subRecordExpectedStatus}"`
        );
        await unitTracker.restoreRowStatus(
          ownedRow.id,
          unitTrackerData.subRecordExpectedStatus
        );
        expect(
          await unitTracker.apiRowStatus(ownedRow.id),
          `FAIL: could not restore "${unitTrackerData.subRecordToUpdate}" to "${unitTrackerData.subRecordExpectedStatus}"`
        ).toBe(unitTrackerData.subRecordExpectedStatus);
      }
    });
    let children;
    await test.step(`Open Unit tracker, select "${unitTrackerData.propertyName}" and click on ${unitTrackerData.unitLabel}`, async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
      await unitTracker.searchUnit();
      await unitTracker.clickUnitRecord();
    });
    await test.step(`Assert and log the status of ${unitTrackerData.unitLabel} is "${unitTrackerData.unitExpectedStatus}"`, async () => {
      await unitTracker.verifyUnitStatus(
        unitTrackerData.unitLabel,
        unitTrackerData.unitExpectedStatus
      );
    });
    await test.step(`Expand ${unitTrackerData.unitLabel}: sub records 2 and 3 are "${unitTrackerData.subRecordExpectedStatus}"`, async () => {
      ({ children } = await unitTracker.expandUnit());
      const asserted = unitTrackerData.subRecordsToAssert.map(label => {
        const child = children.find(c => c.label === label);
        expect(
          child,
          `FAIL: Sub record "${label}" not under ${unitTrackerData.unitLabel}`
        ).toBeTruthy();
        return child;
      });
      await unitTracker.verifySubRecordsStatus(
        asserted,
        unitTrackerData.subRecordExpectedStatus
      );
    });
    const subRow = () =>
      children.find(c => c.label === unitTrackerData.subRecordToUpdate);
    for (const status of unitTrackerData.statusesToApply) {
      await test.step(`Change "${unitTrackerData.subRecordToUpdate}" to "${status}" (5 options available)`, async () => {
        expect(
          subRow(),
          `FAIL: Sub record "${unitTrackerData.subRecordToUpdate}" not under ${unitTrackerData.unitLabel}`
        ).toBeTruthy();
        changedRowId = subRow().id;
        await unitTracker.updateSubRecordStatus(subRow(), status);
      });
    }
  });
});
