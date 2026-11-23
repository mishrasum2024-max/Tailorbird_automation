/**
 * Approvals E2E page object (tests/TC10_approval.spec.js, Approvals E2E block).
 *
 * Self-contained approval coverage: the suite builds its OWN property → budget →
 * project → job → finalized contract → Change Order approval template, raises its
 * own change orders and drives them through the approval drawer as owner and as
 * the real approver. Nothing here edits a seeded property, job, template or vendor.
 *
 * Reuses the existing chain helpers unchanged (PropertiesHelper.createPropertyRobust,
 * BudgetJob, ProjectPage locators/helpers, ProjectJob.runTc47NewUiContractFinalize,
 * ApprovalJob template helpers, InvoicePage.createCompleteChangeOrder).
 *
 * Shared hand-off files (data/projectData.json, data/lastCreatedJob.json,
 * data/propertyData.json, downloads/property.json) are read by other specs. This page
 * object never leaves them changed:
 *  - the project is created with ProjectPage's own locators instead of
 *    fillProjectDetails() (which reads propertyData.json and writes projectData.json);
 *  - runTc47NewUiContractFinalize() reads data/lastCreatedJob.json synchronously,
 *    before its first await, so the file holds this suite's job name only for that
 *    synchronous read and is restored immediately afterwards;
 *  - backupSharedData()/restoreSharedData() snapshot and restore all four files
 *    as a final safety net.
 */
const fs = require("fs");
const path = require("path");
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const { forceGridFullWidth } = require("../utils/columnResizeHelper");
const { ensureLeftPanelExpanded } = require("../utils/leftPanelExpander");
const {
  waitForReadyRecoveringErrors,
} = require("../utils/errorLoadingDataRecovery");
const {
  approvalE2EElementStrategies,
} = require("../locators/approvalE2ELocator");
const PropertiesHelper = require("./properties");
const { BudgetJob } = require("./budgetPage");
const { ProjectPage } = require("./projectPage");
const { ProjectJob } = require("./projectJob");
const { ApprovalJob } = require("./approvalPage");
const { InvoicePage } = require("./invoicePage");

const BASE_URL = process.env.BASE_URL;
const AUTOMATION_ROOT = path.join(__dirname, "..");
const SHARED_DATA_FILES = [
  "data/projectData.json",
  "data/lastCreatedJob.json",
  "data/propertyData.json",
  "downloads/property.json",
];
const NOTES_PLACEHOLDER = "Enter any remarks or notes about this approval...";

class ApprovalE2EPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.s = approvalE2EElementStrategies(page);
    this.searchInput = healingLocator(this.s.searchInput);
    this.viewDetailsButtons = healingLocator(this.s.viewDetailsButtons);
    this.detailsDialog = healingLocator(this.s.detailsDialog).first();
    this.notesInput = healingLocator(this.s.notesInput).first();
    this.notesRequiredError = healingLocator(this.s.notesRequiredError).first();
    this.preflightDialog = healingLocator(this.s.preflightDialog).last();
    this.preflightProceedButton = healingLocator(
      this.s.preflightProceedButton
    ).last();
    this.drawSchedulePanel = healingLocator(this.s.drawSchedulePanel).first();
  }

  // ─── Shared hand-off file guard ────────────────────────────────────────────

  static _abs(rel) {
    // `rel` only ever comes from the constant SHARED_DATA_FILES list above (never user input).
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    return path.join(AUTOMATION_ROOT, rel);
  }

  /** Snapshot the shared hand-off files (content or "absent"). */
  static backupSharedData() {
    const snapshot = {};
    for (const rel of SHARED_DATA_FILES) {
      const abs = ApprovalE2EPage._abs(rel);
      snapshot[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    }
    Logger.info(
      `Approvals E2E: backed up shared data files (${SHARED_DATA_FILES.join(", ")})`
    );
    return snapshot;
  }

  /** Put every shared hand-off file back exactly as it was. */
  static restoreSharedData(snapshot) {
    if (!snapshot) return;
    for (const rel of SHARED_DATA_FILES) {
      const abs = ApprovalE2EPage._abs(rel);
      const original = snapshot[rel];
      if (original === null) {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } else if (
        !fs.existsSync(abs) ||
        fs.readFileSync(abs, "utf8") !== original
      ) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, original);
      }
    }
    Logger.info("Approvals E2E: shared data files restored to their originals");
  }

  /** Returns the list of shared files whose content differs from the snapshot. */
  static changedSharedData(snapshot) {
    return SHARED_DATA_FILES.filter(rel => {
      const abs = ApprovalE2EPage._abs(rel);
      const now = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
      return now !== snapshot[rel];
    });
  }

  /**
   * ensureLeftPanelExpanded() with one reload: on 2026-11-18 (TC584 run 2) the
   * sidebar rendered only "Get Help" (nav items still loading) and the helper's
   * 3 attempts timed out. A reload re-fetches the nav before the second try.
   */
  async _ensureLeftPanel() {
    try {
      await ensureLeftPanelExpanded(this.page);
    } catch (e) {
      Logger.info(
        `Left panel not ready (${String(e.message).split("\n")[0]}) — reloading once`
      );
      await this.page.reload({ waitUntil: "load" });
      await ensureLeftPanelExpanded(this.page);
    }
  }

  // ─── Self-contained data chain ─────────────────────────────────────────────

  /**
   * Builds property → budget → project → job (Contract, vendor Sumit_Corp) →
   * finalized contract, all owned by this suite. Returns the created names/ids.
   */
  async createFinalizedContractChain(suffix) {
    const page = this.page;
    const prop = new PropertiesHelper(page);
    const budgetJob = new BudgetJob(page);
    const projectPage = new ProjectPage(page);
    const projectJob = new ProjectJob(page);

    const propertyName = `ApprovalE2E_prop_${suffix}`;
    Logger.info(`Approvals E2E chain 1/5: creating property "${propertyName}"`);
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: "load" });
    await this._ensureLeftPanel();
    await prop.goToProperties();
    await prop.createPropertyRobust(
      propertyName,
      "Domestic Terminal, College Park, GA 30337, USA",
      "College Park",
      "GA",
      "30337",
      "Garden Style"
    );
    Logger.success(
      `Approvals E2E chain 1/5: property "${propertyName}" created`
    );

    Logger.info("Approvals E2E chain 2/5: submitting the budget revision");
    const budgetCsv = path.join(
      AUTOMATION_ROOT,
      "files",
      "budget_data_for_E2EFlow.csv"
    );
    expect(
      fs.existsSync(budgetCsv),
      "FAIL: files/budget_data_for_E2EFlow.csv must exist for the budget step"
    ).toBeTruthy();
    await budgetJob.navigateToBudget();
    await budgetJob.waitForPageLoad();
    const selected = await budgetJob.selectPropertyByName(propertyName);
    expect(
      selected,
      `FAIL: Budget property dropdown must list the new property "${propertyName}"`
    ).toBeTruthy();
    await budgetJob.openRevisionEditor();
    await budgetJob.uploadFileInRevision(budgetCsv);
    await budgetJob.ensureSubmitEnabledAfterUpload();
    await budgetJob.clickSubmitForApproval();
    await expect(page).toHaveURL(/financials\/budget|budget-revision/i, {
      timeout: 30000,
    });
    // Same settle time TC224 documents: the backend indexes budget categories
    // asynchronously and the project/job dropdowns read them right after.
    await page.waitForTimeout(8000);
    Logger.success("Approvals E2E chain 2/5: budget revision submitted");

    Logger.info("Approvals E2E chain 3/5: creating the project");
    const projectName = await this._createProjectForProperty(
      projectPage,
      propertyName
    );
    Logger.success(`Approvals E2E chain 3/5: project "${projectName}" created`);

    Logger.info("Approvals E2E chain 4/5: creating the Contract job");
    await projectPage.openProjectFromProjectsGrid(projectName);
    await projectJob.navigateToJobsTab();
    await projectPage.openCreateJobModal();
    const today = new Date();
    const jobEnd = new Date(today);
    jobEnd.setFullYear(today.getFullYear() + 1);
    const jobName = `ApprovalE2E_job_${suffix}`;
    await projectPage.fillJobForm({
      title: jobName,
      jobType: "Unit Interior",
      financialType: "Contract",
      vendor: "Sumit_Corp",
      description: "Job created by the Approvals E2E suite",
      estimatedBudget: 5000,
      startDate: projectPage.formatDate(today),
      endDate: projectPage.formatDate(jobEnd),
      selectBudgetCategory: true,
    });
    await projectPage.submitJob();
    const jobId = await this._resolveCreatedJobId(jobName);
    Logger.success(
      `Approvals E2E chain 4/5: job "${jobName}" created (id ${jobId})`
    );
    await this._setEstimatedTotalCost(projectPage, 5000);

    Logger.info(
      "Approvals E2E chain 5/5: adding the contract row and finalizing"
    );
    await this._finalizeContractWithRetry(
      projectJob,
      { projectName },
      { jobName, projectName },
      jobId
    );
    await page.goto(`${BASE_URL}/jobs/${jobId}?tab=change-orders`, {
      waitUntil: "load",
    });
    await expect(
      healingLocator(this.s.changeOrdersTab).first(),
      "FAIL: Change Orders tab must be enabled once the contract is finalized"
    ).toBeEnabled({ timeout: 30000 });
    Logger.success(
      `Approvals E2E chain 5/5: contract finalized — Change Orders tab enabled on job ${jobId}`
    );

    return { propertyName, projectName, jobName, jobId };
  }

  /** Project creation with ProjectPage's locators — no shared data file read or written. */
  async _createProjectForProperty(projectPage, propertyName) {
    const page = this.page;
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: "load" });
    await projectPage.navigateToProjects();
    await projectPage.openCreateProjectModal();

    const projectName = projectPage.generateRandomProjectName();
    await projectPage.nameInput.fill(projectName);
    await projectPage.propertyDropdown.waitFor({ state: "visible" });
    await projectPage.propertyDropdown.click();
    await projectPage.propertyDropdown.fill(propertyName);
    const option = page
      .getByRole("option", { name: propertyName, exact: true })
      .or(
        page
          .locator('[data-combobox-option="true"]')
          .filter({ hasText: propertyName })
      )
      .first();
    await expect(
      option,
      `FAIL: Project property dropdown must offer "${propertyName}"`
    ).toBeVisible({ timeout: 30000 });
    await option.click();
    await page.waitForTimeout(2000); // budget categories load for the selected property (fillProjectDetails uses the same settle)
    await projectPage.selectBudgetCategoryIfAvailable();
    await projectPage.descInput.fill("Created by the Approvals E2E suite");
    await projectPage.budgetInput.fill("500000");
    await projectPage.startDateInput.fill(await projectPage.getStartDate());
    await projectPage.endDateInput.fill(await projectPage.getEndDate());
    await expect(projectPage.addProjectBtn).toBeVisible();
    // Runs of 2026-11-19 (TC41/TC42 setup): the project-create request
    // (POST /api/bird-table/rows) took 39.7s on beta, longer than the old waits.
    // Click, confirm the create request was actually sent, then wait for its
    // response; click again only when no request went out (click not taken).
    const addModal = page
      .getByRole("dialog")
      .filter({ hasText: "Add project" })
      .last();
    const isCreate = req =>
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/bird-table/rows";
    let createRequest = null;
    for (let attempt = 1; attempt <= 3 && !createRequest; attempt++) {
      const sent = page
        .waitForRequest(isCreate, { timeout: 15000 })
        .catch(() => null);
      await projectPage.addProjectBtn.click();
      createRequest = await sent;
      if (!createRequest)
        Logger.info(
          `Create Project: no create request after click ${attempt} — clicking again`
        );
    }
    expect(
      createRequest,
      "FAIL: Create Project must send the project-create request"
    ).toBeTruthy();
    const started = Date.now();
    const finished = await Promise.race([
      createRequest.response(),
      new Promise(resolve => setTimeout(() => resolve(null), 150000)),
    ]);
    expect(
      finished?.status(),
      "FAIL: project-create request must succeed"
    ).toBeLessThan(300);
    Logger.info(
      `Create Project: create request answered ${finished.status()} (waited ${Math.round((Date.now() - started) / 1000)}s)`
    );
    await expect(addModal, "FAIL: Add project modal must close").toBeHidden({
      timeout: 30000,
    });
    await expect(page).toHaveURL(/projects/, { timeout: 30000 });
    await page.waitForLoadState("load");
    await projectPage.assertProjectCreated(
      projectName,
      "Created by the Approvals E2E suite"
    );
    return projectName;
  }

  /** Same Contract-overview edit TC224 performs before finalizing. */
  async _setEstimatedTotalCost(projectPage, amount) {
    const page = this.page;
    await projectPage.openContractsTab();
    // MCP-verified 2026-11-18: Job Summary and Contracts each render an "Edit"
    // button, and right after the tab switch the Summary one can still be mounted
    // (first run opened "Edit Job" instead). "Contract ID" only renders on the
    // Contracts panel, so wait for it before clicking Edit.
    await expect(
      healingLocator(this.s.contractsTab).first(),
      "FAIL: Contracts tab must be selected"
    ).toHaveAttribute("aria-selected", "true", { timeout: 30000 });
    await expect(
      page.getByText("Contract ID", { exact: true }).first(),
      "FAIL: Contracts panel (Contract ID) must render before editing the overview"
    ).toBeVisible({ timeout: 30000 });
    const editBtn = page.getByRole("button", { name: /^Edit$/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 30000 });
    await editBtn.click({ force: true });
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: /Edit Contract Overview/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    const input = dialog
      .getByRole("textbox", { name: /Estimated total cost/i })
      .or(dialog.getByLabel(/Estimated total cost/i))
      .first();
    // MCP-verified 2026-11-23 (job 6944, 1920x1080, per-frame rects): the Edit Contract Overview
    // drawer slides in from the right — the input mounts at left=1936px (past the 1920px edge)
    // and settles at left=1316px ~350ms later. click({ force: true }) skips the stability check,
    // so on a slow runner it fired mid-slide: "Element is outside of the viewport" (TC595, TC601).
    // Wait until the input is fully inside the viewport and has stopped moving.
    await expect(input, "FAIL: Estimated total cost input").toBeVisible({
      timeout: 15000,
    });
    await expect(async () => {
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const first = await input.boundingBox();
      await page.waitForTimeout(100);
      const second = await input.boundingBox();
      expect(
        Boolean(
          first &&
            second &&
            second.x >= 0 &&
            second.x + second.width <= viewportWidth &&
            Math.abs(first.x - second.x) < 1
        ),
        `FAIL: Estimated total cost input still sliding/off-screen (x=${second?.x}, viewport=${viewportWidth})`
      ).toBe(true);
    }).toPass({ timeout: 15000, intervals: [100, 200, 300] });
    await input.click({ force: true });
    await input.press("Control+A");
    await input.press("Backspace");
    await input.fill(String(amount));
    await input.press("Tab");
    const save = dialog
      .getByRole("button", { name: /Save Changes|Save/i })
      .first();
    await expect(save).toBeEnabled({ timeout: 10000 });
    await save.click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
    Logger.success(`Contract overview: Estimated Total Cost set to ${amount}`);
  }

  /**
   * runTc47NewUiContractFinalize() takes the job name from data/lastCreatedJob.json
   * with a synchronous read that runs before its first await. Write this suite's job
   * there, start the method (the read happens synchronously inside the call), restore
   * the original file at once, then await the finalize.
   */
  async _finalizeContractWithoutTouchingSharedData(
    projectJob,
    projectData,
    jobInfo
  ) {
    const rel = "data/lastCreatedJob.json";
    const abs = ApprovalE2EPage._abs(rel);
    const original = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(
      abs,
      JSON.stringify({ ...jobInfo, createdVia: "TC10_approval E2E" }, null, 2)
    );
    let finalizePromise;
    try {
      finalizePromise = projectJob.runTc47NewUiContractFinalize(projectData);
    } finally {
      if (original === null) fs.unlinkSync(abs);
      else fs.writeFileSync(abs, original);
    }
    Logger.info(
      "Finalize: data/lastCreatedJob.json restored right after the finalize helper read it"
    );
    await finalizePromise;
  }

  /**
   * After "Create Job" the app usually navigates to /jobs/<id>, but the full run
   * on 2026-11-18 stayed on the project's Jobs list although the job was created
   * (TC224 tolerates the same with .catch). Fall back to the job table API
   * (GET /api/bird-table?table_name=job, MCP-verified) by the unique job title,
   * then open the job page so the next steps start from it.
   */
  async _resolveCreatedJobId(jobName) {
    const page = this.page;
    const navigated = await page
      .waitForURL(/\/jobs\/\d+/, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (navigated) return page.url().match(/\/jobs\/(\d+)/)[1];

    Logger.info(
      `Job "${jobName}": app did not open the job page — resolving its id from the job table API`
    );
    let jobId = null;
    await expect
      .poll(
        async () => {
          const j = await this._getJson("/api/bird-table?table_name=job");
          const rows = Array.isArray(j) ? j : j.data || j.rows || [];
          const hit = rows.find(r => r.title === jobName);
          jobId = hit ? String(hit.id) : null;
          return jobId;
        },
        {
          message: `FAIL: created job "${jobName}" must be returned by the job table API`,
          timeout: 60000,
          intervals: [3000],
        }
      )
      .not.toBeNull();
    await page.goto(`${BASE_URL}/jobs/${jobId}?tab=summary`, {
      waitUntil: "load",
    });
    await expect(page.getByText(jobName).first()).toBeVisible({
      timeout: 30000,
    });
    return jobId;
  }

  /** True when the job's contract is finalized (Change Orders tab enabled). */
  async _isContractFinalized(jobId) {
    await this.page.goto(`${BASE_URL}/jobs/${jobId}?tab=contracts`, {
      waitUntil: "load",
    });
    const tab = healingLocator(this.s.changeOrdersTab).first();
    await tab.waitFor({ state: "visible", timeout: 30000 });
    // MCP-verified: unfinalized → <button role=tab disabled data-disabled="true">.
    // Allow the job data to load before concluding it is still disabled.
    return expect(tab)
      .toBeEnabled({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * The existing finalize helper types the contract row cell by cell into
   * RevoGrid. Run 4 (2026-11-18) showed the Scope and Cost Item edits occasionally
   * not committing (screenshot: row with only SOV 15000 + Budget Category), which
   * fails the helper's own "Scope cell visible" check. The helper deletes
   * incomplete (blank-Scope) rows before finalizing, so a further attempt on the
   * same job is safe; each attempt first checks whether the contract already got
   * finalized so a successful finalize is never repeated.
   */
  async _finalizeContractWithRetry(projectJob, projectData, jobInfo, jobId) {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (await this._isContractFinalized(jobId)) {
        Logger.info(`Finalize: job ${jobId} is already finalized`);
        return;
      }
      Logger.info(`Finalize: attempt ${attempt}/${attempts} on job ${jobId}`);
      try {
        await this._finalizeContractWithoutTouchingSharedData(
          projectJob,
          projectData,
          jobInfo
        );
        return;
      } catch (e) {
        Logger.info(
          `Finalize: attempt ${attempt} failed (${String(e.message).split("\n")[0]})`
        );
        if (attempt === attempts) throw e;
      }
    }
  }

  // ─── Change Order approval template ────────────────────────────────────────

  /**
   * Creates a Change Order template on this suite's property with the given
   * approver rows (each "Always Required").
   */
  async createChangeOrderTemplate(templateName, propertyName, approvers) {
    const page = this.page;
    const approvalJob = new ApprovalJob(page);
    Logger.info(
      `Template: creating Change Order template "${templateName}" on "${propertyName}" with approvers [${approvers.join(", ")}]`
    );
    await page.goto(process.env.DASHBOARD_URL, {
      waitUntil: "domcontentloaded",
    });
    await this._ensureLeftPanel();
    await approvalJob.navigateToApprovalTab();
    await approvalJob.navigateToApprovalTemplatesTab();
    await approvalJob.waitForPageLoad();
    await approvalJob.openCreateTemplateDialog();
    await approvalJob.fillTemplateName(templateName);
    await approvalJob.selectTemplateType("Change Order");
    await approvalJob.addProperty(propertyName);

    // Approver rows (MCP-verified 2026-11-18): the dialog opens with 3 rule rows
    // (tbody tr), each with a MultiSelect "Select approvers". A pick shows as a
    // pill and stores "user:<id>" in the row's hidden input — the text box itself
    // stays empty, so the row (not the input value) is asserted. Unused rows are
    // removed with their trash button so the template has exactly these steps.
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByPlaceholder("Enter template name") });
    const ruleRows = dialog.locator("tbody tr");
    await expect(
      ruleRows.first(),
      "FAIL: template dialog must show approval rule rows"
    ).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < approvers.length; i++) {
      const row = ruleRows.nth(i);
      const input = row
        .getByPlaceholder("Select approvers")
        .or(row.locator('input[aria-haspopup="listbox"]'))
        .first();
      await input.waitFor({ state: "visible", timeout: 15000 });
      await input.click();
      await input.fill(approvers[i]);
      const option = page
        // A string name already matches case-insensitively as a substring (same
        // as the former RegExp(name, "i")) without a non-literal RegExp (Semgrep).
        .getByRole("option", { name: approvers[i] })
        .first();
      await expect(
        option,
        `FAIL: approver dropdown must offer "${approvers[i]}"`
      ).toBeVisible({ timeout: 15000 });
      await option.click();
      await page.keyboard.press("Escape"); // close the MultiSelect dropdown
      await expect(
        row,
        `FAIL: approver row ${i + 1} must show "${approvers[i]}"`
      ).toContainText(approvers[i], { timeout: 10000 });
      const userValue = await row
        .locator('input[type="hidden"]')
        .first()
        .inputValue();
      expect(
        userValue,
        `FAIL: approver row ${i + 1} must store a user id`
      ).toMatch(/^user:\d+/);
      Logger.success(
        `Template: approver row ${i + 1} = "${approvers[i]}" (${userValue})`
      );
    }
    while ((await ruleRows.count()) > approvers.length) {
      const before = await ruleRows.count();
      await ruleRows
        .last()
        .getByRole("button")
        .filter({ has: page.locator("svg.lucide-trash-2") })
        .click();
      await expect(ruleRows).toHaveCount(before - 1, { timeout: 10000 });
    }
    Logger.success(
      `Template: exactly ${approvers.length} approval rule rows remain`
    );
    await approvalJob.fillAmount(5000);
    await approvalJob.checkAlwaysRequiredInTemplateDialog(approvers.length);

    const [response] = await Promise.all([
      // app/approvals/template/page.tsx → birdTableApi.createRow("approval_template")
      // = POST /api/bird-table/rows with table "approval_template" in the body.
      page.waitForResponse(
        r =>
          r.url().includes("/api/bird-table/rows") &&
          r.request().method() === "POST" &&
          (r.request().postData() || "").includes("approval_template"),
        { timeout: 60000 }
      ),
      approvalJob.submitCreateTemplate(),
    ]);
    expect(
      response.status(),
      `FAIL: creating template "${templateName}" must succeed (POST ${response.url()})`
    ).toBeLessThan(300);
    await approvalJob.searchTemplate(templateName);
    // Added 2026-11-23 (insert-only): 2-worker run TC576 setup — the template POST succeeded but
    // Approval Templates then showed "Error Loading Data — HTTP error! status: 400" (screenshot),
    // so the row never rendered in 30s. MCP-verified: the banner's Retry reloads the list. Wait up
    // to 80s for the row, recovering and re-applying the search after each Retry.
    await waitForReadyRecoveringErrors(
      page,
      page.getByRole("row").filter({ hasText: templateName }).first(),
      {
        label: `Approval Templates row "${templateName}"`,
        afterRecover: () => approvalJob.searchTemplate(templateName),
      }
    );
    await expect(
      page.getByRole("row").filter({ hasText: templateName }).first(),
      `FAIL: template "${templateName}" must appear in Approval Templates`
    ).toBeVisible({ timeout: 30000 });
    await approvalJob.clearSearch();
    Logger.success(`Template: "${templateName}" created and listed`);
  }

  /** Best-effort template cleanup (never fails the suite). */
  async deleteTemplateQuietly(templateName) {
    try {
      const approvalJob = new ApprovalJob(this.page);
      await this.page.goto(process.env.DASHBOARD_URL, {
        waitUntil: "domcontentloaded",
      });
      await approvalJob.navigateToApprovalTab();
      await approvalJob.navigateToApprovalTemplatesTab();
      await approvalJob.waitForPageLoad();
      await approvalJob.searchTemplate(templateName);
      await approvalJob.deleteTemplate(templateName);
      Logger.success(`Cleanup: template "${templateName}" deleted`);
    } catch (e) {
      Logger.info(
        `Cleanup: could not delete template "${templateName}" (${e.message}) — it only covers this suite's own property`
      );
    }
  }

  // ─── Change orders on this suite's job ─────────────────────────────────────

  /** Creates and submits a change order on the job; returns its number. */
  async createChangeOrder(jobId, { title, amount }) {
    const page = this.page;
    await page.goto(`${BASE_URL}/jobs/${jobId}?tab=change-orders`, {
      waitUntil: "load",
    });
    await expect(healingLocator(this.s.changeOrdersTab).first()).toBeVisible({
      timeout: 30000,
    });
    const invoicePage = new InvoicePage(page);
    const result = await invoicePage.createCompleteChangeOrder({
      title,
      description: "Raised by the Approvals E2E suite",
      amount,
    });
    const number = String(result.number || "").match(/\d+/)?.[0];
    expect(number, "FAIL: change order number must be assigned").toBeTruthy();
    expect(
      result.confirmed,
      `FAIL: change order #${number} must be confirmed/submitted (Review Changes → Confirm Changes)`
    ).toBeTruthy();
    Logger.success(
      `Change order #${number} ("${title}", $${amount}) submitted on job ${jobId}`
    );
    return number;
  }

  /** Status of a change order in the job's Change Orders grid. */
  async getChangeOrderStatusInJob(jobId, number) {
    const page = this.page;
    await page.goto(`${BASE_URL}/jobs/${jobId}?tab=change-orders`, {
      waitUntil: "load",
    });
    const row = page
      .getByRole("row")
      .filter({ hasText: `Change Order #${number}` })
      .first();
    await expect(
      row,
      `FAIL: change order #${number} must be listed on job ${jobId}`
    ).toBeVisible({ timeout: 30000 });
    const text = (await row.innerText()).replace(/\s+/g, " ");
    const status =
      text.match(/\b(Approved|Rejected|Pending Approval|Draft)\b/)?.[1] || "";
    Logger.info(`Job ${jobId}: change order #${number} row → "${text}"`);
    return status;
  }

  /**
   * Reads the Contracts grid Total row of the job: { changeOrder, original, revised }.
   * MCP-verified 2026-11-18: the Total row lives in the grid's pinned-bottom
   * section (revogr-data[type="rowPinEnd"]); column names depend on the job type —
   * Unit Interior: "Original Contract Amount" / "Approved Change Orders" /
   * "Current Contract Amount"; CapEx: "Original Contract amount" / "Change order" /
   * "Revised Contract amount". Columns are resolved by header data-rgcol after
   * forcing full width (RevoGrid drops off-screen columns from the DOM).
   */
  async getContractTotals(jobId) {
    const page = this.page;
    await page.goto(`${BASE_URL}/jobs/${jobId}?tab=contracts`, {
      waitUntil: "load",
    });
    await expect(
      page.getByText("Contract ID", { exact: true }).first()
    ).toBeVisible({ timeout: 30000 });
    const grid = page.locator('[role="treegrid"], [role="grid"]').first();
    await grid.waitFor({ state: "visible", timeout: 30000 });
    await forceGridFullWidth(page);
    const totalRow = grid
      .locator('revogr-data[type="rowPinEnd"] [role="row"]')
      .first();
    await expect(
      totalRow,
      `FAIL: job ${jobId} contract grid must have a Total row`
    ).toContainText("Total", { timeout: 30000 });
    const readTotal = async headers => {
      for (const header of headers) {
        const h = grid
          .getByRole("columnheader", { name: header, exact: true })
          .first();
        if (await h.isVisible().catch(() => false)) {
          const col = await h.getAttribute("data-rgcol");
          const cell = totalRow
            .locator(`[role="gridcell"][data-rgcol="${col}"]`)
            .first();
          return (await cell.innerText()).trim();
        }
      }
      throw new Error(
        `FAIL: none of the columns [${headers.join(", ")}] is in job ${jobId}'s contract grid`
      );
    };
    const money = t => Number(String(t).replace(/[^0-9.-]/g, "")) || 0;
    const totals = {
      original: money(
        await readTotal([
          "Original Contract Amount",
          "Original Contract amount",
        ])
      ),
      changeOrder: money(
        await readTotal(["Approved Change Orders", "Change order"])
      ),
      revised: money(
        await readTotal(["Current Contract Amount", "Revised Contract amount"])
      ),
    };
    Logger.info(
      `Job ${jobId} contract totals → Original ${totals.original}, Change order ${totals.changeOrder}, Revised ${totals.revised}`
    );
    return totals;
  }

  // ─── Approval data (API = source of truth) ─────────────────────────────────

  async _getJson(url) {
    const res = await this.page.request.get(`${BASE_URL}${url}`);
    expect(res.status(), `FAIL: GET ${url} must succeed`).toBeLessThan(300);
    return res.json();
  }

  async getApprovalRows() {
    const j = await this._getJson(
      "/api/bird-table?table_name=approval&one_row_per_approval=true"
    );
    return Array.isArray(j) ? j : j.data || j.rows || [];
  }

  /** Waits until the approval row for a given item number/type exists. */
  async waitForApprovalRow(number, templateType, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await this.getApprovalRows();
      const row = rows.find(
        r =>
          String(r.approval_number) === String(number) &&
          r.template_type === templateType
      );
      if (row) {
        Logger.info(
          `Approval row found: ${templateType} #${number} → approval ${row.approval_id}, status "${row.current_status}", amount ${row.dollar_amount}`
        );
        return row;
      }
      await this.page.waitForTimeout(3000);
    }
    throw new Error(
      `FAIL: no ${templateType} approval row for #${number} within ${timeoutMs}ms`
    );
  }

  async getApprovalDetails(approvalId) {
    return this._getJson(`/api/approvals/${approvalId}/details`);
  }

  async getApprovalStatus(approvalId) {
    const row = (await this.getApprovalRows()).find(
      r => String(r.approval_id) === String(approvalId)
    );
    return row ? row.current_status : null;
  }

  async getFeatureFlags() {
    const j = await this._getJson("/api/auth/feature-flags");
    return Array.isArray(j.featureFlags)
      ? j.featureFlags
      : Object.keys(j.featureFlags || {}).filter(k => j.featureFlags[k]);
  }

  // ─── Approvals page UI ─────────────────────────────────────────────────────

  async gotoApprovalsTab(tabName) {
    const page = this.page;
    const url =
      tabName === "My Approvals"
        ? `${BASE_URL}/approvals/my-approvals`
        : `${BASE_URL}/approvals/all-approvals`;
    await page.goto(url, { waitUntil: "load" });
    const tab = healingLocator(this.s.approvalsTab(tabName)).first();
    await expect(tab, `FAIL: "${tabName}" tab must be visible`).toBeVisible({
      timeout: 30000,
    });
    await expect(
      tab,
      `FAIL: "${tabName}" tab must be selected`
    ).toHaveAttribute("aria-selected", "true", { timeout: 15000 });
    Logger.success(`Approvals: "${tabName}" tab open and selected`);
  }

  /**
   * Searches the approvals grid and opens View Details on the row whose text
   * contains every given fragment (row ↔ Actions pane matched by data-rgrow).
   */
  async openApprovalDetails(searchTerm, rowFragments) {
    const page = this.page;
    await expect(this.searchInput.first()).toBeVisible({ timeout: 30000 });
    const [listResponse] = await Promise.all([
      page
        .waitForResponse(
          r => /\/api\/bird-table\?table_name=approval/.test(r.url()),
          { timeout: 30000 }
        )
        .catch(() => null),
      (async () => {
        await this.searchInput.first().fill(String(searchTerm));
        await this.searchInput.first().press("Enter");
      })(),
    ]);
    if (listResponse)
      Logger.info(
        `Approvals search "${searchTerm}" → HTTP ${listResponse.status()}`
      );

    const dataRows = page.locator('revogr-data[type="rgRow"] [role="row"]');
    const deadline = Date.now() + 45000;
    let rgrow = null;
    let rowText = "";
    while (Date.now() < deadline && rgrow === null) {
      const rows = await dataRows.evaluateAll(els =>
        els.map(e => ({
          rgrow: e.getAttribute("data-rgrow"),
          text: (e.innerText || "").replace(/\s+/g, " "),
        }))
      );
      const hit = rows.find(
        r => r.text && rowFragments.every(f => r.text.includes(String(f)))
      );
      if (hit) {
        rgrow = hit.rgrow;
        rowText = hit.text;
      } else {
        await page.waitForTimeout(1500);
      }
    }
    expect(
      rgrow,
      `FAIL: approvals grid must show a row containing [${rowFragments.join(", ")}] after searching "${searchTerm}"`
    ).not.toBeNull();
    Logger.info(`Approvals row (data-rgrow=${rgrow}): ${rowText}`);

    const actionButton = page
      .locator(`[role="row"][data-rgrow="${rgrow}"]`)
      .getByRole("button", { name: "View Details" })
      .first();
    await expect(actionButton).toBeVisible({ timeout: 15000 });
    // MCP-verified 2026-11-23 (All Approvals, Change Order #11574): the drawer opens as an empty
    // "Approval Details" shell and fills from GET /api/approvals/<id>/details (~1s). When that call
    // fails the drawer keeps only its title + the error text and never retries ("Approval Type:"
    // never renders — the TC576 CI failure); closing it and clicking View Details again refetches.
    const isDetailsCall = r =>
      r.request().method() === "GET" &&
      /\/api\/approvals\/\d+\/details/.test(new URL(r.url()).pathname);
    let detailsResponse = page
      .waitForResponse(isDetailsCall, { timeout: 30000 })
      .catch(() => null);
    await actionButton.click();
    await expect(
      this.detailsDialog,
      "FAIL: Approval Details drawer must open"
    ).toBeVisible({ timeout: 30000 });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await detailsResponse;
      const fieldsShown = await this.detailsDialog
        .getByText("Approval Type:")
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (fieldsShown) break;
      Logger.info(
        `Approval Details: fields not rendered (details API ${res ? `HTTP ${res.status()}` : "no response"}) — attempt ${attempt}/3, reopening`
      );
      if (attempt === 3) break;
      await page.keyboard.press("Escape");
      await expect(this.detailsDialog).toBeHidden({ timeout: 15000 });
      detailsResponse = page
        .waitForResponse(isDetailsCall, { timeout: 30000 })
        .catch(() => null);
      await actionButton.click();
      await expect(this.detailsDialog).toBeVisible({ timeout: 30000 });
    }
    await expect(
      this.detailsDialog.getByText("Approval Type:"),
      "FAIL: Approval Details must render its fields"
    ).toBeVisible({ timeout: 30000 });
    Logger.success("Approval Details drawer opened");
    return rowText;
  }

  /** Label → value pairs rendered in the drawer header ("Property:", "Job:" …). */
  async readDrawerFields() {
    const text = await this.detailsDialog.innerText();
    const fields = {};
    const lines = text
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      const m = lines[i].match(/^([A-Za-z ]+):$/);
      if (m) fields[m[1].trim()] = lines[i + 1];
    }
    Logger.info(`Approval Details fields: ${JSON.stringify(fields)}`);
    return { fields, text };
  }

  async closeDrawer() {
    await this.page.keyboard.press("Escape");
    await expect(this.detailsDialog).toBeHidden({ timeout: 15000 });
  }

  drawerButton(name) {
    return healingLocator(this.s.drawerButton(name)).first();
  }

  /** Clicks a reject button with EMPTY notes; returns what happened. */
  async rejectWithoutNotes(buttonName) {
    const page = this.page;
    const sent = [];
    const listener = r => {
      if (/\/api\/approvals\/\d+\/(reject|approve)/.test(r.url()))
        sent.push(`${r.method()} ${r.url()}`);
    };
    page.on("request", listener);
    try {
      await this.notesInput.fill("");
      await this.drawerButton(buttonName).click();
      await expect(
        this.notesRequiredError,
        `FAIL: "${buttonName}" with empty notes must show "Notes are required for rejection"`
      ).toBeVisible({ timeout: 10000 });
      // No-request check: give a request that would have been sent time to appear.
      await page.waitForTimeout(1500);
    } finally {
      page.off("request", listener);
    }
    const ariaInvalid = await this.notesInput.getAttribute("aria-invalid");
    Logger.info(
      `Empty-notes "${buttonName}": error visible, aria-invalid=${ariaInvalid}, requests sent=${sent.length}`
    );
    return { requestsSent: sent, ariaInvalid };
  }

  /** Enter a note and approve/reject; handles the preflight modal. */
  async actOnApproval(buttonName, note) {
    const page = this.page;
    const action = /reject/i.test(buttonName) ? "reject" : "approve";
    await this.notesInput.fill(note);
    await expect(this.notesInput).toHaveValue(note);
    const responsePromise = page.waitForResponse(
      r =>
        new RegExp(`/api/approvals/\\d+/${action}$`).test(
          r.url().split("?")[0]
        ) && r.request().method() === "POST",
      { timeout: 90000 }
    );
    await this.drawerButton(buttonName).click();
    Logger.info(`Clicked "${buttonName}" with note "${note}"`);

    let preflightText = null;
    const settled = await Promise.race([
      responsePromise.then(() => "response"),
      this.preflightDialog
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => "preflight")
        .catch(() => "none"),
    ]);
    if (settled === "preflight") {
      preflightText = (await this.preflightDialog.innerText()).replace(
        /\s+/g,
        " "
      );
      Logger.info(`Preflight modal shown: ${preflightText}`);
      await expect(this.preflightProceedButton).toBeEnabled({ timeout: 10000 });
      await this.preflightProceedButton.click();
      Logger.info("Preflight modal: clicked Proceed");
    }
    const response = await responsePromise;
    expect(
      response.status(),
      `FAIL: POST ${action} must succeed (got ${response.status()})`
    ).toBeLessThan(300);
    // The response body is deliberately not read: in run 3 reading the reject
    // response body hung for 554s (trace "Get response body") although the request
    // had already returned 200. Status + the API state checks are the assertions.
    Logger.success(
      `"${buttonName}" → POST ${response.url().replace(BASE_URL, "")} = ${response.status()}`
    );
    return { status: response.status(), preflightText };
  }

  /** Waits for a Mantine notification containing `title`; returns its text. */
  async expectNotification(title, messagePattern) {
    const toast = healingLocator(this.s.notification(title)).first();
    await expect(
      toast,
      `FAIL: "${title}" notification must appear`
    ).toBeVisible({
      timeout: 20000,
    });
    const text = (await toast.innerText()).replace(/\s+/g, " ").trim();
    if (messagePattern)
      expect(
        text,
        `FAIL: "${title}" notification text must match ${messagePattern}`
      ).toMatch(messagePattern);
    Logger.success(`Notification: "${text}"`);
    return text;
  }

  get notesPlaceholder() {
    return NOTES_PLACEHOLDER;
  }
}

module.exports = { ApprovalE2EPage };
