# Failure Investigation Report

## Test

Test Case: TC376 @drawReporting @regression : Verify Draw calculations for CM Fee, Current Draw Request, and disbursement amounts

Test File: tests/TC25_Draw_reporting.spec.js (test defined at line 318)

Browser: chromium

Failure Location: tests/TC25_Draw_reporting.spec.js:353

---

## Classification

Type: **AUTOMATION_BUG**

Confidence: **92%**

---

## Initial Hypotheses

1. **PRODUCT_BUG** — the disbursement schedule's "Total" row incorrectly sums CM Fee into its
   "Current Draw" column, while individual line items correctly exclude it (an aggregation defect).
2. **AUTOMATION_BUG (column misalignment)** — `readDisbursementRowValuesInEditor`'s fixed-position
   cell destructuring is correct for a normal row but misaligned for the "Total" row (e.g. a
   colspan/merged label cell shifting every subsequent column by one), causing it to accidentally
   read the wrong column's value into `currentDraw`.
3. **AUTOMATION_BUG (stale/pre-existing invoice)** — the shared, long-lived property ("Test
   Property 6_Draw reporting" has 373+ accumulated invoices from prior runs) left an extra invoice
   included in the "fresh" draft despite `excludeAllInvoicesInDraft()`, inflating the Total by
   exactly $2 coincidentally.
4. **AUTOMATION_BUG (wrong test assumption)** — the test assumes "CM Fee is not part of the
   disbursement schedule" universally, but the application actually posts the CM Fee amount against
   a real budget item (e.g. "Uncategorized"), which the Total row correctly includes by summing all
   budget items — making the test's expected value for Total wrong, not the application's output.

---

## Evidence

### Test Evidence

- The failure is precise and deterministic: Expected 10, Received 12 — a difference of exactly
  $2.00, which is exactly the CM Fee amount the test itself computes and asserts two lines earlier
  (`cmFeeAfterDefault ≈ 10 * 0.20 = 2`, itself passing).
- The immediately preceding assertion on the SAME read method, for the "Bathroom fixtures install"
  row, passes with `currentDraw ≈ 10` — ruling out a systemic parsing failure across the board.

### Source Evidence

- `pages/drawReportingPage.js:1245` — `readDisbursementRowValuesInEditor(budgetItemName)` uses one
  shared code path for both the named-item row and the "Total" row: a `getRole('row').filter({
  hasText })` lookup + positional cell destructuring. Since the "Bathroom fixtures install" read via
  this exact method passed, the method's parsing logic itself is not the defect.
- `git log -p` shows this method was added once and never modified — no recent regression in the
  reading logic itself.

### Git Evidence

- Most recent commit touching `drawReportingPage.js` (`2e7aaca "fixes full"`) is 55 pure insertions,
  0 deletions — an unrelated performance fast-path for `excludeAllInvoicesInDraft()`. No commit in
  recent history touches the Total-row assertion or its reading logic.

### MCP Browser Evidence

- Logged in as admin, opened the exact draw (`CALC_Draw_1789729856017`) that TC376's own failed run
  had left in-progress (undiscarded) on "Test Property 6_Draw reporting" — i.e. inspected the EXACT
  state the test produced, live, not a reconstruction.
- The live "Draw disbursement schedule" table shows: "Bathroom fixtures install" Current Draw =
  $10.00 (correct, matches the invoice); a separate "Uncategorized" row's Current Draw = $2.00; and
  "Total" Current Draw = $12.00 = $10.00 + $2.00.
- The Invoices panel shows the CM Fee as its own non-deselectable line ("CM Fee Invoice (TBD)",
  $2.00) alongside the real invoice ($10.00) — confirming the CM Fee is a real, separately-tracked
  dollar amount, not a display-only calculation.
- The "Uncategorized" row's own "Drawn" (historical) column already showed $6.00 accumulated from
  prior draws on this shared property — consistent with CM Fee amounts routinely landing on
  "Uncategorized" across many past runs, not a one-off anomaly.

---

## MCP Verification

Browser flow: Logged in as admin (summit.harsha@tailorbird.us, org "QA Automations Org_2026") →
navigated to `/financials/draw-reporting?propertyId=8659` ("Test Property 6_Draw reporting", the
exact property TC376 uses) → opened the in-progress draw TC376's failed run had left behind →
inspected the "Draw disbursement schedule" table and Invoices panel directly.

Actual behavior: The CM Fee amount ($2.00) is posted as a real disbursement against the
"Uncategorized" budget item (since this property has no dedicated CM-Fee scope configured), and the
"Total" row correctly sums every budget item's Current Draw, including "Uncategorized" — giving
Total = $12.00.

Expected behavior (per the test): Total "Current Draw" should equal only the raw invoice amount
($10.00), treating CM Fee as entirely outside the disbursement schedule.

Reproduction result: **Reproduced deterministically.** The live values match the failure exactly
($10 + $2 = $12), and the mechanism (CM Fee landing on "Uncategorized," itself summed into Total) is
directly visible in the UI, not inferred.

Verified root cause: The test's assumption that "CM Fee is not part of the disbursement schedule"
is correct only for a SPECIFIC named budget-item row that CM Fee doesn't touch — it is not a
correct assumption for the Total row, which by definition sums every budget item, including
whichever one the CM Fee actually gets disbursed against. The test's own comment even documents
this assumption explicitly on line 349's assertion ("CM Fee is not part of the disbursement
schedule") and the author then over-applied that same assumption to the Total row.

---

## Root Cause

The application is behaving consistently and correctly: CM Fee is a real dollar amount that must be
disbursed against some budget item, and on this property it lands on "Uncategorized" (no dedicated
CM-Fee scope exists). The Total row's "Current Draw" is a genuine sum across all budget items and
therefore legitimately includes that $2.00 — it is not a bug in aggregation. The test's assertion at
line 353 (`toBeCloseTo(10, 2)`) embeds an incorrect expected value: it should account for the CM Fee
that the SAME test just confirmed exists and would be posted (the test already reads and asserts
`cmFeeAfterDefault ≈ 2` two lines earlier), i.e. the correct expectation is `10 + cmFeeAfterDefault`
(= 12), matching the exact pattern already used one line earlier for the KPI assertion at line 346
(`currentDrawRequestAfterInclude ... toBeCloseTo(10 + cmFeeAfterDefault, 2)`).

This is a test-authoring inconsistency: line 346 correctly includes CM Fee in its expectation for
the KPI, but line 353 does not include it for the Total row, even though both represent the same
underlying "everything currently being drawn" figure.

---

## Self-Healing Decision

Allowed: **NO (not in this investigation-only run)**

Reason: The skill invocation for this task was explicitly investigation-only ("Do NOT modify
code... Do NOT attempt self-healing yet"). Although the verified root cause (AUTOMATION_BUG, fully
MCP-verified, fix confined to automation code, directly explainable) satisfies all of the
Self-Healing Gate's technical conditions, the human has not yet reviewed this report or explicitly
authorized the fix step. Self-healing should only proceed as an explicit next step after this report
is reviewed.

---

## Proposed Fix

File: tests/TC25_Draw_reporting.spec.js

Change: Line 353 — change the Total row's expected Current Draw from a hardcoded `10` to `10 +
cmFeeAfterDefault` (mirroring line 346's already-correct pattern for the KPI assertion), and update
its message to state the corrected expectation, e.g.:

```js
expect(totalAfterInclude.currentDraw, 'Disbursement Total "Current Draw" must equal the raw invoice amount + CM Fee (CM Fee is posted against a real budget item, so it IS included in the Total)').toBeCloseTo(10 + cmFeeAfterDefault, 2);
```

Line 354's dependent assertion (`drawRemaining`) already subtracts a hardcoded `10` from
`totalBefore.budgetRemaining` — it would need the same `+ cmFeeAfterDefault` adjustment to stay
consistent with the corrected Total.

Reason: Matches the verified root cause exactly — the Total legitimately includes CM Fee, so the
test's expectation should too, using the exact same `cmFeeAfterDefault` value the test already
computed for the (correct) KPI assertion two lines above.

---

## Validation Plan

Affected test: Re-run `TC376` alone (`npx playwright test TC25_Draw_reporting.spec.js -g TC376`)
after the fix and confirm it passes without weakening the assertion (it must still fail if Total
ever stops including CM Fee, or if the CM Fee percentage/amount itself changes unexpectedly).

Regression: Re-run the full `TC25_Draw_reporting.spec.js` file (`TC372`–onward, serial mode) since
these tests share mutable state on the same live property, to confirm no other test in the same
file was relying on the old (incorrect) expectation or is otherwise affected by this file's own
ordering.
