/**
 * "Table settings" drawer that replaced the table-action menu ("Add column" / "Hide/Show
 * columns") and the "Manage Columns" dialog. MCP-verified 2026-10-30 on beta.tailorbird.com
 * (Budget grid, Test Property 2_The Westerham):
 * - The table-action button (data-testid "bt-table-action") opens the drawer directly.
 * - Header: "Table settings", "<Table> · changes preview live in the table", tag
 *   "Organization default"; sections "Columns" and "Rows & sections"; footer "Cancel",
 *   "Save for everyone", "Save changes" (disabled until a pending change such as a new section).
 * - Every column is a row: number, "Drag to reorder", textbox "<name> display name", and for
 *   custom columns "Edit column", a ⋮ menu button (aria-haspopup="menu", no accessible name)
 *   and "Hide <name>" / "Show <name>".
 * - "+ Add column" (data-testid "bt-table-action-add-column") opens an inline form:
 *   "Column name *" (placeholder "e.g. Site Contact"), "Description *" (placeholder "Enter
 *   column description"), "Column type" buttons, "Cancel" and "Add column" (disabled until
 *   name and description are filled). Add → POST /api/bird-table/columns.
 * - ⋮ menu: "Add to Filter", "Add to Budget Creation Form", "Delete column" → dialog
 *   "Delete Column" (Cancel / Delete) → DELETE /api/bird-table/columns.
 */

/** Column type buttons in picker order; accessible name = icon + label (index 0 = Text, …). */
const TABLE_SETTINGS_TYPE_BUTTONS = [
  "T Text",
  "123 Number",
  "▼ Select",
  "☑ Multi-select",
  "📅 Date",
  "☐ Checkbox",
  "🔗 URL",
  "✉ Email",
  "📞 Phone",
  "$ Currency",
  "🖼 Thumbnail",
  "📎 Attachments",
  "👤 User",
];

function tableSettingsLocators(page) {
  const drawer = page
    .getByRole("dialog")
    .filter({ has: page.getByText("Table settings", { exact: true }) })
    .first();

  const nameInput = drawer
    .getByPlaceholder("e.g. Site Contact")
    .or(drawer.getByRole("textbox", { name: "Column name", exact: true }))
    .first();

  // Innermost element holding both the new-column name input and its "Add column" submit.
  const addColumnForm = drawer
    .locator("div")
    .filter({ has: page.getByPlaceholder("e.g. Site Contact") })
    .filter({
      has: page.getByRole("button", { name: "Add column", exact: true }),
    })
    .last();

  /** The row of one column, found by its display-name textbox (exact name). */
  const columnRow = name =>
    drawer
      .locator("div")
      .filter({
        has: page.getByRole("textbox", {
          name: `${name} display name`,
          exact: true,
        }),
      })
      .filter({ has: page.getByRole("button", { name: "Drag to reorder" }) })
      .last();

  const deleteColumnDialog = page
    .getByRole("dialog", { name: "Delete Column" })
    .or(
      page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Delete Column" }) })
    )
    .first();

  return {
    drawer,
    title: drawer.getByText("Table settings", { exact: true }),
    subtitle: drawer.getByText(/changes preview live in the table/i),
    organizationDefaultTag: drawer.getByText("Organization default", {
      exact: true,
    }),
    columnsHeading: drawer.getByText("Columns", { exact: true }),
    columnsHint: drawer.getByText(
      "Drag to reorder. Rename inline. Hide columns you don't need. Locked columns are system-managed.",
      { exact: true }
    ),
    rowsSectionsHeading: drawer.getByText("Rows & sections", { exact: true }),
    rowsSectionsHint: drawer.getByText(
      "Organize rows into sections. Drag sections to reorder and rename inline.",
      { exact: true }
    ),
    closeButton: drawer.getByRole("button", { name: "Close", exact: true }),
    addColumnTrigger: drawer
      .getByTestId("bt-table-action-add-column")
      .or(drawer.getByRole("button", { name: "Add column", exact: true }))
      .first(),
    addSectionButton: drawer.getByRole("button", {
      name: "Add section",
      exact: true,
    }),
    footerCancelButton: drawer
      .getByRole("button", { name: "Cancel", exact: true })
      .last(),
    saveForEveryoneButton: drawer.getByRole("button", {
      name: "Save for everyone",
    }),
    saveChangesButton: drawer.getByRole("button", {
      name: "Save changes",
      exact: true,
    }),

    addColumnForm,
    nameInput,
    nameLabel: addColumnForm
      .locator("label")
      .filter({ hasText: "Column name" }),
    descriptionInput: addColumnForm
      .getByPlaceholder("Enter column description")
      .or(
        addColumnForm.getByRole("textbox", { name: "Description", exact: true })
      )
      .first(),
    descriptionLabel: addColumnForm
      .locator("label")
      .filter({ hasText: "Description" }),
    columnTypeLabel: addColumnForm.getByText("Column type", { exact: true }),
    typeButton: index =>
      addColumnForm.getByRole("button", {
        name: TABLE_SETTINGS_TYPE_BUTTONS[index],
        exact: true,
      }),
    formCancelButton: addColumnForm.getByRole("button", {
      name: "Cancel",
      exact: true,
    }),
    formSubmitButton: addColumnForm.getByRole("button", {
      name: "Add column",
      exact: true,
    }),

    columnNameTextboxes: drawer.getByRole("textbox", {
      name: / display name$/,
    }),
    columnRow,
    columnDisplayName: name =>
      drawer.getByRole("textbox", {
        name: `${name} display name`,
        exact: true,
      }),
    rowEditButton: name =>
      columnRow(name).getByRole("button", { name: "Edit column", exact: true }),
    // The ⋮ button has no accessible name — aria-haspopup="menu" is its only stable signal.
    rowMenuButton: name =>
      columnRow(name).locator('button[aria-haspopup="menu"]').first(),
    rowHideButton: name =>
      columnRow(name).getByRole("button", {
        name: `Hide ${name}`,
        exact: true,
      }),

    columnMenu: page.getByRole("menu").last(),
    columnMenuItem: label =>
      page.getByRole("menu").last().getByRole("menuitem", {
        name: label,
        exact: true,
      }),

    deleteColumnDialog,
    deleteColumnHeading: deleteColumnDialog.getByRole("heading", {
      name: "Delete Column",
    }),
    deleteColumnMessage: name =>
      deleteColumnDialog.getByText(
        `Are you sure you want to delete the "${name}" column? This will permanently remove the column and all its data.`,
        { exact: true }
      ),
    deleteColumnCancel: deleteColumnDialog.getByRole("button", {
      name: "Cancel",
      exact: true,
    }),
    deleteColumnConfirm: deleteColumnDialog.getByRole("button", {
      name: "Delete",
      exact: true,
    }),
  };
}

module.exports = { tableSettingsLocators, TABLE_SETTINGS_TYPE_BUTTONS };
