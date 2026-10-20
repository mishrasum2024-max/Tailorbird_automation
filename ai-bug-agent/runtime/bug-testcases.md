# BUG-1458 — Regression Test Cases

**Bug:** MYB - shows current budget items and does not allow to select from all available categories or add new ones.

**Live status:** ⏸️ Unverified — live check did not complete


**Root-cause hypothesis:** When a property has no existing Multi-Year Budget plan, the 'Create Multi-Year Budget' item picker (and its shared counterpart in the Settings dialog) scopes its budget-item list to items already on that property's current (single-year) budget instead of the full category/item catalog. A property with few or zero single-year budget items therefore sees a restricted or empty picker ('No budget items found for this property.') and cannot select items from other categories.

**Affected area:** Multi-Year Budget › Create Multi-Year Budget item picker (shared by the initialization dialog and the Settings dialog)

**Target spec (tests are appended):** `tests/TC26_MultiYearBudget.spec.js` — Existing Multi-Year Budget suite; already has MultiYearBudgetJob page-object methods (openInitializationDialog, openSettingsDialog, selectBudgetItemInInitDialog, searchItemSelectionList, clickSelectAllItems, getItemCheckboxSummary) and property/budget-item setup helpers (ApprovalJob.createPropertyRobust, BudgetJob.addBudgetItemInRevision) that these cases build on directly.

## Bug Reproduction

### BUG-1458-TC01 — Create Multi-Year Budget item picker shows the full category catalog for a property with no single-year budget items

- Priority: P1
- Covers root cause: Directly reproduces the reported scenario (property with no MYB / no budget items) and asserts the picker shows the full catalog instead of being scoped to the property's empty current budget.
- Preconditions:
  - A brand-new property exists with no single-year budget ever created for it (zero budget items in any category).

**Steps**

1. Navigate to Financials > Multi-Year Budget.
2. Select the brand-new property from the property switcher.
3. Verify the 'Create Your Multi-Year Budget' empty state is shown.
4. Click 'Create Multi-Year Budget' to open the initialization dialog.
5. Observe the budget-item list under 'Select budget items to include in the multi-year budget.'

**Expected result**

The picker lists budget items spanning multiple categories from the full catalog (e.g. RRC Central Heat/Cooling, RRC Roofing, RRC Elevators, etc.) as selectable, unchecked checkboxes — it does not show an empty list or 'No budget items found for this property.'

## Variant

### BUG-1458-TC02 — Item picker includes categories beyond the property's existing single-year budget category

- Priority: P2
- Covers root cause: Confirms the fix is a genuine full-catalog listing, not just 'show something' for a zero-item property — it also surfaces categories/items the property has never used even when it does have some existing items.
- Preconditions:
  - A property has exactly one single-year budget item added under a single category (e.g. '300 - INT_ADA Modifications', via Budget > Revision editor), and no Multi-Year Budget plan has yet been created for it.

**Steps**

1. Navigate to Financials > Multi-Year Budget and select the property.
2. Click 'Create Multi-Year Budget' to open the initialization dialog.
3. Use the 'Search by category or item' box to search for a category the property has never budgeted in (e.g. 'RRC Roofing' or 'RRC Elevators').

**Expected result**

The searched item/category is found and offered as a selectable checkbox, proving the list is not scoped to only the property's existing single-year budget category.

### BUG-1458-TC03 — 'Select all' in the initialization dialog selects the full multi-category catalog, not just the property's own items

- Priority: P2
- Covers root cause: A property-scoped picker would report a total of 0 or 1 item and leave 'Select all'/the submit button effectively meaningless; this quantitatively catches that regression instead of only checking that one named item is present.
- Preconditions:
  - A second brand-new property exists with no single-year budget ever created for it (zero budget items).

**Steps**

1. Navigate to Financials > Multi-Year Budget and select the property.
2. Click 'Create Multi-Year Budget' to open the initialization dialog.
3. Click 'Select all'.
4. Read the checkbox summary (total checkboxes vs. checked checkboxes).

**Expected result**

Total selectable items is greater than 1 (reflecting the full multi-category catalog, not an empty or single-item scoped list), 'Select all' checks every one of them, and 'Create Multi-Year Budget' becomes enabled.

## Neighbouring Flow

### BUG-1458-TC04 — Settings dialog's item picker (shared component) also lists catalog items outside the property's current plan

- Priority: P3
- Covers root cause: Guards the sibling entry point that reuses the same item-selection markup (per the locator file, the Init and Settings dialogs share this list) from regressing back to property-scoped filtering even if only the initialization dialog were fixed.
- Preconditions:
  - A property already has a Multi-Year Budget plan created with at least one budget item selected.

**Steps**

1. Navigate to Financials > Multi-Year Budget and select the property.
2. Open the Settings dialog (gear icon in the toolbar).
3. Use the 'Search by category or item' box to search for a category/item that is not part of the property's current single-year budget or existing plan.

**Expected result**

The searched item is found and offered as a selectable checkbox in the Settings dialog's item picker, the same shared component used by the initialization dialog.
