const { expect } = require("@playwright/test");
const { CapexColumnTerminologyPage } = require("./capexColumnTerminologyPage");
const { Logger } = require("../utils/logger");

/** Batch-2 additions for FEAT-1236 (CapEx Table settings). Extends, never edits, the batch-1 page. */
class CapexColumnTerminologyExtrasPage extends CapexColumnTerminologyPage {
  /** Map of standard column name -> current display value shown in Table settings. */
  async getSettingsLabels() {
    await this.columns.openTableSettings();
    await expect(this.ts.columnNameTextboxes.first()).toBeVisible({
      timeout: 15000,
    });
    const pairs = await this.ts.columnNameTextboxes.evaluateAll(els =>
      els.map(e => [
        (e.getAttribute("aria-label") || "").replace(/ display name$/, ""),
        e.value,
      ])
    );
    await this.columns.closeTableSettings();
    return Object.fromEntries(pairs);
  }

  /** Reloads and reopens settings: returns the labels saved for the org. */
  async getSettingsLabelsAfterReload() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.capex.waitForShellReady();
    return this.getSettingsLabels();
  }

  /** Types a value and tries to save; returns whether Save for everyone was enabled/clicked. */
  async trySaveLabel(standardLabel, value) {
    Logger.step(`Try saving "${standardLabel}" label as "${value}"`);
    await this.columns.openTableSettings();
    const box = this.ts.columnDisplayName(standardLabel);
    await expect(box).toBeVisible({ timeout: 15000 });
    await box.fill(value);
    const enabled = await this.ts.saveForEveryoneButton.isEnabled();
    if (enabled) await this.ts.saveForEveryoneButton.click();
    await this.columns.closeTableSettings();
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.capex.waitForShellReady();
    return enabled;
  }

  /** Sets labels for several columns at once ({standard: custom}) and saves for everyone. */
  async setLabelsForEveryone(map) {
    await this.columns.openTableSettings();
    for (const [standard, custom] of Object.entries(map)) {
      const box = this.ts.columnDisplayName(standard);
      await expect(box).toBeVisible({ timeout: 15000 });
      await box.fill(custom);
    }
    await expect(this.ts.saveForEveryoneButton).toBeEnabled({ timeout: 10000 });
    await this.ts.saveForEveryoneButton.click();
    await this.columns.closeTableSettings();
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.capex.waitForShellReady();
  }

  /** Restores standard labels for the given columns if they differ. */
  async restoreStandardLabels(standards) {
    const labels = await this.getSettingsLabels();
    const dirty = standards.filter(
      s => labels[s] !== undefined && labels[s] !== s
    );
    if (!dirty.length) return;
    await this.setLabelsForEveryone(Object.fromEntries(dirty.map(s => [s, s])));
  }

  /** Exports CSV and returns the header row parsed with quote/comma escaping honoured. */
  async exportCsvHeaderParsed() {
    const { lines } = await this.exportCsv();
    const out = [];
    let cur = "";
    let q = false;
    const line = lines[0] || "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  /** Whether the CapEx toolbar offers an Import control. */
  async hasImportControl() {
    return (
      (await this.capex.l.exportBtn.count()) >= 0 &&
      (await this.page
        .getByRole("button", { name: "Import", exact: true })
        .count()) > 0
    );
  }

  /**
   * Total-row values keyed by STANDARD column names, even when `standard` is currently
   * displayed under `custom` (the base helper looks columns up by header text).
   */
  async getTotalsWithRename(standard, custom) {
    const totals = await this.capex.getTotalRowValues();
    if (totals && totals[standard] && totals[standard].raw !== "")
      return totals;
    const renamed = await this.page.evaluate(label => {
      const heads = Array.from(
        document.querySelectorAll('[role="columnheader"]')
      ).map(h => (h.textContent || "").trim());
      const rows = Array.from(document.querySelectorAll('[role="row"]')).filter(
        r => r.querySelectorAll('[role="gridcell"]').length >= 7
      );
      if (!rows.length) return null;
      const cells = Array.from(
        rows[rows.length - 1].querySelectorAll('[role="gridcell"]')
      ).map(c => (c.textContent || "").trim());
      const idx = heads.indexOf(label) + (heads.length > cells.length ? -1 : 0);
      const raw = idx >= 0 && idx < cells.length ? cells[idx] : "";
      const n = parseFloat(raw.replace(/[$,]/g, ""));
      return { raw, value: raw && raw !== "—" && !isNaN(n) ? n : null };
    }, custom);
    return { ...totals, [standard]: renamed };
  }
}

module.exports = { CapexColumnTerminologyExtrasPage };
