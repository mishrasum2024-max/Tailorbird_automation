const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("@playwright/test");
const { Logger } = require("../utils/logger");
const { userRoleImportLocators } = require("../locators/userRoleImportLocator");

/** Approvers Management -> Import Property Role (CSV with Properties, Location and role columns). */
class UserRoleImportPage {
  constructor(page) {
    this.page = page;
    this.loc = userRoleImportLocators(page);
  }

  async goto() {
    await this.page.goto("/user-role-management", { waitUntil: "load" });
    await expect(
      this.loc.importButton,
      "Import Property Role button must be visible"
    ).toBeVisible({ timeout: 60000 });
  }

  /** Writes a CSV (array of rows) into a fresh temp dir and returns its path. */
  writeCsv(fileName, rows) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feat1313-csv-"));
    // Keep only a bare file name so the CSV can never be written outside the fresh temp dir.
    const safeName = path.basename(String(fileName));
    if (!/^[\w.-]+\.csv$/i.test(safeName) || safeName !== fileName) {
      throw new Error(`writeCsv: invalid CSV file name "${fileName}"`);
    }
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- safeName is path.basename() of a spec-supplied literal, checked against an anchored [\w.-]+.csv pattern just above (no separators, no ".."), joined onto a fresh mkdtemp dir.
    const target = path.join(dir, safeName);
    fs.writeFileSync(
      target,
      rows
        .map(r =>
          r
            .map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
            .join(",")
        )
        .join("\n") + "\n"
    );
    return target;
  }

  async importCsv(csvPath) {
    await this.loc.importButton.click();
    await expect(this.loc.importModal, "Import modal must open").toBeVisible({
      timeout: 30000,
    });
    // Always go through the "From device" file chooser: a bare input[type=file] may belong to a different widget.
    const [chooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: 30000 }),
      this.loc.fromDeviceButton.click(),
    ]);
    await chooser.setFiles(csvPath);
    await expect(
      this.loc.uploadedFileSummary,
      "Uploaded file summary must show"
    ).toBeVisible({ timeout: 60000 });
    // Uploadcare inline mode only fires onFilesUploaded once "Done" is clicked after the file uploaded.
    await expect(
      this.loc.uploadDoneButton,
      "Upload Done button must appear"
    ).toBeVisible({ timeout: 60000 });
    await this.loc.uploadDoneButton.click();
    await expect(
      this.loc.resultSuccessAlert.or(this.loc.resultFailureAlert).first(),
      "Import result must show"
    ).toBeVisible({ timeout: 120000 });
    const succeeded = await this.loc.resultSuccessAlert.isVisible();
    const text = (await this.loc.modalText.innerText()).trim();
    Logger.info(
      `User role import result (success=${succeeded}): ${text.slice(0, 300)}`
    );
    return { succeeded, text };
  }

  async closeResult() {
    await this.loc.doneButton.click();
    await expect(this.loc.importModal).not.toBeVisible({ timeout: 30000 });
  }

  /**
   * Property to import against: `preferred` (data/propertyData.json) when the role grid lists it,
   * otherwise the newest test-created property in the grid (TC…_, e2e_prop_, Automa_Test_) —
   * never a permanent seed. MCP-verified 2026-10-29: GET /api/bird-table?table_name=
   * user_role_management rows have { id, property_name }; 43 of 126 are test-created.
   */
  async resolvePropertyName(preferred) {
    const res = await this.page.request.get(
      "/api/bird-table?table_name=user_role_management"
    );
    expect(res.status(), "FAIL: role grid API did not return 200").toBe(200);
    const rows = (await res.json()).rows || [];
    if (preferred && rows.some(r => r.property_name === preferred))
      return preferred;
    const testCreated = rows
      .filter(r =>
        /^(TC\d+_|e2e_prop_|Automa_Test_)/.test(r.property_name || "")
      )
      .sort((a, b) => Number(b.id) - Number(a.id));
    expect(
      testCreated.length,
      "FAIL: no property to import against — data/propertyData.json has none and no test-created property exists; run the @mandatory chain (TC49) first"
    ).toBeGreaterThan(0);
    Logger.info(
      `Using test-created property "${testCreated[0].property_name}" (data/propertyData.json has ${preferred ? `"${preferred}", not in the role grid` : "no property"})`
    );
    return testCreated[0].property_name;
  }
}

module.exports = { UserRoleImportPage };
