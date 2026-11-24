/**
 * CapEx — non-contract invoices with several vendors on one GL (TC609).
 *
 * MCP-verified 2026-11-24 (headed owner browser, dashboard → Projects → project → Jobs → Create Job):
 * - "Add job" modal: Job Type option "Non Contract" (it is a Job Type, NOT a Financial Type — the
 *   Financial Type list only offers Contract/PO). Picking it disables Financial Type, Vendor
 *   ("Not applicable for non-contract jobs") and Start/End Date. Budget Category is a button whose
 *   name is the pre-selected GL (the project's category). Create → POST /api/bird-table/rows and
 *   the app opens /jobs/<id>.
 * - Job page tabs "Job Summary" / "Invoice". Invoice tab → "Create Invoice" opens the invoice
 *   drawer (/jobs/<id>/invoices/<invoiceId>) with one line already on the job's GL.
 *   "Select vendor" textbox (required for non-contract invoices) → options; picking one PUTs
 *   /api/bird-table/cells {columnName:"vendor_id"}. "Invoice Amount" column header carries the
 *   data-rgcol of the amount cells. "Confirm Invoice" → "Confirm" (Are you sure you want to
 *   approve this invoice?) → PUT cells {columnName:"status", value:"Approved"}.
 * - Job Summary "Invoice Spend by Category" revo-grid props: budget_category, vendor_name,
 *   segment, unit_name, invoice_amount (one row per GL × vendor).
 * - CapEx drill-down (category master-detail) is a second revo-grid with a "Vendor" column header;
 *   project rows expand with button.tree-toggle; job rows contain the job name.
 */

/** "Add job" modal (scoped by its title input). */
function ncJobModalStrategies(page) {
  return [
    { name: "dialog(name=Add job)", locator: page.getByRole("dialog", { name: "Add job" }) },
    {
      name: "dialog has job title input",
      locator: page.getByRole("dialog").filter({ has: page.getByPlaceholder("Enter job title") }).last(),
    },
  ];
}

function ncJobTypeInputStrategies(modal) {
  return [
    { name: "textbox(Job Type)", locator: modal.getByRole("textbox", { name: "Job Type" }) },
    { name: "placeholder(Select job type)", locator: modal.getByPlaceholder("Select job type") },
  ];
}

function ncJobTitleInputStrategies(modal) {
  return [
    { name: "textbox(Title)", locator: modal.getByRole("textbox", { name: "Title" }) },
    { name: "placeholder(Enter job title)", locator: modal.getByPlaceholder("Enter job title") },
  ];
}

/**
 * Budget Category picker trigger — its text is the selected GL. MCP-verified 2026-11-24: a
 * <div role="button"> right after the <label>Budget Category</label> (NOT a <button>: a
 * "following::button" xpath lands on "Cancel" — run 1).
 */
function ncJobBudgetCategoryButtonStrategies(modal) {
  return [
    {
      name: "label(Budget Category) → following-sibling div[role=button]",
      locator: modal
        .locator("label")
        .filter({ hasText: /^\s*Budget Category/ })
        .locator('xpath=following-sibling::div[@role="button"][1]'),
    },
  ];
}

function ncJobCreateButtonStrategies(modal) {
  return [
    { name: "button(Create, exact)", locator: modal.getByRole("button", { name: "Create", exact: true }) },
  ];
}

/** Job page tab by name ("Job Summary" / "Invoice"). */
function ncJobTabStrategies(page, name) {
  return [
    { name: `tab(${name}, exact)`, locator: page.getByRole("tab", { name, exact: true }) },
    { name: `tab(${name})`, locator: page.getByRole("tab", { name }) },
  ];
}

function ncCreateInvoiceButtonStrategies(page) {
  return [
    {
      name: "button(Create Invoice) visible",
      locator: page.getByRole("button", { name: "Create Invoice", exact: true }).locator("visible=true"),
    },
  ];
}

function ncInvoiceVendorInputStrategies(page) {
  return [
    { name: "textbox(Select vendor)", locator: page.getByRole("textbox", { name: "Select vendor" }) },
    { name: "placeholder(Select vendor)", locator: page.getByPlaceholder("Select vendor") },
  ];
}

function ncInvoiceAmountHeaderStrategies(page) {
  return [
    {
      name: "columnheader /^Invoice Amount/",
      locator: page.locator('[role="columnheader"]').filter({ hasText: /^Invoice Amount/ }),
    },
  ];
}

function ncConfirmInvoiceButtonStrategies(page) {
  return [
    { name: "button(/confirm invoice/i)", locator: page.getByRole("button", { name: /confirm invoice/i }) },
  ];
}

/** "Confirm Invoice" dialog (Are you sure you want to approve this invoice?) — visible one only. */
function ncConfirmDialogStrategies(page) {
  return [
    {
      name: "dialog has 'approve this invoice' (visible)",
      locator: page.getByRole("dialog").filter({ hasText: /approve this invoice/i }).locator("visible=true"),
    },
  ];
}

function ncConfirmModalButtonStrategies(page) {
  // Scoped to the visible confirm dialog: run 6 clicked a non-visible "Confirm" match and the
  // dialog stayed open (MCP screenshot 2026-11-24).
  const dialog = page.getByRole("dialog").filter({ hasText: /approve this invoice/i }).locator("visible=true");
  return [
    { name: "dialog → button(^Confirm$)", locator: dialog.getByRole("button", { name: /^Confirm$/ }) },
    { name: "visible button(^Confirm$)", locator: page.getByRole("button", { name: /^Confirm$/ }).locator("visible=true") },
  ];
}

/**
 * Budget pre-flight warning after Confirm on an over-budget GL ("Complete the following before
 * confirming … Proceed Anyway") — MCP/run-verified 2026-11-24 on Test Property 1.
 */
function ncProceedAnywayButtonStrategies(page) {
  return [
    {
      name: "dialog(Complete the following) → button(Proceed Anyway)",
      locator: page
        .getByRole("dialog")
        .filter({ hasText: /Complete the following before confirming/i })
        .getByRole("button", { name: "Proceed Anyway" }),
    },
    { name: "visible button(Proceed Anyway)", locator: page.getByRole("button", { name: "Proceed Anyway" }).locator("visible=true") },
  ];
}

/** Visible revo-grid that has a "Vendor" column (Job Summary spend table / CapEx drill-down). */
function ncVendorGridStrategies(page) {
  const header = page.locator('[role="columnheader"]').filter({ hasText: /^Vendor$/ });
  // Innermost grid only: the CapEx drill-down grid is nested INSIDE the CapEx grid, so the outer
  // grid also "has" the Vendor header (run 4 read the outer grid's source). MCP-verified 2026-11-24.
  return [
    {
      name: "innermost revo-grid with Vendor header (visible)",
      locator: page.locator("revo-grid").filter({ has: header }).filter({ hasNot: page.locator("revo-grid") }).locator("visible=true"),
    },
  ];
}

/** Left-panel entry by its exact label. */
function ncSidebarLinkStrategies(page, label) {
  return [
    { name: `link(${label})`, locator: page.getByRole("link", { name: label, exact: true }) },
    { name: `text(${label})`, locator: page.getByText(label, { exact: true }) },
  ];
}

module.exports = {
  ncJobModalStrategies,
  ncJobTypeInputStrategies,
  ncJobTitleInputStrategies,
  ncJobBudgetCategoryButtonStrategies,
  ncJobCreateButtonStrategies,
  ncJobTabStrategies,
  ncCreateInvoiceButtonStrategies,
  ncInvoiceVendorInputStrategies,
  ncInvoiceAmountHeaderStrategies,
  ncConfirmInvoiceButtonStrategies,
  ncConfirmModalButtonStrategies,
  ncConfirmDialogStrategies,
  ncProceedAnywayButtonStrategies,
  ncVendorGridStrategies,
  ncSidebarLinkStrategies,
};
