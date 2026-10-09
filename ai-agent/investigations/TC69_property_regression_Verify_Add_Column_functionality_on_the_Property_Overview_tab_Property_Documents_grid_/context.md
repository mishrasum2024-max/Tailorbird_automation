# AI Failure Investigation Context

## Test

### Test Case

TC69 @property @regression : Verify Add Column functionality on the Property Overview tab (Property Documents grid)

### Test File

TC04_properties.spec.js

### Test Definition

Line: 995

Column: 8

### Project

chromium

### Tags

property, regression

### Expected Status

passed

### Actual Status

unexpected


---

# Failure


### Attempt 0

Status: failed

Duration: 113414 ms

Start Time: 2026-08-19T06:49:02.873Z

#### Error

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByRole('columnheader', { name: 'TC69 Add Column 1787122287089', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 10000ms[22m
[2m  - waiting for getByRole('columnheader', { name: 'TC69 Add Column 1787122287089', exact: true })[22m

```

#### Error Location

File: D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/tests/TC04_properties.spec.js

Line: 1026

Column: 87

#### Artifacts

Screenshot:
D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium/test-failed-1.png

Trace:
D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium/trace.zip

Error Context:
D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium/error-context.md


### Attempt 1

Status: failed

Duration: 112133 ms

Start Time: 2026-08-19T06:51:46.547Z

#### Error

```text
Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed

Locator: getByRole('columnheader', { name: 'TC69 Add Column 1787122449354', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
[2m  - Expect "toBeVisible" with timeout 10000ms[22m
[2m  - waiting for getByRole('columnheader', { name: 'TC69 Add Column 1787122449354', exact: true })[22m

```

#### Error Location

File: D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/tests/TC04_properties.spec.js

Line: 1026

Column: 87

#### Artifacts

Screenshot:
D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium-retry1/test-failed-1.png

Trace:
D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium-retry1/trace.zip

Error Context:
D:/Mishrasum2024_github_tailorbird/Tailorbird_automation/test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium-retry1/error-context.md




---

# Git Information

## Branch

main

## Commit

d1e024fbecdb20d3e99bf59481d1a93fda1e3aa6

## Repository Status

```
M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-directory-page.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-filter-panel-open.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-invite-dialog-empty.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-manage-columns-drawer.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-vendor-detail-activity.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-vendor-detail-overview.png
 M data/approverRolesAndUsers.json
 M data/bidData.json
 M data/drawReportingPropertyData.json
 M data/fgaCreatedUsers.json
 M data/multiApproverInvoices.json
 M data/multiYearBudgetPropertyData.json
 M downloads/file_upload-data.csv
 M downloads/property-data.csv
 M downloads/property.json
 M package-lock.json
 M package.json
 M playwright.config.js
 M tests/TC01_login.spec.js
 M tests/TC04_properties.spec.js
?? .claude/
?? .mcp.json
?? .playwright-mcp/
?? All_TestCases_Documentation.csv
?? Menu_coverage.xlsx
?? MultiYearBudget_Coverage_Report.md
?? TC03_Test_Coverage_Detailed_Report.md
?? TC03_Test_Coverage_Summary.csv
?? TC03_test_assertions.md
?? TC04_Assertions_Report.md
?? TC05_Project_Test_Coverage.md
?? TC06_Assertion_Coverage.md
?? ai-agent/
?? all-approvals-response.json
?? data/lastCreatedJob.json
?? data/oooChainData.json
?? data/projectData.json
?? data/propertyData.json
?? downloads/budget-data.csv
?? downloads/category-data.csv
?? downloads/drawReportingControlsSnapshot.json
?? downloads/drawReportingExistingPropertySnapshot.json
?? downloads/drawReportingUiSnapshot.json
?? downloads/interior_paint_bid.xlsx
?? downloads/interior_paint_bid_book.xlsx
?? downloads/invoice-data.csv
?? downloads/jobs-export.csv
?? downloads/multi_year_budget_detail-data.csv
?? downloads/myb_invalid_upload_1786436739998.csv
?? downloads/myb_invalid_upload_1786437718213.csv
?? downloads/myb_invalid_upload_1786442437538.csv
?? downloads/myb_invalid_upload_1786444017674.csv
?? downloads/myb_invalid_upload_1786445102503.csv
?? downloads/myb_invalid_upload_1786446262542.csv
?? downloads/myb_invalid_upload_1786514528064.csv
?? downloads/myb_invalid_upload_1786515795681.csv
?? downloads/organization-data.csv
?? downloads/property_exterior_takeoff-data.csv
?? downloads/property_interior_takeoff-data.csv
?? downloads/site-data.csv
?? downloads/table.csv
?? downloads/tc410_valid_new_item_upload_1786436770857.csv
?? downloads/tc410_valid_new_item_upload_1786437747546.csv
?? downloads/tc410_valid_new_item_upload_1786442468078.csv
?? downloads/tc410_valid_new_item_upload_1786444048928.csv
?? downloads/tc410_valid_new_item_upload_1786445130936.csv
?? downloads/tc410_valid_new_item_upload_1786446293616.csv
?? downloads/tc410_valid_new_item_upload_1786514561730.csv
?? downloads/tc410_valid_new_item_upload_1786515836341.csv
?? "files/Misora_Bid_Leveling_Reference_with data(Aggregate Summary).csv"
?? mvb-health-green-check.png
?? mvb-health-positive-variance.png
?? mvb-health-yellow-check.png
?? mvb-health-zero-variance.png
?? mvb-initial-table.png
?? scripts/notion-agent.js
?? scripts/notion-client.js
?? scripts/notion-feature-parser.js
?? scripts/slack-agent-step1.js
?? scripts/slack-agent.js
?? tc10_column_fix_run.log
?? tc10_remaining_run1.log
?? tc168_run.log
?? tc168_run2.log
?? tc205_run.log
?? tc244_run.txt
?? tc244_run1.txt
?? tc244_run2.txt
?? tc273_solo_run.log
?? tc273_solo_run2.log
?? tc273_tc272_run.log
?? tc355_run.log
?? tc360_run1.log
?? tc372_run.log
?? tc372_run2.log
?? tc372_run3.log
?? tc372_run4.log
?? tc372_run5.log
?? tests/multi_approver_happy_path.md
?? tests/retainage_happy_path_pr978.md
?? vendor_headed_run1.log
?? vendor_headed_run2.log
?? vendor_headless_run1.log
?? vendor_headless_run2.log
```

## Recent Commits

```
d1e024f | sumitmishra1712 | 2026-08-19 11:54:55 +0530 | fixes to test ai agent
eaf83cd | sumitmishra1712 | 2026-08-18 22:58:24 +0530 |  final push
0f4f6b7 | sumitmishra1712 | 2026-08-18 18:08:17 +0530 | fixes
a7d9af0 | sumitmishra1712 | 2026-08-18 11:10:25 +0530 | full regression run
a4a8e0e | sumitmishra1712 | 2026-08-14 17:15:21 +0530 |  final fixes
```

## Most Recent Commit Changes

```
.github/workflows/playwright.yml | 14 +++++++++++---
 1 file changed, 11 insertions(+), 3 deletions(-)
```


---

# Test Source

File:

TC04_properties.spec.js

```javascript
﻿/** TC04 â€” Properties. MCP + screenshots: `mcp-reference-screenshots-tc04/`. */
require('dotenv').config();
const { test, expect } = require('@playwright/test');
const PropertiesHelper = require('../pages/properties');
const data = require('../fixture/organization.json');
import fs from 'fs';
import path from 'path';
import { getPropertyName } from '../utils/propertyUtils';
import testData from '../fixture/property.json';
const uiMessages = require('../fixture/tailorbirdUiMessages.json');
const loc = require('../locators/locationLocator');
const { verifyColumnContentDoesNotWrap, forceGridFullWidth } = require('../utils/columnResizeHelper');
import { propertyLocators, filterButtonStrategies, filterCloseButtonStrategies, assetViewerTabStrategies, dropdownInputByLabelStrategies, exportButtonStrategies } from '../locators/propertyLocator.js';
const { healingLocator } = require('../utils/locatorHealer');
const { ProjectPage } = require('../pages/projectPage');
const { AddColumnPage } = require('../pages/addColumnPage');
const { Logger } = require('../utils/logger');
const { CapexPage } = require('../pages/capexPage');
const { CapexColumnPersistencePage } = require('../pages/capexColumnPersistencePage');
const { CapexGridStabilityPage } = require('../pages/capexGridStabilityPage');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');

test.use({
  storageState: 'sessionState.json',
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure'
});

/** TC23/TC24: initial URL from `.env` `DASHBOARD_URL` when set; else fixture default. */
const tcTakeoffsStartUrl = process.env.DASHBOARD_URL || data.dashboardUrl;

/** Table area screenshot: rows change across runs; mask search; allow modest drift. */
const PROPERTY_REGRESSION_SCREENSHOT = {
  animations: 'disabled',
  maxDiffPixels: 50_000,
  maxDiffPixelRatio: 0.3,
};

const propertyTypes = [
  "Garden Style",
  "Mid Rise",
  "High Rise",
  "Military Housing"
];

let context, page, prop;
let name = `name_${Date.now()}`;
let address = `Domestic Terminal, College Park, GA 30337, USA`;
let city = `College Park`;
let state = `GA`;
let zip = `30337`;
let property_type = propertyTypes[Math.floor(Math.random() * propertyTypes.length)];
let garden_style = `Garden Style`;
let mid_rise = `Mid Rise`;
let high_rise = `High Rise`;
let military_housing = `Military Housing`;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: 'sessionState.json' });
  page = await context.newPage();
  prop = new PropertiesHelper(page);
  await prop.goto(tcTakeoffsStartUrl);
  await ensureLeftPanelExpanded(page);
  await prop.goToProperties();
  page.on('domcontentloaded', async () => {
    await page.evaluate(() => {
      const elements = document.querySelectorAll('main, .mantine-AppShell-navbar');
      elements.forEach(el => {
        el.style.zoom = '70%';
      });
    });
  });

  await page.evaluate(() => {
    const elements = document.querySelectorAll('main, .mantine-AppShell-navbar');
    elements.forEach(el => {
      el.style.zoom = '70%';
    });
  });
});

test.afterAll(async () => {
  if (context) await context.close();
});

test.describe('PROPERTY', () => {
  test.describe.configure({ retries: 1 });

  test('TC49 @sanity @mandatory @regression @property @contract - Validate Property Export Functionality and New Property Creation', async () => {
    await test.step('Table View â€” BirdTable toolbar (Export) is available', async () => {
      await prop.changeView(testData.viewName);
    });

    await test.step('Export current table data (CSV/XLSX/PDF)', async () => {
      await prop.exportButton();
    });

    await test.step('Create property via modal, assert success toast copy, then list', async () => {
      await prop.createProperty(name, address, city, state, zip, property_type, uiMessages);
    });

    await test.step('Write propertyData.json / downloads snapshot for downstream tests', async () => {
      const propertyData = {
        propertyName: name
      };

      const filePath = path.join(__dirname, '../data/propertyData.json');

      if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(propertyData, null, 2));
      const fromDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(
        fromDisk.propertyName,
        'propertyData.json must record the property name from this run â€” empty or mismatch means create flow did not complete.',
      ).toBe(name);

      const downloadPath = path.join(process.cwd(), 'downloads', 'property.json');
      fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
      fs.writeFileSync(downloadPath, JSON.stringify(propertyData, null, 2), 'utf-8');
      expect(JSON.parse(fs.readFileSync(downloadPath, 'utf-8')).propertyName).toBe(name);
    });
  });

  test.skip('TC50 @regression @property - Change Property View and Validate Search Results', async () => {
    const propertyName = getPropertyName();
    await prop.changeView(testData.viewName);
    await prop.searchProperty(propertyName);
    await prop.clearSearch("");
  });

  test.skip('TC51 @sanity @property @regression - Validate Filters: Garden, Mid-Rise, High-Rise, and Military', async () => {
    await prop.changeView(testData.viewName);
    const filterBtn = healingLocator(filterButtonStrategies(page));
    await filterBtn.waitFor({ state: 'visible' });
    await filterBtn.click();

    const filterDrawer = prop.filterPopup();
    await filterDrawer.waitFor({ state: 'visible', timeout: 15000 });
    await expect(filterDrawer.getByRole('button', { name: 'Reset Filters' })).toHaveCount(0);

    await prop.filterProperty(garden_style);
    await prop.filterProperty(mid_rise);
    await prop.filterProperty(high_rise);
    await prop.filterProperty(military_housing);
    console.log('[TC51] All four property-type filter cycles complete (row counts logged per filter in filterProperty).');

    await expect(filterDrawer.getByRole('button', { name: 'Reset Filters' })).toHaveCount(0);

    const filterCloseBtn = healingLocator(filterCloseButtonStrategies(filterDrawer));
    await filterCloseBtn.waitFor({ state: 'visible' });
    await filterCloseBtn.click();
  });

  test.skip('TC52 @regression @property - Validate All Column Headers in Table View', async () => {
    await prop.changeView('Table View');
    // MCP-verified live (2026-07-28): this grid virtualizes rightmost columns out of the DOM
    // at narrower effective render widths (1280px renders only 9 of 14 columns; 1920px renders
    // all 14) — the per-column scroll-by-increment + .nth(index) lookups below assume every
    // column is already mounted, so force full width once up front instead of relying on
    // scrollHorizontally() to keep pace with a virtualization boundary that can shift with
    // viewport/font metrics.
    await forceGridFullWidth(page);
    for (let i = 0; i < testData.expectedHeaders.length; i++) {
      await prop.scrollHorizontally(i);
      const headerTxt = await prop.getHeaderText(i);
      await prop.validateHeader(i, testData.expectedHeaders[i], expect);
      console.log("OK =>", headerTxt)
    }
    await prop.scrollBackToStart();
  });

  test.skip('TC53 @regression @property - Validate Overview Fields and Property Document Actions', async () => {
    await prop.goToProperties();
    await page.waitForTimeout(30000);
    await page.waitForTimeout(2000);
    const propName = getPropertyName();
    const vals = {
      "Property Name": propName,
      "Address": address,
      "City": city,
      "State": state,
      "Zip Code": zip,
      "property_type": property_type
    };

    await prop.changeView(testData.viewName);
    await prop.searchProperty(propName);

    await prop.viewPropertyDetails(propName);
    await page.locator('[role="tab"]').first().waitFor({ state: 'visible', timeout: 40000 });
    await prop.validateTabs();
    await prop.validateOverviewFields(vals);

    await prop.uploadPropertyDocument(path.resolve("./files/property_data.csv"));
    await page.waitForTimeout(30000);
    await prop.exportButton();

  });

  test.skip('TC54 @regression @property - Validate Document Section Table', async () => {
    await prop.goto(tcTakeoffsStartUrl);
    const propertyName = getPropertyName();
    await prop.goToProperties();
    await prop.changeView('Table View');
    await prop.openPropertyDetails(propertyName);
    await prop.validatePropertyDocumentsSection();
    await prop.validateDocumentTableHeaders();
    await prop.validateFirstRowValues();
  });

  test.skip('TC55 @regression @property - validate add data form', async () => {
    await prop.goToProperties();
    const propertyName = getPropertyName();
    console.log('Using property name:', propertyName);
    await prop.changeView('Table View');
    await prop.searchProperty(propertyName);
    await prop.viewDetailsButton();
    await prop.addDataColoumn();
    await prop.addData();

  });

  test.skip("TC56 @sanity @regression @property - Validate Location Tab", async () => {
    test.setTimeout(180000);
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    const propertyName = 'Test Property 1_Cottages on Elm';
    await test.step('Search and open property', async () => {
      await prop.changeView('Table View');
      await prop.searchProperty(propertyName);
      await prop.viewDetailsButton();
    });
    await test.step('Location tab - Sites grid', async () => {
      await prop.openLocationTab();
      await prop.addButton();
      await prop.addRowDetail();
      await prop.deleteRow();
    });
    await test.step('Add column and settings', async () => {
      await prop.addColumndata();
      await prop.settingsPanel();
      await prop.deleteCustomColumn();
      await prop.closeSettingsDrawer();
    });
    await test.step('Verify Unit view', async () => {
      await prop.selectLocation("unit");
      await prop.expectUnitTable();
    });
    await test.step('Verify Building view', async () => {
      await prop.selectLocation("building");
      await page.waitForTimeout(7000);
      await prop.expectBuildingTable();
    });
  });

  test.skip('TC57 @sanity @regression @property - validate takeoffs Interior panel and dropdowns', async () => {
    test.setTimeout(240000);
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    const propertyName = 'Test Property 1_Cottages on Elm';
    console.log(`ðŸ”Ž Using property name: ${propertyName}`);
    await prop.changeView('Table View');
    await prop.searchProperty(propertyName);
    await prop.viewDetailsButton();
    await prop.takeoffOption();
    await prop.interiorANDexteriorTab();
    const headerLocator = page.locator('[role="columnheader"]');
    await expect(headerLocator.filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await prop.exportButton();
    await prop.filtertab();
    // await prop.unitMix(); // Unit mix option removed from UI
    await prop.addPropertyTakeOff('interior');
    // await prop.addColumnTakeOff('interior');
  });

  test.skip('TC58 @sanity @regression @property - validate takeoffs Exterior panel and dropdowns', async () => {
    test.setTimeout(240000);
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    const propertyName = 'Test Property 1_Cottages on Elm';
    console.log(`ðŸ”Ž Using property name: ${propertyName}`);
    await prop.changeView('Table View');
    await prop.searchProperty(propertyName);
    await prop.viewDetailsButton();
    await prop.takeoffOption();
    await prop.interiorANDexteriorTab();
    await prop.clickExteriortab();
    const headerLocator = page.locator('[role="columnheader"]');
    await expect(headerLocator.filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    await prop.exportButton();
    // await prop.unitMix(); // Unit mix option removed from UI
    await prop.addPropertyTakeOff('exterior');
    // await prop.addColumnTakeOff('exterior');
  });

  test.skip('TC59 @sanity @regression @property - Validate Asset Viewer dropdown options and verify each selection', async () => {
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    test.setTimeout(480000)

    const log = (...msg) => console.log("ðŸ”¹", ...msg)
    const testStartedAt = Date.now();
    const TIME_BUDGET_MS = 420000; // keep headroom before Playwright test timeout

    const wait = async () => {
      if (page.isClosed()) throw new Error('Page closed during TC25 wait helper');
      if (Date.now() - testStartedAt > TIME_BUDGET_MS) {
        throw new Error('TC25 time budget exceeded before completion');
      }
      log("Waiting network idle")
      try { await page.waitForLoadState("networkidle", { timeout: 500 }); } catch { log("âš  networkidle skipped") }
      await page.waitForTimeout(200)
    }

    const safe = async (label, fn) => {
      if (page.isClosed()) throw new Error(`Page already closed before step: ${label}`);
      log(`START: ${label}`);
      try {
        await wait();
        await fn();
        log(`âœ” DONE: ${label}`);
      } catch (e) {
        log(`â— FAIL: ${label}`, e.message);
        throw e;
      }
    };

    const getImg = async () => {
      const c = await page.locator('img').count();
      if (c > 0) {
        const src = await page.locator('img').first().getAttribute('src');
        log(`IMAGE FOUND â†’ ${src}`);
        return src;
      }
      log('NO IMAGE FOUND');
      return null;
    };

    await safe("Changing table view", async () => await prop.changeView("Table View"))
    await safe("Searching property", async () => await prop.searchProperty("Test Property 2_The Westerham"))
    await safe("Opening View Details", async () => await prop.viewDetailsButton())
    await safe("Opening Asset Viewer", async () => await healingLocator(assetViewerTabStrategies(page)).click({ force: true }))

    await page.waitForTimeout(30000);
    await page.waitForTimeout(3000);

    log("Getting Asset Viewer panel id...")
    let tab = healingLocator(assetViewerTabStrategies(page))
    let id = await tab.getAttribute("aria-controls")

    while (!id) {
      if (Date.now() - testStartedAt > TIME_BUDGET_MS) {
        throw new Error('Timed out waiting for Asset Viewer panel id');
      }
      log("aria-controls not ready â†’ retrying")
      await page.waitForTimeout(250)
      id = await tab.getAttribute("aria-controls")
    }

    log("PANEL ID =", id)
    let pnl = page.locator(`#${id}`)

    await expect(pnl).toBeVisible({ timeout: 30000 })
    log("PANEL LOADED & VISIBLE")

    await wait()

    const labels = await pnl.locator("label").allTextContents()
    log("DROPDOWN LABELS DETECTED â†’", labels)

    const seenLabels = new Set()
    const dropdowns = labels
      .map(l => l.trim())
      .filter(name => name.length > 0)
      .filter(name => {
        if (seenLabels.has(name)) return false
        seenLabels.add(name)
        return true
      })
      .map(name => ({
        name,
        // Use first() to avoid strict-mode collisions when similar inputs exist in panel.
        input: healingLocator(dropdownInputByLabelStrategies(pnl, name)).first()
      }))

    log(`TOTAL DROPDOWNS FOUND = ${dropdowns.length}`)

    let REPORT = []

    for (const dd of dropdowns) {
      log(`PROCESSING DROPDOWN â†’ ${dd.name}`)

      let out = { dropdown: dd.name, options: [], results: [], disabled: false }

      await wait()

      let count = await dd.input.count()
      log(`INPUT COUNT for '${dd.name}' = ${count}`)
      if (count === 0) { log("DROPDOWN INPUT NOT FOUND â†’ SKIPPING"); REPORT.push(out); continue }
      const loc = dd.input

      let enabled = await loc.isEnabled().catch(() => false)
      log(`DROPDOWN '${dd.name}' ENABLED? â†’`, enabled)

      if (!enabled) {
        log(` '${dd.name}' DISABLED â€” FULL SKIP`)
        out.disabled = true
        REPORT.push(out)
        continue
      }

      await safe(`Opening dropdown: ${dd.name}`, async () => await loc.click({ force: true }))

      let list = page.locator(`#${await loc.getAttribute("aria-controls")} [role='option']`)
      let total = await list.count()

      log(`OPTION COUNT for '${dd.name}' = ${total}`)

      if (total === 0) { log("ZERO OPTIONS â†’ SKIP"); REPORT.push(out); continue }
      if (total > 20) { log("VISIBILITY FILTER ACTIVATED"); list = list.filter({ has: page.locator("[role='option']:visible") }); total = await list.count() }
      const maxOptionsPerDropdown = 8;
      if (total > maxOptionsPerDropdown) {
        log(`OPTION COUNT CAPPED for '${dd.name}' from ${total} to ${maxOptionsPerDropdown} to stay within test budget`);
        total = maxOptionsPerDropdown;
      }

      for (let i = 0; i < total; i++) {
        if (Date.now() - testStartedAt > TIME_BUDGET_MS) {
          log(`TIME BUDGET REACHED while processing '${dd.name}'. Saving partial report and exiting loops.`);
          i = total;
          break;
        }

        log(`\n DROPDOWN '${dd.name}' â†’ OPTION ${i + 1}/${total}`)

        await wait()

        let raw = await list.nth(i).innerText().catch(() => null)
        if (!raw) {
          log("FAILED TO READ OPTION TEXT â†’ SKIP")
          continue
        }

        let option = raw.split("\n")[0].trim()
        out.options.push(option)

        log(`Selecting option â†’ ${option}`)

        let before = await getImg()
        await safe(`Clicking option '${option}'`, async () => await list.nth(i).click({ force: true }))
        await wait()
        let after = await getImg()

        if (before === null && after === null) {
          log(`NO IMAGE FOR '${option}' â†’ SKIPPED BUT CONTINUING`)
          out.results.push({ option, image: "none" })
        }
        else if (before !== after) {
          log(`IMAGE UPDATED for '${option}'`)
          out.results.push({ option, imageChanged: true })
        }
        else {
          log(`IMAGE STATIC for '${option}'`)
          out.results.push({ option, imageChanged: false })
        }

        if (i < total - 1) {
          log(`Reopening '${dd.name}' for next option`)
          await safe(`Reopen dropdown '${dd.name}'`, async () => await loc.click({ force: true }))
        }
      }

      REPORT.push(out)
    }

    expect(REPORT.length, 'Asset viewer panel must expose at least one dropdown').toBeGreaterThan(0);

    log("\n EXPORTING FULL JSON LOG â†’ dropdown_report.json")

    await page.evaluate(r => {
      const a = document.createElement("a")
      a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }))
      a.download = "dropdown_report.json"
      a.click()
    }, REPORT)

    log("\n EXECUTION COMPLETE\n")

  });

  test.skip('TC60 @regression @property - Validate Filters: gibberish', async () => {
    await prop.goToProperties();
    await prop.changeView('Table View');
    name = 'gibberish';
    await prop.searchInvalidProperty(name);
    await page.waitForTimeout(30000);
    await page.waitForTimeout(2000);
    const firstRowNameCell = page.locator(propertyLocators.firstRowNameCell);
    await expect(firstRowNameCell).not.toBeVisible();
    console.log(`No record found : ${name}`);

  });

  test.skip('TC61 @regression @property - validate No models available in asset viewer tab', async () => {
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    await page.waitForTimeout(30000);
    await page.waitForTimeout(2000);
    const propertyName = 'Test Property 1_Cottages on Elm';
    console.log('Using property name:', propertyName);
    await prop.changeView('Table View');
    await prop.searchProperty(propertyName);
    await prop.viewDetailsButton();
    await page.waitForTimeout(30000);
    await prop.clickAssetViewer();
    await page.waitForTimeout(30000);
    await page.waitForTimeout(2000);
    await prop.assetViewerpanel();
    await prop.exportBtn();
    await prop.assertOptions();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await prop.clickexportBtn();
    await page.waitForTimeout(30000);
    await prop.assertselectAllOption();
    await prop.bottonActionassertion();
    await prop.iconAssertion();
  });

  test("TC62 @sanity @property - Validate add Units rows inside Locations and no duplicate row added", async () => {
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    await prop.changeView('Table View');
    const propertyName = 'Test Property 1_Cottages on Elm';
    console.log(`Using property name: ${propertyName}`);

    // Change view & search property
    await prop.changeView('Table View');
    console.log("Changed to Table View");

    await prop.searchProperty(propertyName);
    console.log("Property searched successfully");

    await prop.viewDetailsButton();

    const locationsTab = healingLocator(loc.locationsTabStrategies(page)).first();
    await expect(locationsTab).toBeVisible({ timeout: 15000 });
    await locationsTab.click();
    await expect(locationsTab).toHaveAttribute('data-active', 'true');
    console.log("Locations tab opened");

    await prop.selectLocation("unit");
    await page.waitForLoadState('domcontentloaded');
    const locationsPanel = healingLocator(loc.locationsTabpanelStrategies(page));
    const noUnitsState = locationsPanel.getByText(/No units added yet/i).first();

    await expect(
      locationsPanel.getByRole("columnheader", { name: /Unit Name/i }).first(),
    ).toBeVisible({ timeout: 55000 });

    await prop.addButton();
    let unitName = "A new unit";
    let createdNewUnit = true;
    try {
      await prop.addLocationRowByName(unitName);
    } catch (e) {
      // MCP investigation shows some runs expose Units as read-only (no add-row action surfaced).
      // In this case, verify empty-state copy instead of forcing row creation.
      createdNewUnit = false;
      const noUnitsAfterAdd = locationsPanel.getByText(/No units added yet/i).first();
      if (await noUnitsAfterAdd.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(noUnitsAfterAdd).toBeVisible();
        await expect(locationsPanel.getByText(/Use \+ or Create Button to create one/i)).toBeVisible();
        test.skip(true, 'Units panel still in empty-state after add attempt â€” export assertions not testable');
      }
      const firstUnitCell = locationsPanel
        .locator('[role="treegrid"] [role="row"] [role="gridcell"]')
        .first();
      await expect(firstUnitCell).toBeVisible({ timeout: 15000 });
      unitName = ((await firstUnitCell.innerText()).trim() || unitName);
      console.log(`Units add-row not available in this run, validating export with existing unit: ${unitName}`);
    }

    await page.waitForTimeout(1500);

    const exportInLocations = healingLocator(exportButtonStrategies(healingLocator(loc.locationsTabpanelStrategies(page)))).first();
    await exportInLocations.waitFor({ state: 'visible', timeout: 15000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportInLocations.click(),
    ]);

    const fs = require("fs");
    const filePath = await download.path();
    const csvText = fs.readFileSync(filePath, "utf8");

    console.log(csvText);

    function parseCSV(csv) {
      const lines = csv.trim().split("\n");

      const headers = lines[0]
        .split(",")
        .map(h => h.trim().replace(/^"|"$/g, ""));

      console.log("CSV Headers:", headers);

      return lines.slice(1).map((line, index) => {
        const values = line
          .split(",")
          .map(v => v.trim().replace(/^"|"$/g, ""));

        const rowObj = Object.fromEntries(headers.map((h, i) => [h, values[i]]));

        console.log(`Row ${index + 1}:`, rowObj);

        return rowObj;
      });
    }

    const parsedData = parseCSV(csvText);

    console.log(parsedData);

    const unitColumn = Object.keys(parsedData[0]).find(k =>
      k.toLowerCase().includes("unit")
    );

    console.log(" Detected Unit Column â†’", unitColumn);
    expect(unitColumn).toBeTruthy();

    const rowsWithUnit = parsedData.filter(row => row[unitColumn] === unitName);

    console.log(`\n Found "${unitName}" in ${rowsWithUnit.length} row(s)`);

    expect(rowsWithUnit.length).toBeGreaterThan(0);

    if (createdNewUnit) {
      await prop.deleteLocationRowByName(unitName);
    }
  });

  // -------------------------------------------------------------------------
  // Regression bundle: single Properties load + merged negative/edge/bench + multi-screen visuals (was TC04-reg-01â€¦07, bench, vis).
  // Saves runtime vs per-test navigation. Add baselines: npx playwright test tests/TC04_properties.spec.js -g TC04-reg-bundle --update-snapshots
  // -------------------------------------------------------------------------
  test.describe.skip('PROPERTY', () => {
    test('TC63 @regression @property Negative, edge, bench, visuals (single Properties load)', async () => {
      const searchMask = page.locator('main input[placeholder="Search..."], main [role="textbox"][placeholder="Search..."]').first();
      const shotMain = {
        ...PROPERTY_REGRESSION_SCREENSHOT,
        mask: [searchMask],
      };

      await test.step('Load Properties workspace once (Table View)', async () => {
        await prop.goto(tcTakeoffsStartUrl);
        await prop.goToProperties();
        await page.waitForLoadState('domcontentloaded');
        await page.evaluate(() => {
          document.querySelectorAll('main, .mantine-AppShell-navbar').forEach(el => {
            el.style.zoom = '70%';
          });
        });
        let searchReady = false;
        for (let attempt = 0; attempt < 3 && !searchReady; attempt++) {
          await prop.changeView('Table View');
          searchReady = await searchMask.isVisible({ timeout: 5000 }).catch(() => false);
          if (!searchReady) {
            await prop.goToProperties();
            await page.waitForTimeout(1500);
          }
        }
        await expect(searchMask).toBeVisible({ timeout: 15_000 });
      });

      await test.step('Visual: toolbar and column headers (no data rows)', async () => {
        // Full-main comparison always fails because property data changes between runs.
        // Instead compare only stable non-data elements: toolbar action buttons and column header row.
        const shotStable = { ...PROPERTY_REGRESSION_SCREENSHOT };

        // Toolbar: the row of action buttons (Filter, View, Table, Export, Create Property)
        const toolbar = page.locator('main').getByRole('button', { name: /Filter|Export|View|Table|Create Property/i }).first()
          .locator('xpath=ancestor::*[contains(@class,"mantine-Group") or contains(@class,"toolbar") or @role="toolbar"][1]')
          .or(page.locator('main [class*="toolbar"], main [class*="Toolbar"]').first())
          .or(page.locator('main').locator('button:has-text("Create Property")').locator('../..'));
        try {
          await toolbar.first().waitFor({ state: 'visible', timeout: 8_000 });
          await expect(toolbar.first()).toHaveScreenshot('properties-toolbar.png', shotStable);
        } catch (e) {
          console.log(`[TC63] Visual toolbar soft-fail: ${e.message.split('\n')[0]}`);
        }

        // Column headers: the stable header row of the table grid (never contains dynamic data)
        const colHeaderRow = page.locator('main [role="row"]')
          .filter({ has: page.locator('[role="columnheader"]') }).first();
        try {
          await colHeaderRow.waitFor({ state: 'visible', timeout: 8_000 });
          await expect(colHeaderRow).toHaveScreenshot('properties-colheaders.png', shotStable);
        } catch (e) {
          console.log(`[TC63] Visual col-headers soft-fail: ${e.message.split('\n')[0]}`);
        }
      });

      await test.step('TC04-reg-01: Very long search yields no matching row', async () => {
        const longQuery = `x`.repeat(500);
        await prop.searchInvalidProperty(longQuery);
        await expect(page.locator(propertyLocators.firstRowNameCell).nth(0)).not.toBeVisible({ timeout: 8000 });
        await prop.clearSearch('');
      });

      await test.step('TC04-reg-02: Markup-like search does not break grid', async () => {
        await prop.searchInvalidProperty('"><img src=x onerror=alert(1)>');
        await expect(page.locator('body')).toBeVisible();
        await expect(page.locator(propertyLocators.firstRowNameCell).nth(0)).not.toBeVisible({ timeout: 8000 });
        await prop.clearSearch('');
      });

      await test.step('TC04-reg-03: Filter drawer + visual + close', async () => {
        await page.locator(propertyLocators.birdTableFilterButton).waitFor({ state: 'visible', timeout: 15000 });
        await page.locator(propertyLocators.birdTableFilterButton).click();
        const filterDrawer = prop.filterPopup();
        await filterDrawer.waitFor({ state: 'visible', timeout: 15000 });
        await expect(filterDrawer.getByRole('button', { name: 'Reset Filters' })).toHaveCount(0);
        await expect(filterDrawer).toHaveScreenshot('properties-filter-drawer.png', {
          ...PROPERTY_REGRESSION_SCREENSHOT,
        });
        await filterDrawer.locator('.mantine-CloseButton-root').click();
        await expect(filterDrawer).toBeHidden({ timeout: 10000 });
      });

      await test.step('TC04-reg-04: Bogus search then valid property', async () => {
        await prop.searchInvalidProperty('__tb_no_property_match_zz__');
        await expect(page.locator(propertyLocators.firstRowNameCell).nth(0)).not.toBeVisible({ timeout: 8000 });
        await prop.searchProperty(getPropertyName());
      });

      await test.step('TC04-reg-05: Whitespace-only search; grid usable', async () => {
        await prop.searchInvalidProperty('   \t  \u00a0  ');
        await expect(searchMask).toBeVisible();
        await expect(page.locator('[role="treegrid"], main').first()).toBeVisible({ timeout: 15000 });
        await prop.clearSearch('');
      });

      await test.step('TC04-reg-06 + visual: empty-state copy and screenshot', async () => {
        await prop.searchInvalidProperty(`__tb_empty_grid_${Date.now()}__`);
        await expect(page.getByText(/No properties added yet|No results/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText(/Use \+ or Create Button to create one|Nothing matches your filters/i)).toBeVisible();
        await expect(page.locator('main').first()).toHaveScreenshot('properties-main-empty-state.png', shotMain);
        await prop.clearSearch('');
      });

      await test.step('TC04-reg-07: Add Property empty submit (negative)', async () => {
        await page.locator(propertyLocators.createPropertyButton).first().click({ force: true });
        await expect(prop.addPropertyDialog()).toBeVisible({ timeout: 15_000 });
        await page.getByRole('button', { name: /\badd property\b/i }).click();
        await expect(async () => {
          const dialog = prop.addPropertyDialog();
          const mantineErrors = await dialog.locator('.mantine-Input-error').count();
          const dialogCopy = (await dialog.innerText()).toLowerCase();
          const nameInput = dialog.getByRole('textbox', { name: /^name$/i }).first();
          const nativeMsg = await nameInput
            .evaluate(el => (el instanceof HTMLInputElement ? el.validationMessage : ''))
            .catch(() => '');
          return (
            mantineErrors > 0 ||
            /is required|must be|invalid/.test(dialogCopy) ||
            /please fill out this field|fill out this field/i.test(nativeMsg) ||
            nativeMsg.length > 0
          );
        }).toPass({ intervals: [100, 300, 600], timeout: 12_000 });
        const failedCreateToast = page
          .locator('.mantine-Notification-root')
          .filter({ hasText: uiMessages.propertyCreateFailedToastPrefix });
        await expect(
          failedCreateToast,
          'Empty form must not proceed to API failure toast; client validation should block submit.',
        ).toHaveCount(0);
        // MCP-verified behavior: Cancel may close asynchronously; add resilient close sequence.
        const dialog = prop.addPropertyDialog();
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await page.keyboard.press('Escape').catch(() => { });
        const closeX = dialog.locator('button[aria-label="Close"], .mantine-CloseButton-root').first();
        if (await closeX.isVisible().catch(() => false)) {
          await closeX.click().catch(() => { });
        }
        await expect(dialog.first()).toBeHidden({ timeout: 15_000 });
      });

      await test.step('TC04-bench-mcp: Search placeholder', async () => {
        await expect(page.getByPlaceholder('Search...').first()).toBeVisible({ timeout: 15_000 });
      });
    });
  });

  test('@regression @property TC64 - Reject property creation with empty name', async () => {
    await prop.goToProperties();
    await page.waitForTimeout(30000);

    await page.locator(propertyLocators.createPropertyButton).first().waitFor({ state: 'visible', timeout: 15000 });
    await page.locator(propertyLocators.createPropertyButton).first().click({ force: true });

    const dialog = prop.addPropertyDialog();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    // Leave name empty to trigger required-field validation; fill all other fields with valid data.
    await prop.nameInput.fill('');
    await prop.cityInput.fill(city);
    await prop.stateInput.fill(state);
    await prop.zipInput.fill(zip);
    await prop.addressInput.fill(address);
    const addressOpt = page.locator(propertyLocators.addressSuggestion(address)).first();
    await addressOpt.waitFor({ state: 'attached', timeout: 30000 });
    await addressOpt.evaluate(el => el.click());
    await prop.typeInput.fill(garden_style);
    const typeOpt = page.locator(propertyLocators.propertyTypeOption(garden_style)).first();
    await typeOpt.waitFor({ state: 'attached', timeout: 15000 });
    await typeOpt.evaluate(el => el.click());
    await page.waitForTimeout(1000);

    await dialog.getByRole('button', { name: /\badd property\b/i }).click();

    // Property must not be created when name is empty (required field validation).
    const wasCreated = await page
      .locator('.mantine-Notification-root')
      .filter({ hasText: uiMessages.propertyCreatedToastTitle })
      .filter({ hasText: uiMessages.propertyCreatedToastMessage })
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    expect(
      wasCreated,
      'Property must not be created when the name field is empty — the app must enforce the required Name field.',
    ).toBe(false);

    // Dialog must remain open because validation should have blocked the submit.
    await expect(
      dialog,
      'Add Property dialog should stay open when the name is empty.',
    ).toBeVisible({ timeout: 3000 });

    // Clean up
    await dialog.getByRole('button', { name: 'Cancel' }).click().catch(() => { });
    await page.keyboard.press('Escape').catch(() => { });
    await expect(dialog.first()).toBeHidden({ timeout: 10000 }).catch(() => { });
  });

  test('@regression @property TC65 — Budget Variance currency column: values must stay on a single line after column is resized narrower', async () => {
    await prop.changeView('Table View');
    await page.waitForTimeout(1500);

    const result = await verifyColumnContentDoesNotWrap({
      page,
      columnName: 'Budget Variance',
      dragByPx: 50,
      minCellsToCheck: 1,
    });

    console.log(
      `[TC65] ${result.cellsChecked}/${result.cellCount} cells verified single-line  |  ` +
      `width: ${result.widthStart}px → narrowed ${result.widthAfter}px → restored ${result.widthRestored}px ✓`
    );
  });

  test('TC66 @regression @property — Cover Picture: upload image to property and verify it shows on property card', async () => {
    test.setTimeout(300000);

    const downloadPath = path.join(process.cwd(), 'downloads', 'property.json');
    const propertyData = JSON.parse(fs.readFileSync(downloadPath, 'utf-8'));
    const propertyName = propertyData.propertyName;
    const imagePath = path.resolve('./files/Property_image.png');

    // Step 1: Navigate to properties list (Table View) and open the target property's details page
    await prop.goToProperties();
    await prop.changeView('Table View');
    await prop.searchProperty(propertyName);
    await prop.viewDetailsButton();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/properties\/details/, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Step 2: Open Edit Property dialog
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit Property' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Step 3: Scroll to Cover Picture section, then upload image via device file chooser
    await dialog.getByText('Cover Picture').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dialog.getByRole('button', { name: 'From device' }).click(),
    ]);
    await fileChooser.setFiles(imagePath);

    // Wait for Uploadcare CDN upload to finish — Save Changes button transitions from disabled to enabled
    await expect(dialog.getByRole('button', { name: 'Save Changes' })).toBeEnabled({ timeout: 20000 });
    await page.waitForTimeout(1000);

    // Step 4: Save changes and assert the success notification
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
      page.locator('.mantine-Notification-root').filter({ hasText: 'property updated successfully' })
    ).toBeVisible({ timeout: 15000 });

    // Step 5: Navigate directly to the properties list (Grid/Card View by default),
    // search for the property, and assert its card shows the uploaded cover image.
    // Using page.goto() avoids the slow 60s API watcher inside prop.goToProperties().
    const propertiesUrl = new URL(page.url()).origin + '/properties';
    await page.goto(propertiesUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.locator('[placeholder="Search..."]').first().fill(propertyName);
    await page.waitForTimeout(3000);
    await expect(page.locator('[style*="files.tailorbird.com"]')).toBeVisible({ timeout: 15000 });
  });

  test('TC67 @property @regression : Verify reusable add column function for all column types', async ({ page }) => {
    test.setTimeout(600000);
    const projectPage = new ProjectPage(page);
    const addColumnPage = new AddColumnPage(page, { scope: page.locator('main') });

    try {
      await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
      await expect(page).toHaveURL(process.env.DASHBOARD_URL);

      await projectPage.navigateToProjects();
      await projectPage.setProjectsTableView();
      await expect(page.getByTestId('bt-table-action').first()).toBeVisible({ timeout: 15000 });

      const createdColumns = await addColumnPage.addAndVerifyAllColumnTypes();
      expect(createdColumns.length).toBe(13);

      Logger.success('TC250: addAndVerifyAllColumnTypes — PASSED');
    } catch (error) {
      Logger.error(`TC250: Test failed — ${error.message}`);
      throw error;
    }
  });

  test('TC68 @capex @regression — Property column data persists after hiding all default columns and page refresh', async ({ page }) => {
    test.setTimeout(420000); // 7 min — 3× getPropertyColumnValues + refreshCapexPage runs slow headless
    const capex = new CapexPage(page);

    await capex.goto();
    await capex.selectAllDefaultFinancialColumns().catch(() => { });
    await capex.goto();

    // Step 1: capture Property column values before hiding columns
    const propertyDataBeforeHide = await capex.getPropertyColumnValues();
    expect(
      propertyDataBeforeHide.length,
      'Property column must contain at least one property row before column changes'
    ).toBeGreaterThan(0);

    let shouldResetColumns = false;

    try {
      const hiddenColumns = await capex.unselectAllDefaultFinancialColumns();
      shouldResetColumns = true;
      expect(
        hiddenColumns.length,
        'At least one default column should have been visible and unchecked'
      ).toBeGreaterThan(0);

      // Step 2: capture Property column values after hiding columns
      const propertyDataAfterHide = await capex.getPropertyColumnValues();

      // Step 3: compare snapshots and fail when values do not match
      expect(
        propertyDataAfterHide,
        `Property column values after hiding columns must match before hiding.\nBefore: ${propertyDataBeforeHide.join(', ')}\nAfter:  ${propertyDataAfterHide.join(', ')}`
      ).toEqual(propertyDataBeforeHide);

      await capex.refreshCapexPage();

      const propertyDataAfterRefresh = await capex.getPropertyColumnValues();
      expect(
        propertyDataAfterRefresh,
        `Property column values after page refresh must match before hiding.\nBefore: ${propertyDataBeforeHide.join(', ')}\nAfter:  ${propertyDataAfterRefresh.join(', ')}`
      ).toEqual(propertyDataBeforeHide);
    } finally {
      if (shouldResetColumns) {
        await capex.selectAllDefaultFinancialColumns().catch(() => { });
      }
    }
  });

  test('TC69 @property @regression : Verify Add Column functionality on the Property Overview tab (Property Documents grid)', async () => {
    test.setTimeout(180000);
    await prop.goto(tcTakeoffsStartUrl);
    await prop.goToProperties();
    const propertyName = 'Test Property 1_Cottages on Elm';
    await test.step('Search and open property', async () => {
      await prop.changeView('Table View');
      await prop.searchProperty(propertyName);
      await prop.viewDetailsButton();
    });
    await test.step('Go to Overview tab', async () => {
      await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    });

    // MCP-verified live (2026-08-13): the Property Documents grid on the Overview tab does
    // NOT follow the "View button -> Add custom column" pattern the shared addColumndata()
    // helper assumes (its "View" button here opens an unrelated "Save current view as"
    // popover) — its column actions live under "Table" -> "Add custom column" / "Hide / show
    // columns" instead. Its Manage Columns row buttons are also ordered differently than
    // deleteCustomColumn() assumes: button[0] toggles inline rename, button[1] opens the real
    // "Delete Column" confirmation, button[2] opens an unrelated "Add to Filter" menu. Written
    // self-contained against this grid's actual behavior rather than reusing those helpers.
    const columnName = `TC69 Add Column ${Date.now()}`;
    const documentsTableButton = page.getByRole('button', { name: 'Table', exact: true });

    await test.step('Add a custom column on the Property Documents grid', async () => {
      await documentsTableButton.click();
      await page.getByTestId('bt-table-action-add-column').click();
      await page.getByRole('textbox', { name: /Enter column name/i }).fill(columnName);
      await page.getByRole('textbox', { name: /Enter column description/i }).fill('Added by TC69 automation');
      await page.getByRole('button', { name: 'Add column', exact: true }).click();
      await expect(page.getByRole('columnheader', { name: columnName, exact: true })).toBeVisible({ timeout: 10000 });
    });

    await test.step('Verify the new column in Manage Columns, then delete it', async () => {
      await documentsTableButton.click();
      await page.getByTestId('bt-table-action-hide-show-columns').click();

      const drawer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Manage Columns' }) });
      await expect(drawer).toBeVisible({ timeout: 10000 });
      await expect(drawer.getByText('Custom Columns', { exact: true })).toBeVisible();

      const columnNameText = drawer.getByText(columnName, { exact: true });
      await expect(columnNameText).toBeVisible({ timeout: 10000 });

      const columnRow = columnNameText.locator('xpath=../..');
      await columnRow.locator('button').nth(1).click();

      const confirmDialog = page.getByRole('dialog').filter({ has: page.getByText('Delete Column', { exact: true }) });
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(columnNameText).toBeHidden({ timeout: 10000 });

      await page.keyboard.press('Escape');
    });
  });

});

```


---

# Investigation Rules

This document contains evidence collected from the failed Playwright execution.

Claude must NOT immediately modify the test.

Claude must:

1. Analyze the failure evidence.
2. Identify possible root causes.
3. Classify the failure.
4. Check the relevant test source.
5. Check recent Git changes.
6. Use Playwright MCP to reproduce and investigate the failure in the real application.
7. Verify the suspected root cause through the browser.
8. Only after MCP verification may a self-healing fix be proposed.
9. A fix must be validated by rerunning the affected test.
10. A regression run must be performed before creating the final PR.

Possible classifications:

- PRODUCT_BUG
- AUTOMATION_BUG
- TIMING_OR_SYNCHRONIZATION
- FLAKY_TEST
- ENVIRONMENT_FAILURE
- UNKNOWN

No classification has been performed yet.
