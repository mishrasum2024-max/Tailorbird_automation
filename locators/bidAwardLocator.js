/**
 * Locators for the ADMIN "Manage Bids" tab (a bid's /bids/:id?tab=manage-bids page) and its
 * per-vendor Award flow. This tab/flow was previously unexercised by any spec (bidPage.js's
 * `assertAwardBidFlow()` assumes a directly-visible "Award Bid" button and a hover-to-reveal
 * row action, which does not match the real UI — MCP-verified 2026-09-14: awarding a vendor's
 * bid response requires opening the row's action menu (aria-haspopup="menu" button in the
 * pinned Actions column, matched by the row's `data-rgrow` — same revo-grid pattern used
 * elsewhere in this suite) and choosing "Award" from a Mantine dropdown menu
 * (Resend Bid / Award / Remove from bid / Download Submission)).
 *
 * Every element below is a healingLocator([...]) with 4 independent strategies, per project
 * convention (utils/locatorHealer.js) — same pattern as locators/vendorBidLocator.js.
 * This file does not modify locators/bidLocator.js; existing bid-list locators (search input,
 * bid-name row link) are reused as-is from that file by the page object.
 */

/** The "Manage Bids" tab on a bid's detail page (Overview / Bid Book / Manage Bids). */
function manageBidsTabStrategies(page) {
    return [
        { name: 'role:tab[name=Manage Bids](original)', locator: page.getByRole('tab', { name: 'Manage Bids', exact: true }) },
        { name: 'css:[role=tablist] >> text=Manage Bids', locator: page.locator('[role="tablist"]').getByText('Manage Bids', { exact: true }) },
        { name: 'css:button:has-text("Manage Bids")', locator: page.locator('button:has-text("Manage Bids")').first() },
        { name: 'text=Manage Bids(exact)', locator: page.getByText('Manage Bids', { exact: true }).first() },
    ];
}

/** The Manage Bids per-vendor revo-grid (columns: Vendor, Status, Invited At, Bid Due Date,
 * Submitted At, Actions). Same virtualized-grid technology as the vendor portal's own Bids
 * grid (locators/vendorBidLocator.js). */
function manageBidsGridStrategies(page) {
    return [
        { name: 'role:tabpanel[Manage Bids] >> role:treegrid(original)', locator: page.getByRole('tabpanel', { name: 'Manage Bids' }).locator('revo-grid[role="treegrid"]').first() },
        { name: 'css:revo-grid.bird-table-revogrid(scoped)', locator: page.getByRole('tabpanel', { name: 'Manage Bids' }).locator('revo-grid.bird-table-revogrid').first() },
        { name: 'css:revo-grid(page-wide, first)', locator: page.locator('revo-grid[role="treegrid"]').first() },
        { name: 'xpath://revo-grid[@role="treegrid"]', locator: page.locator('xpath=//revo-grid[@role="treegrid"]').first() },
    ];
}

/** Data rows within the Manage Bids grid — `div[role="row"][data-rgrow]`, class "rgRow". Also
 * renders the same decoy raw-injected-CSS rows as the vendor portal grid; callers must filter
 * those out by content. */
function manageBidsGridRowsStrategies(gridScope) {
    return [
        { name: 'css:div[role=row][data-rgrow](original)', locator: gridScope.locator('div[role="row"][data-rgrow]') },
        { name: 'css:div.rgRow[data-rgrow]', locator: gridScope.locator('div.rgRow[data-rgrow]') },
        { name: 'role:row', locator: gridScope.getByRole('row') },
        { name: 'css:[data-rgrow]', locator: gridScope.locator('[data-rgrow]') },
    ];
}

/** Row action menu trigger — an icon-only button with `aria-haspopup="menu"` in the row's
 * pinned Actions column (MCP-verified: not a descendant of the data row itself, so matched by
 * `data-rgrow` against the whole page, same technique as vendorBidLocator's
 * viewDetailsButtonStrategies). Opens a Mantine menu with Resend Bid / Award / Remove from
 * bid / Download Submission.
 * @param {import('@playwright/test').Page} page
 * @param {string} rowGrow the row's `data-rgrow` attribute value
 */
function rowActionsMenuButtonStrategies(page, rowGrow) {
    return [
        { name: 'css:[data-rgrow=X] button[aria-haspopup=menu](original)', locator: page.locator(`[data-rgrow="${rowGrow}"] button[aria-haspopup="menu"]`) },
        { name: 'css:div[role=gridcell][data-rgrow=X] button', locator: page.locator(`div[role="gridcell"][data-rgrow="${rowGrow}"] button`).first() },
        { name: 'css:[data-rgrow=X] .mantine-ActionIcon-root', locator: page.locator(`[data-rgrow="${rowGrow}"] .mantine-ActionIcon-root`).first() },
        { name: 'css:[data-rgrow=X] button(last)', locator: page.locator(`[data-rgrow="${rowGrow}"] button`).last() },
    ];
}

/** "Award" item in the row action dropdown menu (MCP-verified live: role="menuitem", text
 * "Award", alongside "Resend Bid" / "Remove from bid" / "Download Submission"). */
function awardMenuItemStrategies(page) {
    return [
        { name: 'role:menuitem[name=Award](exact, original)', locator: page.getByRole('menuitem', { name: 'Award', exact: true }) },
        { name: 'css:[role=menu] [role=menuitem]:has-text("Award")', locator: page.locator('[role="menu"] [role="menuitem"]').filter({ hasText: /^Award$/ }) },
        { name: 'text=Award(exact)', locator: page.getByText('Award', { exact: true }).first() },
        { name: 'css:[role=menuitem]:text-is("Award")', locator: page.locator('[role="menuitem"]:text-is("Award")') },
    ];
}

/** The "Award Bid" confirmation dialog that opens after choosing "Award" from the row menu
 * (MCP-verified live 2026-09-14: heading "Award Bid", copy "Select a project and job to link
 * with this bid award.", a Project select, a Job select — disabled until Project is chosen —
 * an optional Justification textarea, and Cancel / "Award Bid" buttons; "Award Bid" stays
 * disabled until both Project and Job are selected). The page object still treats it as
 * best-effort/optional (kept consistent with bidPage.js's existing, similarly-shaped
 * assertAwardBidFlow() dialog handling) in case this ever changes to a single-step action. */
function awardConfirmationDialogStrategies(page) {
    return [
        { name: 'role:dialog[name=Award Bid](original, MCP-verified heading)', locator: page.getByRole('dialog', { name: 'Award Bid' }) },
        { name: 'css:[role=dialog]:has-text("award")', locator: page.locator('[role="dialog"]').filter({ hasText: /award/i }) },
        { name: 'css:.mantine-Modal-content:has-text("award")', locator: page.locator('.mantine-Modal-content').filter({ hasText: /award/i }) },
        { name: 'role:alertdialog[hasText=award]', locator: page.getByRole('alertdialog').filter({ hasText: /award/i }) },
    ];
}

/** The Award Bid dialog's "Project" select field (MCP-verified: textbox with accessible name
 * "Select a project"; clicking it opens a Mantine combobox listbox of project options). */
function awardProjectSelectStrategies(dialogScope) {
    return [
        { name: 'role:textbox[name=Select a project](original)', locator: dialogScope.getByRole('textbox', { name: 'Select a project', exact: true }) },
        { name: 'css:input near text=Project', locator: dialogScope.locator('text=Project').locator('xpath=following::input[1]') },
        { name: 'role:combobox[name=Select a project]', locator: dialogScope.getByRole('combobox', { name: 'Select a project' }) },
        { name: 'css:[placeholder="Select a project"]', locator: dialogScope.locator('[placeholder="Select a project"]') },
    ];
}

/** The Award Bid dialog's "Job" select field. MCP-verified live it cycles through THREE
 * placeholder states as the Project selection resolves — "Select a project first" (disabled)
 * → "Loading jobs..." (disabled, transient) → "Select a job" (enabled) — so matching by
 * accessible name/placeholder text is inherently timing-sensitive (a name-regex strategy can
 * miss the "Loading jobs..." instant and fall through to a stray match elsewhere in the
 * dialog). Matched primarily by POSITION instead: the Job select is always the second
 * `.mantine-Select-input` in the dialog (Project is the first), which holds true across all
 * three placeholder states. */
function awardJobSelectStrategies(dialogScope) {
    return [
        { name: 'css:.mantine-Select-input(nth=1, original, position-based — stable across placeholder states)', locator: dialogScope.locator('.mantine-Select-input').nth(1) },
        { name: 'css:input.mantine-Select-input(nth=1)', locator: dialogScope.locator('input.mantine-Select-input').nth(1) },
        { name: 'role:textbox[name=/Select a job|Select a project first|Loading jobs/](name-based fallback)', locator: dialogScope.getByRole('textbox', { name: /Select a job|Select a project first|Loading jobs/ }) },
        { name: 'css:[placeholder="Select a job"],[placeholder="Select a project first"],[placeholder="Loading jobs..."]', locator: dialogScope.locator('[placeholder="Select a job"], [placeholder="Select a project first"], [placeholder="Loading jobs..."]') },
    ];
}

/** The Award Bid dialog's Project-field "Create New" button — the FIRST of the dialog's two
 * "Create New" buttons (Project's, then Job's), for the case where the bid's property has NO
 * existing projects at all (MCP-verified live 2026-09-14: the Project field then shows the
 * placeholder/accessible-name "No projects found for this property" instead of a normal
 * "Select a project" combobox). Clicking it opens a "Create New Project" dialog — the SAME
 * form/component as the existing TC71 Create Project flow (pages/projectPage.js's nameInput/
 * addProjectBtn), reused unmodified; Property comes pre-filled and only Name is required. */
function createNewProjectButtonStrategies(dialogScope) {
    return [
        { name: 'role:button[name=Create New](nth=0, original, position-based)', locator: dialogScope.getByRole('button', { name: 'Create New' }).nth(0) },
        { name: 'css:button:has-text("Create New")(nth=0)', locator: dialogScope.locator('button:has-text("Create New")').nth(0) },
        { name: 'css:button.mantine-Button-root:has-text("Create New")(nth=0)', locator: dialogScope.locator('button.mantine-Button-root:has-text("Create New")').nth(0) },
        { name: 'css:button[data-variant=outline]:has-text("Create New")(nth=0)', locator: dialogScope.locator('button[data-variant="outline"]:has-text("Create New")').nth(0) },
    ];
}

/** The "Create New Project" dialog that opens on top of the (still-open) Award Bid dialog —
 * MCP-verified live 2026-09-14 the two dialogs are genuinely STACKED at once, which breaks
 * pages/projectPage.js's own `nameInput`/`addProjectBtn` locators here: their positional
 * fallback strategy (`[role="dialog"] input`.first()) matches page-wide across BOTH stacked
 * dialogs, not just this one, causing a strict-mode violation. Scoping every strategy below to
 * this dialog specifically (matched by its own heading, not just "last dialog") avoids that. */
function createProjectDialogStrategies(page) {
    return [
        { name: 'role:dialog[name=Create New Project](exact, original)', locator: page.getByRole('dialog', { name: 'Create New Project', exact: true }) },
        { name: 'css:[role=dialog]:has(heading[name=Create New Project])', locator: page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: 'Create New Project', exact: true }) }) },
        { name: 'css:.mantine-Modal-content:has-text(Create New Project)', locator: page.locator('.mantine-Modal-content').filter({ hasText: 'Create New Project' }) },
        { name: 'role:dialog(last, position-based fallback)', locator: page.getByRole('dialog').last() },
    ];
}

/** "Name" field inside the Create New Project dialog (scoped — see createProjectDialogStrategies). */
function createProjectNameInputStrategies(dialogScope) {
    return [
        { name: 'role:textbox[name=Name](exact, original)', locator: dialogScope.getByRole('textbox', { name: 'Name', exact: true }) },
        { name: 'placeholder:Enter project name', locator: dialogScope.getByPlaceholder('Enter project name') },
        { name: 'label:Name', locator: dialogScope.getByLabel('Name', { exact: true }) },
        { name: 'css:input:not([type=hidden])(nth=0, scoped)', locator: dialogScope.locator('input:not([type="hidden"])').nth(0) },
    ];
}

/** "Create Project" submit button inside the Create New Project dialog (scoped). */
function createProjectSubmitButtonStrategies(dialogScope) {
    return [
        { name: 'role:button[name=Create Project](exact, original)', locator: dialogScope.getByRole('button', { name: 'Create Project', exact: true }) },
        { name: 'css:button:has-text(Create Project)(scoped)', locator: dialogScope.locator('button:has-text("Create Project")') },
        { name: 'css:footer button(last, scoped)', locator: dialogScope.locator('button').last() },
        { name: 'css:button after Cancel(scoped)', locator: dialogScope.getByRole('button', { name: 'Cancel', exact: true }).locator('xpath=following-sibling::button[1]') },
    ];
}

/** The Award Bid dialog's Job-field "Create New" button — MCP-verified live 2026-09-14: the
 * dialog has TWO "Create New" buttons (Project's, then Job's); Job's is always the second one
 * in DOM order, mirroring the same position-based approach as awardJobSelectStrategies (its
 * accessible name is identical to Project's "Create New" button, so name-based matching alone
 * cannot disambiguate them). Clicking it opens a "Create New Job" dialog — the SAME
 * form/component as the existing Add-Job flow (pages/projectPage.js's fillJobForm()/
 * submitJob()), reused unmodified. */
function createNewJobButtonStrategies(dialogScope) {
    return [
        { name: 'role:button[name=Create New](nth=1, original, position-based)', locator: dialogScope.getByRole('button', { name: 'Create New' }).nth(1) },
        { name: 'css:button:has-text("Create New")(nth=1)', locator: dialogScope.locator('button:has-text("Create New")').nth(1) },
        { name: 'css:button.mantine-Button-root:has-text("Create New")(nth=1)', locator: dialogScope.locator('button.mantine-Button-root:has-text("Create New")').nth(1) },
        { name: 'css:button[data-variant=outline]:has-text("Create New")(nth=1)', locator: dialogScope.locator('button[data-variant="outline"]:has-text("Create New")').nth(1) },
    ];
}

/** The first option in whichever Mantine combobox listbox is currently open (used for both
 * the Project and the Job selects). MCP/DOM-verified live 2026-09-14: once the Job select
 * becomes enabled, its option list is ALREADY mounted in the DOM (a separate, distinctly-id'd
 * `[role="listbox"]` from the Project one) but collapsed/zero-size — it is NOT
 * `aria-hidden`/`display:none`, so `page.getByRole('option')` (and any locator without an
 * explicit visibility filter) matches BOTH the Project select's stale options and the Job
 * select's real ones at once, causing a strict-mode violation. Every strategy below is
 * therefore filtered to genuinely-rendered (`:visible`) options only — confirmed live this
 * reduces the match to exactly the one currently-open listbox's option(s). */
function firstComboboxOptionStrategies(page) {
    return [
        { name: 'css:[role=option]:visible(first, root cause fix — excludes hidden-but-mounted listboxes)', locator: page.locator('[role="option"]:visible').first() },
        { name: 'role:option(filter visible)', locator: page.getByRole('option').filter({ visible: true }).first() },
        { name: 'css:[data-combobox-option=true]:visible(first)', locator: page.locator('[data-combobox-option="true"]:visible').first() },
        { name: 'css:.mantine-Select-option:visible(first)', locator: page.locator('.mantine-Select-option:visible').first() },
    ];
}

/** The dialog's own "Award Bid" submit button — disabled until Project and Job are both
 * selected (MCP-verified live). Distinct from the generic awardConfirmButtonStrategies below
 * (kept for the "no Project/Job step" fallback case). */
function awardBidSubmitButtonStrategies(dialogScope) {
    return [
        { name: 'role:button[name=Award Bid](exact, original)', locator: dialogScope.getByRole('button', { name: 'Award Bid', exact: true }) },
        // NOT dialogScope.getByText('Award Bid') — MCP/Playwright-verified live this also
        // matches the dialog's own "Award Bid" <h2> title, a real 3-way ambiguity (heading +
        // button + the button's inner label span all satisfy a bare text match).
        { name: 'css:footer button:has-text("Award Bid"),button:has-text("Award Bid"):not(:has(h2))', locator: dialogScope.locator('button:has-text("Award Bid")').last() },
        { name: 'css:button after Cancel(sibling of Cancel button)', locator: dialogScope.getByRole('button', { name: 'Cancel', exact: true }).locator('xpath=following-sibling::button[1]') },
        { name: 'css:button(last)', locator: dialogScope.locator('button').last() },
    ];
}

/** Fallback confirm/award button inside the confirmation dialog, for the case where no
 * Project/Job step exists (kept for parity with bidPage.js's existing assertAwardBidFlow()). */
function awardConfirmButtonStrategies(dialogScope) {
    return [
        { name: 'role:button[name=award|confirm](original)', locator: dialogScope.getByRole('button', { name: /award|confirm/i }).last() },
        { name: 'css:button:has-text("Award")', locator: dialogScope.locator('button:has-text("Award")').last() },
        { name: 'css:button:has-text("Confirm")', locator: dialogScope.locator('button:has-text("Confirm")').last() },
        { name: 'css:button(last)', locator: dialogScope.locator('button').last() },
    ];
}

module.exports = {
    manageBidsTabStrategies,
    manageBidsGridStrategies,
    manageBidsGridRowsStrategies,
    rowActionsMenuButtonStrategies,
    awardMenuItemStrategies,
    awardConfirmationDialogStrategies,
    awardProjectSelectStrategies,
    awardJobSelectStrategies,
    createNewProjectButtonStrategies,
    createProjectDialogStrategies,
    createProjectNameInputStrategies,
    createProjectSubmitButtonStrategies,
    createNewJobButtonStrategies,
    firstComboboxOptionStrategies,
    awardBidSubmitButtonStrategies,
    awardConfirmButtonStrategies,
};
