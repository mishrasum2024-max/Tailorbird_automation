const zlib = require("zlib");
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { ReportsPage } = require("./reportsPage");
const { reportsExportLocators } = require("../locators/reportsExportLocator");

/** Export-only helpers on top of ReportsPage (FEAT-1313 cases routed through Reports export). */
class ReportsExportPage extends ReportsPage {
  constructor(page) {
    super(page);
    this.exportLoc = reportsExportLocators(page);
  }

  /** Opens the first (most recent) report listed on /reports — a report created before this run. */
  async openFirstExistingReport() {
    await this.goToReportsHome();
    await expect(this.exportLoc.viewReportLinks.first()).toBeVisible({
      timeout: 60000,
    });
    await this.exportLoc.viewReportLinks.first().click();
    await expect(this.page).toHaveURL(/\/reports\/\d+/, { timeout: 60000 });
    await expect(this.loc.generatedMarker, "Report must open").toBeVisible({
      timeout: 90000,
    });
  }

  /** Exports a PDF while polling /api/health on the same instance; returns timings and the PDF. */
  async exportPdfWhileMeasuringHealth() {
    const timings = [];
    let exporting = true;
    const poll = (async () => {
      while (exporting) {
        const started = Date.now();
        const response = await this.page.request.get("/api/health");
        timings.push({ status: response.status(), ms: Date.now() - started });
      }
    })();
    try {
      const pdf = await this.exportPdfAndRead();
      return { pdf, timings };
    } finally {
      exporting = false;
      await poll;
    }
  }

  /** Reads one file from an xlsx (zip) buffer; returns its text or null. */
  readXlsxEntry(buffer, entryName) {
    let offset = 0;
    while (
      offset + 30 < buffer.length &&
      buffer.readUInt32LE(offset) === 0x04034b50
    ) {
      const method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const name = buffer.toString(
        "utf8",
        offset + 30,
        offset + 30 + nameLength
      );
      const start = offset + 30 + nameLength + extraLength;
      if (name === entryName) {
        const data = buffer.slice(start, start + compressedSize);
        return (method === 8 ? zlib.inflateRawSync(data) : data).toString(
          "utf8"
        );
      }
      offset = start + compressedSize;
    }
    return null;
  }

  /** Returns the real tab names of an exported workbook. */
  readSheetNames(buffer) {
    const xml = this.readXlsxEntry(buffer, "xl/workbook.xml");
    expect(xml, "FAIL: workbook.xml must be readable").toBeTruthy();
    return [...xml.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    );
  }

  /** Counts data rows (rows after the header) in the first worksheet. */
  countSheetRows(buffer) {
    const xml = this.readXlsxEntry(buffer, "xl/worksheets/sheet1.xml");
    expect(xml, "FAIL: first worksheet must be readable").toBeTruthy();
    return (xml.match(/<row[ >]/g) || []).length;
  }

  async exportSheetNames(useDataExport) {
    const file = useDataExport
      ? await this.exportDataExcel()
      : await this.exportExcel();
    const names = this.readSheetNames(file.buffer);
    Logger.info(`Workbook tabs: ${names.join(" | ")}`);
    return { ...file, names };
  }
}

module.exports = { ReportsExportPage };
