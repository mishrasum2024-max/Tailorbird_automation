const fs = require("fs");
const { expect } = require("@playwright/test");
const {
  CapexColumnTerminologyExtrasPage,
} = require("./capexColumnTerminologyExtrasPage");
const { DrawReportingJob } = require("./drawReportingPage");
const {
  drawDisbursementLocators,
} = require("../locators/capexColumnTerminologyBatch3Locator");
const { Logger } = require("../utils/logger");

/** Batch-3 additions for FEAT-1236. Extends, never edits, the earlier pages. */
class CapexColumnTerminologyBatch3Page extends CapexColumnTerminologyExtrasPage {
  constructor(page) {
    super(page);
    this.drawJob = new DrawReportingJob(page);
    this.dd = drawDisbursementLocators(page);
  }

  /** Creates a draft draw on the given property, returns the Disbursement Schedule headers, then discards the draft. */
  async getNewDrawDisbursementHeaders(propertyName) {
    await this.drawJob.navigateToDrawReporting();
    await this.drawJob.selectPropertyByName(propertyName);
    const drawName = `FEAT1236_TC023_${Date.now()}`;
    await this.drawJob.createDraw(drawName, "07/01/2026", "07/31/2026");
    try {
      await expect(this.dd.headers.first()).toBeVisible({ timeout: 30000 });
      const headers = (await this.dd.headers.allInnerTexts()).map(h =>
        h.trim()
      );
      Logger.info(`Disbursement Schedule headers: ${headers.join(" | ")}`);
      return headers;
    } finally {
      await this.drawJob.discardDraw();
    }
  }

  /** Property name created by the @mandatory suite (data/propertyData.json). */
  readSeededPropertyName() {
    return JSON.parse(fs.readFileSync("data/propertyData.json", "utf-8"))
      .propertyName;
  }
}

module.exports = { CapexColumnTerminologyBatch3Page };
