/**
 * FEAT-972 — FGA (Fine-Grained Access) User Management.
 *
 * New spec file (existing stub tests/TC23_FGA_flow.spec.js was empty). Reuses
 * OrganizationHelper (invite flow) and ManageTeamRolesHelper (land on /organization)
 * indirectly via the new pages/fgaUserManagementPage.js — neither existing file was
 * modified. Property access grid + per-property user-assignment automation did not
 * exist anywhere in the framework before this file.
 *
 * Every invited user is randomly generated per run (timestamp + random suffix, never
 * reused across tests) and appended to data/fgaCreatedUsers.json, matching this repo's
 * existing data/lastCreatedJob.json / data/propertyData.json persistence convention.
 *
 * Prerequisite: `sessionState.json` from TC01 mandatory login. Target property
 * "Test Property 1_Cottages on Elm" must exist in the logged-in org (MCP-verified
 * live 2026-07-08 — same org this framework's sessionState.json already lands in,
 * shared with TC04/TC05/TC06 property tests).
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { InteractionLogger } = require("../utils/InteractionLogger");
const { FgaUserManagementPage } = require("../pages/fgaUserManagementPage");
const { orgUrls } = require("../pages/manageTeamRolesHelper");
const fgaTexts = require("../fixture/fga_cta_texts.json");

const dashboardLandingUrl = process.env.DASHBOARD_URL || orgUrls.dashboardUrl;
const TARGET_PROPERTY = "Test Property 1_Cottages on Elm";
const CREATED_USERS_FILE = path.join(__dirname, "../data/fgaCreatedUsers.json");

/**
 * Random every call — timestamp + random suffix avoids collisions even within the same
 * millisecond. Lowercase throughout: the app itself normalizes invited emails to lowercase
 * (MCP/live-run verified), so generating lowercase avoids a spurious case mismatch against
 * what later renders in the Users table.
 */
function generateFgaTestUser(prefix = "fga") {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const email = `${prefix}_${Date.now()}_${randomSuffix}@yopmail.com`;
    return { email, prefix, randomSuffix };
}

/** Appends to data/fgaCreatedUsers.json (array) — does not overwrite prior runs' records. */
function saveCreatedUser(record) {
    let existing = [];
    if (fs.existsSync(CREATED_USERS_FILE)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(CREATED_USERS_FILE, "utf8"));
            if (Array.isArray(parsed)) existing = parsed;
        } catch (err) {
            Logger.info(`[FGA] Could not parse existing fgaCreatedUsers.json, starting fresh: ${err.message}`);
        }
    }
    existing.push(record);
    fs.mkdirSync(path.dirname(CREATED_USERS_FILE), { recursive: true });
    fs.writeFileSync(CREATED_USERS_FILE, JSON.stringify(existing, null, 2));
    Logger.info(`[FGA] Saved created user to data/fgaCreatedUsers.json: ${JSON.stringify(record)}`);
}

test.describe("FEAT-972 FGA User Management", () => {
    test.use({
        storageState: "sessionState.json",
        viewport: { width: 1440, height: 900 },
    });

    test.beforeEach(() => {
        test.skip(!dashboardLandingUrl, "DASHBOARD_URL or fixture dashboard required");
    });

    test("TC_FGA_01 @sanity @regression @FGA : Invite user and assign property access successfully", async ({ page }) => {
        const fga = new FgaUserManagementPage(page);
        const { email } = generateFgaTestUser("testmember");

        InteractionLogger.logNavigation(dashboardLandingUrl, "Dashboard — profile menu → Manage Organization");
        await fga.gotoOrganization(dashboardLandingUrl);
        Logger.info("[TC_FGA_01] Asserting: URL is /organization");
        await expect(page).toHaveURL(/\/organization/);

        Logger.step(`[TC_FGA_01] Inviting new member: ${email}`);
        const inviteResult = await fga.inviteMemberAndCaptureApi(email);
        Logger.info("[TC_FGA_01] Asserting: invite API responded 201 with success:true");
        expect(inviteResult.status).toBe(201);
        expect(inviteResult.ok).toBeTruthy();
        expect(inviteResult.responseBody).toEqual({ success: true });
        expect(inviteResult.requestBody.email, "Invite request body must carry the exact invited email").toBe(email);

        saveCreatedUser({ email, role: "Member", testCase: "TC_FGA_01", purpose: "invite + property assignment", createdAt: new Date().toISOString() });

        await fga.validateInvitedBadge(email);
        Logger.success(`[TC_FGA_01] Invite verified — badge shown for ${email}`);

        Logger.step("[TC_FGA_01] Navigating to Property access tab");
        await fga.openPropertyAccessTab();
        await fga.searchProperty(TARGET_PROPERTY);

        const beforeCount = await fga.getAssignedUserCount(TARGET_PROPERTY);
        Logger.info(`[TC_FGA_01] Existing assigned user count for "${TARGET_PROPERTY}": ${beforeCount}`);
        expect(beforeCount, `"${TARGET_PROPERTY}" must show a numeric Access count before assignment`).not.toBeNull();

        const assignResult = await fga.assignUserToProperty(TARGET_PROPERTY, email);
        Logger.info("[TC_FGA_01] Asserting: assign API responded 200 with success:true");
        expect(assignResult.status).toBe(200);
        expect(assignResult.ok).toBeTruthy();
        expect(assignResult.responseBody).toEqual({ success: true });
        expect(assignResult.requestBody.userId, "Assign request must carry the invited user's id").toBeTruthy();
        expect(assignResult.propertyId, "Property id must resolve from the approval-approvers API fired on Settings open").not.toBeNull();
        expect(assignResult.requestBody.propertyId, "Assign request propertyId must match the property actually opened").toBe(assignResult.propertyId);

        await fga.expectAccessGrantedToast();
        await fga.closePropertySettings(TARGET_PROPERTY);

        const afterCount = await fga.getAssignedUserCount(TARGET_PROPERTY);
        Logger.info(`[TC_FGA_01] Access count after assignment: ${afterCount}`);
        expect(afterCount, "Access count must increase by exactly one after assignment").toBe(beforeCount + 1);

        Logger.success(`[TC_FGA_01] ✅ Invite + property access assignment completed for ${email}`);
    });

    test("TC_FGA_02 @regression @FGA : Validate property access page functionality — headers, search, sort, empty state, actions", async ({ page }) => {
        const fga = new FgaUserManagementPage(page);
        await fga.gotoOrganization(dashboardLandingUrl);
        await fga.openPropertyAccessTab();

        Logger.step("[TC_FGA_02] Validating column headers against fga_cta_texts.json");
        const headers = await fga.getColumnHeaderTexts();
        Logger.info(`[TC_FGA_02] Headers found: ${JSON.stringify(headers)}`);
        for (const expectedHeader of [
            fgaTexts.column_property,
            fgaTexts.column_location,
            fgaTexts.column_access,
            fgaTexts.column_actions,
        ]) {
            expect(headers, `Expected column "${expectedHeader}" in Property access grid`).toContain(expectedHeader);
        }

        Logger.step("[TC_FGA_02] Validating search input and Transpose view button are visible");
        await expect(fga.propertyAccessSearchInput()).toBeVisible();
        await expect(
            fga.propertyAccessTabPanel().getByRole("button", { name: fgaTexts.transpose_view_button }),
        ).toBeVisible();

        Logger.step(`[TC_FGA_02] Searching known fixture property: ${TARGET_PROPERTY}`);
        await fga.searchProperty(TARGET_PROPERTY);
        const row = fga.getPropertyRow(TARGET_PROPERTY);
        await expect(row, "Known fixture property must be found via search").toBeVisible({ timeout: 15000 });
        await expect(
            row.getByRole("button", { name: fgaTexts.settings_button }),
            "Settings action must be visible per row",
        ).toBeVisible();

        Logger.step("[TC_FGA_02] Validating empty state for a non-existent property");
        await fga.searchProperty(`__no_such_property_${Date.now()}__`);
        await fga.expectNoPropertiesFound();

        Logger.step("[TC_FGA_02] Re-searching known property and exercising column sort");
        await fga.searchProperty(TARGET_PROPERTY);
        await expect(row).toBeVisible({ timeout: 15000 });
        const sortResult = await fga.sortByColumn(fgaTexts.column_property);
        Logger.info(
            `[TC_FGA_02] Sort by "${fgaTexts.column_property}" — first row before: "${sortResult.firstRowBefore}", after: "${sortResult.firstRowAfter}"`,
        );
        await expect(fga.propertyAccessTable(), "Grid must remain rendered after clicking a column header").toBeVisible();

        Logger.info(
            "[TC_FGA_02] Pagination and filter controls are not present on the Property access tab in the current UI (MCP-verified live) — not applicable, no assertion made.",
        );

        Logger.success("[TC_FGA_02] ✅ Property access page structure validated");
    });

    test("TC_FGA_03 @regression @FGA : Validate invited user assignment increases property user count by exactly one", async ({ page }) => {
        const fga = new FgaUserManagementPage(page);
        const { email } = generateFgaTestUser("fga_count");

        await fga.gotoOrganization(dashboardLandingUrl);
        Logger.step(`[TC_FGA_03] Inviting new member: ${email}`);
        await fga.inviteMemberAndCaptureApi(email);
        saveCreatedUser({ email, role: "Member", testCase: "TC_FGA_03", purpose: "count-delta validation", createdAt: new Date().toISOString() });
        await fga.validateInvitedBadge(email);

        await fga.openPropertyAccessTab();
        await fga.searchProperty(TARGET_PROPERTY);
        const beforeCount = await fga.getAssignedUserCount(TARGET_PROPERTY);
        Logger.info(`[TC_FGA_03] Count before assignment: ${beforeCount}`);
        expect(beforeCount).not.toBeNull();

        await fga.assignUserToProperty(TARGET_PROPERTY, email);
        await fga.expectAccessGrantedToast();
        await fga.closePropertySettings(TARGET_PROPERTY);

        const afterCount = await fga.getAssignedUserCount(TARGET_PROPERTY);
        Logger.info(`[TC_FGA_03] Count after assignment: ${afterCount}`);
        expect(afterCount, "Count must increase by exactly one after assigning a single new user").toBe(beforeCount + 1);

        Logger.success(`[TC_FGA_03] ✅ Count increased by exactly one: ${beforeCount} → ${afterCount}`);
    });

    test("TC_FGA_04 @regression @FGA : Validate invited user appears with invited badge and correct status after invitation", async ({ page }) => {
        const fga = new FgaUserManagementPage(page);
        const { email } = generateFgaTestUser("fga_badge");

        await fga.gotoOrganization(dashboardLandingUrl);
        Logger.step(`[TC_FGA_04] Inviting new member: ${email}`);
        await fga.inviteMemberAndCaptureApi(email);
        saveCreatedUser({ email, role: "Member", testCase: "TC_FGA_04", purpose: "badge/status validation", createdAt: new Date().toISOString() });

        Logger.step(`[TC_FGA_04] Validating row, email display, and Invited badge for ${email}`);
        const row = page.getByRole("row").filter({ hasText: email });
        await expect(row, "Invited user row must be visible in Users table").toBeVisible({ timeout: 15000 });
        await expect(row, "Email must display correctly in the row").toContainText(email);
        await fga.validateInvitedBadge(email);

        Logger.step("[TC_FGA_04] Cross-checking via GET /api/organization/users");
        const orgUser = await fga.getOrganizationUserByEmail(email);
        expect(orgUser, `Invited user "${email}" must exist in /api/organization/users`).not.toBeNull();
        expect(orgUser.email).toBe(email);
        expect(orgUser.status, 'Newly invited user must have status "pending" (backs the "Invited" badge)').toBe("pending");
        expect(orgUser.id, "Invitation id (proxy) must exist").toBeTruthy();
        Logger.info(`[TC_FGA_04] Invitation id (proxy): ${orgUser.id}, status: ${orgUser.status}`);

        Logger.success(`[TC_FGA_04] ✅ Invited badge + status verified for ${email} (id ${orgUser.id})`);
    });

    test("TC_FGA_05 @regression @negative @FGA : Duplicate invite using same email is rejected with expected error", async ({ page }) => {
        const fga = new FgaUserManagementPage(page);
        const { email } = generateFgaTestUser("fga_dup");

        await fga.gotoOrganization(dashboardLandingUrl);
        Logger.step(`[TC_FGA_05] First invite: ${email}`);
        await fga.inviteMemberAndCaptureApi(email);
        saveCreatedUser({ email, role: "Member", testCase: "TC_FGA_05", purpose: "duplicate-invite negative check", createdAt: new Date().toISOString() });
        await fga.validateInvitedBadge(email);

        Logger.step("[TC_FGA_05] Re-inviting the same email — expecting rejection");
        const dup = await fga.attemptDuplicateInvite(email);

        Logger.info("[TC_FGA_05] Asserting: duplicate invite API responded 400 with expected message");
        expect(dup.status).toBe(400);
        expect(dup.ok).toBeFalsy();
        expect(dup.responseBody?.message).toBe(fgaTexts.duplicate_invite_inline_error);

        Logger.info("[TC_FGA_05] Asserting: dialog stays open with inline validation error");
        await expect(dup.dialogRoot).toBeVisible();
        await expect(dup.dialogRoot.getByText(fgaTexts.duplicate_invite_inline_error)).toBeVisible({ timeout: 10000 });
        await expect(dup.emailAddressInput).toHaveAttribute("aria-invalid", "true");

        await dup.dialogRoot.getByRole("button", { name: "Cancel" }).click();
        await expect(dup.dialogRoot).toBeHidden({ timeout: 10000 });

        Logger.success(`[TC_FGA_05] ✅ Duplicate invite correctly rejected with "${fgaTexts.duplicate_invite_inline_error}"`);
    });
});
