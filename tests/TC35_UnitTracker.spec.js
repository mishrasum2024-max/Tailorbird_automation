require("dotenv").config();

const { test, expect } = require("@playwright/test");
const { UnitTrackerPage } = require("../pages/unitTrackerPage");
const { resetActiveFilters } = require("../utils/filterResetHelper");
const { Logger } = require("../utils/logger");
const unitTrackerData = require("../fixture/unitTracker.json");
const { ManageTeamRolesHelper } = require("../pages/manageTeamRolesHelper");

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

/**
 * Move-In / Move-Out dates — TC564–TC567 (MCP-verified 2026-11-16, headed MCP browser, owner session).
 *
 * - Unit Tracker: "Move-In Date" / "Move-Out Date" are editable on unit rows only (date picker,
 *   PUT /api/bird-table/cells), shown MM/DD/YYYY, "—" when empty; Move-In must be on or after
 *   Move-Out (400 + toast); a filled cell has a clear (✕) button. See pages/unitTrackerPage.js.
 * - Contract page → Units tab has NO Move-In / Move-Out field (not in its grid, Columns settings or
 *   its ui-contract-units API). Every case therefore also asserts, for each job of the unit, that the
 *   Contract Units tab shows the unit with the same FP Type / Unit Type / Status / Start-End dates as
 *   the Unit Tracker, and that its contract data is identical before and after the date changes.
 * - Target: unit 101 of Test Property 2_The Westerham (no dates; not TC501's unit 106 nor the units
 *   105/107 that already carry dates). Days are picked in the month the date picker opens on (the
 *   current month), so the cases do not depend on a calendar date.
 * - Dates are saved server-side: a precondition empties them and afterEach empties them again.
 */
test.describe("Unit Tracker — Move-In / Move-Out dates", () => {
  const md = unitTrackerData.moveDates;
  // Added 2026-11-19 (insert-only): TC564–TC567 all edit and empty the SAME unit (101). Under the
  // CI regression run (--workers=4 --fully-parallel) they ran concurrently, so one test's
  // precondition/afterEach emptied 101's dates while another was mid-test; the grid re-reads the
  // row after every save (GET /api/bird-table/rows?row_id=…), so the cell flipped to "—"
  // (MCP-verified headed). "default" mode keeps these tests in one worker, in order, without
  // skipping the rest when one fails.
  test.describe.configure({ mode: "default" });
  let unitTracker;
  let unitId = null;

  test.beforeEach(async ({ page }) => {
    unitTracker = new UnitTrackerPage(page);
    unitId = null;
  });

  test.afterEach(async ({ page }) => {
    if (unitId)
      await unitTracker
        .restoreMoveDates(unitId)
        .catch(e => Logger.info(`Cleanup failed: ${e.message}`));
    await resetActiveFilters(page).catch(e =>
      Logger.info(`Cleanup failed: ${e.message}`)
    );
  });

  /** Opens the tracker, empties leftover dates of the unit and records the baseline of both pages. */
  async function precondition() {
    await unitTracker.navigateToUnitTracker();
    await unitTracker.selectProperty();
    let { unit, jobs } = await unitTracker.moveDateRows(md.unitLabel);
    unitId = unit.id;
    expect(
      jobs.length,
      `FAIL: Unit ${md.unitLabel} has no job to check on the Contract page`
    ).toBeGreaterThan(0);
    if (unit[md.moveInField] || unit[md.moveOutField]) {
      Logger.info(
        `Unit ${md.unitLabel} had leftover dates — emptying them first`
      );
      await unitTracker.restoreMoveDates(unitId);
      ({ unit, jobs } = await unitTracker.moveDateRows(md.unitLabel));
    }
    expect(
      [unit[md.moveInField], unit[md.moveOutField]],
      `FAIL: Unit ${md.unitLabel} must start without Move-In / Move-Out dates`
    ).toEqual([null, null]);
    const contractBefore = await unitTracker.contractUnitSnapshot(
      jobs,
      md.unitLabel
    );
    return { unit, jobs, contractBefore };
  }

  /** Contract → Units tab of every job: same unit data as the tracker, contract data unchanged. */
  async function verifyContractPage(baseline) {
    const { unit, jobs } = await unitTracker.moveDateRows(md.unitLabel);
    expect(unit.status, "FAIL: Date changes altered the unit status").toBe(
      baseline.unit.status
    );
    expect(
      unit.days_in_reno,
      "FAIL: Date changes altered Days in renovation"
    ).toBe(baseline.unit.days_in_reno);
    for (const job of jobs)
      await unitTracker.verifyContractUnitMatchesTracker(
        unit,
        job,
        md.unitLabel
      );
    expect(
      await unitTracker.contractUnitSnapshot(jobs, md.unitLabel),
      "FAIL: Contract Units data changed after editing Move-In / Move-Out"
    ).toEqual(baseline.contractBefore);
    Logger.success(
      "Contract Units data is unchanged and consistent with the Unit Tracker"
    );
  }

  test("TC564 @regression @unitTracker : Validate Move-Out and Move-In dates can be set on a unit and are reflected in Unit Tracker and Contract Units tab", async () => {
    let baseline, moveOut, moveIn;
    await test.step(`Precondition: unit ${md.unitLabel} has no dates; contract baseline recorded`, async () => {
      baseline = await precondition();
    });
    await test.step(`Contract page → Units tab: unit ${md.unitLabel} matches the Unit Tracker (before)`, async () => {
      for (const job of baseline.jobs)
        await unitTracker.verifyContractUnitMatchesTracker(
          baseline.unit,
          job,
          md.unitLabel
        );
    });
    await test.step(`Unit Tracker: search ${md.unitLabel}; both date columns show "${md.emptyCell}"`, async () => {
      await unitTracker.openUnitInTracker(md.unitLabel);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: null,
        moveOut: null,
      });
    });
    await test.step(`Job rows of ${md.unitLabel} show Move-In / Move-Out read-only`, async () => {
      await unitTracker.verifyJobRowsMoveDatesReadOnly(md.unitLabel);
    });
    await test.step(`Set "${md.moveOutColumn}" (day ${md.moveOutDay}): API 200; cell, grid data and API show it`, async () => {
      moveOut = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveOutColumn,
        md.moveOutDay
      );
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: null,
        moveOut: moveOut.iso,
      });
    });
    await test.step(`Set "${md.moveInColumn}" (day ${md.moveInDay}, after Move-Out): API 200; both dates shown`, async () => {
      moveIn = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveInColumn,
        md.moveInDay
      );
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: moveOut.iso,
      });
    });
    await test.step("Reload the Unit Tracker: both dates persisted", async () => {
      await unitTracker.openUnitInTracker(md.unitLabel);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: moveOut.iso,
      });
    });
    await test.step("Contract page → Units tab: unit data consistent and unchanged (after)", async () => {
      await verifyContractPage(baseline);
    });
  });

  test("TC565 @regression @unitTracker : Validate Move-In date earlier than Move-Out date is rejected and the same day is accepted", async () => {
    let baseline, moveOut, moveIn;
    await test.step(`Precondition: unit ${md.unitLabel} has no dates; contract baseline recorded`, async () => {
      baseline = await precondition();
      await unitTracker.searchUnitContaining(md.unitLabel);
    });
    await test.step(`Set "${md.moveOutColumn}" (day ${md.moveInDay})`, async () => {
      moveOut = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveOutColumn,
        md.moveInDay
      );
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: null,
        moveOut: moveOut.iso,
      });
    });
    await test.step(`Set "${md.moveInColumn}" before Move-Out (day ${md.invalidMoveInDay}): 400 "${md.invalidOrderMessage}" + toast`, async () => {
      const rejected = await unitTracker.pickMoveDate(
        md.unitLabel,
        md.moveInColumn,
        md.invalidMoveInDay
      );
      await unitTracker.verifyMoveDateRejected(rejected, unitId);
      await unitTracker.closeCellEditor();
    });
    await test.step(`"${md.moveInColumn}" was not saved: cell, grid data and API still empty; Move-Out unchanged`, async () => {
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: null,
        moveOut: moveOut.iso,
      });
    });
    await test.step(`Set "${md.moveInColumn}" on the same day as Move-Out: accepted (on or after)`, async () => {
      moveIn = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveInColumn,
        md.moveInDay
      );
      expect(
        moveIn.iso,
        "FAIL: Move-In must equal Move-Out for the boundary check"
      ).toBe(moveOut.iso);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: moveOut.iso,
      });
    });
    await test.step("Reload the Unit Tracker: only the valid dates persisted", async () => {
      await unitTracker.openUnitInTracker(md.unitLabel);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: moveOut.iso,
      });
    });
    await test.step("Contract page → Units tab: unit data consistent and unchanged", async () => {
      await verifyContractPage(baseline);
    });
  });

  test("TC566 @regression @unitTracker : Validate Move-Out and Move-In dates can be cleared with the clear button", async () => {
    let baseline, moveOut, moveIn;
    await test.step(`Precondition: unit ${md.unitLabel} has no dates; contract baseline recorded`, async () => {
      baseline = await precondition();
      await unitTracker.searchUnitContaining(md.unitLabel);
    });
    await test.step(`Set "${md.moveOutColumn}" (day ${md.moveOutDay}) and "${md.moveInColumn}" (day ${md.moveInDay})`, async () => {
      moveOut = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveOutColumn,
        md.moveOutDay
      );
      moveIn = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveInColumn,
        md.moveInDay
      );
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: moveOut.iso,
      });
    });
    await test.step(`Clear "${md.moveOutColumn}" while Move-In is set: API 200 with empty value; Move-In kept`, async () => {
      await unitTracker.clearMoveDate(md.unitLabel, unitId, md.moveOutColumn);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: null,
      });
    });
    await test.step(`Clear "${md.moveInColumn}": API 200 with empty value; both cells "${md.emptyCell}"`, async () => {
      await unitTracker.clearMoveDate(md.unitLabel, unitId, md.moveInColumn);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: null,
        moveOut: null,
      });
    });
    await test.step("Reload the Unit Tracker: both dates stay empty", async () => {
      await unitTracker.openUnitInTracker(md.unitLabel);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: null,
        moveOut: null,
      });
    });
    await test.step("Contract page → Units tab: unit data consistent and unchanged", async () => {
      await verifyContractPage(baseline);
    });
  });

  test("TC567 @regression @unitTracker : Validate Move-In and Move-Out dates in search result and exported CSV", async () => {
    let baseline, moveOut, moveIn, csv;
    await test.step(`Precondition: unit ${md.unitLabel} has no dates; contract baseline recorded`, async () => {
      baseline = await precondition();
      await unitTracker.searchUnitContaining(md.unitLabel);
    });
    await test.step(`Set "${md.moveOutColumn}" (day ${md.moveOutDay}) and "${md.moveInColumn}" (day ${md.moveInDay})`, async () => {
      moveOut = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveOutColumn,
        md.moveOutDay
      );
      moveIn = await unitTracker.setMoveDate(
        md.unitLabel,
        unitId,
        md.moveInColumn,
        md.moveInDay
      );
    });
    await test.step(`Reload and search ${md.unitLabel}: the search result shows both dates`, async () => {
      await unitTracker.openUnitInTracker(md.unitLabel);
      await unitTracker.verifyMoveDates(md.unitLabel, unitId, {
        moveIn: moveIn.iso,
        moveOut: moveOut.iso,
      });
    });
    await test.step("Reload without search and Export: a csv file is exported", async () => {
      await unitTracker.navigateToUnitTracker();
      await unitTracker.selectProperty();
      await unitTracker.waitForAllRowsLoaded();
      csv = await unitTracker.exportCsv();
    });
    await test.step(`CSV has "${md.moveInColumn}" / "${md.moveOutColumn}" and unit ${md.unitLabel} carries the new dates`, async () => {
      const [header, ...rows] = UnitTrackerPage.parseCsv(csv);
      const inCol = header.indexOf(md.moveInColumn);
      const outCol = header.indexOf(md.moveOutColumn);
      expect(
        inCol,
        `FAIL: CSV has no "${md.moveInColumn}" column`
      ).toBeGreaterThanOrEqual(0);
      expect(
        outCol,
        `FAIL: CSV has no "${md.moveOutColumn}" column`
      ).toBeGreaterThanOrEqual(0);
      const unitRows = rows.filter(r => r[0] === md.unitLabel);
      expect(
        unitRows.length,
        `FAIL: CSV must have exactly one row for unit ${md.unitLabel}`
      ).toBe(1);
      expect(
        unitRows[0][inCol],
        `FAIL: CSV "${md.moveInColumn}" of ${md.unitLabel} is wrong`
      ).toBe(moveIn.display);
      expect(
        unitRows[0][outCol],
        `FAIL: CSV "${md.moveOutColumn}" of ${md.unitLabel} is wrong`
      ).toBe(moveOut.display);
      Logger.success(
        `CSV unit ${md.unitLabel}: Move-In ${moveIn.display}, Move-Out ${moveOut.display}`
      );
    });
    await test.step("CSV Move-In / Move-Out of every unit match the API (MM/DD/YYYY, empty when not set)", async () => {
      const [header, ...rows] = UnitTrackerPage.parseCsv(csv);
      const inCol = header.indexOf(md.moveInColumn);
      const outCol = header.indexOf(md.moveOutColumn);
      const asCsv = v =>
        v ? UnitTrackerPage.displayDate(UnitTrackerPage.isoDay(v)) : "";
      const apiUnits = (await unitTracker.fetchAllRowsFromApi()).filter(
        r => r.__treeRowKind === "unit"
      );
      const csvByLabel = new Map(rows.map(r => [r[0], r]));
      const mismatches = [];
      for (const u of apiUnits) {
        const r = csvByLabel.get(String(u.hierarchy_label));
        if (!r) mismatches.push(`unit ${u.hierarchy_label} missing in CSV`);
        else if (
          r[inCol] !== asCsv(u[md.moveInField]) ||
          r[outCol] !== asCsv(u[md.moveOutField])
        )
          mismatches.push(
            `unit ${u.hierarchy_label}: csv ${r[inCol]}/${r[outCol]} api ${asCsv(u[md.moveInField])}/${asCsv(u[md.moveOutField])}`
          );
      }
      expect(
        mismatches.slice(0, 20),
        "FAIL: CSV move dates differ from the API"
      ).toEqual([]);
      Logger.success(
        `CSV move dates match the API for ${apiUnits.length} units`
      );
    });
    await test.step("Contract page → Units tab: unit data consistent and unchanged", async () => {
      await verifyContractPage(baseline);
    });
  });
});

/**
 * Manage Organization → Roles → Add role: permission catalogue — TC568 (MCP-verified 2026-11-16).
 * The live "Create role" drawer is captured as JSON (component → permissions with description and
 * control type) and compared with fixture/rolePermissionsBaseline.json, so any added / removed /
 * renamed / re-described / re-typed / re-ordered permission fails the run with a readable diff
 * (attached as role-permissions-diff.txt; the live JSON is attached as role-permissions-live.json).
 * Accept an intended change with UPDATE_ROLE_PERMISSIONS_BASELINE=1. Nothing is created: the drawer
 * is cancelled and the test asserts no write API call was made.
 */
test.describe("Manage Organization — Create role permissions", () => {
  test("TC568 @regression @manageTeam @roles : Validate Create role permission components and types match the baseline JSON", async ({
    page,
  }, testInfo) => {
    const roles = new ManageTeamRolesHelper(page);
    const writeCalls = [];
    const trackWrites = request => {
      if (request.url().includes("/api/") && request.method() !== "GET")
        writeCalls.push(`${request.method()} ${request.url()}`);
    };
    let live;
    await test.step("Dashboard → user menu → Manage Organization → Roles tab", async () => {
      await roles.landOrganizationWorkspaceViaMenu(process.env.DASHBOARD_URL);
      await roles.openRolesTab();
    });
    await test.step('Click "Add role": the "Create role" drawer opens with Name, Description and Permissions', async () => {
      page.on("request", trackWrites);
      await roles.openCreateRoleDrawer();
      await roles.verifyCreateRoleFormFields();
    });
    await test.step("Expand every component: log and assert each permission and its type (unchecked, enabled, toggles)", async () => {
      live = await roles.captureRolePermissions();
    });
    await test.step("Compare the live permissions JSON with fixture/rolePermissionsBaseline.json", async () => {
      await roles.compareRolePermissionsWithBaseline(live, testInfo);
    });
    await test.step("Cancel: drawer closes and no role is created", async () => {
      await roles.cancelCreateRole(writeCalls);
      page.off("request", trackWrites);
    });
  });
});
