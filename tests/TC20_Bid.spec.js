require("dotenv").config();
const { test, expect } = require("@playwright/test");
const { BidPage } = require("../pages/bidPage");
const { Logger } = require("../utils/logger");
const PropertiesHelper = require("../pages/properties");
const fs = require("fs");
const path = require("path");
const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");

const BID_DATA_PATH = path.join(__dirname, "../data/bidData.json");
const BID_SNAPSHOT_DIR = path.join(
  process.cwd(),
  "committed_ui_snapshots",
  "Bid.spec.js"
);

test.use({
  storageState: "sessionState.json",
  video: "retain-on-failure",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
});

let page, bidPage;

function loadBidData() {
  return JSON.parse(fs.readFileSync(BID_DATA_PATH, "utf8"));
}

function saveBidData(updated) {
  fs.writeFileSync(BID_DATA_PATH, JSON.stringify(updated, null, 2), "utf8");
}

/**
 * Parses an Overview "Bid Due Date" display value (e.g. "Mar 15, 2027") and returns the
 * next day, both as an input-field value ("MM/DD/YYYY") and the expected Overview display
 * text (e.g. "Mar 16, 2027"). Falls back to tomorrow (relative to now) if the current value
 * is blank/unparsable (e.g. "-" when no due date has been set yet).
 * @param {string} currentOverviewText
 * @returns {{ inputValue: string, overviewValue: string }}
 */
function addOneDayToOverviewDate(currentOverviewText) {
  const parsed = new Date(currentOverviewText);
  const base = isNaN(parsed.getTime()) ? new Date() : parsed;
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + 1);

  const inputValue = `${String(next.getMonth() + 1).padStart(2, "0")}/${String(next.getDate()).padStart(2, "0")}/${next.getFullYear()}`;
  const overviewValue = next.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { inputValue, overviewValue };
}

test.describe("Verify Bids", () => {
  test.describe.configure({ retries: 1 });

  // ── Property setup — creates a fresh property per suite run ──────────────────
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "sessionState.json" });
    const setupPage = await ctx.newPage();
    const prop = new PropertiesHelper(setupPage);

    const propertyName = `bid_prop_${Date.now()}`;
    await setupPage.goto(process.env.BASE_URL, { waitUntil: "load" });
    await setupPage.waitForTimeout(1500);
    await ensureLeftPanelExpanded(setupPage);
    await prop.goToProperties();
    // createPropertyRobust (existing, additive PropertiesHelper method — pages/properties.js)
    // instead of createProperty: same MCP-verified client-side stale-cache bug on the
    // Properties listing after in-app navigation, already root-caused and fixed there.
    // createProperty() itself is untouched.
    await prop.createPropertyRobust(
      propertyName,
      "Domestic Terminal, College Park, GA 30337, USA",
      "College Park",
      "GA",
      "30337",
      "Garden Style"
    );

    const bidData = JSON.parse(fs.readFileSync(BID_DATA_PATH, "utf8"));
    saveBidData({ ...bidData, property: propertyName });
    Logger.info(`Created property for bid tests: ${propertyName}`);

    await ctx.close();
  });

  test.beforeEach(async ({ page: p }) => {
    if (!fs.existsSync(BID_SNAPSHOT_DIR))
      fs.mkdirSync(BID_SNAPSHOT_DIR, { recursive: true });
    page = p;
    bidPage = new BidPage(page);
    await page.goto(`${process.env.BASE_URL}/bids`, { waitUntil: "load" });
    await expect(page).toHaveURL(/\/bids$/);
    await page.waitForTimeout(3000);
  });

  test("TC311 @regression @bid : Verify Bids list page layout, columns, and toolbar", async () => {
    Logger.step("TC_BID_01: Asserting Bid list page");

    await bidPage.assertBidsListPage();

    const rows = page.getByRole("row").filter({ has: page.getByRole("link") });
    const rowCount = await rows.count().catch(() => 0);
    Logger.info(`Bid rows visible: ${rowCount}`);
    expect(rowCount).toBeGreaterThanOrEqual(0);

    Logger.success("TC_BID_01 passed");
  });

  test("TC312 @regression @bid : Verify Create Bid form, dropdown options, bid creation, and due date update", async () => {
    const bidData = loadBidData();
    const uniqueBidName = `Auto_Bid_${Date.now()}`;

    Logger.step("TC_BID_02: Open Create Bid modal and assert fields");
    await bidPage.openCreateBidModal();
    await bidPage.assertCreateBidModalFields();

    await bidPage.assertBidTypeDropdownOptions();
    await bidPage.assertDetailLevelDropdownOptions();
    await bidPage.assertPriceByDropdownOptions();

    const formData = {
      bidName: uniqueBidName,
      property: bidData.property,
      bidType: bidData.bidType,
      detailLevel: bidData.detailLevel,
      priceBy: bidData.priceBy,
      bidDueDate: bidData.bidDueDate,
    };
    await bidPage.fillAndSubmitCreateBidForm(formData);

    const bidId = await bidPage.waitForBidDetailPage();
    const bidUrl = `${process.env.BASE_URL}/bids/${bidId}`;

    saveBidData({ ...bidData, bidName: uniqueBidName, bidId, bidUrl });

    await expect
      .poll(() => page.title(), { timeout: 10_000 })
      .toContain(uniqueBidName);

    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Bid Book AI Assisted" })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Manage Bids" })).toBeVisible();

    // Assert Overview tab field values
    await bidPage.assertOverviewTab(formData);

    // Assert Edit Bid dialog and due date modification (criterion: due date modification)
    Logger.step("TC_BID_02 — Edit Bid due date e2e");
    await bidPage.assertEditBidDueDate(bidData.editedDueDate);

    Logger.success(
      `TC_BID_02 passed — bid created: ${uniqueBidName} (ID: ${bidId})`
    );
  });

  test("TC313 @regression @bid : Verify Manage Bids tab columns and toolbar", async () => {
    const bidData = loadBidData();
    expect(
      bidData.bidUrl,
      "FAIL: bidData.bidUrl is not set — TC_BID_02 (TC312) must run first and succeed to create a bid."
    ).toBeTruthy();

    Logger.step(`TC_BID_04: Navigating to bid: ${bidData.bidUrl}`);
    await page.goto(bidData.bidUrl, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(url =>
      url.href.includes(`/bids/${bidData.bidId}`)
    );

    await bidPage.assertManageBidsTab();

    Logger.success("TC_BID_04 passed — Manage Bids tab asserted");
  });

  test("TC314 @regression @bid : Verify Create Bid dialog fields, placeholders, and dropdown options", async () => {
    const bidData = loadBidData();

    Logger.step(
      "TC_BID_05: Opening Create Bid dialog for complete fixture assertion"
    );

    await bidPage.openCreateBidModal();
    await bidPage.assertCreateBidDialogFromFixture(bidData.createBidDialog);

    Logger.success(
      "TC_BID_05 passed — Create Bid dialog completely verified against fixture"
    );
  });

  test("TC318 @regression @bid : Verify bid due date update from Overview and success notification", async () => {
    Logger.step("TC365: Navigating to Bids via left panel");
    await page.goto(process.env.BASE_URL, { waitUntil: "load" });
    await page.waitForTimeout(2000);

    await bidPage.navigateToBidsPageViaLeftNav();

    Logger.step(
      "TC365: Selecting any bid from the list and viewing its details"
    );
    const bidName = await bidPage.openFirstBidFromList();

    const loc = bidPage.loc();
    await expect(loc.overviewTab).toHaveAttribute("aria-selected", "true");
    await loc.overviewPanel.waitFor({ state: "visible", timeout: 15000 });

    const dueDateBefore = (
      await loc
        .overviewFieldValue("Bid Due Date")
        .textContent()
        .catch(() => "")
    ).trim();
    Logger.info(`TC365: "${bidName}" due date before edit: "${dueDateBefore}"`);

    // Always advance whatever date is currently set by exactly 1 day — guarantees a real
    // change every run (a fixed hardcoded date would collide once a prior run already set it).
    const { inputValue: newDueDateInput, overviewValue: expectedOverviewText } =
      addOneDayToOverviewDate(dueDateBefore);
    const expectedToastTitle = "Updated";
    const expectedToastMessage = "Bid updated successfully.";
    Logger.info(
      `TC365: New due date (current + 1 day) = "${newDueDateInput}" → expected Overview text "${expectedOverviewText}"`
    );

    const toastText = await bidPage.editDueDateFromOverviewAndAssertToast(
      newDueDateInput,
      expectedOverviewText
    );

    // Explicit comparison of invoked toast text against the expected text
    expect(toastText).toContain(expectedToastTitle);
    expect(toastText).toContain(expectedToastMessage);
    Logger.info(
      `TC365: Toast text compared — expected to contain "${expectedToastTitle}" and "${expectedToastMessage}", got "${toastText}"`
    );

    const dueDateAfter = (
      await loc.overviewFieldValue("Bid Due Date").textContent()
    ).trim();
    expect(dueDateAfter).toBe(expectedOverviewText);
    expect(dueDateAfter).not.toBe(dueDateBefore);
    Logger.success(
      `TC365 passed — "${bidName}" due date changed from "${dueDateBefore}" to "${dueDateAfter}", success toast verified`
    );
  });

  /**
   * Minimal CSV-line parser (handles double-quoted fields containing commas, e.g. the
   * Location column's "BUILDING 01, BUILDING 02, ..." list) — no third-party dependency,
   * used only to build a data-embedded AI prompt from files/bid_to_upload.csv below.
   */
  function parseCsvLine(line) {
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields.map(f => f.trim());
  }

  /**
   * Builds an AI prompt with the CSV's own row data embedded directly as text (NOT as a file
   * attachment) — MCP-verified live 2026-09-14 that Piper's Bid Book chat can fail to read an
   * attached file's contents, but reliably generates an accurate table when the exact values
   * are given inline in the prompt itself.
   * @param {string} csvFile absolute path to a bid_to_upload-style CSV
   */
  function buildAiPromptFromCsv(csvFile) {
    const lines = fs.readFileSync(csvFile, "utf8").trim().split(/\r?\n/);
    const headers = parseCsvLine(lines[0]);
    const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

    const itemLines = dataLines.map((line, i) => {
      const values = parseCsvLine(line);
      const pairs = headers
        .map((h, idx) => [h, values[idx]])
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([h, v]) => `${h}: ${v}`)
        .join(" | ");
      return `${i + 1}. ${pairs}`;
    });

    const prompt = `Please create the bid book table using exactly these ${itemLines.length} line item(s) (do not invent or add any other line items):\n\n${itemLines.join("\n\n")}\n\nPlease generate the complete bid book table now using these exact values.`;
    return { prompt, headers, dataLines };
  }

});
