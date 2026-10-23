const fs = require('fs');
const zlib = require('zlib');
const { expect } = require('@playwright/test');
const { Logger } = require('../utils/logger');
const { healingLocator } = require('../utils/locatorHealer');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');
const { downloadAndExtractPdfText } = require('../utils/pdfTextExtractor');
const reportData = require('../fixture/reportPage.json');
const L = require('../locators/reportPageLocator');

// Report generation runs through the Piper agent (POST <agents-host>/chat/report, streamed) —
// MCP-measured 25–40s per report on beta (2026-10-23); ceiling leaves room for a slow agent.
const GENERATION_TIMEOUT = 180000;
const UI_TIMEOUT = 60000;
// A Reports page that is not ready within 60s is reloaded once instead of waited on longer
// (beta was seen taking 30–90s to answer the list APIs under load — run of 2026-10-23).
const RELOAD_AFTER = 60000;
const PAGE_LOAD_TIMEOUT = RELOAD_AFTER;

/** Rejects with `message` when `promise` has not settled within `ms` (never leaves a wait unbounded). */
function within(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Page object for the Reports module (/reports, /reports/new, /reports/:id).
 * All API paths and UI behaviours below were MCP-verified on beta.tailorbird.com, 2026-10-23:
 * - Landing data: GET /api/reports/versions?limit=200 (+ &q=<term> on search Enter,
 *   + &module=<key> when a module drawer opens), GET /api/report-templates.
 * - Report data: GET /api/reports/:id?versions=1 → { report, versions[] } (createdByName, status).
 * - Delete: DELETE /api/reports/:id → 200 after the "Delete report?" confirmation.
 * - Save as Template: POST /api/reports/:id/save-template → { success, templateId, name }.
 * - Export: POST /api/reports/:id/export { format: 'pdf' | 'xlsx', versionId } → { signedUrl, ... }
 *   followed by a browser download of the file.
 */
class ReportPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.data = reportData;
    this.baseUrl = process.env.BASE_URL;
    // Every report this page object generates, recorded the moment its id is known, so the
    // spec's afterEach can delete it even when the test fails mid-setup.
    this.createdReportIds = [];
    const b = reportData.buttons;

    this.reportsNavItem = healingLocator(L.reportsNavItemStrategies(page, reportData.leftPanelLabel)).first();
    this.breadcrumbHome = healingLocator(L.breadcrumbHomeStrategies(page));
    this.pageHeading = healingLocator(L.headingStrategies(page, reportData.header.title));
    this.pageSubtitle = healingLocator(L.textStrategies(page, reportData.header.subtitle));
    this.useTemplateButton = healingLocator(L.buttonStrategies(page.getByRole('main'), b.useTemplate));
    this.generateReportButton = healingLocator(L.buttonStrategies(page.getByRole('main'), b.generateReport));
    this.searchInput = healingLocator(L.searchInputStrategies(page, reportData.searchPlaceholder));
    this.continueLabel = healingLocator(L.textStrategies(page, reportData.sections.continue));
    this.exploreByModuleLabel = healingLocator(L.textStrategies(page, reportData.sections.exploreByModule));
    this.recentReportsLabel = healingLocator(L.textStrategies(page, reportData.sections.recentReports));
    this.draftReportsTile = healingLocator(L.continueTileStrategies(page, reportData.continueTiles.draftReports));
    this.generatingTile = healingLocator(L.continueTileStrategies(page, reportData.continueTiles.generating));
    this.moduleTiles = healingLocator(L.moduleTilesStrategies(page));
    this.recentReportCards = healingLocator(L.reportCardsStrategies(page, page.getByRole('main')));
    this.recentReportsEmptyText = healingLocator(L.textStrategies(page, reportData.recentReportsEmptyText));
    this.templateModal = healingLocator(L.dialogStrategies(page, reportData.templateModalTitle));
    this.draftDrawer = healingLocator(L.dialogStrategies(page, reportData.draftDrawerTitle));
    this.deleteDialog = healingLocator(L.dialogStrategies(page, reportData.deleteDialogTitle));
    this.chatInput = healingLocator(L.chatInputStrategies(page, reportData.chat.inputName));
    this.generatedByText = healingLocator(L.generatedByStrategies(page, reportData.generatedByPrefix));
    this.renameReportButton = healingLocator(L.buttonStrategies(page.getByRole('main'), b.renameReport));
    this.regenerateButton = healingLocator(L.buttonStrategies(page.getByRole('main'), b.regenerate));
    this.saveAsTemplateButton = healingLocator(L.buttonStrategies(page.getByRole('main'), b.saveAsTemplate));
    this.exportButton = healingLocator(L.buttonStrategies(page.getByRole('main'), b.export));
    this.reportVersionInput = healingLocator(L.reportVersionStrategies(page));
    this.exportPdfMenuItem = healingLocator(L.exportMenuItemStrategies(page, reportData.exportOptions.pdf));
    this.exportExcelMenuItem = healingLocator(L.exportMenuItemStrategies(page, reportData.exportOptions.excel));
    this.reportIframe = healingLocator(L.reportIframeStrategies(page)).first();
  }

  // ---------- Locator helpers (scoped) ----------

  moduleTile(label) {
    return healingLocator(L.moduleTileStrategies(this.page, label));
  }

  moduleDrawer(label) {
    return healingLocator(L.dialogStrategies(this.page, `${label}${this.data.moduleDrawerTitleSuffix}`));
  }

  reportCards(scope) {
    return healingLocator(L.reportCardsStrategies(this.page, scope));
  }

  reportCardById(scope, reportId) {
    return healingLocator(L.reportCardByIdStrategies(this.page, scope, reportId));
  }

  viewLink(scope) {
    return healingLocator(L.viewReportLinkStrategies(scope));
  }

  deleteButton(scope) {
    return healingLocator(L.deleteReportButtonStrategies(scope));
  }

  tag(scope, tagText) {
    return healingLocator(L.tagStrategies(scope, tagText));
  }

  anyStatusTag(scope) {
    return this.tag(scope, this.data.tags.ready).or(this.tag(scope, this.data.tags.draft));
  }

  reportFrame() {
    return this.reportIframe.contentFrame();
  }

  // ---------- Navigation ----------

  async gotoDashboard() {
    Logger.step('Navigating to the dashboard');
    await this.page.goto(process.env.DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await ensureLeftPanelExpanded(this.page);
  }

  async openReportsFromLeftPanel() {
    Logger.step('Clicking "Reports" in the left panel');
    await expect(this.reportsNavItem, 'FAIL: "Reports" option is not visible in the left panel').toBeVisible({ timeout: UI_TIMEOUT });
    const [versionsResponse, countsResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/api/reports/versions') && r.request().method() === 'GET', { timeout: PAGE_LOAD_TIMEOUT }),
      this.page.waitForResponse((r) => r.url().includes('/api/reports?counts=') && r.request().method() === 'GET', { timeout: PAGE_LOAD_TIMEOUT }),
      this.reportsNavItem.click(),
    ]);
    expect(versionsResponse.status(), 'FAIL: Reports list API did not return 200').toBe(200);
    expect(countsResponse.status(), 'FAIL: Reports counts API did not return 200').toBe(200);
    await Promise.all([versionsResponse.finished(), countsResponse.finished()]);
    await expect(this.pageHeading, 'FAIL: Reports page heading did not render').toBeVisible({ timeout: UI_TIMEOUT });
  }

  /**
   * Opens /reports and waits until it has settled; if it is not ready within 60s the page is
   * reloaded once and given another 60s.
   * MCP-verified 2026-10-23: every load issues POST /reports (AuthKit `ensureSignedIn` server
   * action, a text/x-component stream), GET /api/reports/versions and GET /api/reports?counts=1;
   * clicks made before these return are lost when the page re-renders. Only the two data
   * responses are awaited to completion — the sign-in action's stream was seen never closing in
   * the test browser (runs of 2026-10-23 hung on its finished()), and it carries no page data.
   */
  async gotoReportsPage() {
    Logger.step('Opening the Reports page');
    const reportsUrl = `${this.baseUrl}${this.data.reportsPath}`;
    try {
      await this._loadReportsPage(() => this.page.goto(reportsUrl, { waitUntil: 'domcontentloaded' }), reportsUrl);
    } catch (e) {
      Logger.info(`Reports page not ready within ${RELOAD_AFTER / 1000}s (${e.message.split('\n')[0]}) — reloading once`);
      await this._loadReportsPage(() => this.page.reload({ waitUntil: 'domcontentloaded' }), reportsUrl);
    }
  }

  async _loadReportsPage(navigate, reportsUrl) {
    const [actionResponse, versionsResponse, countsResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.request().method() === 'POST' && r.url() === reportsUrl, { timeout: RELOAD_AFTER }),
      this.page.waitForResponse((r) => r.url().includes('/api/reports/versions') && r.request().method() === 'GET', { timeout: RELOAD_AFTER }),
      this.page.waitForResponse((r) => r.url().includes('/api/reports?counts=') && r.request().method() === 'GET', { timeout: RELOAD_AFTER }),
      navigate(),
    ]);
    expect(actionResponse.status(), 'FAIL: Reports page sign-in check did not return 200').toBe(200);
    expect(versionsResponse.status(), 'FAIL: Reports list API did not return 200').toBe(200);
    expect(countsResponse.status(), 'FAIL: Reports counts API did not return 200').toBe(200);
    await within(Promise.all([versionsResponse.finished(), countsResponse.finished()]), RELOAD_AFTER, 'Reports list data did not finish loading');
    await expect(this.pageHeading, 'FAIL: Reports page heading did not render').toBeVisible({ timeout: RELOAD_AFTER });
  }

  /** Opens /reports/new (optionally ?module=), reloading once if the chatbox is not ready within 60s. */
  async gotoNewReportPage(moduleKey) {
    const url = `${this.baseUrl}${this.data.newReportPath}${moduleKey ? `?module=${moduleKey}` : ''}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    const ready = await this.chatInput.waitFor({ state: 'visible', timeout: RELOAD_AFTER }).then(() => true).catch(() => false);
    if (!ready) {
      Logger.info(`Report chat not ready within ${RELOAD_AFTER / 1000}s — reloading once`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
    }
    await expect(this.chatInput, 'FAIL: Report chatbox not visible').toBeVisible({ timeout: RELOAD_AFTER });
  }

  // ---------- Landing page ----------

  async verifyReportsPageLoaded() {
    Logger.step('Verifying the Reports page URL, content and header');
    await expect(this.page, 'FAIL: Reports page URL is wrong').toHaveURL(`${this.baseUrl}${this.data.reportsPath}`);
    const mainText = (await this.page.getByRole('main').innerText()).trim();
    expect(mainText.length, 'FAIL: Reports page main content is blank').toBeGreaterThan(0);
    await expect(this.pageHeading, 'FAIL: Page header is not visible').toBeVisible();
    await expect(this.pageHeading, 'FAIL: Page header text is wrong').toHaveText(this.data.header.title);
    Logger.success('Reports page loaded with header "Generate a Report"');
  }

  async verifyHeadersAndBreadcrumbs() {
    Logger.step('Verifying breadcrumbs and page/section headers');
    await expect(this.breadcrumbHome, 'FAIL: Breadcrumb "Home" missing').toHaveText(this.data.breadcrumb.home);
    const breadcrumbCurrent = healingLocator(L.breadcrumbCurrentStrategies(this.page, this.data.breadcrumb.reports));
    await expect(breadcrumbCurrent, 'FAIL: Breadcrumb "Reports" missing').toHaveText(this.data.breadcrumb.reports);
    await expect(this.pageHeading, 'FAIL: Header title wrong').toHaveText(this.data.header.title);
    await expect(this.pageSubtitle, 'FAIL: Header subtitle wrong').toHaveText(this.data.header.subtitle);
    await expect(this.continueLabel, 'FAIL: "Continue" block header wrong').toHaveText(this.data.sections.continue);
    await expect(this.exploreByModuleLabel, 'FAIL: "Explore by Module" block header wrong').toHaveText(this.data.sections.exploreByModule);
    await expect(this.recentReportsLabel, 'FAIL: "Recent Reports" block header wrong').toHaveText(this.data.sections.recentReports);
    Logger.success('Breadcrumbs and all headers verified');
  }

  async verifyTopButtons() {
    Logger.step('Verifying "Use a Template" and "Generate Report" buttons');
    for (const [label, button] of [[this.data.buttons.useTemplate, this.useTemplateButton], [this.data.buttons.generateReport, this.generateReportButton]]) {
      await expect(button, `FAIL: "${label}" button not visible`).toBeVisible();
      await expect(button, `FAIL: "${label}" button not enabled`).toBeEnabled();
    }
    Logger.success('Top buttons visible and enabled');
  }

  /** Types `term`, presses Enter and returns the search API response JSON. */
  async searchReports(term) {
    Logger.step(`Searching reports for "${term}"`);
    await this.searchInput.fill(term);
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => {
        if (!r.url().includes('/api/reports/versions') || r.request().method() !== 'GET') return false;
        const q = new URL(r.url()).searchParams.get('q') || '';
        return q === term;
      }, { timeout: UI_TIMEOUT }),
      this.searchInput.press('Enter'),
    ]);
    expect(response.status(), `FAIL: Search API for "${term}" did not return 200`).toBe(200);
    return response.json();
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/api/reports/versions') && !r.url().includes('q=') && r.request().method() === 'GET', { timeout: UI_TIMEOUT }),
      this.searchInput.press('Enter'),
    ]);
  }

  async cardReportIds(scope) {
    const hrefs = await this.viewLink(scope).evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    return hrefs.map((h) => Number(h.split('/reports/')[1].split('?')[0]));
  }

  async verifySearchBox() {
    Logger.step('Verifying the search box is visible, enabled and filters reports');
    await expect(this.searchInput, 'FAIL: Search box not visible').toBeVisible();
    await expect(this.searchInput, 'FAIL: Search box not enabled').toBeEnabled();
    await expect(this.recentReportCards.first(), 'FAIL: No recent report available to search for').toBeVisible({ timeout: UI_TIMEOUT });

    const term = (await this.recentReportCards.first().locator('p').first().textContent()).trim();
    const json = await this.searchReports(term);
    expect(json.versions.length, `FAIL: Search for existing report "${term}" returned nothing`).toBeGreaterThan(0);
    for (const v of json.versions) {
      const haystack = `${v.reportName} ${v.prompt}`.toLowerCase();
      expect(haystack, `FAIL: Search result ${v.reportId} does not match "${term}"`).toContain(term.toLowerCase());
    }
    const apiIds = json.versions.map((v) => v.reportId);
    await expect.poll(async () => {
      const uiIds = await this.cardReportIds(this.page.getByRole('main'));
      return uiIds.length > 0 && uiIds.every((id) => apiIds.includes(id));
    }, { message: `FAIL: Search for "${term}" does not show only the matching reports`, timeout: UI_TIMEOUT }).toBe(true);

    const empty = await this.searchReports(this.data.noSearchMatchTerm);
    expect(empty.versions, 'FAIL: Search for a non-existent term returned results').toHaveLength(0);
    await expect(this.recentReportsEmptyText, 'FAIL: Empty search did not show the no-reports message').toBeVisible({ timeout: UI_TIMEOUT });
    await expect(this.recentReportCards, 'FAIL: Report cards still shown for a non-matching search').toHaveCount(0);

    await this.clearSearch();
    Logger.success(`Search verified with "${term}" and a non-matching term`);
  }

  async verifyBlocksHaveOptions() {
    Logger.step('Verifying Continue, Explore by Module and Recent Reports have options');
    await expect(this.draftReportsTile, 'FAIL: Continue block has no "Draft Reports" option').toBeVisible();
    await expect(this.generatingTile, 'FAIL: Continue block has no "Generating" option').toBeVisible();
    await expect(this.moduleTiles, 'FAIL: Explore by Module block options count wrong').toHaveCount(this.data.modules.length);
    for (const m of this.data.modules) {
      await expect(this.moduleTile(m.label), `FAIL: Explore by Module option "${m.label}" missing`).toBeVisible();
    }
    await expect(this.recentReportCards.first(), 'FAIL: Recent Reports block has no report').toBeVisible({ timeout: UI_TIMEOUT });
    Logger.success('All three blocks have options');
  }

  // ---------- Use a Template ----------

  async getTemplatesFromApi() {
    const res = await this.page.request.get(`${this.baseUrl}/api/report-templates`);
    expect(res.status(), 'FAIL: GET /api/report-templates did not return 200').toBe(200);
    return (await res.json()).templates;
  }

  moduleLabelForKey(key) {
    const m = this.data.modules.find((x) => x.key === key);
    return m ? m.label : key;
  }

  async openTemplateModal() {
    Logger.step('Opening "Use a Template"');
    await this.useTemplateButton.click();
    await expect(this.templateModal, 'FAIL: "Use a Template" modal did not open').toBeVisible({ timeout: UI_TIMEOUT });
  }

  async verifyTemplateModalContents() {
    Logger.step('Verifying everything in the "Use a Template" modal');
    const modal = this.templateModal;
    await expect(modal.getByRole('heading', { name: this.data.templateModalTitle, exact: true }), 'FAIL: Template modal title wrong').toBeVisible();
    const closeBtn = healingLocator(L.dialogCloseButtonStrategies(modal));
    await expect(closeBtn, 'FAIL: Template modal close button missing').toBeVisible();
    await expect(closeBtn, 'FAIL: Template modal close button disabled').toBeEnabled();

    const templates = await this.getTemplatesFromApi();
    const cards = healingLocator(L.templateCardsStrategies(modal));
    await expect(cards, 'FAIL: Template modal does not show every saved template').toHaveCount(templates.length);

    const uiEntries = [];
    for (let i = 0; i < templates.length; i++) {
      const parts = await cards.nth(i).locator('p, .mantine-Badge-root').evaluateAll((els) => els.map((e) => e.textContent.trim()));
      uiEntries.push(parts.join(' | '));
    }
    const apiEntries = templates.map((t) => [t.name, t.prompt, this.moduleLabelForKey(t.module)].join(' | '));
    expect(uiEntries.sort(), 'FAIL: Template cards (name | prompt | module) do not match saved templates').toEqual(apiEntries.sort());

    await closeBtn.click();
    await expect(modal, 'FAIL: Template modal did not close').toBeHidden();
    Logger.success(`Template modal shows all ${templates.length} templates with name, prompt and module`);
  }

  // ---------- Generate ----------

  async clickGenerateReport() {
    Logger.step('Clicking "Generate Report"');
    await this.generateReportButton.click();
    await expect(this.page, 'FAIL: Generate Report did not open /reports/new').toHaveURL(`${this.baseUrl}${this.data.newReportPath}`, { timeout: UI_TIMEOUT });
    await expect(this.chatInput, 'FAIL: Report chatbox not visible').toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expect(this.chatInput, 'FAIL: Report chatbox not enabled').toBeEnabled();
  }

  async getReportFromApi(reportId) {
    const res = await this.page.request.get(`${this.baseUrl}/api/reports/${reportId}?versions=1`);
    return { status: res.status(), json: res.status() === 200 ? await res.json() : null };
  }

  /**
   * Sends `prompt` in the report chatbox (must be on /reports/new) and waits for the agent to
   * finish and the app to land on the generated report. Returns its API record.
   */
  async listReportsFromApi() {
    const res = await this.page.request.get(`${this.baseUrl}/api/reports?counts=1`);
    expect(res.status(), 'FAIL: GET /api/reports did not return 200').toBe(200);
    return (await res.json()).reports;
  }

  async generateReportFromChat(prompt) {
    Logger.step(`Generating a report: ${prompt}`);
    const maxIdBefore = Math.max(0, ...(await this.listReportsFromApi()).map((r) => r.id));
    await this.chatInput.fill(prompt);
    const [chatResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith(this.data.chat.endpointSuffix) && r.request().method() === 'POST', { timeout: UI_TIMEOUT }),
      this.chatInput.press('Enter'),
    ]);
    expect(chatResponse.status(), 'FAIL: Report chat request failed').toBe(200);
    await within(chatResponse.finished(), GENERATION_TIMEOUT, 'FAIL: Report chat did not complete');

    const isReportUrl = (url) => url.pathname.startsWith('/reports/') && url.searchParams.has('versionId');
    const redirected = await this.page.waitForURL(isReportUrl, { timeout: RELOAD_AFTER }).then(() => true).catch(() => false);
    let reportId;
    if (redirected) {
      reportId = Number(new URL(this.page.url()).pathname.split('/')[2]);
      this.createdReportIds.push(reportId);
    } else {
      // Run of 2026-10-23 (trace + API): the agent created report 262 but the app never opened
      // it (stayed on /reports/new). Locate the new report by API, then open it the way a user
      // would: search its name on the Reports page and click View.
      const created = (await this.listReportsFromApi())
        .filter((r) => r.id > maxIdBefore && r.latestVersion && r.latestVersion.prompt === prompt)
        .sort((a, b) => b.id - a.id)[0];
      expect(created, 'FAIL: The chat completed but no report was created').toBeTruthy();
      reportId = created.id;
      this.createdReportIds.push(reportId);
      Logger.info(`App did not open report ${reportId} within ${RELOAD_AFTER / 1000}s — opening it via search`);
      await this.gotoReportsPage();
      await this.searchOwnReport(reportId, created.name);
      await this.openOwnReportFromCard(this.page.getByRole('main'), reportId);
    }

    const versionId = Number(new URL(this.page.url()).searchParams.get('versionId'));
    const { status, json } = await this.getReportFromApi(reportId);
    expect(status, `FAIL: Generated report ${reportId} not found via API`).toBe(200);
    const version = json.versions.find((v) => v.id === versionId);
    expect(version, `FAIL: Version ${versionId} missing on report ${reportId}`).toBeTruthy();
    await expect(this.reportFrame().locator('h1'), 'FAIL: Generated report did not render').toBeVisible({ timeout: GENERATION_TIMEOUT });
    Logger.success(`Report ${reportId} (version ${versionId}) generated: ${json.report.name}`);
    return { reportId, versionId, report: json.report, version };
  }

  /** Test setup: creates a report this test owns (tests only ever delete what they created). */
  async createReportForTest(prompt = this.data.reportPrompt) {
    await this.gotoNewReportPage();
    return this.generateReportFromChat(prompt);
  }

  /**
   * Generates the test's report from a module's "New <Module> report" chat
   * (/reports/new?module=<key>). From the plain chat the agent may leave `module` null
   * (run of 2026-10-23), and such a report is listed in no module panel.
   */
  async createReportInModuleForTest(module) {
    await this.gotoNewReportPage(module.key);
    const created = await this.generateReportFromChat(this.data.reportPrompt);
    expect(created.report.module, `FAIL: Report created from the ${module.label} chat is not in module "${module.key}"`).toBe(module.key);
    return created;
  }

  /** Best-effort cleanup of a report the test created; never fails the test. */
  async deleteReportViaApi(reportId) {
    if (!reportId) return;
    const { status } = await this.getReportFromApi(reportId);
    if (status !== 200) return;
    const res = await this.page.request.delete(`${this.baseUrl}/api/reports/${reportId}`);
    Logger.info(`Cleanup: DELETE /api/reports/${reportId} → ${res.status()}`);
  }

  /** afterEach cleanup: removes every report this test generated that still exists. */
  async cleanupCreatedReports() {
    for (const id of this.createdReportIds) {
      await this.deleteReportViaApi(id).catch((e) => Logger.info(`Cleanup of report ${id} failed: ${e.message}`));
    }
    this.createdReportIds = [];
  }

  async formatDateLikeApp(isoDate) {
    return this.page.evaluate((d) => new Date(d).toLocaleDateString(), isoDate);
  }

  /** Right panel of the report viewer: creator/date, status tag, rename, 3 action buttons, report. */
  async verifyReportViewerPanel(created) {
    Logger.step('Verifying the report viewer right panel');
    const date = await this.formatDateLikeApp(created.version.createdAt);
    await expect(this.generatedByText, 'FAIL: "Generated by" creator/date wrong').toHaveText(`${this.data.generatedByPrefix} ${created.version.createdByName} · ${date}`);
    const statusTag = this.page.getByRole('main').getByText(created.version.status, { exact: true });
    await expect(statusTag, `FAIL: Status tag "${created.version.status}" missing`).toBeVisible();
    await expect(this.renameReportButton, 'FAIL: Rename report button missing').toBeVisible();
    for (const [label, button] of [
      [this.data.buttons.regenerate, this.regenerateButton],
      [this.data.buttons.saveAsTemplate, this.saveAsTemplateButton],
      [this.data.buttons.export, this.exportButton],
    ]) {
      await expect(button, `FAIL: "${label}" not visible`).toBeVisible();
      await expect(button, `FAIL: "${label}" not enabled`).toBeEnabled();
    }
    await expect(this.reportIframe, 'FAIL: Report iframe title is not the report name').toHaveAttribute('title', created.report.name);
    await expect(this.reportFrame().locator('h1'), 'FAIL: Report title wrong').toHaveText(created.report.name);
    Logger.success('Right panel: creator/date, status, rename and 3 enabled buttons, report rendered');
  }

  async verifyReportMentionsProperty(propertyName) {
    await expect(this.reportFrame().locator('body'), `FAIL: Report does not cover "${propertyName}"`).toContainText(propertyName);
  }

  // ---------- Cards, drawers, view, delete ----------

  /**
   * Finds the test's own report on the Reports page by searching its name (not by scanning the
   * grid). If the search does not show it, the page is reloaded once and searched again.
   * Returns the report's card in the search results.
   */
  async searchOwnReport(reportId, reportName) {
    const main = this.page.getByRole('main');
    const card = this.reportCardById(main, reportId);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const json = await this.searchReports(reportName);
      const inResults = json.versions.some((v) => v.reportId === reportId);
      const shown = inResults && await card.waitFor({ state: 'visible', timeout: UI_TIMEOUT }).then(() => true).catch(() => false);
      if (shown) {
        Logger.success(`Report ${reportId} found by searching "${reportName}"`);
        return card;
      }
      if (attempt === 1) {
        Logger.info(`Report ${reportId} not shown for "${reportName}" — reloading and searching again`);
        await this.gotoReportsPage();
      }
    }
    await expect(card, `FAIL: Report ${reportId} "${reportName}" not found by search after a reload`).toBeVisible();
    return card;
  }

  async openOwnReportFromCard(scope, reportId) {
    Logger.step(`Opening report ${reportId} via its View button`);
    const card = this.reportCardById(scope, reportId);
    await expect(card, `FAIL: Report ${reportId} card not listed`).toBeVisible({ timeout: UI_TIMEOUT });
    const view = this.viewLink(card);
    await expect(view, 'FAIL: View button not enabled').toBeEnabled();
    const [apiResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes(`/api/reports/${reportId}?`) && r.request().method() === 'GET', { timeout: PAGE_LOAD_TIMEOUT }),
      this.page.waitForURL((url) => url.pathname === `/reports/${reportId}` && url.searchParams.has('versionId'), { timeout: PAGE_LOAD_TIMEOUT }),
      view.click(),
    ]);
    expect(apiResponse.status(), `FAIL: Report ${reportId} API did not return 200 on view`).toBe(200);
    await expect(this.reportFrame().locator('h1'), 'FAIL: Viewed report did not render').toBeVisible({ timeout: UI_TIMEOUT });
    Logger.success(`View opened report ${reportId}`);
  }

  async deleteOwnReportFromCard(scope, reportId, reportName) {
    Logger.step(`Deleting report ${reportId} via its Delete button`);
    const card = this.reportCardById(scope, reportId);
    await expect(card, `FAIL: Report ${reportId} card not listed`).toBeVisible({ timeout: UI_TIMEOUT });
    const del = this.deleteButton(card);
    await expect(del, 'FAIL: Delete button not enabled').toBeEnabled();
    await del.click();
    await expect(this.deleteDialog, 'FAIL: Delete confirmation did not open').toBeVisible({ timeout: UI_TIMEOUT });
    await expect(this.deleteDialog, 'FAIL: Delete confirmation does not name the report').toContainText(reportName);
    const [deleteResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/reports/${reportId}`), { timeout: UI_TIMEOUT }),
      this.deleteDialog.getByRole('button', { name: this.data.buttons.confirmDelete, exact: true }).click(),
    ]);
    expect(deleteResponse.status(), 'FAIL: Delete report API did not return 200').toBe(200);
    await expect(this.deleteDialog, 'FAIL: Delete confirmation did not close').toBeHidden();
    await expect(card, `FAIL: Report ${reportId} still listed after delete`).toHaveCount(0, { timeout: UI_TIMEOUT });
    const { status } = await this.getReportFromApi(reportId);
    expect(status, `FAIL: Report ${reportId} still retrievable after delete`).not.toBe(200);
    Logger.success(`Report ${reportId} deleted (DELETE 200)`);
  }

  /** Every card in `scope` has exactly one allowed tag and enabled View/Delete controls. */
  async verifyCardsHaveTagViewDelete(scope, allowedTags) {
    const cards = this.reportCards(scope);
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const tagLocator = allowedTags.map((t) => this.tag(card, t)).reduce((a, b) => a.or(b));
      await expect(tagLocator, `FAIL: Report card ${i + 1} has no ${allowedTags.join('/')} tag`).toHaveCount(1);
      await expect(this.viewLink(card), `FAIL: Report card ${i + 1} View not enabled`).toBeEnabled();
      await expect(this.deleteButton(card), `FAIL: Report card ${i + 1} Delete not enabled`).toBeEnabled();
    }
    return n;
  }

  async verifyContinueOptions() {
    Logger.step('Verifying the Continue block options');
    for (const [label, tile] of [[this.data.continueTiles.draftReports, this.draftReportsTile], [this.data.continueTiles.generating, this.generatingTile]]) {
      await expect(tile, `FAIL: Continue option "${label}" not visible`).toBeVisible();
      await expect(tile, `FAIL: Continue option "${label}" not enabled`).toBeEnabled();
      expect(await tile.innerText(), `FAIL: Continue option "${label}" shows no count`).toMatch(/\d+\s*$/);
    }
  }

  async openDraftDrawer() {
    Logger.step('Opening Continue → Draft Reports');
    await this.draftReportsTile.click();
    await expect(this.draftDrawer, 'FAIL: Draft reports panel did not open').toBeVisible({ timeout: UI_TIMEOUT });
    await expect(this.reportCards(this.draftDrawer).first(), 'FAIL: Draft reports panel is empty').toBeVisible({ timeout: UI_TIMEOUT });
    return this.draftDrawer;
  }

  async openModuleDrawer(module) {
    Logger.step(`Opening Explore by Module → ${module.label}`);
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/api/reports/versions') && new URL(r.url()).searchParams.get('module') === module.key, { timeout: UI_TIMEOUT }),
      this.moduleTile(module.label).click(),
    ]);
    expect(response.status(), `FAIL: ${module.label} reports API did not return 200`).toBe(200);
    const drawer = this.moduleDrawer(module.label);
    await expect(drawer, `FAIL: ${module.label} reports panel did not open`).toBeVisible({ timeout: UI_TIMEOUT });
    return { drawer, versions: (await response.json()).versions };
  }

  async verifyModuleDrawer(module) {
    const { drawer, versions } = await this.openModuleDrawer(module);
    if (versions.length === 0) {
      const p = this.data.moduleEmptyPattern;
      await expect(drawer.getByText(`${p.prefix}${module.label.toLowerCase()}${p.suffix}`, { exact: true }), `FAIL: ${module.label} empty-state message missing`).toBeVisible();
      await expect(this.reportCards(drawer), `FAIL: ${module.label} panel lists cards with no reports`).toHaveCount(0);
    } else {
      await expect(this.reportCards(drawer), `FAIL: ${module.label} panel does not list all associated reports`).toHaveCount(versions.length, { timeout: UI_TIMEOUT });
      await this.verifyCardsHaveTagViewDelete(drawer, [this.data.tags.ready, this.data.tags.draft]);
    }
    const n = this.data.moduleNewButtonPattern;
    const newButton = drawer.getByRole('button', { name: `${n.prefix}${module.label}${n.suffix}`, exact: true });
    await expect(newButton, `FAIL: "New ${module.label} report" not enabled`).toBeEnabled();
    await newButton.click();
    await expect(this.page, `FAIL: New ${module.label} report did not open the chat`).toHaveURL(`${this.baseUrl}${this.data.newReportPath}?module=${module.key}`, { timeout: UI_TIMEOUT });
    await expect(this.chatInput, `FAIL: AI chatbox not open for ${module.label}`).toBeVisible({ timeout: UI_TIMEOUT });
    Logger.success(`${module.label}: ${versions.length} report(s) verified, New report opens the AI chatbox`);
  }

  async verifyRecentReportsCards() {
    Logger.step('Verifying Recent Reports cards: tag, creator · date, View/Delete');
    const main = this.page.getByRole('main');
    // count() does not wait — make sure the list has rendered before counting it.
    await expect(this.reportCards(main).first(), 'FAIL: Recent Reports did not render').toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    const n = await this.verifyCardsHaveTagViewDelete(main, [this.data.tags.ready, this.data.tags.draft]);
    expect(n, 'FAIL: Recent Reports is empty').toBeGreaterThan(0);
    const cards = this.reportCards(main);
    for (let i = 0; i < n; i++) {
      const text = await cards.nth(i).innerText();
      expect(text, `FAIL: Recent report ${i + 1} has no "Creator · date"`).toMatch(/\S+.* · \d{1,2}\/\d{1,2}\/\d{4}/);
    }
    for (const tagText of [this.data.tags.ready, this.data.tags.draft]) {
      await expect(this.tag(main, tagText).first(), `FAIL: No ${tagText} report in Recent Reports`).toBeVisible();
    }
    Logger.success(`${n} recent reports have tag, creator · date and enabled View/Delete`);
  }

  async verifyOwnRecentCard(created) {
    const card = await this.searchOwnReport(created.reportId, created.report.name);
    const date = await this.formatDateLikeApp(created.version.createdAt);
    await expect(card, 'FAIL: Recent report creator name/date wrong').toContainText(`${created.version.createdByName} · ${date}`);
    await expect(this.tag(card, created.version.status.toUpperCase()), 'FAIL: Recent report tag wrong').toBeVisible();
  }

  async verifyReportNotFoundBySearch(reportId, reportName) {
    Logger.step(`Searching for deleted report "${reportName}"`);
    const json = await this.searchReports(reportName);
    expect(json.versions.map((v) => v.reportId), `FAIL: Deleted report ${reportId} still returned by search`).not.toContain(reportId);
    await expect(this.reportCardById(this.page.getByRole('main'), reportId), `FAIL: Deleted report ${reportId} still shown in search`).toHaveCount(0);
    Logger.success(`Deleted report ${reportId} is unavailable in search`);
  }

  // ---------- Report content & calculations ----------

  /** Reads the rendered report: title, tables (headers + rows), KPI cards and charts. */
  async extractReportContent() {
    return this.reportFrame().locator('body').evaluate((body) => {
      const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
      const tables = [...body.querySelectorAll('table')].map((t) => {
        const headRow = t.tHead ? t.tHead.rows[0] : t.rows[0];
        return {
          headers: headRow ? [...headRow.cells].map(txt) : [],
          rows: [...t.rows].filter((r) => r !== headRow).map((r) => [...r.cells].map(txt)),
        };
      });
      const kpis = [...body.querySelectorAll('.kpi')].map((k) => {
        const parts = [...k.children].map(txt).filter(Boolean);
        return { label: parts[0] || '', value: parts[parts.length - 1] || '' };
      });
      const figures = [...body.querySelectorAll('figure')].map((f) => ({
        caption: txt(f.querySelector('figcaption')) || f.getAttribute('aria-label') || '',
        hasGraphic: !!f.querySelector('svg, canvas, img'),
        bars: [...f.querySelectorAll('title')].map(txt).filter(Boolean),
      }));
      return { title: txt(body.querySelector('h1')), tables, kpis, figures, paragraphs: body.querySelectorAll('p').length };
    });
  }

  /** "$1,234" → 1234, "($198,000)" → -198000, "$9.5K" → 9500; null when not a number. */
  static parseAmount(text) {
    if (text === undefined || text === null) return null;
    const raw = String(text).trim();
    if (!raw || raw.includes('%')) return null;
    const negative = (raw.startsWith('(') && raw.endsWith(')')) || raw.startsWith('-') || raw.startsWith('$-');
    let body = raw.replace(/[$,()\s-]/g, '');
    let multiplier = 1;
    if (body.endsWith('K')) { multiplier = 1000; body = body.slice(0, -1); }
    else if (body.endsWith('M')) { multiplier = 1000000; body = body.slice(0, -1); }
    if (!/^\d+(\.\d+)?$/.test(body)) return null;
    return (negative ? -1 : 1) * Number(body) * multiplier;
  }

  /** Display precision of a value: "$18K" is shown to 0.1K, "$1,234" to the whole unit. */
  static displayTolerance(text) {
    const t = String(text).trim();
    if (t.includes('K')) return 50;
    if (t.includes('M')) return 50000;
    return 0.5;
  }

  /**
   * Recomputes the report's own numbers and compares them with what it displays:
   * Total rows = sum of rows, derived columns (fixture derivedColumnRules), KPI cards = matching
   * table totals, chart bars = matching table row values. Values change per run, so everything
   * is read from the generated report itself.
   */
  verifyReportCalculations(content) {
    const parse = ReportPage.parseAmount;
    const totalLabel = this.data.totalRowLabel;
    let checks = 0;

    for (const [ti, table] of content.tables.entries()) {
      const totalRow = table.rows.find((r) => r[0] === totalLabel);
      const body = table.rows.filter((r) => r[0] !== totalLabel);
      if (totalRow) {
        for (let c = 1; c < table.headers.length; c++) {
          const values = body.map((r) => parse(r[c]));
          const total = parse(totalRow[c]);
          if (total === null || values.length === 0 || values.some((v) => v === null)) continue;
          const sum = values.reduce((a, b) => a + b, 0);
          const tolerance = 0.5 * (values.length + 1);
          expect(Math.abs(sum - total), `FAIL: Table ${ti + 1} "${table.headers[c]}" Total ${totalRow[c]} ≠ sum of rows ${sum}`).toBeLessThanOrEqual(tolerance);
          checks++;
        }
      }
      for (const rule of this.data.derivedColumnRules) {
        const idx = (h) => table.headers.findIndex((x) => x.toLowerCase() === h.toLowerCase());
        const [r, a, b] = [idx(rule.result), idx(rule.minuend), idx(rule.subtrahend)];
        if (r < 0 || a < 0 || b < 0) continue;
        for (const row of table.rows) {
          const [vr, va, vb] = [parse(row[r]), parse(row[a]), parse(row[b])];
          if (vr === null || va === null || vb === null) continue;
          expect(Math.abs(vr - (va - vb)), `FAIL: "${row[0]}" ${rule.result} ${row[r]} ≠ ${rule.minuend} − ${rule.subtrahend} (${va - vb})`).toBeLessThanOrEqual(1.5);
          checks++;
        }
      }
    }

    // A KPI is checked only against table Totals whose column header IS the KPI label (e.g.
    // "Committed" ↔ "Committed"). Word overlap is not enough: MCP/run-verified 2026-10-23 that
    // "Units in renovation program" (0) and the "Units" total (750) are different measures.
    for (const kpi of content.kpis) {
      const value = parse(kpi.value);
      if (value === null) continue;
      const label = kpi.label.trim().toLowerCase();
      const candidates = [];
      for (const table of content.tables) {
        const totalRow = table.rows.find((r) => r[0] === totalLabel);
        if (!totalRow) continue;
        table.headers.forEach((h, c) => {
          const total = parse(totalRow[c]);
          if (c > 0 && total !== null && h.trim().toLowerCase() === label) candidates.push(total);
        });
      }
      if (candidates.length === 0) continue;
      const matched = candidates.some((t) => Math.abs(Math.abs(t) - Math.abs(value)) <= 0.5);
      expect(matched, `FAIL: KPI "${kpi.label}" ${kpi.value} does not match its table total (${candidates.join(', ')})`).toBe(true);
      checks++;
    }

    for (const figure of content.figures) {
      for (const bar of figure.bars) {
        const sep = bar.lastIndexOf(': ');
        if (sep < 0) continue;
        const shown = bar.slice(sep + 2);
        const value = parse(shown);
        const label = bar.slice(0, sep).split(' · ')[0].trim();
        const row = content.tables.flatMap((t) => t.rows).find((r) => r[0] === label);
        if (value === null || !row) continue;
        const tolerance = ReportPage.displayTolerance(shown);
        const matched = row.slice(1).map(parse).some((v) => v !== null && Math.abs(v - value) <= tolerance);
        expect(matched, `FAIL: Chart value for "${label}" (${shown}) does not match the table row`).toBe(true);
        checks++;
      }
    }

    expect(checks, 'FAIL: Report has no calculable figures (no Total rows, derived columns, KPIs or chart values)').toBeGreaterThan(0);
    Logger.success(`${checks} report calculations recomputed and matched`);
    return checks;
  }

  async verifyReportDetails(created) {
    Logger.step('Verifying report details, text and graph');
    const content = await this.extractReportContent();
    expect(content.title, 'FAIL: Report title wrong').toBe(created.report.name);
    expect(content.paragraphs, 'FAIL: Report has no text').toBeGreaterThan(0);
    expect(content.tables.length, 'FAIL: Report has no data table').toBeGreaterThan(0);
    for (const [i, t] of content.tables.entries()) {
      expect(t.headers.length, `FAIL: Table ${i + 1} has no columns`).toBeGreaterThan(0);
      expect(t.rows.length, `FAIL: Table ${i + 1} has no rows`).toBeGreaterThan(0);
    }
    const graphs = content.figures.filter((f) => f.hasGraphic);
    expect(graphs.length, 'FAIL: Report has no graph').toBeGreaterThan(0);
    return content;
  }

  // ---------- Regenerate / Save as Template ----------

  async regenerateAndVerify(created) {
    Logger.step('Clicking Regenerate');
    const before = (await this.getReportFromApi(created.reportId)).json.versions;
    const currentVersionId = Number(new URL(this.page.url()).searchParams.get('versionId'));
    const [chatResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith(this.data.chat.endpointSuffix) && r.request().method() === 'POST', { timeout: UI_TIMEOUT }),
      this.regenerateButton.click(),
    ]);
    expect(chatResponse.status(), 'FAIL: Regenerate chat request failed').toBe(200);
    await chatResponse.finished();
    Logger.info('Chatbox process completed');

    // MCP-verified 2026-10-23: a never-exported draft is regenerated IN PLACE (same version id,
    // new htmlFileUploadId each time); an exported version is regenerated as a NEW version.
    // Either way "regenerated" = the report now has a report file it did not have before.
    const beforeFiles = before.map((v) => v.htmlFileUploadId);
    await expect.poll(async () => {
      const versions = (await this.getReportFromApi(created.reportId)).json.versions;
      return versions.some((v) => !beforeFiles.includes(v.htmlFileUploadId));
    }, { message: 'FAIL: Regenerate did not produce a regenerated report', timeout: UI_TIMEOUT }).toBe(true);
    const after = (await this.getReportFromApi(created.reportId)).json.versions;
    const regenerated = after.find((v) => !beforeFiles.includes(v.htmlFileUploadId));

    if (regenerated.id !== currentVersionId) {
      await expect(this.page, 'FAIL: Viewer did not switch to the regenerated version').toHaveURL((url) => Number(url.searchParams.get('versionId')) === regenerated.id, { timeout: UI_TIMEOUT });
      await expect(this.reportVersionInput, 'FAIL: Version selector does not show the new version').toHaveValue(`Version ${regenerated.version} · ${regenerated.status}`, { timeout: UI_TIMEOUT });
    } else {
      expect(new URL(this.page.url()).searchParams.get('versionId'), 'FAIL: Viewer is not on the regenerated version').toBe(String(regenerated.id));
    }
    // Reload so the viewer is proven to serve the regenerated file, not a cached render.
    const [fileResponse] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes(`/api/file-upload/${regenerated.htmlFileUploadId}/download`), { timeout: PAGE_LOAD_TIMEOUT }),
      this.page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
    expect(fileResponse.status(), 'FAIL: Regenerated report file could not be loaded').toBe(200);
    await expect(this.reportFrame().locator('h1'), 'FAIL: Regenerated report did not render').toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    Logger.success(`Report regenerated (version ${regenerated.version}, file ${regenerated.htmlFileUploadId})`);
  }

  async saveAsTemplate(created) {
    Logger.step('Clicking Save as Template');
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/reports/${created.reportId}/save-template`), { timeout: UI_TIMEOUT }),
      this.saveAsTemplateButton.click(),
    ]);
    expect(response.status(), 'FAIL: Save as Template API did not return 200').toBe(200);
    const json = await response.json();
    expect(json.success, 'FAIL: Save as Template did not succeed').toBe(true);
    expect(json.templateId, 'FAIL: Save as Template returned no template id').toBeTruthy();
    Logger.success(`Template ${json.templateId} "${json.name}" saved`);
    return json;
  }

  async verifyTemplateAvailableOnReportsPage(saved) {
    Logger.step(`Verifying template "${saved.name}" is available on the Reports page`);
    await this.gotoReportsPage();
    const templates = await this.getTemplatesFromApi();
    expect(templates.map((t) => t.id), `FAIL: Template ${saved.templateId} not in saved templates`).toContain(saved.templateId);
    await this.openTemplateModal();
    const cards = healingLocator(L.templateCardsStrategies(this.templateModal));
    await expect(cards, 'FAIL: Template modal does not list every saved template').toHaveCount(templates.length);
    const expectedNamed = templates.filter((t) => t.name === saved.name).length;
    await expect(cards.filter({ has: this.page.getByText(saved.name, { exact: true }) }), `FAIL: Template "${saved.name}" not shown in Use a Template`).toHaveCount(expectedNamed);
    Logger.success(`Template "${saved.name}" available in Use a Template`);
  }

  // ---------- Export ----------

  async openExportMenu() {
    await this.exportButton.click();
    await expect(this.exportPdfMenuItem, 'FAIL: "Export PDF" option missing').toBeVisible({ timeout: UI_TIMEOUT });
    await expect(this.exportExcelMenuItem, 'FAIL: "Export data (Excel)" option missing').toBeVisible();
    await expect(this.exportPdfMenuItem, 'FAIL: "Export PDF" option disabled').toBeEnabled();
    await expect(this.exportExcelMenuItem, 'FAIL: "Export data (Excel)" option disabled').toBeEnabled();
  }

  async exportAs(menuItem, format, reportId) {
    const [response, download] = await Promise.all([
      this.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/reports/${reportId}/export`) && (r.request().postData() || '').includes(`"format":"${format}"`), { timeout: UI_TIMEOUT }),
      this.page.waitForEvent('download', { timeout: UI_TIMEOUT }),
      menuItem.click(),
    ]);
    expect(response.status(), `FAIL: Export ${format} API did not return 200`).toBe(200);
    const json = await response.json();
    expect(json.success, `FAIL: Export ${format} did not succeed`).toBe(true);
    expect(json.format, `FAIL: Export returned format ${json.format}`).toBe(format);
    expect(download.suggestedFilename().endsWith(`.${format}`), `FAIL: Downloaded file is not .${format}`).toBe(true);
    return { json, download };
  }

  async exportPdfAndVerify(created, content) {
    Logger.step('Export → Export PDF');
    await this.openExportMenu();
    const { json } = await this.exportAs(this.exportPdfMenuItem, this.data.exportFormats.pdf, created.reportId);
    const pdf = await downloadAndExtractPdfText(json.signedUrl);
    const norm = (s) => s.replace(/\s+/g, '');
    expect(pdf.numpages, 'FAIL: Exported PDF has no pages').toBeGreaterThan(0);
    expect(pdf.normalized, 'FAIL: PDF title wrong').toContain(norm(content.title));
    const graphs = content.figures.filter((f) => f.hasGraphic);
    expect(graphs.length, 'FAIL: Report has no graph to export').toBeGreaterThan(0);
    for (const g of graphs) {
      if (g.caption) expect(pdf.normalized, `FAIL: PDF missing graph "${g.caption}"`).toContain(norm(g.caption));
      for (const bar of g.bars) {
        const shown = bar.slice(bar.lastIndexOf(': ') + 2);
        expect(pdf.normalized, `FAIL: PDF graph missing value ${shown}`).toContain(norm(shown));
      }
    }
    for (const t of content.tables) {
      for (const row of t.rows) {
        for (const cell of row) {
          if (ReportPage.parseAmount(cell) !== null) expect(pdf.normalized, `FAIL: PDF missing value ${cell} of row "${row[0]}"`).toContain(norm(cell));
        }
      }
    }
    Logger.success(`PDF (${pdf.numpages} pages) contains the graph and all table values`);
  }

  async exportExcelAndVerify(created, content) {
    Logger.step('Export → Export data (Excel)');
    await this.openExportMenu();
    const { download } = await this.exportAs(this.exportExcelMenuItem, this.data.exportFormats.excel, created.reportId);
    const entries = ReportPage.readZipEntries(fs.readFileSync(await download.path()));
    const names = Object.keys(entries);
    const graphParts = names.filter((n) => this.data.excelGraphParts.some((p) => n.startsWith(p)));
    expect(graphParts, 'FAIL: Excel export unexpectedly contains a graph').toEqual([]);
    const sheets = ReportPage.readXlsxRows(entries);
    expect(sheets.length, 'FAIL: Excel export has no sheets').toBeGreaterThan(0);
    const excelRows = sheets.flatMap((s) => s.rows);

    let matchedRows = 0;
    for (const t of content.tables) {
      for (const row of t.rows.filter((r) => r[0] !== this.data.totalRowLabel)) {
        const excelRow = excelRows.find((r) => String(r[0]).trim() === row[0]);
        if (!excelRow) continue;
        const excelNumbers = excelRow.slice(1).map(Number).filter((n) => !Number.isNaN(n));
        for (const cell of row.slice(1)) {
          const v = ReportPage.parseAmount(cell);
          if (v === null) continue;
          const tol = ReportPage.displayTolerance(cell);
          expect(excelNumbers.some((n) => Math.abs(n - v) <= tol), `FAIL: Excel row "${row[0]}" missing value ${cell}`).toBe(true);
        }
        matchedRows++;
      }
    }
    expect(matchedRows, 'FAIL: No report table row found in the Excel export').toBeGreaterThan(0);
    Logger.success(`Excel (${sheets.length} sheets, no graph) matches ${matchedRows} report rows`);
  }

  /** Minimal ZIP reader (xlsx is a zip of XML) using Node's zlib — no extra dependency. */
  static readZipEntries(buf) {
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('Excel export is not a valid zip/xlsx file');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = {};
    for (let i = 0; i < count; i++) {
      const method = buf.readUInt16LE(p + 10);
      const size = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.slice(start, start + size);
      entries[name] = method === 8 ? zlib.inflateRawSync(data) : data;
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  /** Returns [{ name, rows: [[cell, ...], ...] }] for every worksheet (shared + inline strings). */
  static readXlsxRows(entries) {
    const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const textOf = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
    const shared = entries['xl/sharedStrings.xml']
      ? [...entries['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
      : [];
    const workbook = entries['xl/workbook.xml'].toString('utf8');
    const sheetNames = [...workbook.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => decode(m[1]));
    return Object.keys(entries)
      .filter((n) => n.startsWith('xl/worksheets/sheet') && n.endsWith('.xml'))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))
      .map((n, i) => {
        const xml = entries[n].toString('utf8');
        const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
          [...r[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
            const attrs = c[1];
            const inner = c[2] || '';
            const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
            if (attrs.includes('t="s"')) return shared[Number(v)];
            if (attrs.includes('t="inlineStr"')) return textOf(inner);
            return v === undefined ? '' : decode(v);
          }));
        return { name: sheetNames[i] || n, rows };
      });
  }
}

module.exports = { ReportPage };
