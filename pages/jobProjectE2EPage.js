/**
 * Jobs & Projects E2E page object (tests/TC05_project.spec.js and
 * tests/TC06_jobs.spec.js, E2E blocks).
 *
 * Works only on data the suites create themselves: the property → budget →
 * project → finalized Contract job chain comes from
 * ApprovalE2EPage.createFinalizedContractChain() (unchanged), extra jobs and
 * throwaway projects are created here with ProjectPage's own helpers. No seeded
 * property, project or job is edited; the CM fee project check is read-only.
 *
 * Shared hand-off files (data/*.json) are guarded with ApprovalE2EPage's
 * backupSharedData()/restoreSharedData() by the specs.
 *
 * Live-verified behaviour: see locators/jobProjectE2ELocator.js.
 */
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const {
  jobProjectE2EElementStrategies,
} = require("../locators/jobProjectE2ELocator");
const { ApprovalE2EPage } = require("./approvalE2EPage");
const { ProjectPage } = require("./projectPage");

const BASE_URL = process.env.BASE_URL;

class JobProjectE2EPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.s = jobProjectE2EElementStrategies(page);
    this.approvals = new ApprovalE2EPage(page);
    this.projectPage = new ProjectPage(page);
    this.gridSearch = healingLocator(this.s.gridSearch).first();
  }

  // ─── Generic helpers ───────────────────────────────────────────────────────

  dialog(title) {
    return this.s.dialog(title);
  }

  tab(name) {
    return healingLocator(this.s.tab(name)).first();
  }

  toast(text) {
    return healingLocator(this.s.toast(text)).first();
  }

  async expectToast(text, label) {
    await expect(
      this.toast(text),
      `FAIL: toast "${text}" must appear (${label})`
    ).toBeVisible({ timeout: 30000 });
    Logger.success(`${label}: toast "${text}" shown`);
  }

  async _getJson(url) {
    const res = await this.page.request.get(`${BASE_URL}${url}`);
    expect(res.status(), `FAIL: GET ${url} must succeed`).toBeLessThan(300);
    return res.json();
  }

  async tableRows(table) {
    const j = await this._getJson(`/api/bird-table?table_name=${table}`);
    return Array.isArray(j) ? j : j.data || j.rows || [];
  }

  async searchGrid(term) {
    await expect(this.gridSearch, "FAIL: grid search box").toBeVisible({
      timeout: 30000,
    });
    await this.gridSearch.fill(term);
    await this.gridSearch.press("Enter").catch(() => {});
    await this.page.waitForTimeout(2500);
  }

  // ─── Chain / data creation ─────────────────────────────────────────────────

  /** Suite-owned property → budget → project → finalized Contract job, plus project id. */
  async createChain(suffix) {
    const chain = await this.approvals.createFinalizedContractChain(suffix);
    await this.projectPage.openProjectFromProjectsGrid(chain.projectName);
    await this.page.waitForURL(/\/projects\/\d+/, { timeout: 30000 });
    chain.projectId = this.page.url().match(/\/projects\/(\d+)/)[1];
    Logger.success(`Chain ready: ${JSON.stringify(chain)}`);
    return chain;
  }

  /** Unfinalized Contract job on the suite's project; returns its id. */
  async createContractJob(projectId, title) {
    const pp = this.projectPage;
    await this.page.goto(`${BASE_URL}/projects/${projectId}?tab=jobs`, {
      waitUntil: "load",
    });
    await this.openCreateJobModal();
    const start = new Date();
    const end = new Date(start);
    end.setFullYear(start.getFullYear() + 1);
    await pp.fillJobForm({
      title,
      jobType: "Unit Interior",
      financialType: "Contract",
      vendor: "Sumit_Corp",
      description: "Created by the Jobs & Projects E2E suite",
      estimatedBudget: 1000,
      startDate: pp.formatDate(start),
      endDate: pp.formatDate(end),
      selectBudgetCategory: true,
    });
    await pp.submitJob();
    const id = await this.approvals._resolveCreatedJobId(title);
    Logger.success(`Job "${title}" created (id ${id})`);
    return id;
  }

  /**
   * Run of 2026-11-19 (TC42 setup): a click on "Create Job" right after the
   * project page loaded was ignored (page not hydrated yet) and the existing
   * openCreateJobModal() only waits 5s for the modal. Retry the click.
   */
  async openCreateJobModal() {
    const btn = this.createJobButton();
    await expect(btn, "FAIL: Create Job button").toBeEnabled({
      timeout: 30000,
    });
    const modal = this.page
      .getByRole("dialog")
      .filter({ hasText: "Add job" })
      .last();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await btn.click();
      const open = await modal
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (open) return modal;
      Logger.info(
        `Create Job: modal not open after click ${attempt} — retrying`
      );
    }
    await expect(modal, 'FAIL: "Add job" modal must open').toBeVisible();
    return modal;
  }

  /** Throwaway project (no jobs) on the suite's property; returns its name. */
  async createThrowawayProject(propertyName) {
    return this.approvals._createProjectForProperty(
      this.projectPage,
      propertyName
    );
  }

  // ─── Projects ──────────────────────────────────────────────────────────────

  async openProject(projectId, tab) {
    await this.page.goto(
      `${BASE_URL}/projects/${projectId}${tab ? `?tab=${tab}` : ""}`,
      { waitUntil: "load" }
    );
    await expect(this.tab("Overview"), "FAIL: project tabs").toBeVisible({
      timeout: 30000,
    });
    // The app adds ?propertyId=… once the project loads; wait for that so later
    // clicks are not lost to the URL rewrite.
    await expect(this.page).toHaveURL(/propertyId=\d+/, { timeout: 30000 });
  }

  createJobButton() {
    return healingLocator(this.s.createJobButton).first();
  }

  async openEditProjectDrawer() {
    const edit = healingLocator(this.s.editButton).first();
    await expect(edit, "FAIL: project Edit button").toBeVisible({
      timeout: 30000,
    });
    await edit.click();
    const drawer = this.dialog("Edit Project");
    await expect(drawer, 'FAIL: "Edit Project" drawer must open').toBeVisible({
      timeout: 15000,
    });
    return drawer;
  }

  saveChanges(scope) {
    return healingLocator(this.s.saveChangesButton(scope)).first();
  }

  fiscalYearInput(scope) {
    return healingLocator(this.s.fiscalYearInput(scope)).first();
  }

  budgetCategoryInput(scope) {
    return healingLocator(this.s.budgetCategoryInput(scope)).first();
  }

  jobBudgetCategoryTrigger(scope) {
    return healingLocator(this.s.jobBudgetCategoryTrigger(scope)).first();
  }

  /** Locked = the combobox trigger refuses pointer input (pointer-events:none, not-allowed cursor). */
  async expectJobBudgetCategoryLocked(scope, locked, label) {
    const trigger = this.jobBudgetCategoryTrigger(scope);
    await expect(trigger, `FAIL: ${label} → Budget Category field`).toBeVisible(
      {
        timeout: 15000,
      }
    );
    await expect(
      trigger,
      `FAIL: ${label} → Budget Category ${locked ? "locked" : "editable"}`
    ).toHaveCSS("cursor", locked ? "not-allowed" : "pointer", {
      timeout: 15000,
    });
    if (locked) await expect(trigger).toHaveCSS("pointer-events", "none");
  }

  /**
   * Clicks a project tab until the URL carries it. Run of 2026-11-19 (TC588): a
   * click right after load was lost when the app rewrote the URL to add
   * propertyId, so the first click can be ignored.
   */
  async selectProjectTab(name, param) {
    await expect(async () => {
      await this.tab(name).click();
      // Compare the parsed query parameter instead of a RegExp built from
      // `param` (Semgrep detect-non-literal-regexp).
      await expect
        .poll(() => new URL(this.page.url()).searchParams.get("tab"), {
          timeout: 5000,
        })
        .toBe(param);
    }, `FAIL: clicking "${name}" must put tab=${param} in the URL`).toPass({
      timeout: 30000,
    });
  }

  async setFiscalYear(scope, year) {
    const fy = this.fiscalYearInput(scope);
    await fy.click();
    await fy.press("Control+A");
    await fy.fill(String(year));
    await fy.press("Tab");
    await this.page.waitForTimeout(800);
  }

  /**
   * Opens a list page and waits for its grid search. Run of 2026-11-19 (TC594):
   * beta answered one reload with "Error Loading Data" (a failed
   * organization_membership query) — a transient server error, not the feature
   * under test — so reload up to 3 times before failing.
   */
  async gotoListPage(urlPath) {
    const errorBanner = this.page.getByText("Error Loading Data", {
      exact: true,
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.page.goto(`${BASE_URL}${urlPath}`, { waitUntil: "load" });
      const ready = await Promise.race([
        this.gridSearch
          .waitFor({ state: "visible", timeout: 30000 })
          .then(() => "grid"),
        errorBanner
          .waitFor({ state: "visible", timeout: 30000 })
          .then(() => "error"),
      ]).catch(() => "timeout");
      if (ready === "grid") return;
      Logger.info(
        `${urlPath}: list not ready (${ready}) on attempt ${attempt} — reloading`
      );
    }
    await expect(
      this.gridSearch,
      `FAIL: ${urlPath} list must load`
    ).toBeVisible({
      timeout: 30000,
    });
  }

  async openProjectsTable() {
    await this.gotoListPage("/projects");
    await this.projectPage.setProjectsTableView();
  }

  deleteProjectButtons() {
    return healingLocator(this.s.deleteProjectButton);
  }

  async uploadProjectDocument(filePath) {
    const page = this.page;
    await healingLocator(this.s.uploadFilesButton).first().click();
    const fromDevice = healingLocator(this.s.uploadFromDevice).first();
    await expect(fromDevice, "FAIL: Uploadcare 'From device'").toBeVisible({
      timeout: 30000,
    });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 30000 }),
      fromDevice.click(),
    ]);
    await chooser.setFiles(filePath);
    const done = page.getByRole("button", { name: "Done", exact: true }).last();
    await expect(done, "FAIL: Uploadcare 'Done' after the upload").toBeVisible({
      timeout: 60000,
    });
    await expect(
      page.getByText(/1 file uploaded/i).first(),
      "FAIL: Uploadcare must report the file as uploaded"
    ).toBeVisible({ timeout: 60000 });
    await done.click();
    const tags = this.dialog("Add Tags & Types");
    await expect(tags, 'FAIL: "Add Tags & Types" dialog').toBeVisible({
      timeout: 30000,
    });
    await tags.getByRole("button", { name: "Add Files", exact: true }).click();
    await expect(tags).toBeHidden({ timeout: 30000 });
  }

  deleteFileButtons() {
    return healingLocator(this.s.deleteFileButton);
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  async openJob(jobId, tab = "summary") {
    await this.page.goto(`${BASE_URL}/jobs/${jobId}?tab=${tab}`, {
      waitUntil: "load",
    });
    await expect(this.tab("Job Summary"), "FAIL: job tabs").toBeVisible({
      timeout: 30000,
    });
    await this.page.waitForTimeout(2000); // job lock state loads after the tabs
  }

  editButton() {
    return healingLocator(this.s.editButton).first();
  }

  async openEditJobDrawer() {
    await expect(this.editButton(), "FAIL: job Edit button").toBeEnabled({
      timeout: 30000,
    });
    await this.editButton().click();
    const drawer = this.dialog("Edit Job");
    await expect(drawer, 'FAIL: "Edit Job" drawer must open').toBeVisible({
      timeout: 15000,
    });
    return drawer;
  }

  lockedBanner() {
    return healingLocator(this.s.lockedBanner).first();
  }

  voidCancelButton() {
    return healingLocator(this.s.voidCancelButton).first();
  }

  async openJobsTable(searchTerm) {
    await this.gotoListPage("/jobs");
    await this.searchGrid(searchTerm);
  }

  deleteRowButtons() {
    return healingLocator(this.s.deleteRowButton);
  }

  /**
   * Selects exactly the given job titles in the Jobs table (searched by the
   * suite suffix, so only suite-owned rows are listed).
   */
  async selectJobs(searchTerm, titles) {
    await this.openJobsTable(searchTerm);
    for (const t of titles) {
      await expect(
        this.page.getByText(t, { exact: true }).first(),
        `FAIL: job "${t}" must be listed`
      ).toBeVisible({ timeout: 30000 });
    }
    const boxes = this.page.locator("main input[type=checkbox]");
    await expect(
      boxes,
      "FAIL: header checkbox + one per listed suite job"
    ).toHaveCount(titles.length + 1, { timeout: 15000 });
    for (let i = 1; i <= titles.length; i++) {
      await boxes.nth(i).check({ force: true });
    }
    Logger.info(`Selected jobs: ${titles.join(", ")}`);
  }

  bulkButton(name) {
    return healingLocator(this.s.bulkButton(name)).first();
  }
}

module.exports = { JobProjectE2EPage };
