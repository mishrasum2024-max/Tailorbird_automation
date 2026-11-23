const { expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { Logger } = require("../utils/logger");
const { healingLocator } = require("../utils/locatorHealer");
const RL = require("../locators/manageTeamRolesLocator");
const ROLE_PERMISSIONS_BASELINE = path.join(
  __dirname,
  "../fixture/rolePermissionsBaseline.json"
);
const OrganizationHelper = require("./organizationHelper");
const organizationUrls = require("../fixture/organization.json");
const roleManagementUiLabels = require("../fixture/manageTeamRoles.json");

/**
 * Navigation + assertions for Approvers Management (`/user-role-management`) and Organization (`/organization`).
 * Legacy `/manage-team` routes 404 on beta (MCP 2026-05-05).
 */
class ManageTeamRolesHelper {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.organizationHelper = new OrganizationHelper(page);
  }

  /** Deep-link to roles matrix (session required). */
  async gotoManageTeamRolesViaQuery(dashboardUrl) {
    const start =
      dashboardUrl ||
      process.env.DASHBOARD_URL ||
      organizationUrls.dashboardUrl;
    const origin = new URL(start).origin;
    await this.page.goto(`${origin}/user-role-management`, {
      waitUntil: "load",
      timeout: 90_000,
    });
    await this.page.waitForLoadState("domcontentloaded");
  }

  /** Dashboard → user menu → Manage Approvers. */
  async landManageTeamViaMenu(dashboardUrl) {
    await this.organizationHelper.goto(dashboardUrl);
    await this.organizationHelper.goToUserRoleManagement();
    // Trace-verified 2026-10-05: /user-role-management treats ANY failed GET /api/profile as
    // "not admin" and router.replace("/")s back to the dashboard — an intermittent 400 from the
    // auth middleware bounced the page to CapEx right after the URL check above passed. If that
    // happens, take the same menu path once more.
    const addRoleButton = this.page.getByRole("button", {
      name: roleManagementUiLabels.addRoleButtonText,
    });
    const stayedOnApprovers = await addRoleButton
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!stayedOnApprovers && !/user-role-management/i.test(this.page.url())) {
      await this.organizationHelper.goToUserRoleManagement();
    }
  }

  /** Dashboard → user menu → Manage Organization (Users / Property access). */
  async landOrganizationWorkspaceViaMenu(dashboardUrl) {
    await this.organizationHelper.goto(dashboardUrl);
    await this.organizationHelper.goToOrganization();
    // Trace-verified 2026-10-05: /organization renders only the breadcrumb + a skeleton until
    // GET /api/profile confirms admin, and router.replace("/")s on ANY failed response — an
    // intermittent 400 bounced the page to CapEx right after the breadcrumb/URL checks above
    // passed. The tabs render only once admin is confirmed, so wait for them and take the same
    // menu path once more if the page bounced.
    const usersTab = this.page.getByRole("tab", {
      name: roleManagementUiLabels.tabUsers,
    });
    const stayedOnOrganization = await usersTab
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!stayedOnOrganization && !/\/organization/i.test(this.page.url())) {
      await this.organizationHelper.goToOrganization();
    }
  }

  async openRolesTab() {
    await this.page
      .getByRole("tab", { name: roleManagementUiLabels.tabRoles })
      .click();
  }

  async openUsersTab() {
    await this.page
      .getByRole("tab", { name: roleManagementUiLabels.tabUsers })
      .click();
  }

  async openPropertyAccessTab() {
    await this.page
      .getByRole("tab", { name: roleManagementUiLabels.tabPropertyAccess })
      .click();
  }

  async expectRolesBenchmarkVisible() {
    await expect(
      this.page.getByRole("button", {
        name: roleManagementUiLabels.addRoleButtonText,
      })
    ).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      this.page.getByRole("textbox", {
        name: roleManagementUiLabels.searchBoxName,
      })
    ).toBeVisible({
      timeout: 15_000,
    });
  }

  /** Legacy name: ensures we are on the user-role-management route. */
  async expectRolesTabSelected() {
    await expect(this.page).toHaveURL(/user-role-management/i, {
      timeout: 15_000,
    });
  }

  /** Approvers Management grid exposes property/location columns (MCP-verified). */
  async expectRolesColumnHeaders() {
    await expect(
      this.page
        .getByRole("columnheader", {
          name: roleManagementUiLabels.gridColumnProperties,
          exact: true,
        })
        .first()
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      this.page
        .getByRole("columnheader", {
          name: roleManagementUiLabels.gridColumnLocation,
          exact: true,
        })
        .first()
    ).toBeVisible();
  }

  async expectManageTeamBreadcrumb() {
    await expect(
      this.page
        .locator(".mantine-Breadcrumbs-root")
        .getByText(roleManagementUiLabels.breadcrumbUserRoleManagement, {
          exact: true,
        })
    ).toBeVisible({
      timeout: 15_000,
    });
  }

  // ---------- Create role drawer — permissions baseline (TC568) ----------
  // MCP-verified 2026-11-16: Roles tab → "Add role" opens the "Create role" drawer (Name *,
  // Description, Permissions = 12 accordion components, 44 checkboxes, all unchecked and enabled).
  // Opening it calls no API; Cancel closes it without creating anything.

  createRoleDrawer() {
    return healingLocator(
      RL.createRoleDrawerStrategies(
        this.page,
        roleManagementUiLabels.createRole.drawerTitle
      )
    ).first();
  }

  async openCreateRoleDrawer() {
    const cr = roleManagementUiLabels.createRole;
    await expect(
      this.page.getByRole("tab", { name: roleManagementUiLabels.tabRoles }),
      "FAIL: Roles tab not selected"
    ).toHaveAttribute("aria-selected", "true", { timeout: 25_000 });
    await expect(
      this.page.getByRole("main").getByText(cr.rolesIntro),
      "FAIL: Roles tab intro missing"
    ).toBeVisible({
      timeout: 25_000,
    });
    const addRole = this.page
      .getByRole("main")
      .getByRole("button", { name: roleManagementUiLabels.addRoleButtonText });
    await expect(addRole, "FAIL: Add role button not enabled").toBeEnabled({
      timeout: 25_000,
    });
    await addRole.click();
    await expect(
      this.createRoleDrawer(),
      `FAIL: "${cr.drawerTitle}" drawer did not open`
    ).toBeVisible({ timeout: 25_000 });
    Logger.success(`"${cr.drawerTitle}" drawer opened`);
  }

  async verifyCreateRoleFormFields() {
    const cr = roleManagementUiLabels.createRole;
    const drawer = this.createRoleDrawer();
    const name = healingLocator(
      RL.drawerInputStrategies(drawer, cr.nameLabel, cr.namePlaceholder)
    ).first();
    const description = healingLocator(
      RL.drawerInputStrategies(
        drawer,
        cr.descriptionLabel,
        cr.descriptionPlaceholder
      )
    ).first();
    await expect(name, "FAIL: Role name input missing").toBeEditable();
    await expect(name, "FAIL: Role name must start empty").toHaveValue("");
    await expect(name, "FAIL: Role name must be required").toHaveAttribute(
      "required",
      ""
    );
    await expect(description, "FAIL: Description input missing").toBeEditable();
    await expect(description, "FAIL: Description must start empty").toHaveValue(
      ""
    );
    // Run-verified 2026-11-16: the Name label renders as "Name *" (required asterisk inside the
    // <label>), so assert each input's own label (label[for=<input id>]) instead of exact text.
    for (const [input, text] of [
      [name, cr.nameLabel],
      [description, cr.descriptionLabel],
    ]) {
      const label = drawer.locator(
        `label[for="${await input.getAttribute("id")}"]`
      );
      await expect(label, `FAIL: "${text}" label not shown`).toBeVisible();
      await expect(
        label,
        `FAIL: Label of the "${text}" input is wrong`
      ).toContainText(text);
    }
    await expect(
      drawer.locator(`label[for="${await name.getAttribute("id")}"]`),
      'FAIL: Name label must show the required "*" marker'
    ).toHaveText(`${cr.nameLabel} *`);
    await expect(
      drawer.getByText(cr.permissionsHeading, { exact: true }).first(),
      `FAIL: "${cr.permissionsHeading}" heading not shown`
    ).toBeVisible();
    for (const button of [cr.cancelButton, cr.createButton])
      await expect(
        healingLocator(RL.drawerButtonStrategies(drawer, button)).first(),
        `FAIL: "${button}" button not enabled`
      ).toBeEnabled();
    Logger.success(
      "Create role form: Name (required), Description, Permissions, Cancel, Create"
    );
  }

  /**
   * Expands every permission component and returns
   * [{ component, permissions: [{ name, description, type }] }] in UI order. Each permission is
   * asserted visible, enabled, unchecked by default, and toggles on/off (nothing is saved).
   */
  async captureRolePermissions() {
    const drawer = this.createRoleDrawer();
    const controls = healingLocator(
      RL.permissionComponentStrategies(this.page, drawer)
    );
    await expect(
      controls.first(),
      "FAIL: No permission component shown"
    ).toBeVisible();
    const count = await controls.count();
    const components = [];
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      const component = (await control.innerText()).trim();
      if ((await control.getAttribute("aria-expanded")) !== "true")
        await control.click();
      await expect(
        control,
        `FAIL: "${component}" did not expand`
      ).toHaveAttribute("aria-expanded", "true");
      const region = this.page.locator(
        `[id="${await control.getAttribute("aria-controls")}"]`
      );
      await expect(
        region,
        `FAIL: "${component}" permissions not shown`
      ).toBeVisible();
      const boxes = healingLocator(RL.permissionCheckboxStrategies(region));
      const permissions = [];
      for (let j = 0; j < (await boxes.count()); j++) {
        const box = boxes.nth(j);
        const info = await box.evaluate(input => {
          const root =
            input.closest(".mantine-Checkbox-root") ||
            input.closest("label")?.parentElement;
          return {
            name: (
              root?.querySelector(".mantine-Checkbox-label")?.innerText || ""
            ).trim(),
            description: (
              root?.querySelector(".mantine-Checkbox-description")?.innerText ||
              ""
            ).trim(),
            type: input.type,
          };
        });
        expect(
          info.name,
          `FAIL: A "${component}" permission has no label`
        ).not.toBe("");
        const byName = region.getByRole("checkbox", {
          name: info.name,
          exact: true,
        });
        await expect(
          byName,
          `FAIL: "${component} → ${info.name}" not visible`
        ).toBeVisible();
        await expect(
          byName,
          `FAIL: "${component} → ${info.name}" not enabled`
        ).toBeEnabled();
        await expect(
          byName,
          `FAIL: "${component} → ${info.name}" must be unchecked for a new role`
        ).not.toBeChecked();
        await byName.check();
        await expect(
          byName,
          `FAIL: "${component} → ${info.name}" cannot be ticked`
        ).toBeChecked();
        await byName.uncheck();
        await expect(
          byName,
          `FAIL: "${component} → ${info.name}" cannot be unticked`
        ).not.toBeChecked();
        permissions.push(info);
      }
      expect(
        permissions.length,
        `FAIL: "${component}" has no permissions`
      ).toBeGreaterThan(0);
      Logger.info(
        `${component} (${permissions.length}): ${permissions.map(p => `${p.name} [${p.type}]`).join(" | ")}`
      );
      components.push({ component, permissions });
    }
    Logger.success(
      `Captured ${components.length} components, ${components.reduce((n, c) => n + c.permissions.length, 0)} permissions`
    );
    return {
      drawerTitle: roleManagementUiLabels.createRole.drawerTitle,
      components,
    };
  }

  /** Human-readable differences between the baseline and the live capture (empty = identical). */
  static diffRolePermissions(baseline, live) {
    const diff = [];
    const byName = list => new Map(list.map(c => [c.component, c]));
    const base = byName(baseline.components);
    const now = byName(live.components);
    for (const name of base.keys())
      if (!now.has(name)) diff.push(`Component REMOVED: "${name}"`);
    for (const name of now.keys())
      if (!base.has(name)) diff.push(`Component ADDED: "${name}"`);
    const baseOrder = baseline.components
      .map(c => c.component)
      .filter(n => now.has(n));
    const liveOrder = live.components
      .map(c => c.component)
      .filter(n => base.has(n));
    if (baseOrder.join("|") !== liveOrder.join("|"))
      diff.push(
        `Component ORDER changed: [${baseOrder.join(", ")}] → [${liveOrder.join(", ")}]`
      );
    for (const [name, b] of base) {
      const l = now.get(name);
      if (!l) continue;
      const bp = new Map(b.permissions.map(p => [p.name, p]));
      const lp = new Map(l.permissions.map(p => [p.name, p]));
      for (const p of bp.keys())
        if (!lp.has(p)) diff.push(`${name}: permission REMOVED "${p}"`);
      for (const p of lp.keys())
        if (!bp.has(p))
          diff.push(`${name}: permission ADDED "${p}" (${lp.get(p).type})`);
      for (const [p, bv] of bp) {
        const lv = lp.get(p);
        if (!lv) continue;
        if (bv.type !== lv.type)
          diff.push(`${name} → ${p}: type "${bv.type}" → "${lv.type}"`);
        if (bv.description !== lv.description)
          diff.push(
            `${name} → ${p}: description "${bv.description}" → "${lv.description}"`
          );
      }
      const bOrder = b.permissions.map(p => p.name).filter(p => lp.has(p));
      const lOrder = l.permissions.map(p => p.name).filter(p => bp.has(p));
      if (bOrder.join("|") !== lOrder.join("|"))
        diff.push(`${name}: permission ORDER changed`);
    }
    return diff;
  }

  /**
   * Compares the live capture with fixture/rolePermissionsBaseline.json. The live JSON is always
   * attached to the report. With UPDATE_ROLE_PERMISSIONS_BASELINE=1 (or no baseline yet) the
   * baseline file is (re)written from the live capture instead of compared.
   */
  async compareRolePermissionsWithBaseline(live, testInfo) {
    const envName = roleManagementUiLabels.createRole.updateBaselineEnv;
    await testInfo.attach("role-permissions-live.json", {
      body: JSON.stringify(live, null, 2),
      contentType: "application/json",
    });
    const existing = fs.existsSync(ROLE_PERMISSIONS_BASELINE)
      ? JSON.parse(fs.readFileSync(ROLE_PERMISSIONS_BASELINE, "utf8"))
      : null;
    if (!existing || process.env[envName] === "1") {
      const source =
        existing?._source ||
        "Baseline of Manage Organization → Roles → Create role permissions (written by TC568).";
      fs.writeFileSync(
        ROLE_PERMISSIONS_BASELINE,
        `${JSON.stringify({ _source: source, ...live }, null, 2)}\n`
      );
      Logger.info(
        `Role permissions baseline ${existing ? "updated" : "created"}: ${ROLE_PERMISSIONS_BASELINE}`
      );
      return [];
    }
    const diff = ManageTeamRolesHelper.diffRolePermissions(existing, live);
    if (diff.length) {
      Logger.error(
        `Role permissions changed (${diff.length}):\n  ${diff.join("\n  ")}`
      );
      await testInfo.attach("role-permissions-diff.txt", {
        body: diff.join("\n"),
        contentType: "text/plain",
      });
    }
    expect(
      diff,
      `FAIL: Create role permissions differ from fixture/rolePermissionsBaseline.json — if intended, re-run with ${envName}=1`
    ).toEqual([]);
    expect(
      live.components,
      "FAIL: Live permissions do not equal the baseline"
    ).toEqual(existing.components);
    Logger.success("Create role permissions match the baseline JSON");
    return diff;
  }

  /** Cancel closes the drawer; no role is created (no write API call while the drawer was open). */
  async cancelCreateRole(writeCalls) {
    const cr = roleManagementUiLabels.createRole;
    const drawer = this.createRoleDrawer();
    await healingLocator(RL.drawerButtonStrategies(drawer, cr.cancelButton))
      .first()
      .click();
    await expect(
      drawer,
      `FAIL: "${cr.drawerTitle}" drawer did not close`
    ).toBeHidden({ timeout: 15_000 });
    expect(
      writeCalls,
      "FAIL: Inspecting permissions must not create or change anything"
    ).toEqual([]);
    Logger.success("Drawer cancelled — no role created");
  }
}

module.exports = {
  ManageTeamRolesHelper,
  manageTeamRolesBench: roleManagementUiLabels,
  orgUrls: organizationUrls,
};
