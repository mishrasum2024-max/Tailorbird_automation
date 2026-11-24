/**
 * Draw Reporting overview — calculated values (TC608).
 *
 * MCP-verified 2026-11-24 (dashboard → Draw Reporting → Test Property 6_Draw reporting):
 * - Tiles (DrawOverviewMetrics.tsx / DrawMetricTile.tsx): "Total Budget", "Draws to Date",
 *   "Remaining Budget", "Pending Invoices", and — only while a Draft draw exists —
 *   "Active Draw (Draw in progress)". Each tile renders its title as exact text with the currency
 *   value in the same tile.
 * - CapEx Status (DrawOverviewCapexStatus.tsx): "<n>% Drawn ($x)" and "<n>% Remaining ($y)", then
 *   one "<name> … <n>%" line per budget item.
 * - Current draw card (DrawOverviewCurrentDrawCard.tsx, only with a Draft draw): labels
 *   "Draw Amount", "Invoices Included", "Warnings".
 */
const DRAW_TILE_LABELS = ["Total Budget", "Draws to Date", "Remaining Budget", "Pending Invoices"];
const ACTIVE_DRAW_TILE_LABEL = "Active Draw (Draw in progress)";

/** Element holding exact label text inside the main area (multi-locator, element-based first). */
function drawExactTextStrategies(page, text) {
  return [
    { name: "main text(exact)", locator: page.getByRole("main").getByText(text, { exact: true }) },
    { name: "text(exact)", locator: page.getByText(text, { exact: true }) },
  ];
}

/** CapEx Status summary lines. */
function capexDrawnLineStrategies(page) {
  return [
    { name: "main text /% Drawn ($/", locator: page.getByRole("main").getByText(/^\d+% Drawn \(/) },
    { name: "text /% Drawn ($/", locator: page.getByText(/^\d+% Drawn \(/) },
  ];
}
function capexRemainingLineStrategies(page) {
  return [
    { name: "main text /% Remaining ($/", locator: page.getByRole("main").getByText(/^\d+% Remaining \(/) },
    { name: "text /% Remaining ($/", locator: page.getByText(/^\d+% Remaining \(/) },
  ];
}

/** Tab panels holding the two grids. */
function drawTabPanelStrategies(page, name) {
  return [
    { name: `tabpanel ${name}`, locator: page.getByRole("tabpanel", { name }) },
    { name: "main", locator: page.getByRole("main") },
  ];
}

module.exports = {
  DRAW_TILE_LABELS,
  ACTIVE_DRAW_TILE_LABEL,
  drawExactTextStrategies,
  capexDrawnLineStrategies,
  capexRemainingLineStrategies,
  drawTabPanelStrategies,
};
