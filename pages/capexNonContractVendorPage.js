/**
 * CapEx — non-contract invoices from several vendors on one GL (TC609, tests/TC19_Capex.spec.js).
 *
 * Bug covered: "CapEx Tracker → Non-contract invoices with multiple vendors on a specific GL only
 * shows one vendor instead of all vendors". MCP-reproduced 2026-11-24: a non-contract job with
 * approved invoices from "New vendor 12" ($137) and "Kishan Flooring Vendor" ($59) on GL Concrete
 * → Job Summary spend table lists both vendors, but the CapEx drill-down job row (and
 * GET /api/capex-tracker/detail → job.vendorName) shows only the vendor of the newest invoice
 * (app/server/capex/category-detail.ts: non_contract_invoice_stats … ORDER BY i2.id DESC LIMIT 1).
 *
 * Runtime-first, nothing hardcoded (no property, project, job, vendor, GL or amount):
 *  A. discover() finds an existing non-contract job whose approved invoices on one GL come from
 *     ≥ 2 vendors → reuse it, create nothing (seconds);
 *  B. else an existing non-contract job with 1 vendor → add ONE invoice from another live vendor;
 *  C. else an existing project (current FY, has a GL) → add a Non Contract job + 2 invoices.
 *  Seeded data is left in place, so the next run takes path A. No property/budget is created.
 *
 * Extra API (MCP-verified 2026-11-24): GET /api/bird-table?table_name=job → {id, title, job_type
 * "non-contract", project_id, project_title, property_id, property_name, budget_item [bim]};
 * table_name=project → {id, title, property_id, fiscal_year, budget_item,
 * is_construction_management_fee_project}. Jobs list rows have no /jobs/ link — the job opens
 * from the pinned Actions row's eye button (button:has(svg.lucide-eye), same data-rgrow).
 *
 * API sources of truth (MCP-verified 2026-11-24):
 *  - GET /api/bird-table?table_name=invoice → rows {id, job_id, property_id, vendor_name,
 *    invoice_amount, status, job_type ("non-contract"), invoice_detail_budget_items [bim id]}
 *  - GET /api/bird-table?table_name=capex_tracker&dimension=properties&selection=<pid>&fiscal_year=<y>
 *    → category row id "prop:<pid>::bim-<bimId>" with invoiced_amount / net_paid
 *  - GET /api/capex-tracker/detail?categoryId=bim-<bimId>&propertyId=<pid>&fiscalYear=<y>
 *    → { tree: [project{children:[job{name, jobType, vendorName, invoicedAmount}]}] }
 */
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const { waitForReadyRecoveringErrors } = require("../utils/errorLoadingDataRecovery");
const L = require("../locators/capexNonContractVendorLocator");

const BASE_URL = process.env.BASE_URL;
const SLOW = 80000; // beta is slow — worst-case waits (60–80s)
// Long-lived seeded property the daily cleanup never deletes (user choice 2026-11-24). Only the
// PROPERTY is fixed; the job, GL, vendors and amounts are still discovered/created at run time.
const STABLE_PROPERTY = "Test Property 1_Cottages on Elm";
const STABLE_JOB_PREFIX = "TC609_NonContract_MultiVendor - automation, please don't delete";

class CapexNonContractVendorPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page, { propertyName = STABLE_PROPERTY } = {}) {
    this.page = page;
    this.propertyName = propertyName;
    this.fiscalYear = String(new Date().getFullYear());
  }

  static get STABLE_JOB_PREFIX() {
    return STABLE_JOB_PREFIX;
  }

  static M(n) {
    const v = Math.round(Number(n || 0) * 100) / 100;
    return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
  }

  async _getJson(url) {
    const res = await this.page.request.get(`${BASE_URL}${url}`);
    expect(res.status(), `FAIL: GET ${url} must succeed`).toBeLessThan(300);
    return res.json();
  }

  async _rows(tableName) {
    const j = await this._getJson(`/api/bird-table?table_name=${tableName}`);
    return Array.isArray(j) ? j : j.rows || j.data || [];
  }

  // ─── Discovery (live data, nothing hardcoded) ─────────────────────────────

  /**
   * Non-contract (job, GL) groups from live data. Only approved invoices whose lines are ALL on
   * that one GL are counted, so every amount rule stays exact. Returns groups sorted by most
   * vendors first: [{ job, bim, invoices, vendors }].
   */
  async discoverGroups() {
    const [invoices, jobs] = await Promise.all([this._rows("invoice"), this._rows("job")]);
    const ncJobs = jobs.filter(
      j =>
        j.job_type === "non-contract" &&
        Number(j.fiscal_year) === Number(this.fiscalYear) &&
        j.property_name === this.propertyName
    );
    const groups = [];
    for (const job of ncJobs) {
      const approved = invoices.filter(i => Number(i.job_id) === Number(job.id) && /^approved$/i.test(String(i.status)));
      const bims = [...new Set(approved.flatMap(i => (i.invoice_detail_budget_items || []).map(Number)))];
      for (const bim of bims) {
        const touching = approved.filter(i => (i.invoice_detail_budget_items || []).map(Number).includes(bim));
        if (touching.some(i => (i.invoice_detail_budget_items || []).length !== 1)) continue; // multi-GL → not exact
        // User rule 2026-11-24: invoice amounts in this flow are $5–$10 only — reuse only such data.
        if (touching.some(i => Number(i.invoice_amount) > 10)) continue;
        const vendors = [...new Set(touching.map(i => i.vendor_name).filter(Boolean))].sort();
        groups.push({ job, bim, invoices: touching, vendors });
      }
    }
    groups.sort((a, b) => b.vendors.length - a.vendors.length || Number(a.job.id) - Number(b.job.id));
    // Jobs that may be topped up: every approved invoice single-GL and ≤ $10 (or none yet).
    // Oldest property first (long-lived data); never creates a second job when one exists.
    const topUpJobs = ncJobs
      .filter(job => {
        const approved = invoices.filter(i => Number(i.job_id) === Number(job.id) && /^approved$/i.test(String(i.status)));
        return approved.every(i => (i.invoice_detail_budget_items || []).length === 1 && Number(i.invoice_amount) <= 10);
      })
      .map(job => ({
        job,
        vendors: [
          ...new Set(
            invoices
              .filter(i => Number(i.job_id) === Number(job.id) && /^approved$/i.test(String(i.status)))
              .map(i => i.vendor_name)
              .filter(Boolean)
          ),
        ],
      }))
      .sort((a, b) => Number(a.job.property_id) - Number(b.job.property_id) || Number(a.job.id) - Number(b.job.id));
    Logger.info(`[TC609] Top-up candidates: ${topUpJobs.map(t => `#${t.job.id} (property ${t.job.property_id})`).join(", ") || "none"}`);
    Logger.info(
      `[TC609] Discovery on "${this.propertyName}": ${ncJobs.length} non-contract job(s) in FY${this.fiscalYear}; GL groups → ${
        groups.map(g => `job #${g.job.id} "${g.job.title}" bim ${g.bim}: ${g.vendors.length} vendor(s)`).join(" | ") || "none"
      }`
    );
    return { groups, ncJobs, topUpJobs };
  }

  /** Oldest project of the stable property with a GL in the current FY (not CM-fee, unique title) — path C. */
  async pickExistingProject() {
    const props = await this._rows("property");
    const prop = props.find(p => p.name === this.propertyName);
    expect(prop, `FAIL: property "${this.propertyName}" must exist`).toBeTruthy();
    const projects = (await this._rows("project")).filter(p => Number(p.property_id) === Number(prop.id));
    const titles = projects.map(p => (p.title || "").trim());
    const usable = projects
      .filter(
        p =>
          (p.title || "").trim() &&
          titles.filter(t => t === p.title.trim()).length === 1 &&
          Number(p.fiscal_year) === Number(this.fiscalYear) &&
          (p.budget_item || []).length > 0 &&
          !p.is_construction_management_fee_project
      )
      .sort((a, b) => Number(a.id) - Number(b.id));
    expect(usable.length, "FAIL: an existing project with a GL in the current fiscal year is required").toBeGreaterThan(0);
    Logger.info(`[TC609] Path C project: #${usable[0].id} "${usable[0].title}" (property ${usable[0].property_id})`);
    return usable[0];
  }

  /** Left panel → Jobs (Contracts & POs) → search → Actions eye → /jobs/<id>. */
  async openJobFromJobsList(jobTitle) {
    const page = this.page;
    await healingLocator(L.ncSidebarLinkStrategies(page, "Jobs (Contracts & POs)")).first().click();
    await page.waitForURL(/\/jobs(\?|$)/, { timeout: SLOW });
    const search = page.getByRole("textbox", { name: "Search..." }).first();
    await waitForReadyRecoveringErrors(page, search, { label: "Jobs list", timeout: SLOW });
    await search.fill(jobTitle);
    await search.press("Enter");
    const row = page.getByRole("row").filter({ hasText: jobTitle }).first();
    await expect(row, `FAIL: Jobs list must show "${jobTitle}"`).toBeVisible({ timeout: SLOW });
    const rg = await row.getAttribute("data-rgrow");
    await page.locator(`[role="row"][data-rgrow="${rg}"] button:has(svg.lucide-eye)`).first().click();
    await page.waitForURL(/\/jobs\/\d+/, { timeout: SLOW });
    Logger.info(`[TC609] Opened job "${jobTitle}" → ${page.url()}`);
  }

  // ─── Job ──────────────────────────────────────────────────────────────────

  /**
   * With the project's "Add job" modal open (ProjectPage.openCreateJobModal), creates a
   * Job Type "Non Contract" job on the GL the modal pre-selects. Returns { jobId, gl }.
   */
  async createNonContractJobInOpenModal(jobName, { pickGl = null } = {}) {
    const page = this.page;
    const modal = healingLocator(L.ncJobModalStrategies(page)).first();
    await expect(modal, "FAIL: Add job modal must be open").toBeVisible({ timeout: 30000 });

    const jobType = healingLocator(L.ncJobTypeInputStrategies(modal)).first();
    await jobType.click();
    await page.getByRole("option", { name: "Non Contract", exact: true }).click();
    await expect(jobType, "FAIL: Job Type must be Non Contract").toHaveValue("Non Contract");
    await expect(
      modal.getByPlaceholder("Not applicable for non-contract jobs"),
      "FAIL: Vendor must be locked for a non-contract job"
    ).toBeDisabled({ timeout: 15000 });

    // Title last: the job-type change re-renders the form (same note as ProjectPage.fillJobForm).
    const title = healingLocator(L.ncJobTitleInputStrategies(modal)).first();
    await title.click();
    await title.fill(jobName);
    await title.press("Tab");
    await expect(title).toHaveValue(jobName);

    // GL = whatever Budget Category the app pre-selects (the project's category) — read live.
    const glButton = healingLocator(L.ncJobBudgetCategoryButtonStrategies(modal)).first();
    await expect(glButton, "FAIL: Budget Category picker must be shown").toBeVisible({ timeout: 30000 });
    let gl = "";
    const glReady = async () => {
      gl = ((await glButton.innerText().catch(() => "")) || "").trim();
      return Boolean(gl) && !/select budget|\(none\)|loading/i.test(gl);
    };
    // The app pre-selects the project's category once the modal finishes loading.
    const deadline = Date.now() + 30000;
    while (!(await glReady()) && Date.now() < deadline) await page.waitForTimeout(1000);
    if (!(await glReady()) && pickGl) {
      Logger.info(`[TC609] No GL pre-selected ("${gl}") — picking one with the existing picker helper`);
      await pickGl(modal);
    }
    await expect
      .poll(glReady, { message: "FAIL: the job's Budget Category (GL) must be selected", timeout: 30000, intervals: [1000] })
      .toBe(true);
    Logger.info(`[TC609] Non-contract job "${jobName}" — GL (Budget Category) = "${gl}"`);

    const created = page.waitForResponse(
      r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/bird-table/rows",
      { timeout: 150000 }
    );
    await healingLocator(L.ncJobCreateButtonStrategies(modal)).first().click();
    const res = await created;
    expect(res.status(), "FAIL: job create must succeed").toBeLessThan(300);
    await page.waitForURL(/\/jobs\/\d+/, { timeout: SLOW });
    const jobId = Number(page.url().match(/\/jobs\/(\d+)/)[1]);
    Logger.success(`[TC609] Non-contract job created: #${jobId} "${jobName}" on GL "${gl}"`);
    return { jobId, gl };
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────

  /**
   * On the job page: Invoice tab → Create Invoice → pick a vendor → amount on the pre-added GL
   * line → Confirm Invoice → Confirm (approve). Vendor = `vendorName` when given, otherwise the
   * first live dropdown option whose name is unique in the list and not in `exclude`.
   * Returns { invoiceId, vendor, amount, gl }.
   */
  async createApprovedInvoice(jobId, { amount, vendorName = null, exclude = [], gl }) {
    const page = this.page;
    await healingLocator(L.ncJobTabStrategies(page, "Invoice")).first().click();
    const createBtn = healingLocator(L.ncCreateInvoiceButtonStrategies(page)).first();
    await waitForReadyRecoveringErrors(page, createBtn, { label: "Job invoices tab", timeout: SLOW });
    await createBtn.click();
    // URL predicate instead of a built RegExp (semgrep detect-non-literal-regexp).
    const invoicePrefix = `/jobs/${jobId}/invoices/`;
    await page.waitForURL(
      u => u.pathname.startsWith(invoicePrefix) && /^\d+$/.test(u.pathname.slice(invoicePrefix.length)),
      { timeout: SLOW }
    );
    const invoiceId = Number(page.url().match(/\/invoices\/(\d+)/)[1]);

    // Vendor
    const vendorInput = healingLocator(L.ncInvoiceVendorInputStrategies(page)).first();
    await expect(vendorInput, "FAIL: non-contract invoice must ask for a vendor").toBeVisible({ timeout: SLOW });
    await expect(vendorInput).toBeEnabled({ timeout: 30000 });
    await vendorInput.click();
    const options = page.getByRole("option");
    await expect(options.first(), "FAIL: vendor list must load").toBeVisible({ timeout: 60000 });
    const texts = (await options.allInnerTexts()).map(t => t.trim());
    const base = t => t.split("·")[0].trim();
    const counts = texts.reduce((m, t) => ((m[base(t)] = (m[base(t)] || 0) + 1), m), {});
    const idx = vendorName
      ? texts.findIndex(t => base(t) === vendorName)
      : texts.findIndex(t => base(t) && counts[base(t)] === 1 && !exclude.includes(base(t)));
    expect(idx, `FAIL: vendor dropdown must offer ${vendorName ? `"${vendorName}"` : "an unused vendor"}`).toBeGreaterThanOrEqual(0);
    const isVendorPut = r =>
      r.url().includes("/api/bird-table/cells") && (r.request().postData() || "").includes('"vendor_id"');
    const vendorSaved = page.waitForResponse(isVendorPut, { timeout: 60000 });
    await options.nth(idx).click();
    expect((await vendorSaved).status(), "FAIL: vendor must be saved on the invoice").toBeLessThan(300);
    const vendor = (await vendorInput.inputValue()).trim();
    expect(vendor, "FAIL: picked vendor must show in the field").toBe(base(texts[idx]));

    // GL line + amount. The drawer pre-adds one line on the job's FIRST GL; the cell renders the
    // name plus a clear icon "✕" (run 2: "Concrete✕"; run 5: a 2-GL job's line = first GL only).
    const glCell = page.locator('div[role="gridcell"][data-rgcol="0"]').first();
    await expect(glCell, "FAIL: the invoice must have a GL line").toHaveText(/\w/, { timeout: 60000 });
    const lineGl = ((await glCell.innerText()) || "").replace(/✕/g, "").trim();
    if (gl) expect(lineGl, `FAIL: the invoice line must be on GL "${gl}"`).toBe(gl);
    gl = lineGl;
    const header = healingLocator(L.ncInvoiceAmountHeaderStrategies(page)).first();
    const col = await header.getAttribute("data-rgcol", { timeout: 30000 });
    const amountCell = page.locator(`div[role="gridcell"][data-rgcol="${col}"]`).first();
    const isAmountPut = r =>
      r.url().includes("/api/bird-table/cells") && (r.request().postData() || "").includes('"invoice_amount"');
    const amountSaved = page.waitForResponse(isAmountPut, { timeout: 60000 });
    await amountCell.click();
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.type(String(amount), { delay: 50 });
    await page.keyboard.press("Enter");
    const amountRes = await amountSaved;
    expect(amountRes.status(), "FAIL: invoice amount must be saved").toBeLessThan(300);
    expect(Number(JSON.parse(amountRes.request().postData()).value), "FAIL: saved amount").toBe(amount);

    // Approve
    const confirmBtn = healingLocator(L.ncConfirmInvoiceButtonStrategies(page)).first();
    await expect(confirmBtn, "FAIL: Confirm Invoice must enable").toBeEnabled({ timeout: 45000 });
    const isApprove = r =>
      r.url().includes("/api/bird-table/cells") &&
      (r.request().postData() || "").includes('"status"') &&
      (r.request().postData() || "").includes('"Approved"');
    const approved = page.waitForResponse(isApprove, { timeout: SLOW });
    await confirmBtn.click();
    const dialog = healingLocator(L.ncConfirmDialogStrategies(page)).first();
    await expect(dialog, "FAIL: approve confirmation must open").toBeVisible({ timeout: 30000 });
    // Click Confirm until the dialog closes (a click during the open animation is lost — run 6).
    // On an over-budget GL the app then shows the budget pre-flight warning "Complete the following
    // before confirming" → "Proceed Anyway" (run 8/9 on Test Property 1) — accept it.
    const proceed = healingLocator(L.ncProceedAnywayButtonStrategies(page)).first();
    let approvedRes = null;
    approved.then(r => (approvedRes = r)).catch(() => {});
    await expect(async () => {
      if (approvedRes) return;
      if (await proceed.isVisible().catch(() => false)) {
        Logger.info("[TC609] Budget pre-flight warning shown — clicking Proceed Anyway");
        await proceed.click({ timeout: 10000 });
      } else if (await dialog.isVisible().catch(() => false)) {
        await healingLocator(L.ncConfirmModalButtonStrategies(page)).first().click({ timeout: 10000 });
      }
      await page.waitForTimeout(1500);
      expect(approvedRes, "approve request not sent yet").toBeTruthy();
    }, "FAIL: the invoice must be approved (Confirm / Proceed Anyway)").toPass({ timeout: SLOW, intervals: [1000, 2000] });
    expect((await approved).status(), "FAIL: invoice approval must succeed").toBeLessThan(300);
    await page.waitForURL(u => !/\/invoices\/\d+/.test(u.pathname), { timeout: SLOW });
    Logger.success(`[TC609] Invoice #${invoiceId} approved — vendor "${vendor}", ${CapexNonContractVendorPage.M(amount)} on "${gl}"`);
    return { invoiceId, vendor, amount, gl };
  }

  /**
   * Test Property 1 routes invoices through a 3-step chain (requester skipped → 2 approvers).
   * MCP-verified 2026-11-24 (Approvals → All Approvals → search invoice # → View Details):
   * the owner sees "Approve on Behalf"; each click POSTs /api/approvals/<id>/approve and closes the
   * drawer; after the 2nd the invoice is "Approved". Approves every Pending ≤ $10 invoice of `jobId`.
   */
  async approvePendingOnBehalf(jobId) {
    const page = this.page;
    const pending = async () =>
      (await this._rows("invoice")).filter(
        i => Number(i.job_id) === Number(jobId) && /pending approval/i.test(String(i.status)) && Number(i.invoice_amount) <= 10
      );
    const todo = await pending();
    if (!todo.length) return 0;
    Logger.info(`[TC609] Approving on behalf: ${todo.map(i => `#${i.id}`).join(", ")}`);
    await healingLocator(L.ncSidebarLinkStrategies(page, "Approvals")).first().click();
    await page.waitForURL(/\/approvals/, { timeout: SLOW });
    const search = page.getByRole("textbox", { name: "Search..." }).first();
    await waitForReadyRecoveringErrors(page, search, { label: "Approvals list", timeout: SLOW });
    for (const inv of todo) {
      for (let step = 1; step <= 4; step++) {
        const now = (await this._rows("invoice")).find(i => Number(i.id) === Number(inv.id));
        if (/^approved$/i.test(String(now?.status))) break;
        await search.fill(String(inv.id));
        await search.press("Enter");
        const row = page.locator('revogr-data[type="rgRow"] [role="row"]').filter({ hasText: String(inv.id) }).first();
        await expect(row, `FAIL: Approvals must list invoice #${inv.id}`).toBeVisible({ timeout: SLOW });
        const rg = await row.getAttribute("data-rgrow");
        await page.locator(`[role="row"][data-rgrow="${rg}"]`).getByRole("button", { name: "View Details" }).first().click();
        const drawer = page.getByRole("dialog", { name: "Approval Details" });
        const approveBtn = drawer.getByRole("button", { name: "Approve on Behalf" });
        await expect(approveBtn, `FAIL: "Approve on Behalf" must be offered for #${inv.id}`).toBeVisible({ timeout: SLOW });
        const res = page.waitForResponse(
          r => /\/api\/approvals\/\d+\/approve$/.test(r.url().split("?")[0]) && r.request().method() === "POST",
          { timeout: SLOW }
        );
        await approveBtn.click();
        expect((await res).status(), `FAIL: approve on behalf of #${inv.id} must succeed`).toBeLessThan(300);
        await expect(drawer).toBeHidden({ timeout: 30000 }).catch(() => {});
        Logger.info(`[TC609] #${inv.id}: approved on behalf (step ${step})`);
      }
      await expect
        .poll(async () => (await this._rows("invoice")).find(i => Number(i.id) === Number(inv.id))?.status, {
          message: `FAIL: invoice #${inv.id} must end Approved`,
          timeout: 60000,
          intervals: [3000],
        })
        .toBe("Approved");
      Logger.success(`[TC609] Invoice #${inv.id} (${inv.vendor_name}, ${CapexNonContractVendorPage.M(inv.invoice_amount)}) is Approved`);
    }
    return todo.length;
  }

  async getJobInvoices(jobId) {
    const j = await this._getJson("/api/bird-table?table_name=invoice");
    return (j.rows || j.data || []).filter(r => Number(r.job_id) === Number(jobId));
  }

  // ─── Job Summary spend table ──────────────────────────────────────────────

  /** Waits until the spend table shows `expectedRows` rows for GL `gl` (other GLs may exist). */
  async readSpendTable(expectedRows, gl) {
    const page = this.page;
    await healingLocator(L.ncJobTabStrategies(page, "Job Summary")).first().click();
    const grid = healingLocator(L.ncVendorGridStrategies(page)).first();
    await waitForReadyRecoveringErrors(page, grid, { label: "Invoice Spend by Category", timeout: SLOW });
    let rows = [];
    await expect
      .poll(
        async () => {
          rows = await grid.evaluate(async g => (await g.getSource()).map(r => ({ ...r })));
          return rows.filter(r => !gl || r.budget_category === gl).length;
        },
        { message: "FAIL: spend table must list one row per GL × vendor", timeout: 90000, intervals: [3000] }
      )
      .toBe(expectedRows);
    return rows;
  }

  // ─── CapEx ────────────────────────────────────────────────────────────────

  async getCapexGlRow(propertyId, budgetItemId) {
    const j = await this._getJson(
      `/api/bird-table?table_name=capex_tracker&dimension=properties&selection=${propertyId}&fiscal_year=${this.fiscalYear}`
    );
    const rows = Array.isArray(j) ? j : j.rows || j.data || [];
    return rows.find(r => String(r.id).endsWith(`::bim-${budgetItemId}`));
  }

  /**
   * Left panel → CapEx → only this property → expand it → GL drill-down → expand the project row.
   * Returns { detail (API json), gridRows (drill-down grid source), vendorCellText }.
   */
  async openGlDrillDown(capexE2E, { propertyName, gl, projectName, jobName }) {
    const page = this.page;
    const link = healingLocator(L.ncSidebarLinkStrategies(page, "CapEx")).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForURL(/financials\/capex/, { timeout: SLOW });
    } else {
      await capexE2E.open();
    }
    await capexE2E.selectOnlyProperty(propertyName);

    // Expand the (only) property row, then bring the GL row into view (grid is virtualized).
    const mainGrid = page.locator("revo-grid").first();
    const glRow = page.locator('revogr-data[type="rgRow"] [role="row"]').filter({ has: page.getByText(gl, { exact: true }) }).first();
    await expect(async () => {
      if (!(await glRow.isVisible().catch(() => false))) {
        const toggle = page.locator("main button.tree-toggle").first();
        if (await toggle.isVisible().catch(() => false)) await toggle.click();
        await mainGrid
          .evaluate(async (g, label) => {
            const src = await g.getSource();
            const i = src.findIndex(r => r.group_label === label);
            if (i >= 0 && g.scrollToRow) await g.scrollToRow(i);
          }, gl)
          .catch(() => {});
      }
      await expect(glRow).toBeVisible({ timeout: 10000 });
    }, `FAIL: CapEx must show GL "${gl}" under "${propertyName}"`).toPass({ timeout: SLOW, intervals: [2000, 5000] });

    const detailRes = page.waitForResponse(r => r.url().includes("/api/capex-tracker/detail"), { timeout: SLOW });
    await capexE2E.openCategoryDrillDown(gl);
    const res = await detailRes;
    expect(res.status(), "FAIL: CapEx detail API must succeed").toBeLessThan(300);
    const detail = await res.json();

    const grid = healingLocator(L.ncVendorGridStrategies(page)).first();
    await expect(grid, "FAIL: GL drill-down grid must render").toBeVisible({ timeout: SLOW });
    const jobRow = grid.locator('[role="row"]').filter({ has: page.getByText(jobName, { exact: true }) }).first();
    await expect(async () => {
      if (!(await jobRow.isVisible().catch(() => false))) {
        await grid
          .locator('[role="gridcell"]')
          .filter({ has: page.getByText(projectName, { exact: true }) })
          .first()
          .locator("button.tree-toggle")
          .click({ timeout: 10000 });
      }
      await expect(jobRow).toBeVisible({ timeout: 10000 });
    }, `FAIL: drill-down must list job "${jobName}" under project "${projectName}"`).toPass({ timeout: 60000, intervals: [2000] });
    const col = await grid.locator('[role="columnheader"]').filter({ hasText: /^Vendor$/ }).first().getAttribute("data-rgcol");
    const vendorCellText = ((await jobRow.locator(`[role="gridcell"][data-rgcol="${col}"]`).innerText()) || "").trim();
    const gridRows = await grid.evaluate(async g => (await g.getSource()).map(r => ({ ...r })));
    return { detail, gridRows, vendorCellText };
  }

  // ─── Rules ────────────────────────────────────────────────────────────────

  /**
   * Asserts and logs every rule (RULE | FORMULA = expected | ACTUAL | PASS/FAIL). Soft assertions,
   * so the log shows ALL rules of the run; any FAIL still fails TC609 at the end.
   * `invoices` = approved invoices of the job whose lines are all on this GL (live API).
   */
  verifyAll({ invoices, budgetItemId, spendRows, glRow, drill, jobId, jobName, projectName, gl }) {
    const M = CapexNonContractVendorPage.M;
    const C = v => Math.round(Number(v || 0) * 100) / 100;
    const results = [];
    const rule = (name, actual, expected, formula) => {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      const fmt = v => (typeof v === "number" ? M(v) : JSON.stringify(v));
      results.push({ name, pass });
      Logger.info(`[TC609] RULE ${name} | FORMULA ${formula} = ${fmt(expected)} | ACTUAL ${fmt(actual)} | ${pass ? "PASS" : "FAIL"}`);
      expect.soft(actual, `FAIL ${name} | formula: ${formula} = ${fmt(expected)} | actual: ${fmt(actual)}`).toEqual(expected);
    };

    const inv = invoices.map(i => ({
      id: Number(i.id),
      vendor: i.vendor_name,
      amount: C(i.invoice_amount),
      withheld: C(i.retainage_amount),
      released: C(i.retainage_released),
    }));
    const vendors = [...new Set(inv.map(i => i.vendor))].sort();
    const sumOf = (list, k = "amount") => C(list.reduce((a, i) => a + i[k], 0));
    const expr = (list, k = "amount") => list.map(i => M(i[k])).join(" + ") || "0";
    const total = sumOf(inv);
    Logger.info(
      `[TC609] Data: job #${jobId} "${jobName}" (project "${projectName}"), GL "${gl}" (bim ${budgetItemId}) — ${inv.length} approved invoice(s): ${inv
        .map(i => `#${i.id} ${i.vendor} ${M(i.amount)}`)
        .join(" | ")}`
    );

    // 1. Invoice API — data shape
    for (const i of invoices) {
      rule(`Invoice #${i.id} job type`, i.job_type, "non-contract", "invoice belongs to a Non Contract job");
      rule(`Invoice #${i.id} GL`, (i.invoice_detail_budget_items || []).map(Number), [budgetItemId], `all lines on GL "${gl}"`);
      rule(`Invoice #${i.id} has a vendor`, Boolean(i.vendor_name), true, "vendor is required on non-contract invoices");
    }
    rule(`Distinct vendors on GL "${gl}" ≥ 2`, vendors.length >= 2, true, `distinct vendor_name of approved invoices = ${JSON.stringify(vendors)}`);

    // 2. Job Summary "Invoice Spend by Category" (rows of this GL)
    const glSpend = spendRows.filter(r => r.budget_category === gl);
    rule("Spend table vendors on the GL", glSpend.map(r => r.vendor_name).sort(), vendors, `one row per GL "${gl}" × vendor`);
    for (const v of vendors) {
      const mine = inv.filter(i => i.vendor === v);
      const row = glSpend.find(r => r.vendor_name === v);
      rule(`Spend table "${v}" amount`, C(row?.invoice_amount), sumOf(mine), `Σ ${v} invoices = ${expr(mine)}`);
    }
    rule("Spend table GL total", C(glSpend.reduce((a, r) => a + Number(r.invoice_amount || 0), 0)), total, `Σ all invoices = ${expr(inv)}`);

    // 3. CapEx drill-down — the job
    const apiJobs = (drill.detail.tree || []).flatMap(p => (p.children || []).map(j => ({ ...j, project: p.name })));
    const apiJob = apiJobs.find(j => j.id === `job-${jobId}`);
    rule("Drill-down API lists the job", Boolean(apiJob), true, `job-${jobId} under project "${projectName}"`);
    rule("Drill-down API job type", apiJob?.jobType, "non-contract", "job is Non Contract");
    rule("Drill-down API job Invoiced", C(apiJob?.invoicedAmount), total, `Σ invoices on GL = ${expr(inv)}`);
    rule("Drill-down API job Retainage Withheld", C(apiJob?.retainageWithheld), sumOf(inv, "withheld"), `Σ retainage withheld = ${expr(inv, "withheld")}`);
    rule("Drill-down API job Retainage Released", C(apiJob?.retainageReleased), sumOf(inv, "released"), `Σ retainage released = ${expr(inv, "released")}`);
    const gridJob = drill.gridRows.find(r => r.id === `job-${jobId}`);
    rule("Drill-down grid job Invoiced", C(gridJob?.invoicedAmount), total, `Σ invoices on GL = ${expr(inv)}`);
    rule("Drill-down grid job Net Paid", C(gridJob?.netPaid), C(Number(gridJob?.invoicedAmount) - Number(gridJob?.retainageWithheld) + Number(gridJob?.retainageReleased)),
      `Invoiced ${M(gridJob?.invoicedAmount)} − Withheld ${M(gridJob?.retainageWithheld)} + Released ${M(gridJob?.retainageReleased)}`);
    rule("Drill-down grid job Outstanding Retainage", C(gridJob?.outstandingRetainage), C(Number(gridJob?.retainageWithheld) - Number(gridJob?.retainageReleased)),
      `Withheld ${M(gridJob?.retainageWithheld)} − Released ${M(gridJob?.retainageReleased)}`);
    const gridProject = drill.gridRows.find(r => r.id === gridJob?.parentId);
    const siblings = drill.gridRows.filter(r => r.parentId === gridProject?.id);
    rule("Drill-down grid project Invoiced", C(gridProject?.invoicedAmount), C(siblings.reduce((a, j) => a + Number(j.invoicedAmount || 0), 0)),
      `Σ Invoiced of ${siblings.length} job row(s) under "${projectName}" = ${siblings.map(j => M(j.invoicedAmount)).join(" + ")}`);

    // 4. CapEx GL row (may also hold contract jobs of the same GL)
    rule(`CapEx GL "${gl}" Invoiced ≥ job Invoiced`, C(glRow?.invoiced_amount) >= total, true, `GL ${M(glRow?.invoiced_amount)} ≥ non-contract job ${M(total)}`);
    rule(`CapEx GL "${gl}" Net Paid`, C(glRow?.net_paid), C(Number(glRow?.invoiced_amount) - Number(glRow?.retainage_withheld) + Number(glRow?.retainage_released)),
      `Invoiced ${M(glRow?.invoiced_amount)} − Withheld ${M(glRow?.retainage_withheld)} + Released ${M(glRow?.retainage_released)}`);
    rule(`CapEx GL "${gl}" Outstanding Retainage`, C(glRow?.outstanding_retainage), C(Number(glRow?.retainage_withheld) - Number(glRow?.retainage_released)),
      `Withheld ${M(glRow?.retainage_withheld)} − Released ${M(glRow?.retainage_released)}`);

    // 5–6. The bug: every vendor on the GL must be shown for the non-contract job
    for (const v of vendors) {
      rule(`Drill-down API job vendorName includes "${v}"`, String(apiJob?.vendorName || "").includes(v), true,
        `vendorName "${apiJob?.vendorName}" must contain every vendor of ${JSON.stringify(vendors)}`);
      rule(`Drill-down UI Vendor cell (job "${jobName}") includes "${v}"`, drill.vendorCellText.includes(v), true,
        `Vendor cell "${drill.vendorCellText}" must contain every vendor of ${JSON.stringify(vendors)}`);
    }

    const failed = results.filter(r => !r.pass);
    Logger.info(`[TC609] ${results.length} rules checked — ${results.length - failed.length} PASS, ${failed.length} FAIL`);
    if (failed.length) Logger.error(`[TC609] FAILED rules: ${failed.map(f => f.name).join(" ; ")}`);
    return { total: results.length, failed: failed.length };
  }
}

module.exports = { CapexNonContractVendorPage };
