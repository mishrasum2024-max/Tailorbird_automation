const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const {
  REVISION_TILE_LABELS,
  revisionTileLabelStrategies,
} = require("../locators/budgetRevisionCalcLocator");

/**
 * TC607 — every calculation shown in the Budget revision editor, recomputed from the editor's own
 * grid data and asserted rule by rule (each rule is logged with expected vs actual).
 *
 * Formulas taken from the app (verified live in the MCP browser on 2026-11-24, Test Property
 * 2_The Westerham, adjustments +1,000 / -500 and a 200 reallocation — every tile matched):
 *  - app/api/bird-table/tables/budget-revision-detail.ts (per row):
 *      Reallocated Amount = -(sum this row gives through other rows' "Reallocate From")
 *      Net Change        = Adjustment + Reallocated Amount + sum this row receives
 *      New Amount        = (Current Budget ?? Original Budget) + Net Change
 *  - app/server/custom-views/entities/budgets.ts (proforma, only with a multi-year budget):
 *      Revised Proforma Budget  = Proforma Budget + Cumulative Proforma Adjustments
 *      Proforma Funds Remaining = Revised Proforma Budget - Invoice Amount (Lifetime)
 *  - app/financials/budget/components/BudgetRevisionEditor.tsx (tiles):
 *      Original Total = Σ Original Budget, Current Budget Total = Σ Current Budget,
 *      Total Increase = Σ positive Adjustment, Total Decrease = Σ negative Adjustment,
 *      Total Reallocated = Σ |Reallocated Amount|, Adjusted Total = Σ New Amount,
 *      Net Change = Σ Net Change
 *  - Notes (diff_notes): "this revision increased|decreased the adjustment amount by $X" and, on
 *    the receiving row, 'Moved "$X" money from "<source item>"'.
 */
class BudgetRevisionCalcPage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('./budgetPage').BudgetJob} budgetJob existing page object (reused for actions)
   */
  constructor(page, budgetJob) {
    this.page = page;
    this.budgetJob = budgetJob;
  }

  static cents(v) {
    return Math.round(Number(v ?? 0) * 100);
  }

  static money(c) {
    const n = Math.abs(c) / 100;
    return `${c < 0 ? "-" : ""}$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  grid() {
    return this.budgetJob.revisionRevoGrid();
  }

  /** Rows + pinned Total row exactly as the editor holds them. */
  async readGrid() {
    await expect(this.grid(), "FAIL: revision grid must render").toBeVisible({
      timeout: 80000,
    });
    return this.grid().evaluate(async g => ({
      rows: (await g.getSource()).map(r => ({ ...r })),
      total: ((await g.getSource("rowPinEnd")) || [])[0] || null,
      columns: (await g.getColumns()).map(c => c.prop),
    }));
  }

  /** Value shown on each summary tile, in cents. */
  async readTiles() {
    const tiles = {};
    for (const label of REVISION_TILE_LABELS) {
      const labelEl = healingLocator(revisionTileLabelStrategies(this.page, label)).first();
      await expect(labelEl, `FAIL: tile "${label}" must be visible`).toBeVisible({
        timeout: 80000,
      });
      const text = await labelEl.evaluate(e => {
        let n = e;
        for (let i = 0; i < 5 && n; i++) {
          n = n.parentElement;
          const m = n && n.innerText.match(/-?\$[\d,]+\.\d{2}/);
          if (m) return m[0];
        }
        return null;
      });
      expect(text, `FAIL: tile "${label}" must show a currency value`).toMatch(
        /^-?\$[\d,]+\.\d{2}$/
      );
      tiles[label] = Math.round(Number(text.replace(/[$,]/g, "")) * 100);
    }
    return tiles;
  }

  /** Picks three different, non-deleted rows with unique names and enough budget for the edits. */
  pickRows(rows) {
    const base = r => Number(r.current_budget ?? r.original_budget ?? 0);
    const counts = rows.reduce((m, r) => ((m[r.item] = (m[r.item] || 0) + 1), m), {});
    const usable = rows
      .filter(r => !r.is_deleted && r.item && counts[r.item] === 1 && base(r) >= 100)
      .sort((a, b) => base(b) - base(a));
    Logger.info(
      `[TC607] Live revision rows: ${rows.map(r => `"${r.item}" base=${base(r)}${r.is_deleted ? " (deleted)" : ""}${counts[r.item] > 1 ? " (duplicate name)" : ""}`).join("; ")} → usable: ${usable.map(r => r.item).join(", ")}`
    );
    // Two rows are enough: increase on the largest row, decrease on the next, and the reallocation
    // takes money from a third row when there is one, otherwise from the decreased row.
    expect(
      usable.length,
      "FAIL: the revision needs at least 2 budget items (unique name, budget ≥ $100) to exercise increase, decrease and reallocation"
    ).toBeGreaterThanOrEqual(2);
    return {
      increaseRow: usable[0].item,
      decreaseRow: usable[1].item,
      sourceRow: (usable[2] || usable[1]).item,
    };
  }

  /**
   * Amounts to enter, derived from the live budgets of the picked rows (whole dollars, never
   * fixed): increase = 5% of its row, decrease = 3% of its row, reallocation = 2% of the source row.
   */
  liveAmounts(rows, picked) {
    const base = item => {
      const r = rows.find(x => x.item === item);
      return Number(r.current_budget ?? r.original_budget ?? 0);
    };
    const pct = (item, p) => Math.max(1, Math.round(base(item) * p));
    return {
      increase: pct(picked.increaseRow, 0.05),
      decrease: -pct(picked.decreaseRow, 0.03),
      realloc: pct(picked.sourceRow, 0.02),
    };
  }

  /**
   * Asserts and logs how much each tile moved between two stages (both read live).
   * @param {Record<string, number>} deltasDollars expected change per tile, in dollars
   */
  expectTileDeltas(stage, before, after, deltasDollars) {
    const M = BudgetRevisionCalcPage.money;
    for (const [label, dollars] of Object.entries(deltasDollars)) {
      const expectedDelta = Math.round(dollars * 100) || 0;
      const actualDelta = (after[label] - before[label]) || 0;
      Logger.info(
        `[TC607][${stage}] Tile "${label}" change: expected ${M(expectedDelta)} (${M(before[label])} → ${M(before[label] + expectedDelta)}) | actual ${M(actualDelta)} (${M(before[label])} → ${M(after[label])})`
      );
      expect(actualDelta, `FAIL [${stage}] tile "${label}" changed by ${M(actualDelta)}, expected ${M(expectedDelta)}`).toBe(expectedDelta);
    }
    Logger.success(`[TC607] ${stage}: tile changes match the entered amounts`);
  }

  /** Runs `action` and requires the cell-save PUT for `columnName` to answer 200. */
  async expectCellSave(columnName, label, action) {
    const [res] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.request().method() === "PUT" &&
          r.url().includes("/api/bird-table/cells") &&
          (r.request().postData() || "").includes(`"columnName":"${columnName}"`),
        { timeout: 80000 }
      ),
      action(),
    ]);
    expect(res.status(), `FAIL: ${label} must be saved (PUT /api/bird-table/cells → 200)`).toBe(200);
    Logger.success(`${label}: saved (HTTP ${res.status()})`);
  }

  /**
   * Recomputes every on-screen figure from the grid's inputs and asserts it.
   * @param {string} stage label for the log
   * @param {{ adjustments?: Record<string, number>, reallocations?: {from:string,to:string,amount:number}[] }} expected
   *   what the test entered — asserted to be what the grid holds before the rules run
   */
  async verifyAllCalculations(stage, expected = {}) {
    Logger.step(`[TC607] ${stage}: recomputing every revision-editor calculation`);
    const C = BudgetRevisionCalcPage.cents;
    const M = BudgetRevisionCalcPage.money;
    let grid, tiles;
    // The tiles and the grid refresh after each save; wait until they agree with the inputs.
    await expect(async () => {
      grid = await this.readGrid();
      tiles = await this.readTiles();
      for (const [item, amount] of Object.entries(expected.adjustments || {})) {
        const row = grid.rows.find(r => r.item === item);
        expect(C(row && row.adjustment_amount), `grid must hold the adjustment entered for "${item}"`).toBe(C(amount));
      }
      for (const re of expected.reallocations || []) {
        const to = grid.rows.find(r => r.item === re.to);
        const got = (to && Array.isArray(to.reallocate_from) ? to.reallocate_from : []).reduce((s, x) => s + Number(x.budget || 0), 0);
        expect(C(got), `grid must hold the reallocation into "${re.to}"`).toBe(C(re.amount));
      }
      expect(tiles["Adjusted Total"], "tiles must have refreshed").toBe(
        grid.rows.reduce((s, r) => s + C(r.new_amount), 0)
      );
    }).toPass({ timeout: 80000, intervals: [1000, 2000, 3000] });

    const rows = grid.rows;
    const byId = Object.fromEntries(rows.map(r => [String(r.id), r]));
    // what each row gives / receives through "Reallocate From"
    const gives = {}, receives = {}, receivedFrom = {};
    for (const r of rows) {
      for (const x of Array.isArray(r.reallocate_from) ? r.reallocate_from : []) {
        const amt = C(x.budget);
        receives[r.id] = (receives[r.id] || 0) + amt;
        gives[x.rowId] = (gives[x.rowId] || 0) + amt;
        (receivedFrom[r.id] = receivedFrom[r.id] || []).push({ source: byId[String(x.rowId)], amt });
      }
    }
    let rules = 0;
    // -0 and 0 are the same amount; toEqual() would treat them as different (run of 2026-11-24).
    const norm = v => (typeof v === "number" && v === 0 ? 0 : v);
    // Every rule: RULE | FORMULA (with this run's real numbers) = expected | ACTUAL | PASS/FAIL — and a
    // hard assertion, so any mismatch fails TC607.
    const rule = (name, actualRaw, expectedRaw, detail) => {
      const actual = norm(actualRaw);
      const expectedValue = norm(expectedRaw);
      rules++;
      const fmt = v => (typeof v === "number" ? M(v) : JSON.stringify(v));
      const pass = JSON.stringify(actual) === JSON.stringify(expectedValue);
      Logger.info(`[TC607][${stage}] RULE ${name} | FORMULA ${detail || "(see rule)"} = ${fmt(expectedValue)} | ACTUAL ${fmt(actual)} | ${pass ? "PASS" : "FAIL"}`);
      expect(actual, `FAIL [${stage}] ${name} | formula: ${detail || "-"} = ${fmt(expectedValue)} | actual: ${fmt(actual)}`).toEqual(expectedValue);
    };

    // ---- per-row rules
    for (const r of rows) {
      const id = String(r.id);
      const name = r.item || id;
      const adj = r.is_deleted ? -C(r.current_budget ?? r.original_budget) : C(r.adjustment_amount);
      const realloc = -(gives[id] || 0);
      rule(`Row "${name}" Reallocated Amount`, C(r.reallocated_amount), realloc, `−(Σ this row gives through other rows' Reallocate From) = −(${M(gives[id] || 0)})`);
      const net = adj + realloc + (receives[id] || 0);
      rule(`Row "${name}" Net Change`, C(r.net_change), net,
        `Adjustment + Reallocated + Received = ${M(adj)} + ${M(realloc)} + ${M(receives[id] || 0)}`);
      const baseRaw = r.current_budget ?? r.original_budget;
      if (baseRaw == null && net === 0) {
        rule(`Row "${name}" New Amount`, r.new_amount ?? null, null, "no Current/Original budget and Net Change 0 → empty");
      } else {
        rule(`Row "${name}" New Amount`, C(r.new_amount), C(baseRaw) + net,
          `(Current ?? Original) + Net Change = ${M(C(baseRaw))} + ${M(net)}`);
      }
      if (r.proforma_budget != null) {
        const revised = C(r.proforma_budget) + C(r.cumulative_proforma_adjustments);
        rule(`Row "${name}" Revised Proforma Budget`, C(r.revised_proforma_budget), revised, `Proforma + Cumulative Adjustments = ${M(C(r.proforma_budget))} + ${M(C(r.cumulative_proforma_adjustments))}`);
        rule(`Row "${name}" Proforma Funds Remaining`, C(r.proforma_funds_remaining), revised - C(r.invoice_amount_lifetime), `Revised Proforma − Invoice Lifetime = ${M(revised)} − ${M(C(r.invoice_amount_lifetime))}`);
      } else {
        Logger.info(`[TC607][${stage}] Row "${name}" proforma rules: not applicable (no multi-year budget — Proforma Budget is empty)`);
      }
      // Notes generated from the change
      const notes = (Array.isArray(r.diff_notes) ? r.diff_notes : []).map(n => n.toDisplay);
      if (C(r.adjustment_amount) !== 0 && !r.is_deleted) {
        const verb = C(r.adjustment_amount) > 0 ? "increased" : "decreased";
        rule(`Row "${name}" Note for the adjustment`, notes.includes(`this revision ${verb} the adjustment amount by ${M(Math.abs(C(r.adjustment_amount)))}`), true,
          `expects "this revision ${verb} the adjustment amount by ${M(Math.abs(C(r.adjustment_amount)))}" in ${JSON.stringify(notes)}`);
      }
      for (const x of receivedFrom[id] || []) {
        const text = `Moved "${M(x.amt)}" money from "${x.source ? x.source.item : "?"}"`;
        rule(`Row "${name}" Note for the reallocation received`, notes.includes(text), true, `expects ${JSON.stringify(text)} in ${JSON.stringify(notes)}`);
      }
    }

    // ---- Total row = Σ rows, column by column
    const sum = k => rows.reduce((s, r) => s + C(r[k]), 0);
    const total = grid.total || {};
    for (const k of ["original_budget", "current_budget", "budget_remaining", "adjustment_amount", "reallocated_amount", "net_change", "new_amount", "proforma_budget", "cumulative_proforma_adjustments", "revised_proforma_budget", "invoice_amount_lifetime", "amount_paid_lifetime", "proforma_funds_remaining"]) {
      if (!(k in total)) continue;
      rule(`Total row "${k}"`, C(total[k]), sum(k), `Σ ${k} of ${rows.length} rows = ${rows.map(r => M(C(r[k]))).join(" + ")}`);
    }

    // ---- tiles
    const inc = rows.reduce((s, r) => s + Math.max(0, C(r.adjustment_amount)), 0);
    const dec = rows.reduce((s, r) => s + Math.min(0, C(r.adjustment_amount)), 0);
    const reallocTotal = rows.reduce((s, r) => s + Math.abs(C(r.reallocated_amount)), 0);
    rule('Tile "Original Total"', tiles["Original Total"], sum("original_budget"), `Σ Original Budget = ${rows.map(r => M(C(r.original_budget))).join(" + ")}`);
    rule('Tile "Current Budget Total"', tiles["Current Budget Total"], sum("current_budget"), `Σ Current Budget = ${rows.map(r => M(C(r.current_budget))).join(" + ")}`);
    rule('Tile "Total Increase"', tiles["Total Increase"], inc, `Σ positive Adjustment = ${rows.filter(r => C(r.adjustment_amount) > 0).map(r => M(C(r.adjustment_amount))).join(" + ") || "none → $0.00"}`);
    rule('Tile "Total Decrease"', tiles["Total Decrease"], dec, `Σ negative Adjustment = ${rows.filter(r => C(r.adjustment_amount) < 0).map(r => M(C(r.adjustment_amount))).join(" + ") || "none → $0.00"}`);
    rule('Tile "Total Reallocated"', tiles["Total Reallocated"], reallocTotal, `Σ |Reallocated Amount| = ${rows.filter(r => C(r.reallocated_amount) !== 0).map(r => M(Math.abs(C(r.reallocated_amount)))).join(" + ") || "none → $0.00"}`);
    rule('Tile "Adjusted Total"', tiles["Adjusted Total"], sum("new_amount"), `Σ New Amount = ${rows.map(r => M(C(r.new_amount))).join(" + ")}`);
    rule('Tile "Net Change"', tiles["Net Change"], sum("net_change"), `Σ Net Change = ${rows.map(r => M(C(r.net_change))).join(" + ")}`);
    // ---- cross-checks between tiles
    rule('Tile "Net Change" (cross-check)', tiles["Net Change"], tiles["Total Increase"] + tiles["Total Decrease"], `Total Increase + Total Decrease = ${M(tiles["Total Increase"])} + ${M(tiles["Total Decrease"])} (a reallocation nets to zero)`);
    const baseSum = rows.reduce((s, r) => s + C(r.current_budget ?? r.original_budget), 0);
    rule('Tile "Adjusted Total" (cross-check)', tiles["Adjusted Total"], baseSum + tiles["Net Change"], `Σ (Current ?? Original) + Net Change = ${M(baseSum)} + ${M(tiles["Net Change"])}`);
    rule('Tile "Total Reallocated" (cross-check)', tiles["Total Reallocated"], Object.values(receives).reduce((s, v) => s + v, 0), `Σ amounts received through "Reallocate From" = ${Object.values(receives).map(v => M(v)).join(" + ") || "none → $0.00"}`);
    Logger.success(`[TC607] ${stage}: ${rules} calculation rules verified`);
    return { tiles, rows };
  }
}

module.exports = { BudgetRevisionCalcPage };
