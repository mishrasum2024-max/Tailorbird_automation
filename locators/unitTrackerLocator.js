/**
 * Locators for the Unit Tracker page (beta.tailorbird.com/unit-tracker).
 *
 * MCP-verified 2026-10-26 (owner session, headed MCP browser, property "Test Property 2_The Westerham"):
 * - Before a property is chosen, main shows only the breadcrumb (Home / Unit Tracker) and a
 *   "Select a Property" button; it opens a menu with a "Search properties..." box and
 *   menuitems. The choice is not remembered on the next visit.
 * - Toolbar: "Search..." textbox + "Search" button, then Filter / View / Table / Export buttons;
 *   "Update Status" appears only while a grid row checkbox is ticked.
 * - Grid: a RevoGrid rendered as role="treegrid" with pinned panes; unit rows carry a
 *   `button.tree-toggle` (no accessible name besides "›") and a row checkbox.
 * - Filter: a floating Mantine Paper ("Filters" / "Filter Options") outside main, one
 *   checkbox group per column (each group has its own "Search..." box — so the grid search
 *   is always scoped to main), a Reno Date From/To pair, Clear / Apply, "Reset Filters"
 *   (only while a filter is active) and a CloseButton.
 * - View: a popover (role="dialog") with "Enter a view name" + check/x icon buttons, one
 *   button per saved view (trash icon inside), and "Reset to default" while a view is active.
 * - Update Status: a menu of 5 menuitems, then a confirmation dialog named "Update Status".
 *
 * Every element is a healingLocator([...]) strategy list (utils/locatorHealer.js) —
 * element-based Playwright methods first; CSS only as a fallback for role-less elements.
 */

function textButtonStrategies(scope, name) {
  return [
    {
      name: "role:button(exact)",
      locator: scope.getByRole("button", { name, exact: true }),
    },
    {
      name: "button has text(exact)",
      locator: scope
        .locator("button")
        .filter({ has: scope.getByText(name, { exact: true }) }),
    },
  ];
}

function unitTrackerMenuItemStrategies(menu, item) {
  return [
    {
      name: "role:menuitem(exact)",
      locator: menu.getByRole("menuitem", { name: item, exact: true }),
    },
    {
      name: "menu button has text(exact)",
      locator: menu
        .locator("button")
        .filter({ has: menu.getByText(item, { exact: true }) }),
    },
  ];
}

function selectPropertyButtonStrategies(page, name) {
  const main = page.getByRole("main");
  return [
    {
      name: "role:button(exact)",
      locator: main.getByRole("button", { name, exact: true }),
    },
    {
      name: "main button has text(exact)",
      locator: main
        .locator("button")
        .filter({ has: page.getByText(name, { exact: true }) }),
    },
  ];
}

function propertyMenuStrategies(page, searchPlaceholder) {
  return [
    {
      name: "role:menu has search box",
      locator: page
        .getByRole("menu")
        .filter({ has: page.getByPlaceholder(searchPlaceholder) }),
    },
    {
      name: "css:[role=menu] has search box",
      locator: page
        .locator('[role="menu"]')
        .filter({ has: page.getByPlaceholder(searchPlaceholder) }),
    },
  ];
}

function propertySearchStrategies(menu, placeholder) {
  return [
    { name: "placeholder", locator: menu.getByPlaceholder(placeholder) },
    {
      name: "role:textbox",
      locator: menu.getByRole("textbox", { name: placeholder }),
    },
  ];
}

function propertyOptionStrategies(menu, propertyName) {
  return [
    {
      name: "role:menuitem has text",
      locator: menu.getByRole("menuitem").filter({ hasText: propertyName }),
    },
    {
      name: "menu button has text",
      locator: menu.locator("button").filter({ hasText: propertyName }),
    },
  ];
}

function breadcrumbHomeStrategies(page, home) {
  const main = page.getByRole("main");
  return [
    {
      name: "role:link Home",
      locator: main.getByRole("link", { name: home, exact: true }),
    },
    {
      name: 'main a[href="/"]',
      locator: main
        .locator('a[href="/"]')
        .filter({ has: page.getByText(home, { exact: true }) }),
    },
  ];
}

function mainTextStrategies(page, text) {
  const main = page.getByRole("main");
  return [
    {
      name: "main text(exact)",
      locator: main.getByText(text, { exact: true }),
    },
    {
      name: "main p has text(exact)",
      locator: main
        .locator("p")
        .filter({ has: page.getByText(text, { exact: true }) }),
    },
  ];
}

function gridSearchInputStrategies(page, placeholder) {
  const main = page.getByRole("main");
  return [
    {
      name: "main role:textbox",
      locator: main.getByRole("textbox", { name: placeholder, exact: true }),
    },
    {
      name: "main placeholder",
      locator: main.getByPlaceholder(placeholder, { exact: true }),
    },
  ];
}

function gridStrategies(page) {
  const main = page.getByRole("main");
  return [
    { name: "role:treegrid", locator: main.getByRole("treegrid") },
    { name: "css:revo-grid", locator: main.locator("revo-grid") },
  ];
}

/** A grid row (left pinned pane) whose label cell text is exactly `label`. */
function gridRowStrategies(page, grid, label) {
  return [
    {
      name: "role:row has text(exact)",
      locator: grid
        .getByRole("row")
        .filter({ has: page.getByText(label, { exact: true }) }),
    },
    {
      name: "css:[role=row][data-rgrow] has text(exact)",
      locator: grid
        .locator('[role="row"][data-rgrow]')
        .filter({ has: page.getByText(label, { exact: true }) }),
    },
  ];
}

function rowToggleStrategies(row) {
  return [
    {
      name: "role:button ›",
      locator: row.getByRole("button", { name: "›", exact: true }),
    },
    {
      name: "css:button.tree-toggle",
      locator: row.locator("button.tree-toggle"),
    },
  ];
}

function rowCheckboxStrategies(row) {
  return [
    { name: "role:checkbox", locator: row.getByRole("checkbox") },
    {
      name: "css:input[type=checkbox]",
      locator: row.locator('input[type="checkbox"]'),
    },
  ];
}

/** The floating filter Paper (outside main): the one holding "Filter Options" and Apply. */
function filterPanelStrategies(page, subtitle, apply) {
  return [
    // Both strategies resolve to the same Paper node (a different-node fallback would make the
    // healed .or() match twice and fail strict mode).
    {
      name: "css:.mantine-Paper-root has subtitle + apply",
      locator: page
        .locator(".mantine-Paper-root")
        .filter({ has: page.getByText(subtitle, { exact: true }) })
        .filter({
          has: page.getByRole("button", { name: apply, exact: true }),
        }),
    },
    {
      name: "css:.mantine-Paper-root has subtitle + date inputs",
      locator: page
        .locator(".mantine-Paper-root")
        .filter({ has: page.getByText(subtitle, { exact: true }) })
        .filter({
          has: page.getByRole("button", { name: "Clear", exact: true }),
        }),
    },
  ];
}

/** One checkbox group inside the filter panel: the innermost container with its header and option. */
function filterGroupStrategies(page, panel, group, option) {
  return [
    // Same innermost container either way: the option is found by its label, or by the
    // checkbox's accessible name (identical text), so the healed .or() stays one node.
    {
      name: "css:div has header(exact)+label(exact)",
      locator: panel
        .locator("div")
        .filter({ has: page.getByText(group, { exact: true }) })
        .filter({ has: page.getByLabel(option, { exact: true }) })
        .last(),
    },
    {
      name: "css:div has header(exact)+role:checkbox(exact)",
      locator: panel
        .locator("div")
        .filter({ has: page.getByText(group, { exact: true }) })
        .filter({
          has: page.getByRole("checkbox", { name: option, exact: true }),
        })
        .last(),
    },
  ];
}

function labelledCheckboxStrategies(scope, label) {
  return [
    { name: "label(exact)", locator: scope.getByLabel(label, { exact: true }) },
    {
      name: "role:checkbox(exact)",
      locator: scope.getByRole("checkbox", { name: label, exact: true }),
    },
  ];
}

function placeholderInputStrategies(scope, placeholder, label) {
  return [
    {
      name: "placeholder",
      locator: scope.getByPlaceholder(placeholder, { exact: true }),
    },
    { name: "label(exact)", locator: scope.getByLabel(label, { exact: true }) },
  ];
}

function filterCloseButtonStrategies(panel) {
  return [
    {
      name: "css:.mantine-CloseButton-root",
      locator: panel.locator(".mantine-CloseButton-root"),
    },
    {
      name: "first button of panel",
      locator: panel.getByRole("button").first(),
    },
  ];
}

/** The View popover (role="dialog") — the one with the "Enter a view name" box. */
function viewPopoverStrategies(page, placeholder) {
  return [
    {
      name: "role:dialog has name input",
      locator: page
        .getByRole("dialog")
        .filter({ has: page.getByPlaceholder(placeholder) }),
    },
    {
      name: "css:.mantine-Popover-dropdown has name input",
      locator: page
        .locator(".mantine-Popover-dropdown")
        .filter({ has: page.getByPlaceholder(placeholder) }),
    },
  ];
}

/** The "save view" check icon button next to the view name box (no accessible name). */
function saveViewButtonStrategies(page, popover) {
  return [
    {
      name: "css:button has svg.lucide-check",
      locator: popover
        .locator("button")
        .filter({ has: page.locator("svg.lucide-check") })
        .first(),
    },
    {
      name: "css:.mantine-ActionIcon-root has svg.lucide-check",
      locator: popover
        .locator(".mantine-ActionIcon-root")
        .filter({ has: page.locator("svg.lucide-check") })
        .first(),
    },
  ];
}

function savedViewButtonStrategies(popover, viewName) {
  return [
    {
      name: "role:button(exact)",
      locator: popover.getByRole("button", { name: viewName, exact: true }),
    },
    {
      name: "css:button[data-table-action] has text(exact)",
      locator: popover
        .locator("button[data-table-action]")
        .filter({ has: popover.getByText(viewName, { exact: true }) }),
    },
  ];
}

/** Trash icon button inside a saved view's button (no accessible name). */
function deleteViewButtonStrategies(page, viewButton) {
  return [
    {
      name: "css:button has svg.lucide-trash-2",
      locator: viewButton
        .locator("button")
        .filter({ has: page.locator("svg.lucide-trash-2") }),
    },
    {
      name: "css:.mantine-ActionIcon-root inside view",
      locator: viewButton.locator(".mantine-ActionIcon-root"),
    },
  ];
}

function menuItemStrategies(page, name) {
  return [
    {
      name: "role:menuitem(exact)",
      locator: page.getByRole("menuitem", { name, exact: true }),
    },
    {
      name: "menu button has text(exact)",
      locator: page
        .getByRole("menu")
        .locator("button")
        .filter({ has: page.getByText(name, { exact: true }) }),
    },
  ];
}

function statusMenuItemsStrategies(page) {
  return [
    {
      name: "role:menu > menuitem",
      locator: page.getByRole("menu").getByRole("menuitem"),
    },
    {
      name: "css:[role=menu] [role=menuitem]",
      locator: page.locator('[role="menu"] [role="menuitem"]'),
    },
  ];
}

function dialogStrategies(page, name) {
  return [
    {
      name: "role:dialog name",
      locator: page.getByRole("dialog", { name, exact: true }),
    },
    {
      name: "role:dialog has heading",
      locator: page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name, exact: true }) }),
    },
  ];
}

function toastStrategies(page, text) {
  return [
    {
      name: "css:.mantine-Notification-root has text",
      locator: page
        .locator(".mantine-Notification-root")
        .filter({ hasText: text }),
    },
    { name: "text", locator: page.getByText(text) },
  ];
}

// ---------- Move-In / Move-Out dates (TC564–TC567) ----------
// MCP-verified 2026-11-16 (owner session, headed MCP browser, Test Property 2_The Westerham):
// - "Move-In Date" / "Move-Out Date" are columnheaders of the unit_tracker treegrid; editable only
//   on unit rows (job / scope row cells carry class "disabled").
// - Double-click opens a Mantine DatePickerInput dropdown (portal): header level button
//   "November 2026", day buttons with accessible names like "20 November 2026".
// - A filled cell carries a "Clear selection" (✕) button. The data pane is revogr-data[type=rgRow];
//   the Total row lives in revogr-data[type=rowPinEnd] with the same data-rgrow, so scope to rgRow.

function columnHeaderStrategies(grid, name) {
  return [
    {
      name: "role:columnheader(exact)",
      locator: grid.getByRole("columnheader", { name, exact: true }),
    },
    {
      name: "css:[role=columnheader] has text(exact)",
      locator: grid
        .locator('[role="columnheader"]')
        .filter({ has: grid.getByText(name, { exact: true }) }),
    },
  ];
}

/** One data cell of the body pane by RevoGrid row index (data-rgrow) and aria-colindex. */
function gridCellStrategies(grid, rowIndex, colIndex) {
  const position = `[aria-colindex="${colIndex}"][data-rgrow="${rowIndex}"]`;
  return [
    {
      name: "role:gridcell in rgRow pane at position",
      locator: grid
        .locator('revogr-data[type="rgRow"]')
        .getByRole("gridcell")
        .and(grid.locator(position)),
    },
    {
      name: "css:rgRow [role=gridcell] at position",
      locator: grid.locator(
        `revogr-data[type="rgRow"] [role="gridcell"]${position}`
      ),
    },
  ];
}

/** The open date-picker dropdown (it is the one holding the month/year level button). */
function datePickerDropdownStrategies(page) {
  return [
    {
      name: "css:.mantine-Popover-dropdown has day button",
      locator: page
        .locator(".mantine-Popover-dropdown")
        .filter({
          has: page.getByRole("button", {
            name: /^\d{1,2} [A-Z][a-z]+ \d{4}$/,
          }),
        }),
    },
    {
      name: "css:.mantine-Popover-dropdown has calendar level",
      locator: page
        .locator(".mantine-Popover-dropdown")
        .filter({
          has: page.locator(".mantine-DatePickerInput-calendarHeaderLevel"),
        }),
    },
  ];
}

function calendarLevelStrategies(calendar) {
  return [
    {
      name: "role:button Month YYYY",
      locator: calendar.getByRole("button", { name: /^[A-Z][a-z]+ \d{4}$/ }),
    },
    {
      name: "css:.mantine-DatePickerInput-calendarHeaderLevel",
      locator: calendar.locator(".mantine-DatePickerInput-calendarHeaderLevel"),
    },
  ];
}

/** A day button, e.g. "20 November 2026" (outside-month days have their own month in the name). */
function calendarDayStrategies(calendar, dayName) {
  return [
    {
      name: "role:button(exact)",
      locator: calendar.getByRole("button", { name: dayName, exact: true }),
    },
    {
      name: "css:button[aria-label]",
      locator: calendar.locator(`button[aria-label="${dayName}"]`),
    },
  ];
}

function cellClearButtonStrategies(cell, name) {
  return [
    {
      name: "role:button(exact)",
      locator: cell.getByRole("button", { name, exact: true }),
    },
    {
      name: "css:button.revo-grid-cell-clear-btn",
      locator: cell.locator("button.revo-grid-cell-clear-btn"),
    },
  ];
}

function tabStrategies(page, name) {
  return [
    {
      name: "role:tab(exact)",
      locator: page.getByRole("tab", { name, exact: true }),
    },
    {
      name: "css:[role=tab] has text(exact)",
      locator: page
        .locator('[role="tab"]')
        .filter({ has: page.getByText(name, { exact: true }) }),
    },
  ];
}

module.exports = {
  columnHeaderStrategies,
  gridCellStrategies,
  datePickerDropdownStrategies,
  calendarLevelStrategies,
  calendarDayStrategies,
  cellClearButtonStrategies,
  tabStrategies,
  textButtonStrategies,
  unitTrackerMenuItemStrategies,
  selectPropertyButtonStrategies,
  propertyMenuStrategies,
  propertySearchStrategies,
  propertyOptionStrategies,
  breadcrumbHomeStrategies,
  mainTextStrategies,
  gridSearchInputStrategies,
  gridStrategies,
  gridRowStrategies,
  rowToggleStrategies,
  rowCheckboxStrategies,
  filterPanelStrategies,
  filterGroupStrategies,
  labelledCheckboxStrategies,
  placeholderInputStrategies,
  filterCloseButtonStrategies,
  viewPopoverStrategies,
  saveViewButtonStrategies,
  savedViewButtonStrategies,
  deleteViewButtonStrategies,
  menuItemStrategies,
  statusMenuItemsStrategies,
  dialogStrategies,
  toastStrategies,
};
