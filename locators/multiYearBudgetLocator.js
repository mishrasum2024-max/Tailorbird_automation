function multiYearBudgetLocators(page) {
    return {
        // --- Navigation ---
        multiYearBudgetNavLink: page.locator('nav').locator('a, div').filter({ hasText: 'Multi-Year Budget' }).first(),
        // The breadcrumb's property-switcher button is consistently the first button
        // rendered under <main> (MCP-verified), both before ("Select a Property") and
        // after a property is chosen — its internal markup differs between those two
        // states (only the post-selection state wraps the label in a <p>), so matching
        // by DOM position here is more robust than filtering on internal markup.
        propertySwitcherButton: page.locator('main').getByRole('button').first(),
        propertyMenuItems: page.getByRole('menuitem'),
        propertySearchBox: page.getByRole('textbox', { name: 'Search properties...' }),

        // --- Empty state (no plan yet for the selected property) ---
        createPlanHeading: page.getByText('Create Your Multi-Year Budget'),
        createPlanBtn: page.getByRole('button', { name: 'Create Multi-Year Budget' }),
        noPropertiesFoundText: page.getByText('No properties found'),

        // --- Empty state (plan created but zero budget items selected, MCP-verified live 2026-08-11) ---
        noDetailsHeading: page.getByText('No multi year budget details added yet'),
        noDetailsSubtext: page.getByText('Use + or Create Button to create one'),
        noItemsMatchSearchText: page.getByText('No items match your search.'),

        // --- Initialization dialog ---
        initDialog: page.getByRole('dialog', { name: 'Create Multi-Year Budget' }),
        holdPeriodStartYear: page.getByRole('textbox', { name: 'Hold Period Start Year' }),
        holdPeriodEndYear: page.getByRole('textbox', { name: 'Hold Period End Year' }),
        itemSearchBox: page.getByRole('textbox', { name: 'Search by category or item' }),
        // exact: true is required here — Playwright's default substring name match means
        // 'Select all' would otherwise also match the "Deselect all" button (MCP/CI-verified:
        // "Deselect all" contains "select all" as a literal substring), causing a strict-mode
        // violation the moment anything actually clicks it. Pre-existing locator, never
        // exercised by any test until this one, so the ambiguity had never surfaced before.
        selectAllItemsBtn: page.getByRole('button', { name: 'Select all', exact: true }),
        deselectAllItemsBtn: page.getByRole('button', { name: 'Deselect all', exact: true }),
        noItemsFoundText: page.getByText('No budget items found for this property.'),
        itemCheckbox: (labelPattern) => page.getByRole('checkbox', { name: labelPattern }),
        // Scoped to whichever dialog (Init or Settings — both share this same item-list markup)
        // is currently open, rather than an unscoped page-wide role query, so this can never
        // accidentally pick up an unrelated checkbox elsewhere on the page.
        allItemCheckboxes: page.getByRole('dialog').getByRole('checkbox'),
        initCancelBtn: page.getByRole('dialog', { name: 'Create Multi-Year Budget' }).getByRole('button', { name: 'Cancel' }),
        initSubmitBtn: page.getByRole('dialog', { name: 'Create Multi-Year Budget' }).getByRole('button', { name: 'Create Multi-Year Budget' }),

        // --- Plan table view ---
        treegrid: page.locator('[role="treegrid"]'),
        categoryColumnHeader: page.getByRole('columnheader', { name: 'Category' }),
        budgetItemColumnHeader: page.getByRole('columnheader', { name: 'Budget Item' }),
        // MCP-verified live (2026-09-02): this column now renders as "Proforma/Underwriting
        // Budget" — the old "Planned Budget" copy is gone (confirmed by a live automated run
        // and an independent manual MCP check against the same rendered plan table).
        //
        // MCP-verified live (2026-09-03): this revo-grid renders the per-year Proforma/Current
        // Budget/Variance columns TWICE — once per hold-period year in the scrollable middle
        // pane (`revogr-viewport-scroll.scroll-rgCol`), and again as its own grand-total-across-
        // years group in a separate right-pinned pane (`revogr-viewport-scroll.colPinEnd`), which
        // reuses the identical header text. An unscoped role query matches both, and the caller's
        // geometric (bounding-box) disambiguation between a specific year and that pinned Total
        // group is a coincidence of on-screen position, not a real distinction — it can and did
        // misfire, reading the pinned Total pane's value instead of the intended year's. Scoping
        // to the scrollable pane's own container structurally excludes the pinned pane, so only
        // genuine per-year headers are ever matched — no positional guessing required.
        plannedBudgetColumnHeaders: page.locator('revogr-viewport-scroll.scroll-rgCol').getByRole('columnheader', { name: 'Proforma/Underwriting Budget' }),
        currentBudgetColumnHeaders: page.locator('revogr-viewport-scroll.scroll-rgCol').getByRole('columnheader', { name: 'Current Budget' }),
        varianceColumnHeaders: page.locator('revogr-viewport-scroll.scroll-rgCol').getByRole('columnheader', { name: 'Variance' }),
        totalRow: page.locator('[role="row"]').filter({ hasText: 'Total' }),
        itemRow: (itemName) => page.locator('[role="row"]').filter({ hasText: itemName }),
        // Original unscoped exact-text lookup kept for callers that don't go through
        // healingLocator (see yearGroupHeaderStrategies below for the hardened version
        // used by pages/multiYearBudgetPage.js).
        yearGroupHeader: (year) => page.getByText(String(year), { exact: true }),

        // --- Toolbar icon buttons (no accessible names in this app; identified by their
        // stable lucide icon class, MCP-verified live: lucide-upload / lucide-plus /
        // lucide-download / lucide-rotate-ccw / lucide-settings / lucide-history) ---
        uploadCsvBtn: page.locator('button:has(svg.lucide-upload)').first(),
        addBudgetItemBtn: page.locator('button:has(svg.lucide-plus)').first(),
        exportCsvBtn: page.locator('button:has(svg.lucide-download)').first(),
        resetBudgetBtn: page.locator('button:has(svg.lucide-rotate-ccw)').first(),
        settingsBtn: page.locator('button:has(svg.lucide-settings)').first(),
        historyBtn: page.locator('button:has(svg.lucide-history)').first(),

        // --- "Edit Proforma/Underwriting budget" dialog (opened by double-clicking a year
        // cell). MCP-verified live (2026-09-02): this dialog and its amount field were
        // renamed in lockstep with the column header — was "Edit planned budget" / "Planned
        // budget", now "Edit Proforma/Underwriting budget" / "Proforma/Underwriting budget".
        editPlannedBudgetDialog: page.getByRole('dialog', { name: 'Edit Proforma/Underwriting budget' }),
        reallocateRadio: page.getByRole('radio', { name: 'Reallocate' }),
        setAmountRadio: page.getByRole('radio', { name: 'Set amount' }),
        reallocateFromInput: page.getByRole('textbox', { name: 'Reallocate from' }),
        reallocateFromOption: (labelPattern) => page.getByRole('option', { name: labelPattern }),
        reallocateFromOptionsList: page.getByRole('listbox', { name: 'Reallocate from' }).getByRole('option'),
        amountToReallocateInput: page.getByRole('textbox', { name: 'Amount to reallocate' }),
        plannedBudgetAmountInput: page.getByRole('textbox', { name: 'Proforma/Underwriting budget' }),
        editReasonInput: page.getByRole('textbox', { name: 'Reason' }),
        editSaveBtn: page.getByRole('dialog', { name: 'Edit Proforma/Underwriting budget' }).getByRole('button', { name: 'Save' }),
        editCancelBtn: page.getByRole('dialog', { name: 'Edit Proforma/Underwriting budget' }).getByRole('button', { name: 'Cancel' }),

        // --- Upload CSV dialog ---
        uploadCsvDialog: page.getByRole('dialog', { name: 'Upload CSV' }),
        downloadTemplateBtn: page.getByRole('button', { name: 'Download Template CSV' }),
        // The widget is Uploadcare (third-party file picker); "From device" opens the native
        // file chooser, which Playwright intercepts via the 'filechooser' event (MCP-verified).
        uploadCsvFromDeviceBtn: page.getByRole('button', { name: 'From device' }),
        uploadCsvDoneBtn: page.getByRole('dialog', { name: 'Upload CSV' }).getByRole('button', { name: 'Done' }),
        csvErrorsAlert: page.getByRole('alert', { name: 'Errors' }),
        csvImportCompletedAlert: page.getByRole('alert', { name: 'Import completed' }),
        csvBudgetItemsCreatedAlert: page.getByRole('alert', { name: 'Budget items created' }),

        // --- Reset budget dialog ---
        resetBudgetDialog: page.getByRole('dialog', { name: 'Reset budget' }),
        downloadTableBtn: page.getByRole('button', { name: 'Download table' }),
        resetConfirmBtn: page.getByRole('dialog', { name: 'Reset budget' }).getByRole('button', { name: 'Reset' }),
        resetCancelBtn: page.getByRole('dialog', { name: 'Reset budget' }).getByRole('button', { name: 'Cancel' }),

        // --- Settings dialog ---
        settingsDialog: page.getByRole('dialog', { name: 'Settings' }),
        settingsApplyBtn: page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Apply' }),
        settingsCancelBtn: page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Cancel' }),
        totalCapitalEnvelopeField: page.getByText(/Total Capital Envelope/i),

        // --- Multi-year budget history dialog ---
        historyDialog: page.getByRole('dialog', { name: 'Multi-year budget history' }),
    };
}

/**
 * Multi-locator strategies for the plan table's year-group header (e.g. "2026").
 * MCP-verified live (2026-09-22): the header renders as a bare, non-semantic
 * `<div class="header-content">2026</div>` inside `.rgHeaderCell.myb-year-group-*` —
 * revo-grid gives it no role/aria-label/testid at all, so an element-based strategy
 * (getByRole/getByLabel/getByTestId) genuinely isn't available here; both strategies
 * below are text-based, matching this file's existing convention (§5/§23: only add an
 * independently-verified fallback, never a fabricated attribute).
 * Strategy 0 is the original, unchanged, unscoped exact-text lookup (kept for any other
 * caller still using multiYearBudgetLocators().yearGroupHeader directly). Strategy 1
 * scopes the same text match to the grid's own header-cell structure, so it can't
 * accidentally resolve to an unrelated "2026" elsewhere on the page (a date, a footer
 * year, etc.) the way the unscoped page-wide strategy could.
 */
function yearGroupHeaderStrategies(page, year) {
    return [
        { name: 'text:exact(original)', locator: page.getByText(String(year), { exact: true }) },
        { name: 'css:.rgHeaderCell .header-content(scoped)', locator: page.locator('.rgHeaderCell .header-content').filter({ hasText: String(year) }) },
    ];
}

/**
 * Multi-locator strategies for the Multi-Year Budget toolbar's icon-only buttons.
 * MCP-verified live (2026-09-22): none of these six buttons carry an aria-label, title,
 * or visible text — the lucide icon class is genuinely the only accessible-name-style
 * signal available.
 *
 * Both the unscoped `button:has(svg.lucide-upload)` CSS strategy AND a naive
 * `toolbarGroup.locator('button').nth(N)` position strategy are broken: the same
 * `.mantine-Group-root` that holds these six icon buttons ALSO holds a "View"
 * (saved-views) toggle and a "Table" toggle as its first two children — two extra,
 * text-labelled buttons a previous position-based fallback here didn't account for
 * (it indexed nth(0)..nth(5) expecting Upload first, which actually lands on "View"
 * and "Table"). Live-verified via CI: that "View" button can itself render with an
 * `svg.lucide-upload` icon in some state, which the unscoped CSS strategy then matched
 * ALONGSIDE the real Upload CSV button — two different DOM nodes, so healingLocator's
 * `.or()` union produced a strict-mode violation (locator.click: resolved to 2 elements).
 *
 * Fix: scope both strategies to `button.mantine-ActionIcon-root` within the toolbar
 * group. MCP-verified live: the six real icon buttons are Mantine `ActionIcon`
 * components (`mantine-ActionIcon-root`), while "View"/"Table" are Mantine `Button`
 * components (`mantine-Button-root`) — a different component, structurally excluded
 * by this class regardless of which icon "View"/"Table" ever render. Scoped this way,
 * `actionIcons` resolves to exactly the six icon buttons in DOM order (Upload, Plus,
 * Download, RotateCcw, Settings, History), so both the icon-class filter and the
 * position index now always agree on the same element.
 */
function multiYearBudgetToolbarButtonStrategies(page) {
    const toolbarGroup = page.locator(
        '.mantine-Group-root:has(svg.lucide-upload):has(svg.lucide-plus):has(svg.lucide-download):has(svg.lucide-rotate-ccw):has(svg.lucide-settings):has(svg.lucide-history)'
    );
    const actionIcons = toolbarGroup.locator('button.mantine-ActionIcon-root');
    return {
        uploadCsvBtn: [
            { name: 'css:ActionIcon+svg.lucide-upload(scoped)', locator: actionIcons.filter({ has: page.locator('svg.lucide-upload') }) },
            { name: 'position:actionIcons.nth(0)', locator: actionIcons.nth(0) },
        ],
        addBudgetItemBtn: [
            { name: 'css:ActionIcon+svg.lucide-plus(scoped)', locator: actionIcons.filter({ has: page.locator('svg.lucide-plus') }) },
            { name: 'position:actionIcons.nth(1)', locator: actionIcons.nth(1) },
        ],
        exportCsvBtn: [
            { name: 'css:ActionIcon+svg.lucide-download(scoped)', locator: actionIcons.filter({ has: page.locator('svg.lucide-download') }) },
            { name: 'position:actionIcons.nth(2)', locator: actionIcons.nth(2) },
        ],
        resetBudgetBtn: [
            { name: 'css:ActionIcon+svg.lucide-rotate-ccw(scoped)', locator: actionIcons.filter({ has: page.locator('svg.lucide-rotate-ccw') }) },
            { name: 'position:actionIcons.nth(3)', locator: actionIcons.nth(3) },
        ],
        settingsBtn: [
            { name: 'css:ActionIcon+svg.lucide-settings(scoped)', locator: actionIcons.filter({ has: page.locator('svg.lucide-settings') }) },
            { name: 'position:actionIcons.nth(4)', locator: actionIcons.nth(4) },
        ],
        historyBtn: [
            { name: 'css:ActionIcon+svg.lucide-history(scoped)', locator: actionIcons.filter({ has: page.locator('svg.lucide-history') }) },
            { name: 'position:actionIcons.nth(5)', locator: actionIcons.nth(5) },
        ],
    };
}

module.exports = { multiYearBudgetLocators, yearGroupHeaderStrategies, multiYearBudgetToolbarButtonStrategies };
