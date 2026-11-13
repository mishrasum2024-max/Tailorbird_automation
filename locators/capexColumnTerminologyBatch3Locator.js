/** FEAT-1236 batch 3: Draw editor (Step 2) "Draw disbursement schedule" column headers (MCP-verified 2026-11-06). */
function drawDisbursementLocators(page) {
  const editor = page
    .getByRole("dialog")
    .filter({
      has: page.getByText("Draw disbursement schedule", { exact: true }),
    })
    .first();
  return {
    editor,
    headers: editor
      .getByRole("columnheader")
      .or(editor.getByRole("table").getByRole("columnheader"))
      .or(editor.locator("th")),
  };
}

module.exports = { drawDisbursementLocators };
