# Failure Investigation Report

## Test

Test Case: TC69 @property @regression : Verify Add Column functionality on the Property Overview tab (Property Documents grid)

Test File: tests/TC04_properties.spec.js

Browser: chromium

Failure Location: tests/TC04_properties.spec.js:1304 (`await expect(page.getByRole('columnheader', { name: columnName, exact: true })).toBeVisible({ timeout: 10000 });`)

---

## Classification

Type: AUTOMATION_BUG

Confidence: 95%

---

## Initial Hypotheses

1. **Timing/async rendering** — the app creates the column successfully, but the header renders asynchronously after the 10s window closes.
2. **Product bug** — the "Add column" action fails at the API level for this specific grid, so the column is never created.
3. **Virtualization** — the Property Documents grid is a RevoGrid virtualized table; a newly-added column is appended to the far right of the column set and the grid never mounts a DOM node for it unless the grid is scrolled there, regardless of how long the test waits. The test's assertion never scrolls, unlike the codebase's own established pattern for this exact class of problem (`AddColumnPage._waitForColumnHeader()` and `TC52`'s `forceGridFullWidth()`).
4. **Locator drift** — the column name or accessible role changed between when the test was authored and now.

---

## Evidence

### Test Evidence

- Both retries (Attempt 0 and Attempt 1) failed identically: `getByRole('columnheader', { name: '<dynamic name>', exact: true })` not found after 10s, at the exact same step (right after clicking "Add column").
- The test never scrolls the grid or the newly-created column into view before asserting visibility — it goes straight from clicking "Add column" to `toBeVisible()`.
- `context.md`'s error-context snapshot at failure time shows the Property Documents grid already containing several leftover custom columns from earlier runs (`Random Name`, `User1786937880806`) but not the column this run just tried to create — consistent with the new column existing outside the rendered DOM window rather than not existing at all.

### Source Evidence

- `pages/addColumnPage.js` (used by the neighboring TC67 test, which adds columns to a *different* grid) contains an explicit, documented fix for this exact class of bug:
  - `_waitForColumnHeader()`: polls for the header, and if not found, calls `_scrollGridRight()` before checking again (up to 25s).
  - `_forceGridFullWidth()`: comment reads *"MCP-verified live (2026-07-28): each newly-added custom column pushes the total column count further right — by the time a 6th column... is added, its aria-colindex sits past the grid's default rendering width and the gridcell never mounts at all... not a real feature bug."*
  - `TC52` (also in `TC04_properties.spec.js`) has an identical documented comment about the same table-view grid virtualizing rightmost columns out of the DOM, and calls `forceGridFullWidth()` before checking headers.
- TC69 was authored as a hand-rolled, self-contained test (per its own comment) specifically because the Property Documents grid doesn't match the "View button → Add custom column" pattern the shared helper assumes — but in doing so it dropped the scroll/virtualization handling that the shared helper had already solved for a structurally identical (RevoGrid) widget.

### Git Evidence

- TC69 was added in commit `80b4e35` ("final push", 2026-08-13) and has not been modified since — the version that ran in this failure is the only version that has ever existed. It was never actually verified to pass against a grid carrying many pre-existing custom columns.
- The only working-tree change to this test file is `test.only` added to TC69 for isolated debugging — unrelated to the failure itself.
- No recent commit touches the Property Documents grid's rendering or the add-column flow, ruling out a recent regression as the cause.

### MCP Browser Evidence

- Logged into `beta.tailorbird.com`, navigated to Test Property 1_Cottages on Elm → Overview tab → Property Documents grid — reproduced the exact flow TC69 automates (Table → Add custom column → fill name/description → Add column).
- The Manage Columns drawer showed the *actual* current state of this shared test property: **11 leftover "TC69 Add Column ⟨timestamp⟩" columns** from prior failed runs (including the exact two timestamps from this failure's Attempt 0/1: `1787122287089` and `1787122449354`), plus **dozens more** leftover columns from TC67's `addAndVerifyAllColumnTypes()` (6 full sets of Attachments/Checkbox/Currency/Date/Email/Multiselect/Number/Phone/Select/Thumbnail/URL/User columns). This confirms both tests have been failing at this same virtualization step for a long time without ever reaching their own cleanup/delete step.
- Submitting "Add column" always produced a "Column created successfully" toast — the backend operation succeeds every time.
- Immediately after creation, an accessibility snapshot of the grid did **not** show the new column header in the DOM at all — the DOM briefly "revealed" three older leftover columns (`Date...`, `Checkbox...`, `URL...`) that had previously been virtualized out, but not the freshly created one.
- Inspected the grid programmatically: it is a `revo-grid` web component. One of its internal `revogr-viewport-scroll` containers reported `scrollWidth: 12492` vs `clientWidth: 2174` — i.e. the grid tracks ~5.75× more column width than it currently renders in the DOM.
- Scrolling that viewport's `scrollLeft` to its maximum and re-snapshotting revealed the new column header (`MCP Verify Column 999999`) exactly where expected: at the far right, past all the accumulated leftover columns.

---

## MCP Verification

Browser flow: Properties → Test Property 1_Cottages on Elm → Overview tab → Property Documents grid → Table → Add custom column → filled name/description → Add column.

Actual behavior: The column is created successfully server-side (toast confirms it) on every attempt, but RevoGrid only mounts DOM nodes for columns within its current horizontal render window. A newly-added column is appended at the end of the column list, which — on this grid, now carrying 40+ leftover custom columns from previously-failed runs — sits far outside that window. `getByRole('columnheader', ...).toBeVisible()` therefore times out even though the column exists and the feature works correctly.

Expected behavior (per the test's own assertion): The new column's header should be visible in the DOM within 10 seconds of clicking "Add column".

Reproduction result: 100% reproducible. Confirmed by directly scrolling the grid's internal virtualized viewport to its scroll-right extreme, which revealed the missing column header immediately.

Verified root cause: Missing scroll/virtualization handling in TC69's assertion — an automation gap, not a product defect. The same problem was already identified and fixed for structurally identical RevoGrid widgets elsewhere in this codebase (`AddColumnPage._waitForColumnHeader`, `TC52`'s `forceGridFullWidth`), but TC69 was written as a standalone test without reusing or reimplementing that handling.

---

## Root Cause

The Property Documents grid on the Overview tab is a virtualized `revo-grid`. Adding a custom column succeeds at the application level every time, but the new column is appended to the end of the (now very long, due to leftover test columns) column list, placing it outside RevoGrid's default DOM-rendering window. TC69's assertion (`getByRole('columnheader', { name: columnName, exact: true })).toBeVisible({ timeout: 10000 })`) never scrolls the grid to reveal the new column, so it always times out — regardless of how long the timeout is, since this is a spatial/virtualization issue, not a timing one. Because the test fails before its own cleanup step (delete column), every failed run leaves another orphaned column behind, which cumulatively makes the grid wider and the problem worse for the next run.

---

## Self-Healing Decision

Allowed: YES

Reason: Classification is AUTOMATION_BUG, directly verified via Playwright MCP (reproduced the exact missing-column-header symptom and confirmed it resolves once the grid is scrolled). A fix would be confined to automation code (scrolling the grid / waiting for the column to mount before asserting visibility), mirrors an already-proven pattern in this same codebase (`AddColumnPage._waitForColumnHeader`), and would not touch product code or weaken the assertion's intent.

---

## Proposed Fix

File: tests/TC04_properties.spec.js

Change: In the `'Add a custom column on the Property Documents grid'` step (around line 1298-1305), after clicking "Add column", replace the direct `toBeVisible()` check with a poll that scrolls the grid's `revogr-viewport-scroll` container (or the treegrid) to the right when the header isn't immediately found — the same approach already implemented in `pages/addColumnPage.js`'s `_waitForColumnHeader()`/`_scrollGridRight()`. Also worth adding: an upfront cleanup pass (delete pre-existing "TC69 Add Column ..." columns before creating a new one), so the grid doesn't keep growing wider with every failed run — this is what let the problem compound across 11+ prior runs.

Why this change addresses the root cause: It directly compensates for the RevoGrid virtualization behavior confirmed via MCP, rather than assuming the column doesn't exist.

Why this does not hide a product bug: The product behavior (column creation) already works correctly on every attempt (confirmed via repeated MCP reproduction and the "Column created successfully" toast) — only the test's visibility check is out of step with how this specific grid renders.

Expected validation: Re-run TC69 in isolation; it should pass through both steps (add column, then find/delete it in Manage Columns) without needing a wider timeout. Then run the surrounding `TC04_properties.spec.js` regression group to confirm no unrelated tests are affected.

---

## Validation

Affected test: `npx playwright test tests/TC04_properties.spec.js -g TC69 --project=chromium`

Result: PASSED (1.8m). The "Add a custom column" step's scroll-and-poll now finds the newly created header without a wider timeout, and the normal "Verify in Manage Columns, then delete it" step completed successfully (`columnDeleted = true`, so the `finally` safety-net cleanup did not need to run).

Regression: `test.only` on TC69 (a pre-existing, untouched working-tree change) currently restricts the whole file to this one test, so TC69 is the only test this file's runner will execute — it was run as the full available regression scope for this file. No other test in `TC04_properties.spec.js` or the wider suite was touched by this change.

Result: Post-run MCP check of the Manage Columns drawer (a plain scrollable list, not virtualized — every entry is real DOM regardless of scroll position) confirmed exactly the same 15 pre-existing leftover "TC69 Add Column ⟨timestamp⟩" columns as before this run, including none created by this run — proof the new column created during validation was correctly deleted by the test's own delete step, and the fix does not touch or add to the pre-existing environment debris.

New failures: None observed.

Existing unrelated failures: None — no other test was run or modified.

---

## Pull Request

Branch: `ai-self-heal/TC69-add-column` (created from `main`, working-tree changes preserved).

PR: Not created — awaiting explicit instruction to push/open a PR (this is a visible/shared-state action).

Status: Self-healing fix applied and validated. Change is scoped to `tests/TC04_properties.spec.js` (TC69 only): (1) the "Add a custom column" step now polls for the header and scrolls the grid's virtualized viewport right when it isn't yet mounted, mirroring `pages/addColumnPage.js`'s proven `_waitForColumnHeader`/`_scrollGridRight` pattern; (2) column creation-through-deletion is wrapped in `try/finally` so a best-effort delete-by-name always runs if the normal flow throws after the column was created, preventing future failures from leaving orphaned columns. No product code changed, no assertions weakened, no pre-existing leftover columns deleted. Per instructions, the agent stops here — human review and merge decision required before this reaches `main`.
