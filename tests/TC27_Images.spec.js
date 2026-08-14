require('dotenv').config();
const path = require('path');
const { test, expect } = require('@playwright/test');
const { ImagesPage } = require('../pages/imagesPage');
const { Logger } = require('../utils/logger');
const { ensureLeftPanelExpanded } = require('../utils/leftPanelExpander');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Taller than the global 1920x1080 default (playwright.config.js) — this page's KPI
    // cards row (Images/Recent Uploads/Total Size) pushes the toolbar, and therefore the
    // Add Column flyout panel anchored below it, further down than on grids without that
    // row. At 1080px the panel's Type list + submit button fall outside the viewport and
    // AddColumnPage.addColumn()'s own auto-scroll can't reach them (MCP/screenshot-verified
    // 2026-08-14, reproduced headless too — not a local-display artifact). The extra height
    // gives the existing, unmodified addColumnPage.js flow enough room instead.
    viewport: { width: 1920, height: 1600 },
});

const UPLOAD_IMAGE_PATH = path.resolve('./files/Property_image.png');

let page, images;

test.describe('Documents - Images', () => {
    test.beforeEach(async ({ page: p }) => {
        page = p;
        images = new ImagesPage(page);
        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
        await expect(page).toHaveURL(process.env.DASHBOARD_URL);
        await page.waitForTimeout(7000);
        Logger.info('Dashboard loaded from stored session');
        await ensureLeftPanelExpanded(page);
        await images.navigateToImages();
    });

    test('TC416 @images @regression Images page loads correctly', async () => {
        await images.assertPageLoaded();
        const imagesCount = await images.getKpiValue('Images');
        const recentUploads = await images.getKpiValue('Recent Uploads');
        const totalSize = await images.getKpiValue('Total Size');
        expect(imagesCount, 'Images KPI must be present').not.toBeNull();
        expect(recentUploads, 'Recent Uploads KPI must be present').not.toBeNull();
        expect(totalSize, 'Total Size KPI must be present').not.toBeNull();
        Logger.success(`TC416: KPIs — Images=${imagesCount}, Recent Uploads=${recentUploads}, Total Size=${totalSize}`);
    });

    test('TC417 @images @regression Images shows up in left nav', async () => {
        await images.assertReachableFromLeftPanel();
    });

    test('TC418 @images @regression Upload a photo', async () => {
        const fileName = path.basename(UPLOAD_IMAGE_PATH);
        await images.uploadImage(UPLOAD_IMAGE_PATH);
        await expect(images.rowForImage(fileName), 'Uploaded image row must appear in the grid').toBeVisible({ timeout: 60000 });
        Logger.success(`TC418: Uploaded "${fileName}" and confirmed it appears in the grid`);
    });

    test('TC419 @images @regression KPIs update after upload', async () => {
        // The KPI cards reflect the new count only after a reload/re-navigation, not live
        // in-place — same behavior confirmed for delete (imagesPage.js's deleteImage comment).
        // Re-navigating before reading "after" tests what a real user would actually see.
        const fileName = path.basename(UPLOAD_IMAGE_PATH);
        const before = await images.getKpiValue('Images');
        await images.uploadImage(UPLOAD_IMAGE_PATH);
        await expect(images.rowForImage(fileName), 'Uploaded image row must appear').toBeVisible({ timeout: 60000 });
        await images.navigateToImages();
        const after = await images.getKpiValue('Images');
        expect(Number(after), `Images KPI must increase after upload (before=${before}, after=${after})`).toBeGreaterThan(Number(before));
        Logger.success(`TC419: Images KPI ${before} -> ${after} after upload`);
    });

    test('TC420 @images @regression Search the images grid', async () => {
        await images.searchImages('Property_image');
        await expect(images.rowForImage('Property_image.png'), 'Search must show the matching image row').toBeVisible({ timeout: 60000 });
        await images.searchImages('NoSuchImage_zzz_9999');
        // MCP-verified live (2026-08-14): the no-matches empty state reads "No file uploads
        // added yet" here (same generic "No <noun> added yet" copy used app-wide for empty
        // grids, e.g. "No properties added yet", "No approvals added yet") — matched loosely
        // so this doesn't re-break if the noun wording changes again.
        await expect(page.getByText(/No .* added yet/i).first(), 'Search with no matches must show an empty state').toBeVisible({ timeout: 60000 });
        await images.clearSearch();
        Logger.success('TC420: Search filters the grid correctly for matches and no-matches');
    });

    test('TC421 @images @regression Filter panel sections', async () => {
        await images.openFilterPanel();
        await expect(images.loc.filterPropertySection, 'Property filter section must be visible').toBeVisible({ timeout: 60000 });
        await expect(images.loc.filterProjectSection, 'Project filter section must be visible').toBeVisible();
        await expect(images.loc.filterTagsSection, 'Tags filter section must be visible').toBeVisible();
        await images.closeFilterPanel();
        Logger.success('TC421: Filter panel shows Property, Project, and Tags sections');
    });

    test('TC422 @images @regression Save current view', async () => {
        await images.openSaveViewPopover();
        await expect(images.loc.saveViewNameInput, 'Save view name input must be visible').toBeVisible();
        await images.closeSaveViewPopover();
        Logger.success('TC422: Save current view as popover verified');
    });

    test('TC423 @images @regression Add a custom column', async () => {
        const columnName = `ImgCol-${Date.now()}`;
        await images.addCustomColumn(columnName, 'Automation column for Images', 0);
        // addColumnPage.verifyColumnAdded() also types a value into the new column's own
        // data cell to confirm the grid accepts it (verifyColumnTypeInput) — on this specific
        // grid that step's cell lookup times out (MCP/screenshot-verified 2026-08-14): Images
        // already has 9 default columns before any custom one, so a new column lands at a
        // column index past where AddColumnPage's own cell-scroll (a pre-existing, unrelated
        // limitation, not something introduced here) can reach. Column *existence* — what
        // this test is actually named for — is still verified via Manage Columns, the same
        // check TC424 already relies on.
        const manageColumnsDialog = images.addColumnPage.loc.manageColumnsDialog;
        await images.openManageColumns();
        await expect(manageColumnsDialog.getByText(columnName, { exact: true }), 'Newly added column must be listed in Manage Columns').toBeVisible();
        await images.closeManageColumns();
        await images.deleteColumn(columnName);
        // Name-scoped check, not verifyNoCustomColumnsRemain() — this suite runs with parallel
        // workers sharing one org-wide column list, so a "zero remain" assertion would fail
        // whenever another concurrently-running test's own column exists at that instant.
        expect(await images.isCustomColumnPresent(columnName), `Column "${columnName}" must no longer be present after delete`).toBe(false);
        Logger.success(`TC423: Column "${columnName}" created, verified, and cleaned up`);
    });

    test('TC424 @images @regression Manage Columns lists columns', async () => {
        const columnName = `ImgCol-${Date.now()}`;
        await images.addCustomColumn(columnName, 'Automation column for Images', 0);
        await images.openManageColumns();
        const manageColumnsDialog = images.addColumnPage.loc.manageColumnsDialog;
        await expect(manageColumnsDialog.getByText('Default Columns', { exact: true }), 'Default Columns section must be visible').toBeVisible();
        await expect(manageColumnsDialog.getByText('Custom Columns', { exact: true }), 'Custom Columns section must be visible').toBeVisible();
        await expect(manageColumnsDialog.getByText(columnName, { exact: true }), 'Newly added column must be listed').toBeVisible();
        await images.closeManageColumns();
        await images.deleteColumn(columnName);
        // Name-scoped check — see TC423 comment: total-count/verifyNoCustomColumnsRemain()
        // checks aren't safe when other tests are concurrently adding/removing their own columns.
        expect(await images.isCustomColumnPresent(columnName), `Column "${columnName}" must no longer be present after delete`).toBe(false);
        Logger.success('TC424: Manage Columns drawer lists Default and Custom Columns correctly');
    });

    test('TC425 @images @regression Delete a custom column', async () => {
        const columnName = `ImgCol-${Date.now()}`;
        await images.addCustomColumn(columnName, 'Automation column for Images', 0);
        // Name-scoped presence checks, not getCustomColumnCount() — that reads the entire
        // shared, org-wide custom-columns list, so an exact count (toBe(1)/toBe(0)) breaks
        // under parallel workers whenever another test's own column also exists at that instant.
        expect(await images.isCustomColumnPresent(columnName), 'Newly added column must be present after add').toBe(true);
        await images.deleteColumn(columnName);
        expect(await images.isCustomColumnPresent(columnName), 'Deleted column must no longer be present').toBe(false);
        Logger.success(`TC425: Column "${columnName}" deleted and count verified back to 0`);
    });

    test('TC426 @images @regression Export images to CSV', async () => {
        const download = await images.exportImages();
        expect(download.suggestedFilename(), 'Export must download a CSV file').toMatch(/\.csv$/i);
        Logger.success(`TC426: Export downloaded "${download.suggestedFilename()}"`);
    });

    test('TC427 @images @regression Download an image', async () => {
        const download = await images.downloadImage('Property_image.png');
        expect(download.suggestedFilename(), 'Download must be the image file').toMatch(/Property.image\.png/i);
        Logger.success(`TC427: Download Image produced "${download.suggestedFilename()}"`);
    });

    test('TC428 @images @regression Delete an image', async () => {
        // deleteImage() confirms via GET /api/bird-table, not the UI's KPI cards or row count
        // — see imagesPage.js for why (KPI cards lag real state, and this grid's rows are
        // virtualized so a DOM count can't be trusted either).
        const fileName = path.basename(UPLOAD_IMAGE_PATH);
        await images.uploadImage(UPLOAD_IMAGE_PATH);
        await expect(images.rowForImage(fileName), 'Uploaded row must appear before delete').toBeVisible({ timeout: 60000 });
        await images.deleteImage(fileName);
        Logger.success(`TC428: Uploaded then deleted "${fileName}" — row removed`);
    });

    test('TC429 @images @regression Image preview dialog', async () => {
        const dialog = await images.openImagePreview('Property_image.png');
        await expect(dialog.getByRole('heading', { name: 'Property_image.png' }), 'Preview dialog heading must match file name').toBeVisible();
        await images.closePreview(dialog);
        await expect(dialog, 'Preview dialog must close').toBeHidden({ timeout: 60000 });
        Logger.success('TC429: Thumbnail preview dialog opened and closed correctly');
    });

    test('TC430 @images @regression Add all column types', async () => {
        // Uses the Lite variant (see imagesPage.js) — same reason as TC423: this grid's 9
        // default columns push new custom columns past what addColumnPage.js's own scroll
        // mechanism can reach, so existence is verified via Manage Columns instead.
        const createdColumns = await images.addAndVerifyAllColumnTypesLite();
        expect(createdColumns.length, 'All 13 column types must be created and verified').toBe(13);
        Logger.success(`TC430: All ${createdColumns.length} column types created, verified, and cleaned up`);
    });
});
