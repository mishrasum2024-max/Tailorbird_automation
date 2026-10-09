# Investigation Context — TC376

## Origin of this investigation

Unlike other entries under `ai-agent/investigations/`, no CI-generated `failure.json`/trace/screenshot
existed for this run — the user pasted the failure directly from an HTML report. `failure.json` in
this directory was hand-authored from that pasted text. No `stdout`, `steps[]`, `trace.zip`, or
`error-context.md` are available for this specific run. This context.md instead documents what was
established through source inspection, git history, and live MCP browser verification.

## Test identity

- Test Case: TC376 @drawReporting @regression : Verify Draw calculations for CM Fee, Current Draw
  Request, and disbursement amounts
- Test File: tests/TC25_Draw_reporting.spec.js:318
- Failure Line: tests/TC25_Draw_reporting.spec.js:353
- Failed assertion:
  `expect(totalAfterInclude.currentDraw, 'Disbursement Total "Current Draw" must equal the raw invoice amount').toBeCloseTo(10, 2);`
- Expected: 10, Received: 12 (difference of exactly 2)

## Test flow leading to the failure

1. Creates a fresh $10 pending invoice on job 4330 (property "Test Property 6_Draw reporting").
2. Navigates to Draw Reporting, selects that property, creates a new draw `CALC_Draw_<ts>`.
3. `excludeAllInvoicesInDraft()` — unchecks every pre-existing invoice so the draft starts clean.
4. Reads the "Bathroom fixtures install" budget-item row and the "Total" row BEFORE including the
   new invoice (`budgetItemBefore`, `totalBefore`).
5. `includeInvoiceInDraw()` — checks the new $10 invoice.
6. Reads CM Fee amount (`readCmFeeInvoiceAmount()`) — asserted to be $10 * 20% = $2.00. **This
   assertion passes** (not in the reported failure).
7. Reads "Current Draw Request" KPI — asserted to be $10 + $2 = $12. **This assertion passes.**
8. Reads the "Bathroom fixtures install" row again (`budgetItemAfterInclude`) — asserts
   `currentDraw` ≈ 10 (raw invoice amount only, CM Fee excluded). **This assertion passes.**
9. Reads the "Total" row again (`totalAfterInclude`) — asserts `currentDraw` ≈ 10. **This is the
   assertion that fails, with Received: 12.**

## Source evidence

- `pages/drawReportingPage.js:1245` `readDisbursementRowValuesInEditor(budgetItemName)` — finds the
  table row by `getByRole('row').filter({ hasText: budgetItemName })` inside the draw editor dialog,
  then destructures its 8 cells positionally: `[budgetItem, currentBudget, committed, reallocation,
  budgetRemaining, drawn, currentDraw, drawRemaining]`. This exact method is reused for BOTH the
  named budget-item row and the "Total" row — same code path, so a locator/parsing bug would be
  expected to affect both identically (it did not — the budget-item row passed).
- Git history: `readDisbursementRowValuesInEditor` was added in a single commit and has never been
  modified since (`git log -p` shows only one addition, no edits) — ruling out "a recent change to
  this method broke the assertion."
- The most recent commit touching this file (`2e7aaca "fixes full"`) was 55 pure insertions (0
  deletions) adding a performance fast-path to `excludeAllInvoicesInDraft()` — unrelated to row
  reading/parsing.

## MCP live verification (the decisive evidence)

Logged in as admin (`summit.harsha@tailorbird.us`, org "QA Automations Org_2026"), navigated to
`/financials/draw-reporting?propertyId=8659` ("Test Property 6_Draw reporting" — the exact property
TC376 uses). The test's own failed run had left its in-progress draw
(`CALC_Draw_1789729856017`, Draw Amount $12.00, 1 invoice included) undiscarded on the property
(the test throws before reaching `discardDraw()`), so this is the EXACT state TC376 produced,
inspected directly rather than reconstructed.

Opening that draw's "Draw disbursement schedule" table live showed:

| Budget Item | Current Draw |
|---|---|
| Bathroom fixtures install | **$10.00** |
| Concrete | $0.00 |
| ... (9 other budget items) | $0.00 |
| **Uncategorized** | **$2.00** |
| Water supply piping | $0.00 |
| **Total** | **$12.00** |

The Invoices panel for this same draw shows two line items: the real invoice ("Invoice #29246",
$10.00) and a separate, non-deselectable "CM Fee Invoice (TBD)" line ($2.00, "QA Automations Org_2026
CM Fee Vendor").

$10.00 (Bathroom fixtures install) + $2.00 (Uncategorized) = $12.00 (Total) — exactly matching the
failure's "Received: 12".

## Root-cause mechanism

The CM Fee invoice is not excluded from the disbursement schedule at all — it is a real dollar
amount that the application posts against a budget item, specifically **"Uncategorized"** on this
property (there is no dedicated "CM Fee" scope configured here). Each individual named budget-item
row's `currentDraw` correctly reflects only what was drawn against *that specific* line (so
"Bathroom fixtures install" = $10, untouched by CM Fee), but the "Total" row is a genuine sum across
**every** budget-item row, including "Uncategorized" — so it correctly includes the CM Fee's own
$2.00 disbursement. The "Uncategorized" row's own "Drawn" column already showed $6.00 accumulated
from prior draws on this long-lived shared property, consistent with CM Fee amounts routinely
landing there across multiple past test runs — not a one-off glitch.
