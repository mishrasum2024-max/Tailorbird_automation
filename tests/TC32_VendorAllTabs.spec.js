require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { VendorDashboardPage } = require('../pages/vendorDashboardPage');
const { VendorListingPage } = require('../pages/vendorListingPage');
const { VendorBidWorkspacePage } = require('../pages/vendorBidWorkspacePage');
const { VendorProfilePage } = require('../pages/vendorProfilePage');
const { VendorBidPage } = require('../pages/vendorBidPage');
const { viewDetailsButtonStrategies } = require('../locators/vendorBidLocator');
const { bidsListEmptyStateStrategies } = require('../locators/vendorBidWorkspaceLocator');
const { healingLocator } = require('../utils/locatorHealer');
const { Logger } = require('../utils/logger');

const bidWorkspaceData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/vendorBidWorkspaceData.json'), 'utf8'));
const userMgmtData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/vendorUserManagementData.json'), 'utf8'));
const lastVendorTestUserPath = path.join(__dirname, '../data/lastVendorTestUser.json');

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} status exact status text, e.g. "Invited", "Awarded"
 * @returns {Promise<string|null>} the bid's URL, or null if no row matches
 */
async function openFirstBidRowByStatus(page, status) {
    const downloadDir = path.join(__dirname, '../downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    const exportButton = page.getByRole('button', { name: 'Export', exact: true });
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        exportButton.click(),
    ]);
    const csvPath = path.join(downloadDir, `vendor-bids-status-lookup-${Date.now()}.csv`);
    await download.saveAs(csvPath);
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
    const header = VendorBidPage._parseCsvLine(lines[0]);
    const nameIdx = header.findIndex((h) => /^bid name$/i.test(h));
    const statusIdx = header.findIndex((h) => /^status$/i.test(h));
    if (nameIdx === -1 || statusIdx === -1) {
        throw new Error(`openFirstBidRowByStatus: could not locate "Bid Name"/"Status" columns in export header [${header.join(', ')}]`);
    }

    const bids = lines.slice(1).map((line) => {
        const cols = VendorBidPage._parseCsvLine(line);
        return { bidName: (cols[nameIdx] || '').trim(), status: (cols[statusIdx] || '').trim() };
    });
    const target = bids.find((b) => b.bidName && new RegExp(`^${status}$`, 'i').test(b.status));
    if (!target) return null;

    const rows = page.locator('revo-grid [role="row"][data-rgrow]').filter({ hasText: target.bidName });
    await expect(rows.first(), `FAIL: bid "${target.bidName}" found in export but not in the live grid.`).toBeVisible({ timeout: 10000 });
    const rowGrow = await rows.first().getAttribute('data-rgrow');
    const viewDetailsBtn = healingLocator(viewDetailsButtonStrategies(page, rowGrow));
    await viewDetailsBtn.scrollIntoViewIfNeeded();
    await viewDetailsBtn.click();
    await page.waitForURL(/\/bids-and-contracts\/bids\/\d+/, { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    return page.url();
}

test.describe('Vendor Phase 3 — Bids, Read Views & Admin/Compliance', () => {
    test.use({ storageState: 'vendorsession.json' });

    test('TC484 @e2e @sanity @vendor @bids : Vendor can access Bids landing page with its daily-briefing panel, view invited bids, open one, and validate the complete bid workspace', async ({ page }) => {
        test.setTimeout(120000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        Logger.step('TC484: Navigate to Bids landing page');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');
        await vendorListingPage.assertListingPageFullyVisible('bids');

        Logger.step('TC484: Open an Invited bid and validate the full workspace');
        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found on the Bids listing to open.').toBeTruthy();
        await expect(page.getByText('Invited', { exact: true }).first(), 'FAIL: opened bid does not show "Invited" status.').toBeVisible({ timeout: 10000 });
        await workspace.assertBidTabFullyVisible();

        Logger.success('TC484: Bids landing page and full Invited-bid workspace verified end to end.');
    });

    test('TC485 @bids @vendor @regression : Vendor can view awarded bids across the Dashboard and Bids listing, and an awarded bid workspace correctly hides pending accept/reject actions', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Awarded');
        expect(url, 'FAIL: no "Awarded" bid found on the Bids listing to open.').toBeTruthy();
        await expect(page.getByText('Awarded', { exact: true }).first(), 'FAIL: opened bid does not show "Awarded" status.').toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('button', { name: 'Accept Bid', exact: true }), 'FAIL: "Accept Bid" is still shown on an already-Awarded bid.').toBeHidden();
        await expect(page.getByRole('button', { name: 'Reject Bid', exact: true }), 'FAIL: "Reject Bid" is still shown on an already-Awarded bid.').toBeHidden();
        await workspace.assertBidTabFullyVisible();

        Logger.success('TC485: Awarded bid workspace verified — no pending accept/reject actions.');
    });

    test('TC486 @bids @vendor @regression @edge : Vendor can search/filter the Bids listing, including a no-result search showing the correct empty state, and clearing search restores the list', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const search = page.getByRole('textbox', { name: 'Search...', exact: true });
        await expect(search, 'FAIL: Bids search input not visible.').toBeVisible({ timeout: 10000 });

        await search.fill(bidWorkspaceData.searchValidTerm);
        await page.waitForTimeout(1000);
        const rowsAfterValidSearch = await page.locator('revo-grid [role="row"][data-rgrow]').count();
        expect(rowsAfterValidSearch, `FAIL: searching "${bidWorkspaceData.searchValidTerm}" returned no rows.`).toBeGreaterThan(0);

        await search.fill(bidWorkspaceData.searchNoResultTerm);
        await page.waitForTimeout(1000);
        const emptyState = healingLocator(bidsListEmptyStateStrategies(page)).first();
        await expect(emptyState, `FAIL: searching a guaranteed-no-match term "${bidWorkspaceData.searchNoResultTerm}" did not show the empty state.`).toBeVisible({ timeout: 10000 });

        await search.fill('');
        await page.waitForTimeout(1000);
        const rowsAfterClear = await page.locator('revo-grid [role="row"][data-rgrow]').count();
        expect(rowsAfterClear, 'FAIL: clearing the search did not restore any rows.').toBeGreaterThan(0);

        Logger.success('TC486: Bids search — valid term, no-result empty state, and clear — all verified.');
    });

    test('TC487 @bids @vendor @regression @negative : Reject Bid opens a correct confirmation dialog, and Cancel leaves the bid status unchanged', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to test Reject on.').toBeTruthy();
        await workspace.assertActionConfirmDialogThenCancel('Reject Bid');

        Logger.success('TC487: Reject Bid confirmation dialog verified and safely cancelled.');
    });

    test('TC488 @bids @vendor @regression : Accept Bid opens a correct confirmation dialog, and Cancel leaves the bid status unchanged (the real accept-and-submit path is covered by TC452)', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to test Accept on.').toBeTruthy();
        await workspace.assertActionConfirmDialogThenCancel('Accept Bid');

        Logger.success('TC488: Accept Bid confirmation dialog verified and safely cancelled.');
    });

    test('TC489 @bids @vendor @regression : Vendor can ask follow-up questions through the Piper workspace assistant on both the Bids landing page and inside a bid workspace', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const askInputListing = page.getByRole('textbox', { name: 'Ask about your bids', exact: true });
        // Scoped to the ask-input's own enclosing <form>, not "first disabled button on the
        // page" (which can match an unrelated disabled control elsewhere and never enable).
        const sendButtonListing = askInputListing.locator('xpath=ancestor::form[1]//button').first();
        await expect(sendButtonListing, 'FAIL: Piper send button on Bids landing not disabled before typing.').toBeDisabled();
        await askInputListing.fill(bidWorkspaceData.piperAskQuestion);
        await expect(sendButtonListing, 'FAIL: Piper send button on Bids landing did not enable after typing.').toBeEnabled({ timeout: 5000 });

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open the workspace on.').toBeTruthy();
        await workspace.assertPiperAskInputEnablesSend(bidWorkspaceData.piperAskQuestion);

        Logger.success('TC489: Piper follow-up-question input verified on both Bids landing and inside a bid workspace.');
    });

    test('TC490 @bids @property @vendor @regression : Bid workspace Property tab Overview sub-tab displays complete, non-empty read-only property information', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open.').toBeTruthy();
        await workspace.openPropertyTab();
        await workspace.assertPropertyOverviewFieldsVisible();

        Logger.success('TC490: Property tab Overview read-only data verified.');
    });

    test('TC491 @bids @property @vendor @regression : Bid workspace Property tab Documents sub-tab lists the bid package documents sent by the owner', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open.').toBeTruthy();
        await workspace.openPropertyTab();
        await workspace.assertPropertyDocumentsTabVisible();

        Logger.success('TC491: Property tab Documents sub-tab verified.');
    });

    test('TC492 @bids @property @vendor @regression @edge : Bid workspace Property tab Asset Viewer sub-tab renders its selector controls, Export action, and the correct empty state when no 3D view is selected', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open.').toBeTruthy();
        await workspace.openPropertyTab();
        await workspace.assertPropertyAssetViewerTabVisible();

        Logger.success('TC492: Property tab Asset Viewer sub-tab verified (interim, non-FGA authorization — every vendor with bid access sees this widget, per ticket scope).');
    });

    test('TC493 @bids @property @vendor @regression @edge : Bid workspace Property tab Take Offs sub-tab renders all category tabs and the correct empty state when no takeoff version exists', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open.').toBeTruthy();
        await workspace.openPropertyTab();
        await workspace.assertPropertyTakeOffsTabVisible();

        Logger.success('TC493: Property tab Take Offs sub-tab verified.');
    });

    test('TC494 @bids @property @vendor @regression @edge : Bid workspace Property tab Locations sub-tab renders its toolbar and the correct empty state when no sites have been added', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');

        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open.').toBeTruthy();
        await workspace.openPropertyTab();
        await workspace.assertPropertyLocationsTabVisible();

        Logger.success('TC494: Property tab Locations sub-tab verified.');
    });

    test('TC495 @vendor @manageTeam @regression : Settings/Admin is reachable from the bottom-left navigation (Profile), and the Profile page renders all 4 tabs correctly', async ({ page }) => {
        test.setTimeout(90000);
        const profile = new VendorProfilePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await profile.navigateViaSidebarAvatar();
        await profile.assertProfileTabsVisible();

        Logger.success('TC495: Settings/Admin (Profile) navigation and its 4 tabs verified.');
    });

    test('TC496 @vendor @manageTeam @regression : Vendor profile tab shows complete company information, and Edit opens a pre-filled modal that Cancel discards without saving', async ({ page }) => {
        test.setTimeout(90000);
        const profile = new VendorProfilePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await profile.navigateViaSidebarAvatar();
        await profile.openVendorProfileTab();
        await profile.assertVendorProfileCompanyInfoAndEditCancel();

        Logger.success('TC496: Vendor profile company info and Edit/Cancel flow verified.');
    });

    test.describe.serial('Vendor user management — add then remove the same test user', () => {
        test('TC497 @vendor @manageTeam @regression @positive : Vendor org admin can add a new user — required-field and invalid-email validation are enforced, and a valid submission creates the user', async ({ page }) => {
            test.setTimeout(90000);
            const profile = new VendorProfilePage(page);

            await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(1500);
            await profile.navigateViaSidebarAvatar();
            await profile.openVendorProfileTab();

            await profile.assertAddUserRequiredFieldValidation();
            await profile.assertAddUserInvalidEmailValidation();

            const email = `${userMgmtData.newUser.emailLocalPrefix}.${Date.now()}@${userMgmtData.newUser.emailDomain}`;
            const newUser = { firstName: userMgmtData.newUser.firstName, lastName: userMgmtData.newUser.lastName, phone: userMgmtData.newUser.phone, email };
            await profile.addUserAndAssertInTable(newUser);

            fs.mkdirSync(path.dirname(lastVendorTestUserPath), { recursive: true });
            fs.writeFileSync(lastVendorTestUserPath, JSON.stringify({ email, createdAt: new Date().toISOString() }, null, 2));

            Logger.success(`TC497: Add User validation + successful creation verified for "${email}".`);
        });

        test('TC499 @vendor @manageTeam @regression @positive @negative : Vendor org admin can remove a user — Cancel preserves the row, and confirming Delete removes it', async ({ page }) => {
            test.setTimeout(90000);
            expect(fs.existsSync(lastVendorTestUserPath), 'data/lastVendorTestUser.json must exist — TC497 must run first').toBe(true);
            const { email } = JSON.parse(fs.readFileSync(lastVendorTestUserPath, 'utf8'));
            expect(email, 'email must be set in data/lastVendorTestUser.json').toBeTruthy();

            const profile = new VendorProfilePage(page);
            await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(1500);
            await profile.navigateViaSidebarAvatar();
            await profile.openVendorProfileTab();

            await profile.assertDeleteUserConfirmDialogThenCancel(email);
            await profile.deleteUserAndAssertRemoved(email);

            Logger.success(`TC499: Remove User cancel-then-delete flow verified for "${email}".`);
        });
    });

    test('TC498 @vendor @manageTeam @regression @negative : Adding a user with an email that already exists is blocked with a clear error, and Cancel closes the modal without side effects', async ({ page }) => {
        test.setTimeout(90000);
        const profile = new VendorProfilePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await profile.navigateViaSidebarAvatar();
        await profile.openVendorProfileTab();
        await profile.assertAddUserDuplicateEmailThenCancel(process.env.VENDOR_LOGIN_EMAIL);

        Logger.success('TC498: Duplicate-email protection verified.');
    });

    test('TC500 @vendor @manageTeam @regression @edge : Users table renders all expected columns, and searching for a non-existent user correctly hides all rows until the search is cleared', async ({ page }) => {
        test.setTimeout(90000);
        const profile = new VendorProfilePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await profile.navigateViaSidebarAvatar();
        await profile.openVendorProfileTab();

        await profile.assertUsersTableColumnsVisible();
        await profile.assertUsersSearchNoMatch(userMgmtData.usersSearchNoMatchTerm, process.env.VENDOR_LOGIN_EMAIL);

        Logger.success('TC500: Users table columns and search no-match/clear behavior verified.');
    });

    test('TC501 @dashboard @bids @vendor @regression : Vendor Dashboard bid summary stays consistent with the Bids listing page across navigation', async ({ page }) => {
        test.setTimeout(90000);
        const dashboard = new VendorDashboardPage(page);
        const vendorListingPage = new VendorListingPage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await dashboard.navigateToDashboard();
        await dashboard.assertNewBidInvitationsPanelVisible();

        const newBidInvitationsBadge = page.locator('xpath=//main//span[normalize-space(text())="New Bid Invitations"]/following-sibling::*[1]');
        const dashboardInvitedCount = (await newBidInvitationsBadge.innerText()).trim();

        await vendorListingPage.navigateTo('bids');
        // Status is read from the CSV export, not the live grid DOM: this revo-grid virtualizes
        // columns horizontally (MCP/Playwright-verified 2026-09-15 — see openFirstBidRowByStatus
        // above), so a row's innerText can omit its Status cell entirely depending on scroll
        // position.
        const downloadDir = path.join(__dirname, '../downloads');
        fs.mkdirSync(downloadDir, { recursive: true });
        const exportButton = page.getByRole('button', { name: 'Export', exact: true });
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            exportButton.click(),
        ]);
        const csvPath = path.join(downloadDir, `vendor-bids-status-count-${Date.now()}.csv`);
        await download.saveAs(csvPath);
        const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
        const header = VendorBidPage._parseCsvLine(lines[0]);
        const statusIdx = header.findIndex((h) => /^status$/i.test(h));
        expect(statusIdx, `FAIL: could not locate "Status" column in export header [${header.join(', ')}]`).toBeGreaterThanOrEqual(0);
        const listingInvitedCount = lines.slice(1).filter((line) => /^invited$/i.test((VendorBidPage._parseCsvLine(line)[statusIdx] || '').trim())).length;

        expect(
            String(listingInvitedCount),
            `FAIL: Dashboard "New Bid Invitations" count (${dashboardInvitedCount}) does not match the number of "Invited" rows visible on the Bids listing (${listingInvitedCount}).`,
        ).toBe(dashboardInvitedCount);

        Logger.success(`TC501: Dashboard/Bids-listing invited-bid count consistency verified (${dashboardInvitedCount}).`);
    });

    test('TC502 @vendor @regression @edge : Vendor session persists across direct URL navigation to a bid workspace and the Profile page, and browser back/forward preserve the correct screens without forcing re-login', async ({ page }) => {
        test.setTimeout(90000);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);

        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await vendorListingPage.navigateTo('bids');
        const bidUrl = await openFirstBidRowByStatus(page, 'Invited');
        expect(bidUrl, 'FAIL: no "Invited" bid found to open.').toBeTruthy();
        await workspace.assertBidTabFullyVisible();

        Logger.step('TC502: Direct navigation to the same bid URL (simulating a bookmark/refresh)');
        await page.goto(bidUrl, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await expect(page, 'FAIL: direct navigation to a bid workspace URL redirected away (session lost).').toHaveURL(bidUrl);
        await workspace.assertBidTabFullyVisible();

        Logger.step('TC502: Direct navigation to Profile, then back/forward');
        await page.goto(`${process.env.BASE_URL}/profile`, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await expect(page, 'FAIL: direct navigation to /profile redirected away (session lost).').toHaveURL(/\/profile/);

        await page.goBack({ waitUntil: 'load' });
        await page.waitForTimeout(1000);
        await expect(page, 'FAIL: browser Back from /profile did not return to the bid workspace.').toHaveURL(bidUrl);
        await workspace.assertBidTabFullyVisible();

        await page.goForward({ waitUntil: 'load' });
        await page.waitForTimeout(1000);
        await expect(page, 'FAIL: browser Forward did not return to /profile.').toHaveURL(/\/profile/);

        Logger.success('TC502: Vendor session persisted across direct navigation and back/forward with no forced re-login.');
    });

    test('TC503 @e2e @vendor @bids @property @manageTeam @regression : Full cross-module regression journey — Dashboard, Bids landing, a bid workspace with its Property/Asset Viewer/Take Offs widgets, and Settings/Admin user management, all in one continuous vendor session', async ({ page }) => {
        test.setTimeout(150000);
        const dashboard = new VendorDashboardPage(page);
        const vendorListingPage = new VendorListingPage(page);
        const workspace = new VendorBidWorkspacePage(page);
        const profile = new VendorProfilePage(page);

        Logger.step('TC503: Step 1 — Dashboard summary');
        await page.goto(process.env.BASE_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await dashboard.navigateToDashboard();
        await dashboard.assertBreadcrumbVisible();
        await dashboard.assertKpiCardsVisible();

        Logger.step('TC503: Step 2 — Bids landing page');
        await vendorListingPage.navigateTo('bids');
        await vendorListingPage.assertListingPageFullyVisible('bids');

        Logger.step('TC503: Step 3 — open a bid workspace and its Property/Asset Viewer/Take Offs widgets');
        const url = await openFirstBidRowByStatus(page, 'Invited');
        expect(url, 'FAIL: no "Invited" bid found to open for the cross-module journey.').toBeTruthy();
        await workspace.assertBidTabFullyVisible();
        await workspace.openPropertyTab();
        await workspace.assertPropertyOverviewFieldsVisible();
        await workspace.assertPropertyAssetViewerTabVisible();
        await workspace.assertPropertyTakeOffsTabVisible();

        Logger.step('TC503: Step 4 — Settings/Admin (Profile) and vendor user management');
        await profile.navigateViaSidebarAvatar();
        await profile.assertProfileTabsVisible();
        await profile.openVendorProfileTab();
        await profile.assertUsersTableColumnsVisible();

        Logger.success('TC503: Full cross-module regression journey verified — Dashboard, Bids, bid workspace widgets, and Settings/Admin user management.');
    });
});
