const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const {
  DRAW_TILE_LABELS,
  ACTIVE_DRAW_TILE_LABEL,
  drawExactTextStrategies,
  capexDrawnLineStrategies,
  capexRemainingLineStrategies,
  drawTabPanelStrategies,
} = require("../locators/drawReportingCalcLocator");

/**
 * TC608 — every calculated value on the Draw Reporting page (Overview + Historical Draws),
 * recomputed from live data and asserted rule by rule (each rule logged expected vs actual).
 *
 * Formulas taken from the app and MCP-verified on 2026-11-24 (Test Property 6_Draw reporting):
 *  Tiles — app/api/draw-reporting/overview/route.ts
 *    Total Budget     = Σ (revised ?? original) of the active budget version  (= Σ Current Budget)
 *    Draws to Date    = Σ Draw Amount of draws with status Approved or Funded
 *    Remaining Budget = Total Budget − Draws to Date
 *    Pending Invoices = Σ amount of Approved invoices not in a draw
 *                       (app/lib/draw-reporting-eligible-invoices.ts: draw_status never_included|excluded)
 *    Active Draw      = Draw Amount of the latest Draft draw (tile + card only while one exists)
 *  Budget Overview table — app/api/bird-table/tables/draw-budget-overview.ts
 *    Reallocation = Current − Original;  Budget Remaining = Current − Drawn;
 *    Progress % = Drawn ÷ Current × 100 (0 when Current ≤ 0);  Total row = Σ rows (sum columns)
 *    Revised Proforma = Proforma + Cumulative Adj.;  Proforma Funds Remaining = Revised − Invoice Lifetime
 *  CapEx Status — app/financials/draw-reporting/components/DrawReportingOverview.tsx + DrawOverviewCapexStatus.tsx
 *    "<round(ΣDrawn ÷ ΣCurrent × 100)>% Drawn ($ΣDrawn)", "<round(max(0, 100 − that))>% Remaining ($ΣBudget Remaining)",
 *    per item "<round(Progress %)>%"
 *  Historical Draws — app/api/bird-table/tables/draw.ts
 *    Previously Drawn = Σ Draw Amount of every earlier draw of the property (any status, drafts excluded)
 *    Total Draw at Submission = Previously Drawn + Draw Amount
 *    Remaining at Submission  = current Total Budget − Total Draw at Submission
 */
class DrawReportingCalcPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page, drawReportingJob) {
    this.page = page;
    this.drawReportingJob = drawReportingJob;
  }

  static C(v) {
    const n = Math.round(Number(v ?? 0) * 100);
    return n === 0 ? 0 : n; // -0 → 0
  }

  static M(c) {
    return `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  propertyId() {
    const id = new URL(this.page.url()).searchParams.get("propertyId");
    expect(id, "FAIL: Draw Reporting URL must carry propertyId").toBeTruthy();
    return id;
  }

  /** Currency shown in the tile / card whose exact label is `label` (cents), or null when absent. */
  async valueNextTo(label, { required = true, pattern = /-?\$[\d,]+\.\d{2}/ } = {}) {
    // visible only: Mantine keeps the hidden tab mounted (e.g. "Draw Amount" is also a Historical header)
    const labelEl = healingLocator(drawExactTextStrategies(this.page, label)).locator("visible=true").first();
    if (!required && !(await labelEl.isVisible().catch(() => false))) return null;
    await expect(labelEl, `FAIL: "${label}" must be visible`).toBeVisible({ timeout: 80000 });
    // Literal regexes only (semgrep detect-non-literal-regexp): the two patterns callers use.
    const kind = pattern.source === /\b\d+\b/.source ? "integer" : "currency";
    const text = await labelEl.evaluate((e, k) => {
      const re = k === "integer" ? /\b\d+\b/ : /-?\$[\d,]+\.\d{2}/;
      let n = e;
      for (let i = 0; i < 5 && n; i++) { n = n.parentElement; const m = n && n.innerText.match(re); if (m) return m[0]; }
      return null;
    }, kind);
    expect(text, `FAIL: "${label}" must show a value`).toBeTruthy();
    return text;
  }

  async gridData(panelName) {
    // The grid of the tab on screen: both tabs stay mounted, so pick the visible revo-grid.
    const panel = healingLocator(drawTabPanelStrategies(this.page, panelName)).first();
    const grid = panel.locator("revo-grid").locator("visible=true").first();
    await expect(grid, `FAIL: ${panelName} grid must render`).toBeVisible({ timeout: 80000 });
    await expect
      .poll(() => grid.evaluate(async g => (await g.getSource()).length).catch(() => 0), {
        message: `${panelName} grid must load rows`,
        timeout: 80000,
      })
      .toBeGreaterThan(0);
    return grid.evaluate(async g => ({
      rows: (await g.getSource()).map(r => ({ ...r })),
      total: ((await g.getSource("rowPinEnd")) || [])[0] || null,
    }));
  }

  async apiRows(query) {
    const res = await this.page.request.get(`${process.env.BASE_URL}/api/bird-table?${query}`);
    expect(res.status(), `FAIL: GET /api/bird-table?${query} must answer 200`).toBe(200);
    return (await res.json()).rows || [];
  }

  /** One consistent read of every source on the page (Overview → Historical Draws → APIs). */
  async snapshot() {
    const C = DrawReportingCalcPage.C;
    const pid = this.propertyId();
    await this.drawReportingJob.openOverviewTab();
    const tiles = {};
    for (const l of DRAW_TILE_LABELS) tiles[l] = C(String(await this.valueNextTo(l)).replace(/[$,]/g, ""));
    const activeText = await this.valueNextTo(ACTIVE_DRAW_TILE_LABEL, { required: false });
    tiles[ACTIVE_DRAW_TILE_LABEL] = activeText == null ? null : C(activeText.replace(/[$,]/g, ""));
    const card = activeText == null ? null : {
      drawAmount: C(String(await this.valueNextTo("Draw Amount")).replace(/[$,]/g, "")),
      invoicesIncluded: Number(await this.valueNextTo("Invoices Included", { pattern: /\b\d+\b/ })),
    };
    const budget = await this.gridData("Overview");
    const drawnLine = await healingLocator(capexDrawnLineStrategies(this.page)).first().innerText();
    const remainingLine = await healingLocator(capexRemainingLineStrategies(this.page)).first().innerText();
    // Per-item % only from inside the CapEx Status card ("<name>" line followed by "<n>%").
    const capexCardLines = await healingLocator(capexDrawnLineStrategies(this.page))
      .first()
      .evaluate(e => {
        let n = e;
        for (let i = 0; i < 8 && n; i++) { n = n.parentElement; if (n && /Capex Status/i.test(n.innerText) && /Budget Items/i.test(n.innerText)) break; }
        return (n ? n.innerText : "").split("\n").map(x => x.trim()).filter(Boolean);
      });
    const categoryPct = {};
    for (let i = 0; i < capexCardLines.length - 1; i++) {
      if (/^\d+%$/.test(capexCardLines[i + 1]) && !/^\d+%$/.test(capexCardLines[i])) categoryPct[capexCardLines[i]] = capexCardLines[i + 1].replace(/%/g, "");
    }
    await this.drawReportingJob.openHistoricalDrawsTab();
    const historical = await this.gridData("Historical Draws");
    await this.drawReportingJob.openOverviewTab();
    const draws = await this.apiRows(`table_name=draw&property_id=${pid}`);
    const invoices = (await this.apiRows(`table_name=invoice&property_id=${pid}`)).filter(i => String(i.property_id) === String(pid));
    return { pid, tiles, card, budget, drawnLine, remainingLine, categoryPct, historical, draws, invoices };
  }

  /**
   * Reads the page until every source agrees on the cross-source sums (other suites add draws on this
   * shared property), then asserts and logs every rule on that one snapshot.
   */
  async verifyAll(stage = "Draw Reporting") {
    const C = DrawReportingCalcPage.C;
    const M = DrawReportingCalcPage.M;
    let s;
    await expect(async () => {
      s = await this.snapshot();
      const approved = s.historical.rows.filter(r => /^(approved|funded)$/i.test(String(r.status))).reduce((t, r) => t + C(r.draw_amount), 0);
      const pending = s.invoices.filter(i => /^approved$/i.test(String(i.status)) && i.draw_id == null).reduce((t, i) => t + C(i.invoice_amount), 0);
      expect(s.tiles["Draws to Date"], "Historical Draws must match the tile (draw data moved during the read)").toBe(approved);
      expect(s.tiles["Pending Invoices"], "invoices must match the tile (invoice data moved during the read)").toBe(pending);
    }).toPass({ timeout: 300000, intervals: [5000, 10000, 15000] });

    let rules = 0;
    // Every rule: RULE (what is checked) | FORMULA (with this run's real numbers) = expected |
    // ACTUAL (what the screen/API shows) | PASS/FAIL — and a hard assertion, so any mismatch fails TC608.
    const rule = (name, actual, expected, detail) => {
      rules++;
      const fmt = v => (typeof v === "number" ? M(v) : JSON.stringify(v));
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      Logger.info(
        `[TC608][${stage}] RULE ${name} | FORMULA ${detail || "(see rule)"} = ${fmt(expected)} | ACTUAL ${fmt(actual)} | ${pass ? "PASS" : "FAIL"}`
      );
      expect(actual, `FAIL [${stage}] ${name} | formula: ${detail || "-"} = ${fmt(expected)} | actual: ${fmt(actual)}`).toEqual(expected);
    };
    const t = s.tiles;
    const rows = s.budget.rows;
    const sum = k => rows.reduce((a, r) => a + C(r[k]), 0);

    // ---- Budget Overview table (per row + Total row)
    for (const r of rows) {
      const n = r.cost_category;
      rule(`Budget row "${n}" Reallocation`, C(r.reallocation), C(r.current_budget) - C(r.original_budget),
        `Current − Original = ${M(C(r.current_budget))} − ${M(C(r.original_budget))}`);
      rule(`Budget row "${n}" Budget Remaining`, C(r.budget_remaining), C(r.current_budget) - C(r.drawn),
        `Current − Drawn = ${M(C(r.current_budget))} − ${M(C(r.drawn))}`);
      const pct = Number(r.current_budget) > 0 ? (Number(r.drawn) / Number(r.current_budget)) * 100 : 0;
      rule(`Budget row "${n}" Progress % (4 decimals)`, `${Number(r.progress_pct ?? 0).toFixed(4)}%`, `${pct.toFixed(4)}%`,
        Number(r.current_budget) > 0 ? `Drawn ÷ Current × 100 = ${Number(r.drawn)} ÷ ${Number(r.current_budget)} × 100 = ${pct.toFixed(4)}%` : "Current ≤ 0 → 0%");
      if (r.proforma_budget != null) {
        const revised = C(r.proforma_budget) + C(r.cumulative_proforma_adjustments);
        rule(`Budget row "${n}" Revised Proforma Budget`, C(r.revised_proforma_budget), revised,
          `Proforma + Cumulative Adjustments = ${M(C(r.proforma_budget))} + ${M(C(r.cumulative_proforma_adjustments))}`);
        rule(`Budget row "${n}" Proforma Funds Remaining`, C(r.proforma_funds_remaining), revised - C(r.invoice_amount_lifetime),
          `Revised Proforma − Invoice Lifetime = ${M(revised)} − ${M(C(r.invoice_amount_lifetime))}`);
      }
    }
    for (const k of ["original_budget", "reallocation", "current_budget", "committed", "drawn", "budget_remaining", "invoice_amount_lifetime", "amount_paid_lifetime"]) {
      if (s.budget.total && k in s.budget.total)
        rule(`Budget Total row "${k}"`, C(s.budget.total[k]), sum(k), `Σ ${k} of ${rows.length} rows = ${rows.map(r => M(C(r[k]))).join(" + ")}`);
    }

    // ---- Tiles
    rule('Tile "Total Budget"', t["Total Budget"], sum("current_budget"), `Σ Current Budget of ${rows.length} budget items (Budget Overview table)`);
    const approvedRows = s.historical.rows.filter(r => /^(approved|funded)$/i.test(String(r.status)));
    rule('Tile "Draws to Date"', t["Draws to Date"], approvedRows.reduce((a, r) => a + C(r.draw_amount), 0),
      `Σ Draw Amount of ${approvedRows.length} Approved/Funded draws (of ${s.historical.rows.length} in Historical Draws; Rejected excluded)`);
    rule('Tile "Remaining Budget"', t["Remaining Budget"], t["Total Budget"] - t["Draws to Date"],
      `Total Budget − Draws to Date = ${M(t["Total Budget"])} − ${M(t["Draws to Date"])}`);
    const pendingInv = s.invoices.filter(i => /^approved$/i.test(String(i.status)) && i.draw_id == null);
    rule('Tile "Pending Invoices"', t["Pending Invoices"], pendingInv.reduce((a, i) => a + C(i.invoice_amount), 0),
      `Σ amount of ${pendingInv.length} Approved invoices not in any draw = ${pendingInv.map(i => M(C(i.invoice_amount))).join(" + ") || "0"}`);
    const drafts = s.draws.filter(d => /^draft$/i.test(String(d.status))).sort((a, b) => Number(b.id) - Number(a.id));
    rule('Tile "Active Draw" visibility', t[ACTIVE_DRAW_TILE_LABEL] != null, drafts.length > 0,
      `shown only while a Draft draw exists → ${drafts.length} Draft draw(s)`);
    if (drafts.length) {
      rule('Tile "Active Draw"', t[ACTIVE_DRAW_TILE_LABEL], C(drafts[0].draw_amount),
        `Draw Amount of the latest Draft draw "${drafts[0].name}" (id ${drafts[0].id})`);
      rule('Current draw card "Draw Amount"', s.card.drawAmount, t[ACTIVE_DRAW_TILE_LABEL], `= Active Draw tile`);
      // MCP-verified 2026-11-24: a Draft draw does not set invoice.draw_id yet; its included invoices
      // are listed by GET /api/draw-reporting/draws/<id>/summary → includedInvoiceIds.
      const summaryRes = await this.page.request.get(`${process.env.BASE_URL}/api/draw-reporting/draws/${drafts[0].id}/summary`);
      expect(summaryRes.status(), "FAIL: draft draw summary must answer 200").toBe(200);
      const summaryJson = await summaryRes.json();
      const included = (summaryJson.summary || summaryJson.draw || summaryJson).includedInvoiceIds || [];
      rule('Current draw card "Invoices Included"', String(s.card.invoicesIncluded), String(included.length),
        `count of includedInvoiceIds of the Draft draw ${JSON.stringify(included).slice(0, 80)}`);
    }

    // ---- CapEx Status
    const curSum = sum("current_budget"), drawnSum = sum("drawn"), remSum = sum("budget_remaining");
    const drawnPct = curSum > 0 ? (drawnSum / curSum) * 100 : 0;
    rule("CapEx Status drawn line", s.drawnLine.trim(), `${drawnPct.toFixed(0)}% Drawn (${M(drawnSum)})`,
      `round(ΣDrawn ÷ ΣCurrent × 100)% Drawn (ΣDrawn) = round(${M(drawnSum)} ÷ ${M(curSum)} × 100 = ${drawnPct.toFixed(4)})%`);
    rule("CapEx Status remaining line", s.remainingLine.trim(), `${Math.max(0, 100 - drawnPct).toFixed(0)}% Remaining (${M(remSum)})`,
      `round(max(0, 100 − ${drawnPct.toFixed(4)}))% Remaining (Σ Budget Remaining = ${M(remSum)})`);
    for (const r of rows) {
      const pct = Number(r.current_budget) > 0 ? (Number(r.drawn) / Number(r.current_budget)) * 100 : 0;
      if (s.categoryPct[r.cost_category] != null)
        rule(`CapEx Status item "${r.cost_category}" %`, `${s.categoryPct[r.cost_category]}%`, `${pct.toFixed(0)}%`,
          `round(Drawn ÷ Current × 100) = round(${Number(r.drawn)} ÷ ${Number(r.current_budget)} × 100)`);
    }

    // ---- Historical Draws (per row, creation order)
    const hist = [...s.historical.rows].sort((a, b) => Number(a.id) - Number(b.id));
    // Every draw is checked; logging is per rule (count + first examples) to keep the log readable.
    let running = 0;
    let rejectedInRunning = 0;
    const histRules = {
      "Previously Drawn = Σ earlier draws (any status)": [],
      "Total Draw at Submission = Previously Drawn + Draw Amount": [],
      "Remaining at Submission = Total Budget − Total Draw at Submission": [],
    };
    const examples = [];
    for (const r of hist) {
      const checks = [
        ["Previously Drawn = Σ earlier draws (any status)", C(r.previously_drawn), running],
        ["Total Draw at Submission = Previously Drawn + Draw Amount", C(r.total_draw_at_submission), C(r.previously_drawn) + C(r.draw_amount)],
        ["Remaining at Submission = Total Budget − Total Draw at Submission", C(r.remaining_at_submission), t["Total Budget"] - C(r.total_draw_at_submission)],
      ];
      for (const [name, actual, expectedV] of checks) if (actual !== expectedV) histRules[name].push(`"${r.name}": expected ${M(expectedV)}, actual ${M(actual)}`);
      if (examples.length < 3 || hist.indexOf(r) === hist.length - 1)
        examples.push(`"${r.name}" (${r.status}): prev ${M(C(r.previously_drawn))} + amount ${M(C(r.draw_amount))} = total ${M(C(r.total_draw_at_submission))}; remaining ${M(C(r.remaining_at_submission))}`);
      running += C(r.draw_amount);
      if (/^rejected$/i.test(String(r.status))) rejectedInRunning += C(r.draw_amount);
    }
    examples.forEach(e => Logger.info(`[TC608][${stage}] Historical draw example → ${e}`));
    for (const [name, bad] of Object.entries(histRules)) {
      rules += hist.length;
      Logger.info(`[TC608][${stage}] RULE Historical Draws | FORMULA ${name} (each draw, creation order) | ${hist.length - bad.length}/${hist.length} draws match | ${bad.length ? "FAIL" : "PASS"}${bad.length ? ` — first mismatches: ${bad.slice(0, 5).join("; ")}` : ""}`);
      expect(bad, `FAIL [${stage}] Historical Draws "${name}" — ${bad.length} mismatching draw(s)`).toEqual([]);
    }
    Logger.info(
      `[TC608][${stage}] Note: "Previously Drawn" counts every earlier draw (incl. Rejected ${M(rejectedInRunning)}), while "Draws to Date" counts Approved/Funded only (${M(t["Draws to Date"])}) — both as coded in the app`
    );
    Logger.success(`[TC608] ${stage}: ${rules} calculation rules verified on live data`);
    return { rules, snapshot: s };
  }
}

module.exports = { DrawReportingCalcPage };
