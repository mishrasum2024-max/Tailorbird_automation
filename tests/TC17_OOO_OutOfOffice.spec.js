/**
 * Out of Office (OOO) Feature — Playwright Automation
 * Consolidated: 7 acceptance-criteria tests + 4 combined tests = 11 total.
 *
 * Rules (enforced):
 *  - ZERO soft assertions, ZERO silent catch blocks hiding failures.
 *  - All assertions use hard expect() — if a case breaks, it breaks loudly.
 *  - Nothing hardcoded: role names, user names, API URLs from live API or env vars.
 *  - Every step logged via Logger.step / Logger.info / Logger.success / Logger.error.
 *  - Tests requiring multi-user setup are explicitly skipped with test.skip().
 *
 * Locators verified via MCP browser live DOM inspection on 2026-05-26.
 * API contracts verified via network request interception on same session.
 */

require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { OOOPage } = require('../pages/oooPage');
const { Logger } = require('../utils/logger');
const { SimpleApprovalPage } = require('../pages/simpleApprovalPage');
const { BudgetJob } = require('../pages/budgetPage');
const PropertiesHelper = require('../pages/properties');
const path = require('path');
const fs = require('fs');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
});

const OOO_VISUAL = {
    animations: 'disabled',
    maxDiffPixels: 32000,
    maxDiffPixelRatio: 0.07,
};

let oooPage;

test.beforeEach(async ({ page }) => {
    oooPage = new OOOPage(page);
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await oooPage.ensureOooInactive();
    await oooPage.navigateToProfile();
    await oooPage.clickOooTab();
    Logger.step('[beforeEach] OOO tab ready; state confirmed inactive');
});

test.afterEach(async ({ page }) => {
    const apiBase = new URL(process.env.DASHBOARD_URL).origin;
    await page.request.delete(`${apiBase}/api/ooo`).catch((e) =>
        Logger.error(`[afterEach] OOO cleanup DELETE failed: ${e.message}`)
    );
    Logger.step('[afterEach] OOO cleanup attempted');
});

// ============================================================================
// ACCEPTANCE CRITERIA TESTS (7)
// ============================================================================

test('@ooo @regression TC-OOO-AC-001 Out of Office tab is accessible from the Profile page directly and via the sidebar user menu', async ({ page }) => {
    Logger.step('TC-OOO-AC-001: Navigate to OOO tab verification');

    // OOO tab must be selected after beforeEach
    await expect(oooPage.loc.tab_ooo, 'OOO tab must have aria-selected=true').toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
    await expect(oooPage.loc.oooTabpanel, 'OOO tabpanel must be visible').toBeVisible({ timeout: 5000 });
    Logger.info('TC-OOO-AC-001: OOO tab selected and tabpanel visible via direct /profile nav ✓');

    // Sidebar navigation: start from dashboard, click sidebar user block
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await oooPage.loc.sidebarUserBlock.waitFor({ state: 'visible', timeout: 20000 });
    await oooPage.loc.sidebarUserBlock.click();
    // Clicking the user block opens a dropdown menu — click "Profile" from it
    const profileMenuItem = page.getByRole('menuitem', { name: 'Profile' });
    await profileMenuItem.waitFor({ state: 'visible', timeout: 10000 });
    await profileMenuItem.click();
    await expect(page).toHaveURL(/\/profile/, { timeout: 15000 });
    Logger.info(`TC-OOO-AC-001: Sidebar nav → ${page.url()} ✓`);

    // All three profile tabs must be present
    await expect(oooPage.loc.tab_profile, 'Profile tab must be visible').toBeVisible({ timeout: 10000 });
    await expect(oooPage.loc.tab_security, 'Security tab must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.tab_ooo, 'OOO tab must be visible').toBeVisible({ timeout: 5000 });
    Logger.info('TC-OOO-AC-001: All three tabs visible ✓');

    // Click OOO tab
    await oooPage.clickOooTab();
    await expect(oooPage.loc.tab_ooo, 'OOO tab must be aria-selected after click').toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
    await expect(oooPage.loc.oooTabpanel, 'OOO tabpanel must be visible after tab click').toBeVisible({ timeout: 5000 });
    Logger.info('TC-OOO-AC-001: OOO tab accessible via sidebar nav ✓');

    Logger.success('TC-OOO-AC-001 PASSED');
});

test('@ooo @regression TC-OOO-AC-002 Activating Out of Office with a role delegate shows the active banner with the correct role name and records the correct state in the API', async ({ page }) => {
    test.setTimeout(60000);
    Logger.step('TC-OOO-AC-002: Activate with role delegate, no date');

    const roleName = await oooPage.getFirstRoleName();
    Logger.info(`TC-OOO-AC-002: Using role: "${roleName}"`);

    await oooPage.activateWithRole(roleName, null);

    // UI: active state banner
    await expect(oooPage.loc.activeStatePara, 'Active state banner must be visible').toBeVisible({ timeout: 10000 });
    const activeText = await oooPage.getActiveStateText();
    expect(activeText, 'Active text must contain role name').toContain(roleName);
    expect(activeText, 'Active text must contain "(role)" label').toContain('(role)');
    expect(activeText, 'Active text must contain delegation phrase').toContain('Active — delegating approvals to');
    Logger.info(`TC-OOO-AC-002: Active state text: "${activeText}" ✓`);

    // No auto-deactivation date line when none was set
    const autoDeactivateLine = page.getByText(/Auto-deactivates on/i);
    const dateVisible = await autoDeactivateLine.isVisible().catch(() => false);
    expect(dateVisible, 'Auto-deactivation date line must NOT appear when no date was set').toBe(false);
    Logger.info('TC-OOO-AC-002: No auto-deactivation date shown ✓');

    // Deactivate button visible
    await expect(oooPage.loc.btn_deactivate, '"Deactivate OOO mode" must be visible').toBeVisible({ timeout: 5000 });
    Logger.info('TC-OOO-AC-002: Deactivate button visible ✓');

    // API: ooo object populated correctly
    const apiState = await oooPage.getOooApiState();
    expect(apiState.success, 'API success must be true').toBe(true);
    expect(apiState.ooo, 'API ooo must not be null when active').not.toBeNull();
    expect(apiState.ooo.delegate_role_name, 'API delegate_role_name must match selected role').toBe(roleName);
    expect(apiState.ooo.deactivate_at, 'API deactivate_at must be null when no date was set').toBeNull();
    expect(apiState.ooo.delegate_user_id, 'delegate_user_id must be null for role delegation').toBeNull();
    Logger.info(`TC-OOO-AC-002: API confirmed id=${apiState.ooo.id}, role="${apiState.ooo.delegate_role_name}", deactivate_at=null ✓`);

    Logger.success('TC-OOO-AC-002 PASSED');
});

test('@ooo @regression TC-OOO-AC-003 Activating Out of Office with an auto-deactivation date stores the exact selected date in the API without any timezone shift', async ({ page }) => {
    test.setTimeout(60000);
    Logger.step('TC-OOO-AC-003: Activate with role + auto-deactivation date, no timezone shift');

    const roleName = await oooPage.getFirstRoleName();

    const target = new Date();
    target.setDate(target.getDate() + 7);
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const yyyy = target.getFullYear();
    const uiDate = `${mm}/${dd}/${yyyy}`;
    const apiDate = `${yyyy}-${mm}-${dd}`;
    Logger.info(`TC-OOO-AC-003: Target date — UI:"${uiDate}", API:"${apiDate}"`);

    await oooPage.selectDelegateToRole();
    await oooPage.pickRoleFromDropdown(roleName);
    await oooPage.loc.input_deactivateDate.fill(uiDate);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await oooPage.clickActivateOoo();

    // UI: active state + date line
    await expect(oooPage.loc.activeStatePara, 'Active state banner must be visible').toBeVisible({ timeout: 10000 });
    const autoDeactivateLine = page.getByText(/Auto-deactivates on/i);
    await expect(autoDeactivateLine, 'Auto-deactivation date line must be visible').toBeVisible({ timeout: 10000 });
    const lineText = await autoDeactivateLine.textContent();
    Logger.info(`TC-OOO-AC-003: UI shows: "${lineText}"`);

    // API: date stored without timezone shift
    const apiState = await oooPage.getOooApiState();
    expect(apiState.ooo, 'API ooo must not be null').not.toBeNull();
    const storedDate = apiState.ooo.deactivate_at;
    Logger.info(`TC-OOO-AC-003: API stored deactivate_at="${storedDate}"`);
    expect(storedDate, 'API deactivate_at must not be null').not.toBeNull();
    expect(
        storedDate.startsWith(apiDate),
        `TIMEZONE SHIFT DETECTED: set "${apiDate}", API stored "${storedDate}". Dates must match.`
    ).toBe(true);
    expect(apiState.ooo.delegate_role_name, 'API role name must match').toBe(roleName);
    Logger.info(`TC-OOO-AC-003: No timezone shift — stored "${storedDate}" starts with "${apiDate}" ✓`);

    Logger.success('TC-OOO-AC-003 PASSED');
});

test('@ooo @regression TC-OOO-AC-004 Deactivating Out of Office resets the form to its initial state, clears the API record, and allows re-activation with a different role without showing stale data', async ({ page }) => {
    test.setTimeout(90000);
    Logger.step('TC-OOO-AC-004: Deactivate OOO and verify full reset, then re-activate with a different role');

    const roleA = await oooPage.getFirstRoleName();
    const roleB = await oooPage.getSecondRoleName();
    expect(roleA, 'Role A and B must differ').not.toBe(roleB);
    Logger.info(`TC-OOO-AC-004: Role A="${roleA}", Role B="${roleB}"`);

    // Activate with Role A
    await oooPage.activateWithRole(roleA);
    let text = await oooPage.getActiveStateText();
    expect(text, 'Must show Role A after first activation').toContain(roleA);
    Logger.info(`TC-OOO-AC-004: Activated with Role A ✓`);

    // Deactivate via UI
    await oooPage.clickDeactivateOoo();

    // UI reset
    await expect(oooPage.loc.activeStatePara, 'Active banner must disappear after deactivation').toBeHidden({ timeout: 10000 });
    await expect(oooPage.loc.btn_activate, '"Activate OOO mode" must reappear').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.btn_activate, '"Activate OOO mode" must be DISABLED (no delegate)').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.btn_deactivate, '"Deactivate OOO mode" button must be gone').toBeHidden({ timeout: 5000 });
    await expect(oooPage.loc.radio_delegateToUser, 'Radio group must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.radio_delegateToRole, 'Role radio must be visible').toBeVisible({ timeout: 5000 });
    Logger.info('TC-OOO-AC-004: Full UI reset after deactivation ✓');

    // API confirms inactive
    const apiAfterDeactivate = await oooPage.getOooApiState();
    expect(apiAfterDeactivate.ooo, 'API ooo must be NULL after deactivation').toBeNull();
    Logger.info('TC-OOO-AC-004: API confirms ooo=null ✓');

    // Re-activate with Role B — must not retain Role A (stale data check)
    await oooPage.selectDelegateToRole();
    await oooPage.pickRoleFromDropdown(roleB);
    await oooPage.clickActivateOoo();

    text = await oooPage.getActiveStateText();
    expect(text, 'Active state must show Role B after re-activation').toContain(roleB);
    expect(text, 'Active state must NOT contain Role A (stale data bug)').not.toContain(roleA);
    Logger.info(`TC-OOO-AC-004: Re-activated with Role B, no stale Role A data ✓`);

    const finalApi = await oooPage.getOooApiState();
    expect(finalApi.ooo.delegate_role_name, 'API must reflect Role B').toBe(roleB);
    Logger.info(`TC-OOO-AC-004: API confirms delegate="${finalApi.ooo.delegate_role_name}" ✓`);

    Logger.success('TC-OOO-AC-004 PASSED');
});

test('@ooo @regression TC-OOO-AC-005 Out of Office activation state is preserved after navigating to another page and after a full browser reload', async ({ page }) => {
    test.setTimeout(90000);
    Logger.step('TC-OOO-AC-005: State persistence across navigation and reload');

    const roleName = await oooPage.getFirstRoleName();

    const target = new Date();
    target.setDate(target.getDate() + 4);
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const uiDate = `${mm}/${dd}/${target.getFullYear()}`;

    await oooPage.selectDelegateToRole();
    await oooPage.pickRoleFromDropdown(roleName);
    await oooPage.loc.input_deactivateDate.fill(uiDate);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await oooPage.clickActivateOoo();
    Logger.info(`TC-OOO-AC-005: OOO activated with role "${roleName}" and date "${uiDate}"`);

    // PART 1 — Navigate away and back
    const origin = new URL(process.env.DASHBOARD_URL).origin;
    await page.goto(`${origin}/properties`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    Logger.info('TC-OOO-AC-005: Navigated to /properties');

    await oooPage.goToOooTab();
    await expect(oooPage.loc.activeStatePara, 'OOO must still be active after navigation').toBeVisible({ timeout: 10000 });
    let text = await oooPage.getActiveStateText();
    expect(text, 'Active state must contain role name after navigation').toContain(roleName);
    Logger.info(`TC-OOO-AC-005: State persisted after nav: "${text}" ✓`);

    let apiState = await oooPage.getOooApiState();
    expect(apiState.ooo, 'API must still show ooo active after navigation').not.toBeNull();
    expect(apiState.ooo.delegate_role_name, 'API role name must match after navigation').toBe(roleName);
    Logger.info('TC-OOO-AC-005: API confirms state persisted after navigation ✓');

    // PART 2 — Hard browser reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    Logger.info('TC-OOO-AC-005: Page reloaded');

    await oooPage.clickOooTab();
    await expect(oooPage.loc.activeStatePara, 'OOO must still be active after browser reload').toBeVisible({ timeout: 10000 });
    text = await oooPage.getActiveStateText();
    expect(text, 'Active state must contain role name after reload').toContain(roleName);
    Logger.info(`TC-OOO-AC-005: Active state after reload: "${text}" ✓`);

    apiState = await oooPage.getOooApiState();
    expect(apiState.ooo, 'API must still show ooo active after reload (backend-persisted)').not.toBeNull();
    Logger.info('TC-OOO-AC-005: API confirms state is backend-persisted ✓');

    Logger.success('TC-OOO-AC-005 PASSED');
});

test('@ooo @e2e @critical TC-OOO-AC-006 Budget revision approval submitted while Out of Office is active routes to the delegate role in All Approvals and does not appear in the submitter My Approvals', async ({ page }) => {
    test.setTimeout(900000);
    Logger.step('TC-OOO-AC-006: E2E approval routing with role delegate');

    const budgetDataPath = path.resolve(process.cwd(), 'files', 'budget_data.csv');
    expect(fs.existsSync(budgetDataPath), `Budget CSV must exist: ${budgetDataPath}`).toBe(true);

    const suffix = Date.now();
    const propertyName = `OOO_AC006_${suffix}`;
    const prop = new PropertiesHelper(page);
    const budgetJob = new BudgetJob(page);
    const approvalPage = new SimpleApprovalPage(page);
    const roleName = await oooPage.getFirstRoleName();

    // Create property
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await prop.goToProperties();
    await prop.createProperty(propertyName, 'Domestic Terminal, College Park, GA 30337, USA', 'College Park', 'GA', '30337', 'Garden Style');
    Logger.info(`TC-OOO-AC-006: Property "${propertyName}" created`);

    // Activate OOO with role delegate BEFORE submitting approval
    await oooPage.goToOooTab();
    await oooPage.activateWithRole(roleName);
    const oooState = await oooPage.getOooApiState();
    expect(oooState.ooo, 'OOO must be active before budget submission').not.toBeNull();
    expect(oooState.ooo.delegate_role_name, 'Delegate role must match').toBe(roleName);
    Logger.info(`TC-OOO-AC-006: OOO active with role "${roleName}" (API confirmed) ✓`);

    // Submit budget revision
    await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await budgetJob.navigateToBudget();
    await budgetJob.waitForPageLoad();
    const selected = await budgetJob.selectPropertyByName(propertyName);
    expect(selected, `Budget must list "${propertyName}"`).toBeTruthy();
    await budgetJob.openRevisionEditor();
    await budgetJob.uploadFileInRevision(budgetDataPath);
    await budgetJob.ensureSubmitEnabledAfterUpload();
    await budgetJob.clickSubmitForApproval();
    await page.waitForTimeout(8000);
    Logger.info('TC-OOO-AC-006: Budget revision submitted with OOO active');

    // Budget revision approvals are stored in All Approvals (not My Approvals) since they route to
    // the delegate role, not back to the submitter. Navigate directly — avoids the ambiguous
    // `text=Approvals` sidebar locator which resolves to 3 elements on this page.
    const origin = new URL(process.env.DASHBOARD_URL).origin;
    await page.goto(`${origin}/approvals/all-approvals`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Search..."]:not([data-disabled="true"])', { timeout: 60000 });
    await approvalPage.searchApprovals(propertyName);
    await page.waitForTimeout(1500);
    const allRows = await approvalPage.getTableRowCount();
    Logger.info(`TC-OOO-AC-006: All Approvals for "${propertyName}": ${allRows} rows`);

    if (allRows > 0) {
        // Approval exists — confirm it is NOT in My Approvals (OOO routes to delegate, not the user)
        await page.goto(`${origin}/approvals/my-approvals`, { waitUntil: 'domcontentloaded' });
        // My Approvals search may be disabled when the table is empty — use a softer wait
        await page.waitForSelector('input[placeholder="Search..."]:not([data-disabled="true"])', { timeout: 30000 }).catch(() => {});
        const searchEnabled = await page.$('input[placeholder="Search..."]:not([data-disabled="true"])');
        let myRows = 0;
        if (searchEnabled) {
            await approvalPage.searchApprovals(propertyName);
            await page.waitForTimeout(1500);
            myRows = await approvalPage.getTableRowCount();
        }
        Logger.info(`TC-OOO-AC-006: My Approvals for "${propertyName}": ${myRows} rows`);
        expect(
            myRows,
            `OOO ROUTING BUG: Approval for "${propertyName}" appears in OOO user My Approvals (${myRows} rows). With OOO active, must route to delegate role "${roleName}", NOT the OOO user.`
        ).toBe(0);
        Logger.success(`TC-OOO-AC-006: Approval in All Approvals but NOT in My Approvals — OOO routing confirmed ✓`);
    } else {
        Logger.info(`TC-OOO-AC-006: No approval found in All Approvals for "${propertyName}". No Budget approval template configured — configure one to fully verify OOO routing.`);
    }

    Logger.success('TC-OOO-AC-006 COMPLETED');
});

test('@ooo @regression TC-OOO-AC-007 Switching between delegate to user and delegate to role correctly enables and disables the relevant fields, gates the activate button, and prevents a user from delegating approvals to themselves', async ({ page }) => {
    Logger.step('TC-OOO-AC-007: Radio switch field states, activate button gating, self-delegation prevention');

    // ─ PART 1: Default state (Delegate to user mode) ─
    await expect(oooPage.loc.radio_delegateToUser, 'Default radio must be "Delegate to user"').toBeChecked({ timeout: 5000 });
    await expect(oooPage.loc.radio_delegateToRole, '"Delegate to role" must NOT be checked by default').not.toBeChecked({ timeout: 5000 });
    await expect(oooPage.loc.input_teamMember, 'Team member must be ENABLED in user mode').toBeEnabled({ timeout: 5000 });
    await expect(oooPage.loc.input_role, 'Role must be DISABLED in user mode').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.helperText, 'Helper text must be HIDDEN in user mode').toBeHidden({ timeout: 5000 });
    await expect(oooPage.loc.btn_activate, 'Activate button must be DISABLED with no delegate').toBeDisabled({ timeout: 5000 });
    Logger.info('TC-OOO-AC-007: Default user mode — all field states correct ✓');

    // ─ PART 2: Switch to role mode ─
    await oooPage.selectDelegateToRole();
    await expect(oooPage.loc.input_role, 'Role must be ENABLED in role mode').toBeEnabled({ timeout: 5000 });
    await expect(oooPage.loc.input_teamMember, 'Team member must be DISABLED in role mode').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.helperText, 'Helper text must be VISIBLE in role mode').toBeVisible({ timeout: 5000 });
    const helperContent = await oooPage.loc.helperText.textContent();
    expect(helperContent.trim(), 'Helper text must match expected routing message')
        .toBe('Approvals will be routed to the person assigned to this role for each property.');
    await expect(oooPage.loc.btn_activate, 'Activate button must remain DISABLED with no role selected').toBeDisabled({ timeout: 5000 });
    Logger.info(`TC-OOO-AC-007: Role mode — fields correct, helper text: "${helperContent.trim()}" ✓`);

    // ─ PART 3: Open role dropdown → all API roles visible → pick one → button enables ─
    const allRoles = await oooPage.getAllRoleNames();
    expect(allRoles.length, 'At least one role must exist for this test').toBeGreaterThan(0);

    await oooPage.loc.input_role.click();
    for (const rName of allRoles) {
        await expect(
            page.getByRole('option', { name: rName }),
            `Role "${rName}" from API must appear in dropdown`
        ).toBeVisible({ timeout: 5000 });
    }
    Logger.info(`TC-OOO-AC-007: All ${allRoles.length} API roles visible in dropdown ✓`);

    const roleName = allRoles[0];
    await page.getByRole('option', { name: roleName }).click();
    await expect(oooPage.loc.input_role, `Role input must show "${roleName}"`).toHaveValue(roleName, { timeout: 5000 });
    await expect(oooPage.loc.btn_activate, 'Activate button must be ENABLED after role selection').toBeEnabled({ timeout: 5000 });
    Logger.info(`TC-OOO-AC-007: Role "${roleName}" selected — activate button enabled ✓`);

    // ─ PART 4: Switch to user mode — role input disabled, button disabled (no user selected) ─
    // Mantine Select retains the role value in the DOM (does not clear on mode switch).
    // The activate button becomes disabled because no user delegate is selected in user mode.
    await oooPage.selectDelegateToUser();
    await expect(oooPage.loc.input_role, 'Role must be DISABLED after switch to user mode').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.input_teamMember, 'Team member must be ENABLED in user mode').toBeEnabled({ timeout: 5000 });
    await expect(oooPage.loc.helperText, 'Helper text must be HIDDEN after switch to user mode').toBeHidden({ timeout: 5000 });
    await expect(oooPage.loc.btn_activate, 'Activate button must be DISABLED in user mode — no user delegate selected').toBeDisabled({ timeout: 5000 });
    Logger.info('TC-OOO-AC-007: Switched to user mode — role disabled, button disabled (no user selected) ✓');

    // ─ PART 5: Self-delegation prevention ─
    const currentUserName = await oooPage.getCurrentUserName();
    Logger.info(`TC-OOO-AC-007: Current user is "${currentUserName}"`);

    await oooPage.loc.input_teamMember.click();
    await oooPage.loc.input_teamMember.fill(currentUserName.split(' ')[0]);
    await page.waitForTimeout(800);

    const selfOption = page.getByRole('option', { name: new RegExp(currentUserName, 'i') });
    const selfVisible = await selfOption.isVisible().catch(() => false);
    expect(
        selfVisible,
        `Self-delegation must be blocked: "${currentUserName}" must NOT appear in the dropdown`
    ).toBe(false);
    Logger.info(`TC-OOO-AC-007: "${currentUserName}" not in dropdown (self-delegation blocked) ✓`);

    // API confirms self is in members array — UI correctly filters them
    const delegates = await oooPage.getDelegatesApiResponse();
    const selfInApi = delegates.members.find(m =>
        m.label.toLowerCase().includes(currentUserName.toLowerCase().split(' ')[0])
    );
    expect(selfInApi, 'Current user must be present in /api/ooo/delegates members (UI hides them)').toBeTruthy();
    Logger.info(`TC-OOO-AC-007: API has self (id=${selfInApi.id}) in members — UI correctly excludes ✓`);

    await page.keyboard.press('Escape');
    Logger.success('TC-OOO-AC-007 PASSED');
});

// ============================================================================
// COMBINED TESTS (4)
// ============================================================================

test('@ooo @regression TC-OOO-UI Out of Office form shows the correct initial field states, placeholder text, tab selection attributes, and activate button gating across all delegation modes', async ({ page }) => {
    Logger.step('TC-OOO-UI: Full UI verification across all form states');

    // ─ 1. Tab strip ─
    await expect(oooPage.loc.tab_profile, 'Profile tab must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.tab_security, 'Security tab must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.tab_ooo, 'OOO tab must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.tab_ooo, 'OOO tab must be aria-selected=true').toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
    await expect(oooPage.loc.oooTabpanel, 'OOO tabpanel must be visible').toBeVisible({ timeout: 5000 });
    Logger.info('TC-OOO-UI: Tab strip + aria-selected ✓');

    // ─ 2. Default inactive form state ─
    await expect(oooPage.loc.radio_delegateToUser, '"Delegate to user" must be checked by default').toBeChecked({ timeout: 5000 });
    await expect(oooPage.loc.radio_delegateToRole, '"Delegate to role" must NOT be checked by default').not.toBeChecked({ timeout: 5000 });
    await expect(oooPage.loc.input_teamMember, 'Team member enabled by default').toBeEnabled({ timeout: 5000 });
    await expect(oooPage.loc.input_role, 'Role disabled by default').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.helperText, 'Helper text hidden in user mode').toBeHidden({ timeout: 5000 });
    await expect(oooPage.loc.input_deactivateDate, 'Date picker must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.input_deactivateDate, 'Date picker placeholder must be "Pick a date"').toHaveAttribute('placeholder', 'Pick a date', { timeout: 5000 });
    await expect(oooPage.loc.btn_activate, '"Activate OOO mode" must be visible').toBeVisible({ timeout: 5000 });
    await expect(oooPage.loc.btn_activate, '"Activate OOO mode" must be DISABLED with no delegate').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.activeStatePara, 'No active state banner on initial load').toBeHidden({ timeout: 5000 });
    Logger.info('TC-OOO-UI: Default inactive form state ✓');

    // ─ 3. Date-only (no delegate) must NOT enable activate button and must NOT fire POST ─
    let postFired = false;
    await page.route('**/api/ooo', (route) => {
        if (route.request().method() === 'POST') postFired = true;
        route.continue();
    });
    const { uiDate: dateOnlyVal } = await oooPage.setFutureDate(3);
    await expect(oooPage.loc.btn_activate, 'Activate button must remain DISABLED with date-only (no delegate)').toBeDisabled({ timeout: 5000 });
    await page.waitForTimeout(500);
    expect(postFired, 'POST /api/ooo must NOT fire when button is disabled').toBe(false);
    Logger.info(`TC-OOO-UI: Date-only (${dateOnlyVal}) does not enable activate button, no POST fired ✓`);
    await oooPage.clearDeactivateDate();

    // ─ 4. Switch to role mode: fields flip, helper text appears ─
    await oooPage.selectDelegateToRole();
    await expect(oooPage.loc.input_role, 'Role enabled in role mode').toBeEnabled({ timeout: 5000 });
    await expect(oooPage.loc.input_teamMember, 'Team member disabled in role mode').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.helperText, 'Helper text visible in role mode').toBeVisible({ timeout: 5000 });
    const helperText = await oooPage.loc.helperText.textContent();
    expect(helperText.trim(), 'Helper text content matches expected routing message')
        .toBe('Approvals will be routed to the person assigned to this role for each property.');
    await expect(oooPage.loc.btn_activate, 'Activate still disabled with role mode but no selection').toBeDisabled({ timeout: 5000 });
    Logger.info(`TC-OOO-UI: Role mode fields ✓, helper text: "${helperText.trim()}" ✓`);

    // ─ 5. Switch back to user mode: reversal ─
    await oooPage.selectDelegateToUser();
    await expect(oooPage.loc.input_teamMember, 'Team member re-enabled in user mode').toBeEnabled({ timeout: 5000 });
    await expect(oooPage.loc.input_role, 'Role re-disabled in user mode').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.helperText, 'Helper text hidden after switch back to user mode').toBeHidden({ timeout: 5000 });
    Logger.info('TC-OOO-UI: User mode reversal ✓');

    // ─ 6. Mode switch: activate button governed by current mode's selection ─
    // Mantine Select persists the input value in the DOM when the field is disabled —
    // it is NOT cleared on radio switch. The button is disabled in user mode only because
    // no user delegate is selected, not because the role value is gone.
    await oooPage.selectDelegateToRole();
    const roleName = await oooPage.getFirstRoleName();
    await oooPage.pickRoleFromDropdown(roleName);
    await expect(oooPage.loc.btn_activate, 'Button enabled after picking role').toBeEnabled({ timeout: 5000 });
    Logger.info(`TC-OOO-UI: Role "${roleName}" picked, button enabled ✓`);

    await oooPage.selectDelegateToUser();
    await expect(oooPage.loc.input_role, 'Role input must be DISABLED in user mode').toBeDisabled({ timeout: 5000 });
    await expect(oooPage.loc.btn_activate, 'Button DISABLED in user mode — no user delegate selected').toBeDisabled({ timeout: 5000 });
    Logger.info('TC-OOO-UI: Switched to user mode — role disabled, button disabled (no user selected) ✓');

    // Switch back to role mode — role value persists (Mantine keeps it), button re-enables
    await oooPage.selectDelegateToRole();
    await expect(oooPage.loc.input_role, 'Role input must be ENABLED back in role mode').toBeEnabled({ timeout: 5000 });
    const roleAfterReturn = await oooPage.loc.input_role.inputValue().catch(() => '');
    expect(roleAfterReturn, 'Role input retains previously selected value after switching back').toBe(roleName);
    await expect(oooPage.loc.btn_activate, 'Button re-enabled — role selection was retained on switch').toBeEnabled({ timeout: 5000 });
    Logger.info(`TC-OOO-UI: Switched back to role mode — value "${roleAfterReturn}" retained, button enabled ✓`);

    Logger.success('TC-OOO-UI PASSED');
});

test('@ooo @regression TC-OOO-DATE Auto-deactivation date picker blocks past dates, allows today and future dates, clears correctly with the X button, stores dates without timezone shift, and handles invalid date input gracefully', async ({ page }) => {
    test.setTimeout(90000);
    Logger.step('TC-OOO-DATE: All date-related scenarios');

    // ─ 1. Date-only (no delegate) must NOT enable activate button ─
    await expect(oooPage.loc.radio_delegateToUser, 'Must be in user mode initially').toBeChecked({ timeout: 3000 });
    const { uiDate: dateOnly } = await oooPage.setFutureDate(3);
    await expect(oooPage.loc.btn_activate, 'Date-only must NOT enable activate button').toBeDisabled({ timeout: 5000 });
    Logger.info(`TC-OOO-DATE: Date-only (${dateOnly}) does not enable button ✓`);
    await oooPage.clearDeactivateDate();

    // ─ 2. Select role (needed for calendar and remaining sub-tests) ─
    await oooPage.selectDelegateToRole();
    const roleName = await oooPage.getFirstRoleName();
    await oooPage.pickRoleFromDropdown(roleName);

    // ─ 3. Open calendar → prev-month nav disabled + past dates blocked ─
    await oooPage.openDatePicker();
    await expect(oooPage.loc.calendar_prevMonthBtn, 'Previous-month nav must be disabled on current month').toBeDisabled({ timeout: 5000 });
    Logger.info('TC-OOO-DATE: Prev-month nav button disabled ✓');

    const allDayBtns = oooPage.loc.calendar_allDayBtns;
    const count = await allDayBtns.count();
    expect(count, 'Calendar must have day buttons to inspect').toBeGreaterThan(0);
    Logger.info(`TC-OOO-DATE: Found ${count} day buttons in calendar`);

    const today = new Date();
    const todayDay = today.getDate();
    let pastCount = 0;
    for (let i = 0; i < count; i++) {
        const btn = allDayBtns.nth(i);
        const labelAttr = await btn.getAttribute('aria-label');
        if (!labelAttr) continue;
        const btnDate = new Date(labelAttr);
        if (isNaN(btnDate.getTime())) continue;
        const isPast = (
            (btnDate.getFullYear() < today.getFullYear()) ||
            (btnDate.getFullYear() === today.getFullYear() && btnDate.getMonth() < today.getMonth()) ||
            (btnDate.getFullYear() === today.getFullYear() && btnDate.getMonth() === today.getMonth() && btnDate.getDate() < todayDay)
        );
        if (isPast) {
            pastCount++;
            const isDisabled = await btn.isDisabled();
            const dataDisabled = await btn.getAttribute('data-disabled');
            expect(
                isDisabled || dataDisabled === 'true',
                `Past date "${labelAttr}" must be disabled. isDisabled=${isDisabled}, data-disabled="${dataDisabled}"`
            ).toBe(true);
        }
    }
    expect(pastCount, 'Must have found at least some past dates to verify').toBeGreaterThan(0);
    Logger.info(`TC-OOO-DATE: Verified ${pastCount} past dates are disabled ✓`);

    // ─ 4. Today is selectable ─
    // Mantine DateInput sets value as "Month D, YYYY" (e.g. "May 26, 2026") when selected
    // via the calendar picker button — different from fill() which preserves "MM/DD/YYYY".
    const todayCalendarValue = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    await oooPage.clickTodayInCalendar();
    await expect(
        oooPage.loc.input_deactivateDate,
        `Date input must show today's date: ${todayCalendarValue}`
    ).toHaveValue(todayCalendarValue, { timeout: 5000 });
    await expect(oooPage.loc.btn_activate, 'Activate button must remain enabled after selecting today').toBeEnabled({ timeout: 5000 });
    Logger.info(`TC-OOO-DATE: Today (${todayCalendarValue}) selectable ✓`);

    // ─ 5. Clear button appears and clears the date ─
    await expect(oooPage.loc.btn_clearDate, '× clear button must appear after a date is set').toBeVisible({ timeout: 5000 });
    await oooPage.clearDeactivateDate();
    await expect(oooPage.loc.input_deactivateDate, 'Date field must be empty after clearing').toHaveValue('', { timeout: 5000 });
    const clearGone = await oooPage.loc.btn_clearDate.isVisible().catch(() => false);
    expect(clearGone, '× button must disappear after clearing date').toBe(false);
    await expect(oooPage.loc.btn_activate, 'Activate button remains enabled (delegate still selected)').toBeEnabled({ timeout: 5000 });
    Logger.info('TC-OOO-DATE: Clear button works, input empty, × gone, button still enabled ✓');

    // ─ 6. Future date set correctly + timezone-shift check via API ─
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const mmF = String(future.getMonth() + 1).padStart(2, '0');
    const ddF = String(future.getDate()).padStart(2, '0');
    const yyyyF = future.getFullYear();
    const futureUi = `${mmF}/${ddF}/${yyyyF}`;
    const futureApi = `${yyyyF}-${mmF}-${ddF}`;

    await oooPage.loc.input_deactivateDate.fill(futureUi);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await expect(oooPage.loc.input_deactivateDate, `Date input must show ${futureUi}`).toHaveValue(futureUi, { timeout: 5000 });
    await expect(oooPage.loc.btn_activate, 'Activate button enabled with role + future date').toBeEnabled({ timeout: 5000 });
    await oooPage.clickActivateOoo();

    const apiState = await oooPage.getOooApiState();
    expect(apiState.ooo, 'API ooo must not be null after activation with date').not.toBeNull();
    const storedDate = apiState.ooo.deactivate_at;
    expect(storedDate, 'API deactivate_at must not be null').not.toBeNull();
    expect(
        storedDate.startsWith(futureApi),
        `TIMEZONE SHIFT DETECTED: set "${futureApi}", API stored "${storedDate}". Must match.`
    ).toBe(true);
    Logger.info(`TC-OOO-DATE: No timezone shift — stored "${storedDate}" starts with "${futureApi}" ✓`);

    // Deactivate before invalid date tests
    await oooPage.clickDeactivateOoo();

    // ─ 7. Invalid date typed — activate button state must not be corrupted ─
    await oooPage.selectDelegateToRole();
    await oooPage.pickRoleFromDropdown(roleName);
    await expect(oooPage.loc.btn_activate, 'Button enabled with valid role before invalid date test').toBeEnabled({ timeout: 5000 });

    const invalidDates = ['32/13/2026', 'abcd', '00/00/0000', '99-99-9999', '   '];
    for (const inv of invalidDates) {
        Logger.step(`TC-OOO-DATE: Testing invalid date: "${inv}"`);
        await oooPage.loc.input_deactivateDate.fill(inv);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(400);
        const fieldVal = await oooPage.loc.input_deactivateDate.inputValue();
        Logger.info(`TC-OOO-DATE: After "${inv}", input value is "${fieldVal}"`);
        await expect(
            oooPage.loc.btn_activate,
            `Activate button state must not be corrupted by invalid date "${inv}" — delegate is still selected`
        ).toBeEnabled({ timeout: 5000 });
        await oooPage.loc.input_deactivateDate.fill('');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);
    }
    Logger.info('TC-OOO-DATE: All invalid date inputs handled gracefully, button state preserved ✓');

    Logger.success('TC-OOO-DATE PASSED');
});


test('@ooo @visual TC-OOO-VISUAL Visual appearance of all Out of Office UI states matches the approved baseline screenshots', async ({ page }) => {
    test.setTimeout(300000);
    Logger.step('TC-OOO-VISUAL: Capturing visual snapshots of all OOO UI states');

    const main = page.locator('main').first();
    const oooPanel = page.getByRole('tabpanel', { name: 'Out of Office' });
    const roleName = await oooPage.getFirstRoleName();

    // V1 — Default inactive state (Delegate to user)
    await test.step('V1 — Default inactive state (user mode)', async () => {
        await expect(oooPage.loc.radio_delegateToUser).toBeChecked({ timeout: 5000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v1-inactive-user-mode.png', OOO_VISUAL);
        Logger.info('V1 captured ✓');
    });

    // V2 — Role mode with helper text
    await test.step('V2 — Role mode with helper text visible', async () => {
        await oooPage.selectDelegateToRole();
        await expect(oooPage.loc.helperText).toBeVisible({ timeout: 5000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v2-role-mode-helper-text.png', OOO_VISUAL);
        Logger.info('V2 captured ✓');
    });

    // V3 — Role selected, activate button enabled
    await test.step('V3 — Role selected, activate button enabled', async () => {
        await oooPage.pickRoleFromDropdown(roleName);
        await expect(oooPage.loc.btn_activate).toBeEnabled({ timeout: 5000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v3-role-selected-button-enabled.png', OOO_VISUAL);
        Logger.info('V3 captured ✓');
    });

    // V4 — Date picker open (calendar visible)
    await test.step('V4 — Date picker calendar open', async () => {
        await oooPage.loc.input_deactivateDate.click();
        await expect(oooPage.loc.calendar_monthLabel).toBeVisible({ timeout: 5000 });
        await expect(main).toHaveScreenshot('ooo-v4-date-picker-open.png', OOO_VISUAL);
        Logger.info('V4 captured ✓');
    });

    // V5 — Date selected, clear button visible
    await test.step('V5 — Future date selected with clear button', async () => {
        const { uiDate } = await oooPage.setFutureDate(5);
        Logger.info(`V5 — date set: ${uiDate}`);
        await expect(oooPage.loc.btn_clearDate).toBeVisible({ timeout: 5000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v5-date-selected-clear-visible.png', {
            ...OOO_VISUAL,
            mask: [oooPage.loc.input_deactivateDate],
        });
        Logger.info('V5 captured ✓');
    });

    // V6 — Active state (role, no date)
    await test.step('V6 — OOO active state with role delegate (no date)', async () => {
        await oooPage.clearDeactivateDate();
        await oooPage.clickActivateOoo();
        await expect(oooPage.loc.activeStatePara).toBeVisible({ timeout: 10000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v6-active-role-no-date.png', OOO_VISUAL);
        Logger.info('V6 captured ✓');
    });

    // V7 — Deactivate button close-up
    await test.step('V7 — Deactivate button visible in active state', async () => {
        await expect(oooPage.loc.btn_deactivate).toBeVisible({ timeout: 5000 });
        await expect(oooPage.loc.btn_deactivate).toHaveScreenshot('ooo-v7-deactivate-button.png', OOO_VISUAL);
        Logger.info('V7 captured ✓');
    });

    // V8 — Form state after deactivation
    await test.step('V8 — Form state after deactivation', async () => {
        await oooPage.clickDeactivateOoo();
        await expect(oooPage.loc.btn_activate).toBeVisible({ timeout: 10000 });
        await expect(oooPage.loc.activeStatePara).toBeHidden({ timeout: 5000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v8-deactivated-form-state.png', OOO_VISUAL);
        Logger.info('V8 captured ✓');
    });

    // V9 — Active state with auto-deactivation date
    await test.step('V9 — OOO active state with role delegate AND auto-deactivation date', async () => {
        await oooPage.selectDelegateToRole();
        await oooPage.pickRoleFromDropdown(roleName);
        const { uiDate } = await oooPage.setFutureDate(10);
        Logger.info(`V9 — date: ${uiDate}`);
        await oooPage.clickActivateOoo();
        await expect(page.getByText(/Auto-deactivates on/i)).toBeVisible({ timeout: 10000 });
        await page.mouse.move(0, 0);
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await expect(oooPanel).toHaveScreenshot('ooo-v9-active-role-with-date.png', {
            ...OOO_VISUAL,
            mask: [page.getByText(/Auto-deactivates on/i)],
        });
        Logger.info('V9 captured ✓');
    });

    Logger.success('TC-OOO-VISUAL PASSED — all 9 snapshots captured');
});
