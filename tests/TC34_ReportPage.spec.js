require("dotenv").config();

const { test, expect } = require("@playwright/test");
const { ReportPage } = require("../pages/reportPage");
const { Logger } = require("../utils/logger");
const reportData = require("../fixture/reportPage.json");
const fs = require("fs");
const path = require("path");
const { ReportsPage } = require("../pages/reportsPage");
const { ReportsExportPage } = require("../pages/reportsExportPage");
const { UserRoleImportPage } = require("../pages/userRoleImportPage");

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
 *   enabled on every report but do not delete. A normal run generates exactly ONE report: TC547
 *   (Generate Report is the case itself); TC551 then deletes that same report (it generates its
 *   own only if TC547 left none), and afterAll deletes it if TC551 did not run. Every other case
 *   in this file (all 22) reuses the newest existing report for its prompt and generates one only
 *   when none exists (getOrCreateReportForTest / getOrGenerateReport); such a report is kept so
 *   later runs reuse it.
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

  // The ONE report a normal run generates: TC547 (Generate Report is the case itself) keeps its
  // report and TC551 deletes that same report, generating its own only when TC547 did not run or
  // failed. Every other case reuses an existing report. If TC551 never deletes it, afterAll does.
  let tc547Report = null;

  test.afterAll(async ({ browser }) => {
    if (!tc547Report) return;
    const context = await browser.newContext({
      storageState: "sessionState.json",
    });
    await new ReportPage(await context.newPage())
      .deleteReportViaApi(tc547Report.reportId)
      .catch(e => Logger.info(`Cleanup of TC547 report failed: ${e.message}`));
    await context.close();
    tc547Report = null;
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

});

// =============================================================================================
// FEAT-1313 Reports export (PDF / Excel) and user-role CSV import — moved from
// TC34_FEAT1313_WorkerThreadPdf.spec.js. These cases ran with a 1920x1600 viewport, so it is set
// per describe below and does not change the Reports page cases above.
// =============================================================================================
const PDF_REPORT_PROMPT =
  "CapEx summary for the portfolio with a chart by property";
const EXCEL_REPORT_PROMPT =
  "Excel of all properties with their current budget and committed amount";
const EMPTY_EXCEL_REPORT_PROMPT =
  "Excel of all invoices with an amount greater than 999999999999, headers only if none";

// ---------------------------------------------------------------------------------------------
// Content assertions (added): the exported PDF / Excel must hold the exact data the generated
// report shows. MCP-verified on beta.tailorbird.com, 2026-10-27:
// - The report renders in a sandboxed iframe in main (h1 title, h2/h3 headings, tables, KPI
//   cards `.kpi`, and SVG charts in <figure> whose <title> elements read "label · field: $3M").
// - Export PDF text contains every on-screen value (2,012 / 2,012 checked on a 502-row invoice
//   report); labels are printed UPPERCASE (CSS), so the comparison ignores case and whitespace.
//   Charts are vector drawings (0 raster images), so they are checked through their caption and
//   bar values, not as images.
// - An Excel-source report previews the workbook itself as one HTML table; Export Excel holds
//   the same rows/cells (amounts unrounded, e.g. 121500.3 shown as $121,500) and its Total row
//   is SUM() formulas with no cached value (the preview shows those cells blank).
// - Export data (Excel) of a PDF report writes one sheet per query with raw values; every row of
//   the on-screen tables is found there by its first column.
// ---------------------------------------------------------------------------------------------
const normaliseText = s => String(s).replace(/\s+/g, "").toLowerCase();

/** "$1,234" → 1234, "($5)" → -5, "$3M" → 3000000, "45.0%" → 45; null when not a number. */
function parseDisplayNumber(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const negative =
    (raw.startsWith("(") && raw.endsWith(")")) ||
    raw.startsWith("-") ||
    raw.startsWith("−") ||
    raw.startsWith("$-");
  let body = raw.replace(/[$,()\s%−-]/g, "");
  let multiplier = 1;
  if (/K$/i.test(body)) {
    multiplier = 1e3;
    body = body.slice(0, -1);
  } else if (/M$/i.test(body)) {
    multiplier = 1e6;
    body = body.slice(0, -1);
  } else if (/B$/i.test(body)) {
    multiplier = 1e9;
    body = body.slice(0, -1);
  }
  if (!/^\d+(\.\d+)?$/.test(body)) return null;
  return (negative ? -1 : 1) * Number(body) * multiplier;
}

/** Rounding the screen applied to a shown value ("$1,500" → 0.5, "$1,500.25" → 0.005, "$3M" → 50000). */
function displayTolerance(text) {
  const t = String(text).trim();
  const unit = /K$/i.test(t)
    ? 1e3
    : /M$/i.test(t)
      ? 1e6
      : /B$/i.test(t)
        ? 1e9
        : 1;
  const decimals = (t.replace(/[^\d.]/g, "").split(".")[1] || "").length;
  return (unit * Math.pow(10, -decimals)) / 2 + 1e-9;
}

/** Reads what the generated report shows on screen (sandboxed iframe in main). */
async function readReportOnScreen(page) {
  const frame = page.locator("main iframe").first().contentFrame();
  await expect(
    frame.locator("body"),
    "FAIL: generated report preview must render"
  ).toBeVisible({ timeout: 60000 });
  return frame.locator("body").evaluate(b => {
    const txt = e => (e ? e.textContent.replace(/\s+/g, " ").trim() : "");
    return {
      title: txt(b.querySelector("h1")),
      headings: [...b.querySelectorAll("h2, h3")].map(txt).filter(Boolean),
      tables: [...b.querySelectorAll("table")].map(t =>
        [...t.rows].map(r => [...r.cells].map(txt))
      ),
      figures: [...b.querySelectorAll("figure")].map(f => ({
        caption:
          txt(f.querySelector("figcaption")) ||
          f.getAttribute("aria-label") ||
          "",
        drawn: !!f.querySelector("svg, canvas, img"),
        bars: [...f.querySelectorAll("title")].map(txt).filter(Boolean),
        // Text actually drawn on the chart (value labels, axis ticks) — what a PDF can print.
        labels: [...f.querySelectorAll("svg text")].map(txt).filter(Boolean),
      })),
      kpis: [...b.querySelectorAll(".kpi")].map(k =>
        [...k.children].map(txt).filter(Boolean)
      ),
    };
  });
}

/** Asserts the exported PDF text contains every value the report shows; logs each group. */
function assertPdfMatchesReport(
  pdf,
  screen,
  label,
  { expectCharts = false } = {}
) {
  const text = normaliseText(pdf.text);
  const checks = [];
  if (screen.title) checks.push(["title", screen.title]);
  screen.headings.forEach(h => checks.push(["heading", h]));
  screen.kpis.forEach(k => k.forEach(v => checks.push(["KPI", v])));
  // MCP/API-verified 2026-10-29 (reports 254, 690, 701): the PDF prints what the chart DRAWS —
  // every numeric value label and axis tick. A bar's <title> is a hover tooltip: on a simple bar
  // chart it repeats the drawn label, but a stacked chart's segment values (701: "Approved:
  // $18.2K" inside a "$27.6K" bar) are hover-only and can never be in a PDF, so a tooltip value
  // is required only when the chart draws it.
  const hoverOnly = [];
  screen.figures.forEach(f => {
    if (f.caption) checks.push(["chart caption", f.caption]);
    f.bars.forEach(b => {
      const value = b.slice(b.lastIndexOf(": ") + 2);
      if (f.labels.includes(value)) checks.push(["chart value", value]);
      else hoverOnly.push(b);
    });
    f.labels
      .filter(l => parseDisplayNumber(l) !== null)
      .forEach(l => checks.push(["chart label", l]));
  });
  if (hoverOnly.length)
    Logger.info(
      `${label}: ${hoverOnly.length} hover-only chart value(s) not drawn on the chart (not printable): ${hoverOnly.join(" | ")}`
    );
  screen.tables.forEach((t, i) =>
    t.forEach(row =>
      row.forEach(c => c && checks.push([`table ${i + 1} cell`, c]))
    )
  );
  Logger.info(
    `${label}: report on screen — title "${screen.title}", ${screen.headings.length} heading(s), ${screen.kpis.length} KPI(s), ${screen.figures.length} chart(s), ${screen.tables.length} table(s) (${screen.tables.map(t => t.length).join("+") || 0} rows)`
  );
  if (expectCharts) {
    expect(
      screen.figures.length,
      `FAIL: ${label}: the report must show at least one chart`
    ).toBeGreaterThan(0);
    screen.figures.forEach((f, i) =>
      expect(
        f.drawn,
        `FAIL: ${label}: chart ${i + 1} "${f.caption}" must be drawn`
      ).toBe(true)
    );
    Logger.success(
      `${label}: ${screen.figures.length} chart(s) drawn on screen: ${screen.figures.map(f => `"${f.caption}" (${f.bars.length} values)`).join(", ")}`
    );
  }
  expect(
    checks.length,
    `FAIL: ${label}: the report shows no content to compare`
  ).toBeGreaterThan(0);
  const missing = checks
    .filter(([, v]) => !text.includes(normaliseText(v)))
    .map(([k, v]) => `${k}: ${v}`);
  expect(
    missing.slice(0, 25),
    `FAIL: ${label}: exported PDF is missing ${missing.length} value(s) shown in the report`
  ).toEqual([]);
  const byKind = checks.reduce(
    (a, [k]) => (
      (a[k.replace(/ \d+/, "")] = (a[k.replace(/ \d+/, "")] || 0) + 1),
      a
    ),
    {}
  );
  Logger.success(
    `${label}: PDF contains all ${checks.length} on-screen values (${Object.entries(
      byKind
    )
      .map(([k, n]) => `${n} ${k}`)
      .join(", ")})`
  );
}

/** Parses every worksheet of an xlsx into rows of { col, value, formula } (shared + inline strings). */
function readWorkbook(buffer) {
  const readEntry = name =>
    ReportsExportPage.prototype.readXlsxEntry(buffer, name);
  const decode = s =>
    String(s)
      .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  const textOf = xml =>
    [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map(m => decode(m[1]))
      .join("");
  const sharedXml = readEntry("xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]))
    : [];
  const workbookXml = readEntry("xl/workbook.xml");
  expect(workbookXml, "FAIL: workbook.xml must be readable").toBeTruthy();
  const names = [...workbookXml.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(
    m => decode(m[1])
  );
  const colIndex = ref =>
    [...ref.replace(/\d+/g, "")].reduce(
      (n, ch) => n * 26 + ch.charCodeAt(0) - 64,
      0
    ) - 1;
  return names.map((name, i) => {
    const xml = readEntry(`xl/worksheets/sheet${i + 1}.xml`) || "";
    const rows = [...xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)].map(r => ({
      r: Number((r[1].match(/r="(\d+)"/) || [])[1]),
      cells: [...r[2].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(
        c => {
          const attrs = c[1];
          const inner = c[2] || "";
          const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || "A1";
          const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          const formula = (inner.match(/<f>([\s\S]*?)<\/f>/) || [])[1] || null;
          let value = v === undefined ? "" : decode(v);
          if (/t="s"/.test(attrs)) value = shared[Number(v)] ?? "";
          else if (/t="inlineStr"/.test(attrs)) value = textOf(inner);
          return {
            col: colIndex(ref),
            value: String(value).replace(/\s+/g, " ").trim(),
            formula,
            // Text cells (headers such as the year "2026") are never data, even when numeric-looking.
            text: /t="(s|inlineStr|str)"/.test(attrs),
          };
        }
      ),
    }));
    return { name, rows };
  });
}

/** Asserts an Excel-source report's workbook equals its on-screen preview grid, cell by cell. */
function assertWorkbookMatchesPreview(buffer, screen, label) {
  const sheets = readWorkbook(buffer);
  expect(
    sheets.length,
    `FAIL: ${label}: workbook must have a sheet`
  ).toBeGreaterThan(0);
  const preview = (screen.tables[0] || []).filter(row =>
    row.some(c => c !== "")
  );
  const sheetRows = sheets[0].rows.filter(row =>
    row.cells.some(c => c.value !== "" || c.formula)
  );
  Logger.info(
    `${label}: workbook sheets [${sheets.map(s => s.name).join(" | ")}]; preview ${preview.length} row(s), sheet "${sheets[0].name}" ${sheetRows.length} row(s)`
  );
  expect(
    preview.length,
    `FAIL: ${label}: the report preview must show the workbook`
  ).toBeGreaterThan(0);
  expect(
    sheetRows.length,
    `FAIL: ${label}: workbook row count must equal the preview`
  ).toBe(preview.length);
  const mismatches = [];
  const formulas = [];
  preview.forEach((pRow, i) => {
    const cellAt = j =>
      sheetRows[i].cells.find(c => c.col === j) || { value: "", formula: null };
    pRow.forEach((shown, j) => {
      const cell = cellAt(j);
      if (cell.formula) {
        formulas.push({
          row: sheetRows[i].r,
          col: j,
          formula: cell.formula,
          shown,
        });
        if (shown !== "")
          mismatches.push(
            `row ${i + 1} col ${j + 1}: formula ${cell.formula} but preview shows "${shown}"`
          );
        return;
      }
      const shownNumber = parseDisplayNumber(shown);
      const fileNumber = cell.value === "" ? null : Number(cell.value);
      if (shown === "" && cell.value === "") return;
      // Dates: Excel stores a serial day number (46321.3369 = 2026-10-26 08:05); the preview shows
      // the same value as YYYY-MM-DD (run-verified 2026-10-27 on the budget-revisions workbook).
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(shown) &&
        fileNumber !== null &&
        !Number.isNaN(fileNumber)
      ) {
        const asDate = new Date(Date.UTC(1899, 11, 30) + fileNumber * 86400000)
          .toISOString()
          .slice(0, 10);
        if (asDate !== shown)
          mismatches.push(
            `row ${i + 1} col ${j + 1}: file date ${asDate} (serial ${cell.value}) vs preview "${shown}"`
          );
        return;
      }
      if (
        shownNumber !== null &&
        fileNumber !== null &&
        !Number.isNaN(fileNumber)
      ) {
        const asShown =
          shown.trim().endsWith("%") && Math.abs(fileNumber) <= 1
            ? fileNumber * 100
            : fileNumber;
        if (Math.abs(asShown - shownNumber) > displayTolerance(shown))
          mismatches.push(
            `row ${i + 1} col ${j + 1}: file ${cell.value} vs preview "${shown}"`
          );
        return;
      }
      if (normaliseText(cell.value) !== normaliseText(shown))
        mismatches.push(
          `row ${i + 1} col ${j + 1}: file "${cell.value}" vs preview "${shown}"`
        );
    });
  });
  expect(
    mismatches.slice(0, 25),
    `FAIL: ${label}: workbook differs from the report in ${mismatches.length} cell(s)`
  ).toEqual([]);
  // Total rows are SUM() formulas: each must add up exactly the data rows of its column.
  // MCP/API-verified 2026-10-29 on multi-year reports 698 and 373: a workbook can also have a Total
  // COLUMN — a row-direction SUM on the formula's own row (M5=SUM(B5:L5)) — and a grand total that
  // sums those row-total formula cells (M6=SUM(M5:M5)); both are checked below.
  const toCol = letters =>
    [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rowTotalRange = f => {
    const x = (f || "").match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
    return x && x[2] === x[4] && x[1] !== x[3] ? x : null;
  };
  const isDataCell = c =>
    !c.text && !c.formula && c.value !== "" && !Number.isNaN(Number(c.value));
  const rowTotalOf = r => {
    const cell = r.cells.find(c => rowTotalRange(c.formula));
    const x = rowTotalRange(cell.formula);
    return r.cells
      .filter(
        c => isDataCell(c) && c.col >= toCol(x[1]) && c.col <= toCol(x[3])
      )
      .reduce((sum, c) => sum + Number(c.value), 0);
  };
  formulas.forEach(({ row, col, formula }) => {
    const m = formula.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
    expect(
      m,
      `FAIL: ${label}: unexpected formula ${formula} in row ${row}`
    ).toBeTruthy();
    if (rowTotalRange(formula)) {
      const rowCells = sheetRows
        .find(r => r.r === row)
        .cells.filter(c => c.col !== col && isDataCell(c));
      const firstCol = Math.min(...rowCells.map(c => c.col));
      const lastCol = Math.max(...rowCells.map(c => c.col));
      expect(
        [Number(m[2]), toCol(m[1]), toCol(m[3])],
        `FAIL: ${label}: row total ${formula} must cover exactly the ${rowCells.length} amount cell(s) of its own row ${row}`
      ).toEqual([row, firstCol, lastCol]);
      Logger.info(
        `${label}: row total ${formula} covers row ${row}'s ${rowCells.length} amount cell(s) — Excel will show ${rowCells.reduce((s, c) => s + Number(c.value), 0).toFixed(2)}`
      );
      return;
    }
    const dataRows = sheetRows.filter(
      r =>
        r.r < row &&
        r.cells.some(
          c =>
            c.col === col &&
            (isDataCell(c) || (c.formula && rowTotalRange(c.formula)))
        )
    );
    const first = Math.min(...dataRows.map(r => r.r));
    const last = Math.max(...dataRows.map(r => r.r));
    expect(
      [Number(m[2]), Number(m[4])],
      `FAIL: ${label}: ${formula} must cover exactly the data rows ${first}..${last}`
    ).toEqual([first, last]);
    const total = dataRows.reduce((sum, r) => {
      const cell = r.cells.find(c => c.col === col);
      return sum + (cell.formula ? rowTotalOf(r) : Number(cell.value));
    }, 0);
    Logger.info(
      `${label}: total formula ${formula} covers rows ${first}..${last} (${dataRows.length} rows) — Excel will show ${total.toFixed(2)}`
    );
  });
  Logger.success(
    `${label}: workbook matches the report preview cell by cell (${preview.length} rows${formulas.length ? `, ${formulas.length} total formula(s)` : ""})`
  );
  return { sheets, sheetRows };
}

/** Asserts "Export data (Excel)" holds every row of the report's on-screen tables (by first column). */
function assertDataWorkbookCoversReport(buffer, screen, label) {
  const sheets = readWorkbook(buffer);
  Logger.info(
    `${label}: data workbook sheets [${sheets.map(s => `${s.name} (${s.rows.length} rows)`).join(" | ")}]`
  );
  expect(
    sheets.length,
    `FAIL: ${label}: data workbook must have a sheet`
  ).toBeGreaterThan(0);
  const allRows = sheets.flatMap(s =>
    s.rows.map(r => r.cells.map(c => c.value))
  );
  const problems = [];
  let matched = 0;
  screen.tables.forEach((table, ti) => {
    table
      .slice(1)
      .filter(row => row[0] && !/^total$/i.test(row[0]))
      .forEach(row => {
        const numbers = row
          .slice(1)
          .filter(c => !c.trim().endsWith("%"))
          .map(c => ({ shown: c, value: parseDisplayNumber(c) }))
          .filter(n => n.value !== null);
        if (!numbers.length) return;
        const fileRow = allRows.find(
          r =>
            normaliseText(r[0] || "") === normaliseText(row[0]) ||
            r.some(v => normaliseText(v) === normaliseText(row[0]))
        );
        if (!fileRow) {
          problems.push(
            `table ${ti + 1} row "${row[0]}" not in the data workbook`
          );
          return;
        }
        const fileNumbers = fileRow.map(Number).filter(n => !Number.isNaN(n));
        numbers.forEach(({ shown, value }) => {
          if (
            !fileNumbers.some(
              n => Math.abs(n - value) <= displayTolerance(shown)
            )
          )
            problems.push(
              `row "${row[0]}": ${shown} not in data row [${fileRow.join(", ")}]`
            );
        });
        matched++;
      });
  });
  expect(
    matched,
    `FAIL: ${label}: no on-screen table row could be compared with the data workbook`
  ).toBeGreaterThan(0);
  expect(
    problems.slice(0, 25),
    `FAIL: ${label}: data workbook differs from the report in ${problems.length} place(s)`
  ).toEqual([]);
  Logger.success(
    `${label}: all ${matched} on-screen table row(s) and their amounts are in the data workbook`
  );
  screen.kpis.forEach(k => {
    const value = parseDisplayNumber(k[k.length - 1]);
    const found =
      value !== null &&
      allRows
        .flat()
        .map(Number)
        .some(
          n =>
            !Number.isNaN(n) &&
            Math.abs(n - value) <= displayTolerance(k[k.length - 1])
        );
    Logger.info(
      `${label}: KPI "${k.join(" = ")}" ${found ? "found" : "not stored as a raw value (calculated on the report)"} in the data workbook`
    );
  });
}

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

// Instruction for batch 2: every remaining case is verified through Reports -> Export only.
const P = {
  dashboard:
    "Dashboard of the portfolio with widgets: a KPI summary, a chart of current budget by property and a table. PDF report.",
  invoices:
    "PDF report listing invoices with invoice number, title, amount and status",
  cmFee: "PDF report of CM fee invoices and draw fees by property",
  draws: "PDF report of draws with their invoices and attachments by property",
  approvals: "PDF report of approvals, pending and approved draws, by property",
  budgetXlsx:
    "Excel of budget revisions by property with current budget and revised budget",
  multiYearXlsx: "Excel of multi-year budget by property with budget per year",
  bidsXlsx: "Excel of draft bids with bid name, vendor and amount",
  tableXlsx:
    "Excel table of all properties with current budget and committed amount",
};

