/**
 * Budget revision editor — summary tiles (TC607).
 *
 * MCP-verified 2026-11-24 (dashboard → Budget → Test Property 2_The Westerham → draft revision
 * editor): seven tiles render their label as exact text with the currency value in the same card
 * ("Original Total", "Current Budget Total", "Total Increase", "Total Decrease",
 * "Total Reallocated", "Adjusted Total", "Net Change"). Tile values come from
 * app/financials/budget/components/BudgetRevisionEditor.tsx (summaryTotals) and are rendered by
 * BudgetSummaryCards.tsx.
 */
const REVISION_TILE_LABELS = [
  "Original Total",
  "Current Budget Total",
  "Total Increase",
  "Total Decrease",
  "Total Reallocated",
  "Adjusted Total",
  "Net Change",
];

/** Label element of one summary tile (multi-locator, element-based first). */
function revisionTileLabelStrategies(page, label) {
  return [
    { name: "text(exact) in main", locator: page.getByRole("main").getByText(label, { exact: true }) },
    { name: "text(exact)", locator: page.getByText(label, { exact: true }) },
  ];
}

module.exports = { REVISION_TILE_LABELS, revisionTileLabelStrategies };
