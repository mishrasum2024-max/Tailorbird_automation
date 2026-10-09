---
name: tailorbird-playwright
description: Playbook for automating Tailorbird UI tickets inside this repo's existing Playwright framework (pages/, locators/, utils/, fixture/, data/, tests/). Read before writing or editing any spec.
---

# Tailorbird Playwright Framework Playbook

This is a **playbook for working inside an existing framework**, not a generic Playwright guide. Every rule below was verified against actual files in this repo (`Playwright/Tailorbird_UI_Automation/`). Where the repo has an inconsistency or dead code, it is called out explicitly — do not "fix" it unless the ticket asks for that.

## READ THIS FIRST — Rules for every automation task

1. **Read this skill before writing any test, page object, or locator.**
2. **Read the closest existing spec in `tests/` before creating a new one.** Find the feature area's existing `TCxx_*.spec.js` and copy its shape (imports, `beforeEach`, tagging, `test.step` structure).
3. **Search `pages/` for an existing page object before creating a new one.** Most features already have one (see the feature map in §16). Extend it; don't fork a parallel one.
4. **Search the matching `locators/*Locator.js` before adding a new locator.** If a locator already exists but is fragile, prefer adding a fallback strategy (see §5's healing pattern) over writing a brand-new selector elsewhere.
5. **Search `utils/` before writing a new helper.** Grid-width, tab-disabled-state, left-panel-expansion, retry, PDF-extraction, and column-resize helpers already exist (catalog in §15).
6. **Follow existing project terminology** — "Jobs", "CapEx", "Retainage", "FGA", "Draw Reporting", "Approval workflow", "Change Order", etc. are the app's actual domain terms; use them exactly as spelled in existing files.
7. **Follow the TC naming/numbering convention** (§6) — file name `TCxx_FeatureName.spec.js`, and an in-title `test('TCnnn @tag1 @tag2 : Description', ...)` where `nnn` is a *new, unused* 2-3 digit number higher than the current max (currently up to TC320+; grep `tests/*.spec.js` for `'TC\d+'` to find the real current max before picking a number — do not reuse one).
8. **Follow existing `Logger`/`InteractionLogger` conventions** (§7) — do not introduce a new logging utility. `utils/assertUi.js` exists but is currently unused/dead; don't wire it in as part of an unrelated ticket, and don't invent yet another logging helper alongside it.
9. **Follow existing assertion convention**: `expect(actual, 'FAIL: <what/why>').toBe...()` with a descriptive second-argument message, paired with a `Logger.step(...)` before the action and `Logger.success(...)`/`Logger.error(...)` after (§7).
10. **Follow the existing auth/session convention** (§3): never hand-roll a login inside a new feature test. Use `test.use({ storageState: 'sessionState.json', ... })` like every other feature spec. Only `TC01_login.spec.js` performs a real login and regenerates `sessionState.json`.
11. **Follow existing setup/cleanup conventions** (§9) — most feature suites have no `afterEach`/`afterAll` and rely on pre-existing shared environment data; a few (job/project chain) write hand-off files under `data/`. Match whichever pattern the feature area already uses; don't add a new cleanup mechanism unilaterally.
12. **Add the minimum new code required.** Don't refactor unrelated methods, don't rename existing locators/methods "for consistency," don't add abstractions the ticket doesn't need.
13. **Do not duplicate existing functionality.** This repo already has real, in-place duplication (e.g. `capexPage.js` defines `toggleColumn()` twice — see §18); do not add more of it. If you need something similar to an existing method, extend/parameterize the existing one instead of pasting a near-copy.
14. **Do not modify unrelated tests or framework files.** Touch only the files the ticket requires.
15. **Do not invent a new framework pattern (a new modal helper, a new grid-width workaround, a new data-handoff mechanism) when an existing one already covers the case** — see §10–§13 for the patterns that already exist.
16. **Understand prerequisite flows before writing a test.** Several features assume another feature's test already ran and left data behind (§8, §16) — e.g. Jobs/Category/Invoice/Change-Order tests read `data/projectData.json` and `data/lastCreatedJob.json` written by the Project and Jobs tests.
17. **Preserve test isolation and cleanup** exactly as the closest existing sibling test does it — don't add global state that leaks into other spec files.
18. **Validate syntax before considering the task done.** At minimum, confirm the file parses (`node --check <file>` for CommonJS-only files, or ask Playwright to list the test: `npx playwright test <file> --list`) — do not assume correctness from visual inspection alone.
19. **Run Playwright only when explicitly requested by the user.** Do not run `npx playwright test` proactively.
20. **Never create git branches, commits, or pull requests unless explicitly requested.**
21. **Every new locator must be a multi-locator built from element-based Playwright methods** (`getByRole`/`getByLabel`/`getByPlaceholder`/`getByTestId`/`getByText`), never a single bare CSS/XPath selector (§23). When automating the test-case generation skill's combined "full-page static UI elements" test case, assert only static chrome (buttons, labels, headers, dropdown/tab controls, column headers) — never table/row data or record-specific values (§24).
22. **For any new action that calls a backend API, verify success via the API response status code, not just a success toast** — and prefer a web-first `expect(...).toBeVisible({ timeout })`/`locator.waitFor({ timeout })` over a blind `page.waitForTimeout(N)` for any new wait (§25).
23. **Read `.claude/skills/tailorbird-site-flows/SKILL.md` before automating or MCP-exploring anything** — the site's end-to-end flow map (what must exist before each operation, in which order, by which role and existing method) and the automation rules this repository follows.
24. **When a case looks blocked, follow `.claude/skills/automation-blocker-resolution/SKILL.md` before reporting it blocked** — a missing page object, locator, helper, record or role action is resolvable by default.
25. **Rule 19 applies to interactive sessions.** In the AI agent workflows (ticket automation, repair, bug agent), running the selected cases with `npx playwright test` is expected — the workflow prompt asks for it.

---

## 1. Project Architecture

Root: `Playwright/Tailorbird_UI_Automation/` (the actual git repo root is one level further up, at `tailorbird-next/`).

```
pages/         32 Page Object files (feature-per-file, mostly classes taking `page` in the constructor)
locators/      31 locator modules, one per feature, paired 1:1 with most pages/ files by name
utils/         12 shared helpers (logging, retries, grid-width, left-panel, PDF, snapshot, locator-healing)
fixture/       12 JSON files of hand-authored, static "expected UI copy / reference data" (checked in, read-only)
data/          14 JSON files of runtime-generated state written by one test and read by a later one (mostly untracked in git)
tests/         29 spec files (`TC01`…`TC28`, some feature areas split across two files) + 2 Markdown test-plan docs
committed_ui_snapshots/   Playwright's committed screenshot baselines, one subfolder per spec file, plus a manual-only cross-check folder
scripts/       Ad-hoc Node investigation scripts and Slack/Notion integration agents (not part of the Playwright test run)
files/         Static upload fixtures (e.g. CSVs) used by tests that need to upload a file
downloads/     Runtime download landing directory (git-ignored-style scratch data)
playwright.config.js, package.json, .env, sessionState.json (+ 2 sibling session files)
```

Architecture is a classic **Page Object Model**: `tests/*.spec.js` → constructs one or more `pages/*.js` objects → each page object pulls its selectors from a matching `locators/*.js` module → cross-cutting concerns (logging, retries, grid quirks, session bootstrap) live in `utils/*.js` → static/expected data lives in `fixture/*.json`; dynamic/handoff data lives in `data/*.json`.

## 2. Playwright Configuration & Execution Model

Reference: `playwright.config.js` (repo root).

- `testDir: './tests'`, `timeout: 280_000` ms per test, `fullyParallel: true`, but **`workers: 1`** — tests are written and run effectively serially today (be careful about assuming isolation between spec files running concurrently; in practice they don't).
- `retries: 0` locally and on CI (top-level config); several individual spec files override this per-file with `test.describe.configure({ retries: 1 })` (e.g. `tests/TC04_properties.spec.js`, `tests/TC19_Capex.spec.js`, `tests/TC22_Retainage.spec.js`) — follow that per-file pattern rather than changing the global config.
- Reporter: `list` + `html` locally; `list` + `blob` on CI when `PLAYWRIGHT_BLOB_REPORT=1`.
- `expect.toHaveScreenshot.pathTemplate: 'committed_ui_snapshots/{testFilePath}/{arg}{ext}'` — this is what makes screenshot baselines land under `committed_ui_snapshots/<spec-file>/...` (see §14).
- `use`: `headless: true`, `viewport: 1920×1080`, `actionTimeout: 55_000`, `baseURL: process.env.BASE_URL`, `video: 'on'`, `screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`, `outputDir: 'test-results/'`.
- Single project: `chromium` (`devices['Desktop Chrome']`); Firefox/WebKit are commented out — don't assume cross-browser coverage exists.
- **No `globalSetup`/`globalTeardown`.** Session bootstrap is not automated by config — see §3.
- `package.json` scripts define the real invocation surface: `RegressionRun`/`test:full` (all), `SanityRun` (`--grep "@sanity"`), `Test:mandatory` (`--grep "@mandatory" --workers=1`), `test:invertMandatory` (`--grep-invert @mandatory --workers=4 --retries=1`), plus many single-feature greps (`Test:propertiesManagement` → `@property`, `Test:invoice` → `@invoice`, etc.). New tests should be taggable into this existing scheme (§6) rather than requiring a new npm script.

## 3. Authentication / Session Model

References: `pages/loginPage.js`, `locators/loginLocator.js`, `tests/TC01_login.spec.js`, `sessionState.json`.

- There is **no automated global login**. `tests/TC01_login.spec.js` performs the real UI login via `LoginPage.login(email, password)` (`pages/loginPage.js`), then calls `page.context().storageState({ path: 'sessionState.json' })` to persist cookies/localStorage to disk (`TC01_login.spec.js`, the "Store Session" `test.step`). Two sibling accounts get their own files the same way: `OtherSessionState.json`, `OneOrganizationUserSessionState.json`.
- **Every other feature spec** declares `test.use({ storageState: 'sessionState.json', ... })` at file scope (e.g. `tests/TC04_properties.spec.js`, `tests/TC19_Capex.spec.js`, `tests/TC21_multiApprover.spec.js`, `tests/TC22_Retainage.spec.js`) — it never re-logs-in, it just loads the saved cookies.
- **Practical consequence for new tests:** copy the `test.use({ storageState: 'sessionState.json' })` block from the nearest sibling spec. Do not call `LoginPage.login()` inside a new feature test. If `sessionState.json` doesn't exist or is stale, `TC01_login.spec.js` must be run first to regenerate it — this is a manual run-order convention, not something Playwright enforces.
- `LoginPage` locators are all wrapped in the self-healing pattern (`locators/loginLocator.js` exports `loginElementStrategies(page)`, an ordered array of fallback locators per field; `pages/loginPage.js` chains them with `healingLocator(...)` from `utils/locatorHealer.js` — see §5).
- `.env` (repo root, real secrets — never print its contents) supplies `TEST_EMAIL`/`TEST_PASSWORD`, `VENDOR_EMAIL`/`VENDOR_PASSWORD`, `NEW_TEST_EMAIL`/`NEW_TEST_PASSWORD`, `ONE_ORG_TEST_EMAIL`, `LOGIN_URL`, `DASHBOARD_URL`, `BASE_URL`, `LOG_LEVEL`, plus unrelated Slack/Notion/GitHub tokens for the `scripts/` integrations.
- **Caution, not an instruction to fix**: `sessionState.json` (and its two siblings) hold live session cookies and are **not** excluded by the repo's `.gitignore` (only `.env*`, `/test-results/`, `/playwright-report/`, `tests/.auth/**/*.json`, `/node_modules` are ignored — confirmed against `tailorbird-next/.gitignore`). Never `git add -A` in this repo without checking `git status` first for exactly this reason.

## 4. Page Object Model Conventions

References: `pages/budgetPage.js`, `pages/properties.js`, `pages/projectJob.js`, `pages/invoicePage.js`, `pages/modalHandler.js`, `pages/leftPanel.js`.

The repo has **three coexisting page-object shapes** — match whichever shape the feature area you're touching already uses; don't introduce a fourth:

1. `exports.X = class X { constructor(page) { this.page = page; ... } }` — e.g. `pages/budgetPage.js` (`BudgetJob`), `pages/projectJob.js` (`ProjectJob`). Imported as `const { BudgetJob } = require('../pages/budgetPage')`.
2. Plain `class X { ... } module.exports = X` — e.g. `pages/invoicePage.js` (`InvoicePage`), `pages/modalHandler.js` (`ModalHandler`), `pages/properties.js` (`PropertiesHelper`, imported as `const PropertiesHelper = require('../pages/properties')`).
3. A non-class module of plain functions taking `page` explicitly, `module.exports = { fn1, fn2, ... }` — only `pages/leftPanel.js`, which is a **shared/base helper** other page objects call into (e.g. `budgetPage.js` does `const leftPanel = require('./leftPanel'); leftPanel.openMoreMenu(this.page);`).

Common conventions across all three shapes:
- Constructor takes `page` as first/only argument, stores `this.page = page`.
- Locators come from a matching `locators/*.js` factory (`xLocators(page)` returning a plain object of Playwright `Locator`s), assigned either as instance properties at construction (`pages/properties.js`) or held in a shared module-scoped variable read by closure (`pages/budgetPage.js`'s unusual `let budget;` pattern — be aware this is per-module shared state, not per-instance, if you extend `budgetPage.js`).
- Page objects **compose other page objects** directly, e.g. `pages/projectJob.js` instantiates `new PropertiesHelper(page)` internally, and `pages/properties.js` imports `CapexGridStabilityPage`. This is an accepted pattern for cross-feature flows.
- Method naming is verb-first camelCase: `navigateToX`, `clickX`, `fillX`, `verifyX`/`validateX`, `ensureX`, `openX`, `selectX`.
- Assertions (`expect(...)`) are written directly inside page-object methods, not delegated to a separate assertion layer.
- Page objects **read/write `data/*.json` and `fixture/*.json` directly via `fs`**, inline in the method body (e.g. `pages/projectJob.js` reads `data/lastCreatedJob.json`; `pages/projectPage.js`'s `createProject()` writes `data/projectData.json`) — this is the established pattern; don't introduce a repository/DAO abstraction around it.
- `ModalHandler` (`pages/modalHandler.js`) is a small **generic, reusable** helper (`addData({...locators, name, description})`) but is only actually used once (from `pages/properties.js`, for a custom-column "add data" modal). Most modals are hand-rolled per feature instead (see §10) — don't assume `ModalHandler` is the universal modal API.
- Logging: most page objects call `Logger.step/success/info/error` (`utils/logger.js`) throughout. `pages/properties.js` is an outlier that mixes raw `console.log` with emoji prefixes alongside `Logger` — don't copy that inconsistency into new code; use `Logger`/`InteractionLogger`.
- Fixed `page.waitForTimeout(N)` sleeps are used pervasively alongside web-first `expect(...).toBeVisible({timeout})` polling, wrapped in try/catch "soft check" idioms. This describes the *existing* code, kept for the specific documented reasons in §10–§12 — don't remove an existing one. For a **new** wait or success check you are writing, follow §25 instead: verify via the API response status code where the action calls an API, and default to a timeout-bound web-first wait over a new blind `waitForTimeout`.

## 5. Locator Architecture & Selector Preferences

References: `locators/budgetLocator.js`, `locators/propertyLocator.js`, `locators/invoiceLocator.js`, `locators/leftPanelLocator.js`, `utils/locatorHealer.js`.

- Two locator-file export conventions coexist: (a) CommonJS factory `function xLocators(page) { return {...} } module.exports = { xLocators }` returning real `Locator` objects (`budgetLocator.js`, `invoiceLocator.js`); (b) ES-module `export const xLocators = {...}` of **plain selector strings**, resolved later via `page.locator(str)` at the call site (`propertyLocator.js`). Match whichever style the feature's existing locator file already uses.
- Selector preference, in descending order of actual usage: **role-based** (`getByRole('button'|'tab'|'columnheader'|'dialog', {name})`) > **CSS class/attribute selectors keyed to the UI library's internals** (Mantine classes like `.mantine-NavLink-root`, `.mantine-Popover-dropdown`; Lucide icon classes like `svg.lucide-trash-2`) > **text-based** (`:has-text()`, `.filter({hasText})`, `getByText`) > **`data-testid`** (present but sparse, e.g. `bt-add-row`, `bt-table-action-add-column`) > **XPath**, used only as an explicit last resort and called out in comments as something new strategies should avoid adding.
- Naming convention for locator object keys: camelCase, role/noun-suffixed — `xxxButton`, `xxxInput`, `xxxDialog`, `xxxHeader`, `xxxTab`, `xxxRows`. Parameterized locators are functions: `columnHeader: (name) => ...`, `categoryOption: (text) => ...`.
- The framework deliberately favors **redundant, `.or()`-chained locators over one "pure" selector** — resilience over elegance is the explicit design goal.

**Self-healing locator pattern — `utils/locatorHealer.js` (used in 23+ files across `pages/`, `locators/`, and some specs):**
- `healingLocator(strategies)` takes an ordered array of `{name, locator}` and reduces it into a single real Playwright `Locator` via `.or()`, so every normal Playwright API keeps working unchanged.
- Convention: strategy index 0 is always the original/pre-existing locator, unchanged; later entries are additional, independently-verified fallback signals — never invented/guessed, and never regex/XPath unless that was already the original.
- Locator files pair a plain factory (`xLocators(page)`) with companion `xElementStrategies(page)`/`xxxStrategies(page)` functions; the page object then does `budget.propertyDropdownButton = healingLocator(this._elementStrategies.propertyDropdownButton)`, reassigning specific keys post-construction so every existing call site is automatically healed with no other code changes.
- `logLocatorHealth(checks, contextLabel)` is a **non-throwing diagnostic** — probes each strategy in order and logs which one matched (or that all failed), used for observability, never to gate control flow.
- **When a selector breaks**: prefer adding a new fallback strategy to the existing `xxxStrategies(page)` array (via `healingLocator`) over replacing the original selector or writing an entirely new, un-healed locator elsewhere.

## 6. Test Structure & Naming Conventions

References: `tests/TC01_login.spec.js`, `tests/TC04_properties.spec.js`, `tests/TC19_Capex.spec.js`, `tests/TC21_multiApprover.spec.js`, `tests/TC22_Retainage.spec.js`.

- **File naming**: `tests/TCxx_FeatureName.spec.js`, two-digit sequence `TC01`…`TC28` (one feature area, `manageTeam_roles`, shares the `TC03` prefix with `manageOrganization` — duplicate file-level numbers do happen; don't treat the filename number as globally unique).
- **Test-title naming is a *separate*, larger, unique numbering scheme** from the filename: `test('TCnnn <@tag1> <@tag2> ... : Description', async ({ page }) => {...})`, e.g. `'TC01 @sanity @mandatory @login ...'`, `'TC290 @regression @capex : ...'`, `'TC320 @regression @retainage : ...'`. Tags are inlined directly in the title string (Playwright's grep-based tag filtering), not `test.info().annotations`. **Before adding a new test, grep `tests/*.spec.js` for `'TC\d+'` to find the current highest number and pick the next unused one** — numbers are already well past 300.
- **Tag vocabulary actually in use** (grep-derived): `@sanity`, `@mandatory`, `@regression`, `@login`, `@invalid`, `@menu`, `@organization`, `@property`, `@contract`, `@class`, `@role`, `@capex`, `@vendor`, `@negtest`, `@visual`, `@projectAndJob`, `@manageTeam`, `@roles`, `@changeOrderAndinvoice`, `@category`, `@ooo`, `@e2e`, `@finalizeBidUi`, `@approval`, `@multiApprover`, `@retainage`, `@cmfee`, `@drawReporting`. New tests should reuse existing tags where the feature area matches (so they get picked up by the matching `npm run Test:xxx` script), plus `@regression` (and `@sanity`/`@mandatory` only if the ticket calls for it).
- **`test.step(...)`** is used heavily to narrate multi-phase flows within one `test()` (e.g. `TC01_login.spec.js`'s `Go to login page` / `Perform login` / `Store Session` / `Close Context` steps). Use it for any test with more than 2-3 logical phases.
- **`beforeEach` is the dominant setup hook** for feature suites — construct the page object(s), `page.goto(DASHBOARD_URL)` (or a direct feature URL), then `ensureLeftPanelExpanded(page)` (`utils/leftPanelExpander.js`) — see `tests/TC19_Capex.spec.js`, `tests/TC21_multiApprover.spec.js`, `tests/TC22_Retainage.spec.js`. `tests/TC04_properties.spec.js` instead uses `beforeAll`/`afterAll` sharing one `context`/`page` across all its tests — an intentional exception for that file, not the default to copy elsewhere without reason.
- `test.describe.configure({ retries: 1 })` is set per-file for suites prone to environment flake (`TC04`, `TC19`, `TC22`) — add it to a new suite only if the feature is similarly flaky, not by default.
- `tests/multi_approver_happy_path.md` and `tests/retainage_happy_path_pr978.md` are **human-readable design docs**, not executable tests — they translate a backend PR diff into a proposed E2E plan (Feature/Source/Coverage-map/Notes sections) with a draft TypeScript sketch and `TODO` placeholders. If asked to "implement" a feature described in one of these, treat it as a spec/requirements doc to build a real `TCxx_*.spec.js` from — don't try to run the `.md` file's embedded code as-is.

## 7. Logger & Assertion Conventions

References: `utils/logger.js`, `utils/InteractionLogger.js`, `utils/assertUi.js`.

- **`Logger`** (`utils/logger.js`) — static class, the baseline logging API used everywhere: `Logger.step(msg)` (only prints when `LOG_LEVEL==='debug'` or headed), `Logger.success(msg)` (✅), `Logger.error(msg)` (❌), `Logger.info(msg)` (ℹ️), `Logger.log(msg, icon)` (gated by `LOG_LEVEL !== 'silent'`). This is the utility to use for any new logging in a page object or spec.
- **`InteractionLogger`** (`utils/InteractionLogger.js`) — a richer, narration-oriented layer with ~20 semantic methods (`logNavigation`, `logFormFill(field, value, isPassword)` — masks passwords, `logButtonClick`, `logAssertion`/`logUrlAssertion`, `logStepComplete`/`logStepFailure`, `logUIDrift(component, expected, actual, matches)`, etc.), all delegating to `Logger` internally. **Usage is narrow in practice** — mainly `pages/loginPage.js`, `pages/unitInteriorPage.js`, and `tests/TC01_login.spec.js`. Reach for it only when writing detailed UI-copy/accessibility drift narration similar to those files; otherwise plain `Logger` is the norm.
- **`utils/assertUi.js`** (`driftMessage(layer, expected, hint)`, `logExpectation(context, message)`) is **defined but currently unused anywhere in the repo** (no import sites found). Don't build new code assuming it's wired in; the equivalent hand-written pattern below is what's actually used everywhere.
- **Actual assertion convention** (dominant pattern, e.g. `tests/TC19_Capex.spec.js`, `pages/loginPage.js`): `expect(actualValueOrLocator, 'FAIL: <what was expected> — <why/what to check if it fails>').toBe...()`, with a `Logger.step(...)`/`Logger.info(...)` line narrating the action right before, and `Logger.success(...)` right after a passing assertion. New tests/page-object methods should follow this exact shape — descriptive message as the second `expect()` argument, not a separate assertion helper.

## 8. Fixtures & Test-Data Conventions

References: `fixture/property.json`, `fixture/organization.json`, `fixture/retainage.json`, `data/propertyData.json`, `data/projectData.json`, `data/lastCreatedJob.json`, `utils/tabsDisabledHelper.js`.

- **`fixture/`** = static, hand-authored, checked-in **expected values** (UI copy, dialog titles, header labels, thresholds) — read-only at test time; nothing in the repo ever `fs.writeFileSync`s into `fixture/`. Some fixtures embed real environment IDs that must be **manually maintained** if the referenced record is ever deleted (e.g. `fixture/retainage.json` hardcodes a `jobId`/`invoiceId` with an explicit maintenance comment). Treat any edit to a `fixture/*.json` as a deliberate, reviewed change to expected app behavior/copy — not a place to stash new runtime data.
- **`data/`** = runtime-generated/seeded state, written by one test during a run and read back by a later, independent spec file; values contain timestamps/random suffixes (e.g. `data/propertyData.json`'s `propertyName` has a random numeric suffix). Most files here are untracked in git (`git status` shows them `??`) — they're regenerated per run, not fixed truth.
- **Established write→read handoff pattern** (model any new cross-test data passing on this): write side does `fs.writeFileSync(path.join(__dirname, '../data/xxx.json'), JSON.stringify({...}, null, 2))` inline inside the page-object method that creates the entity (e.g. `pages/projectPage.js`'s `createProject()` → `data/projectData.json`; `tests/TC06_jobs.spec.js` → `data/lastCreatedJob.json`); read side does a guarded `if (!x) { ...fs.readFileSync... }` fallback inline in the consuming spec/page object (consumers of project data: `tests/TC06_jobs.spec.js`, `TC07_category.spec.js`, `TC08_invoice.spec.js`, `TC09_changeOrder.spec.js`, `TC13_FInalizeBidWithUIFlow.spec.js`, `pages/capexSidebarPage.js`, `pages/projectPage.js`).
- **One case has a dedicated helper module instead of raw `fs`**: `utils/tabsDisabledHelper.js` (`getTabsDisabledState()`/`setTabsDisabledState(state)`) wraps `data/tabsDisabled.json` — written by `tests/TC06_jobs.spec.js`, read by `tests/TC08_invoice.spec.js` and `tests/TC09_changeOrder.spec.js`. **Prefer this pattern (a small dedicated read/write helper) over raw inline `fs` calls when adding a new cross-test data handoff**, even though the repo itself is inconsistent about which one it uses per file.
- `utils/propertyUtils.js`'s `getPropertyName()` shows the fallback-chain idiom: try `downloads/property.json` first, fall back to `data/propertyData.json`, throw only if neither has the field.

## 9. Cleanup & Test-Isolation Conventions

- There is **no framework-wide `afterEach`/`afterAll` cleanup convention** — most feature suites (including the entire CapEx suite, `tests/TC19_Capex.spec.js`) have no cleanup hook at all and simply read/verify against pre-existing shared environment data.
- Where cleanup exists, it's feature-specific and best-effort, e.g. the (currently unused/orphaned) `pages/capexSidebarPage.js`'s `cleanupSuiteProperty()` deletes a property it created, falling back to a comment that "the TC16 cleanup script will handle it" if deletion fails — i.e. some suites rely on a separate, external cleanup job rather than in-test teardown.
- **Test isolation is weak by design in places**: `playwright.config.js` sets `workers: 1`, and CapEx's own code documents that its target environment is a **shared, mutable portfolio** that other processes can alter mid-test (see §13) — new tests in an already-shared-data feature area should expect and tolerate that, not assume hermetic isolation.
- When a ticket requires new cross-test setup/teardown, match the nearest sibling test's existing approach (hook-based teardown vs. relying on a shared/external cleanup) rather than introducing a new isolation strategy for just one spec.

## 10. Complex UI Patterns — Modal / Form / Dropdown / Tab

References: `pages/modalHandler.js`, `pages/reassignInvoicePage.js`, `pages/invoicePage.js`, `pages/budgetPage.js`, `pages/capexPage.js`.

**Modals** — most are hand-rolled per feature, not routed through the generic `ModalHandler`. The real dominant pattern (`pages/reassignInvoicePage.js`):
1. Click the trigger, then assert the dialog container is visible with an explicit timeout (`expect(dialogLocator).toBeVisible({timeout: 10000})`).
2. Every subsequent interaction re-fetches the dialog locator and scopes child locators under it (don't cache a stale reference from before the dialog opened).
3. For any combobox inside the modal that lazily fetches its options, assert the input's placeholder is *not* a loading state (e.g. not `/loading/i`) before interacting — documented as "a proven source of flakiness" in `reassignInvoicePage.js`.
4. Confirm/cancel actions assert a resulting toast or dialog-closed state, not just that the click succeeded. For a **new** confirm action that calls an API, pair this with an API-response status check (§25) — the toast/dialog-closed state alone is not proof the backend call succeeded.
`pages/invoicePage.js`'s `confirmInvoiceAndHandleModal` shows a second recurring idiom: wait for a confirm button to become *enabled* (server-side settling can leave it disabled briefly) and explicitly dismiss any blocking toast/notification before proceeding, since a stray toast can intercept the next click.

**Dropdowns** (`pages/budgetPage.js`): layered matching — try an exact-text option match first, then a partial-text match, then "first non-empty option" as a last resort; also try `[role="option"]` first and fall back to `[data-combobox-option]` if the component library rendered it differently. Reuse this exact-then-partial-then-fallback shape for any new dropdown interaction rather than a single brittle selector.

**Tabs** — selector strategy depends on which UI component the feature actually uses; don't assume `role="tab"` everywhere:
- Standard Mantine tabs: `getByRole('tab', {name})` then scope to `getByRole('tabpanel', {name})` (`pages/budgetPage.js`).
- CapEx's tab-like control is a Mantine `SegmentedControl`, **not** `role="tab"` — it's `.mantine-SegmentedControl-label` filtered by text (`locators/capexLocator.js`, `pages/capexPage.js`'s `clickTab(name)`).
- `pages/invoicePage.js` shows a layered fallback (`getByRole('tab', {name})` → `[role="tab"]:has-text(...)` → generic `button, [role="tab"]` filter) for a feature where the ARIA role is inconsistent across states.

## 11. Virtualized-Grid Patterns

References: `utils/columnResizeHelper.js`, `pages/capexPage.js`, `pages/budgetPage.js`, `pages/reassignInvoicePage.js`.

The app renders financial/data grids with **RevoGrid** (custom elements `revo-grid`, `revogr-data`, `revogr-viewport-scroll`, `revogr-scroll-virtual`), which only mounts columns/rows that fit the *current rendered width* into the DOM — it doesn't just visually hide them, they're absent from the DOM entirely until scrolled/widened into view. Three distinct, independently-applied workarounds exist framework-wide (not just in CapEx):

1. **`forceGridFullWidth()`** — reimplemented per page object (`pages/capexPage.js`, `pages/approvalPage.js`, `pages/retainagePage.js`, `pages/vendorDirectoryPage.js`, `pages/multiApproverPage.js`, `pages/projectJob.js`, `pages/capexColumnPersistencePage.js`, `pages/addColumnPage.js`, plus a shared version in `utils/columnResizeHelper.js`): sets `width`/`min-width: 3000px !important` (4000px in `addColumnPage.js`) directly on the `revo-grid` element via `element.style.setProperty(..., 'important')`, then waits ~300ms. Rationale (documented in `pages/capexPage.js`): at narrow widths the grid drops low-priority columns from the DOM entirely, and the width threshold that triggers this is font-metric/OS dependent, so it can appear in CI even when it doesn't locally. **This does not change data or interaction behavior — visual-only.** When you need a column that might not be mounted, call the feature's existing `forceGridFullWidth()` before locating it, and prefer a paired `restoreGridWidth()`/re-narrowing call afterward if one exists for that page object (`capexColumnPersistencePage.js` has one, because the forced width otherwise silently persists across later `test.step()`s on the same page and can break unrelated assertions).
2. **Manual virtual-scroll manipulation** for horizontal scroll within a grid (`pages/budgetPage.js`'s `scrollRevisionEditorToNotesColumn`): directly sets `scrollLeft` on the grid's internal `revogr-viewport-scroll`/`revogr-scroll-virtual.horizontal` elements via `page.evaluate` and manually dispatches a `scroll` event — used because Playwright's native `scrollIntoViewIfNeeded()` doesn't reliably trigger RevoGrid's internal re-render for far-off cells.
3. **Retry-with-reload** for cross-pane virtualization lag (`pages/reassignInvoicePage.js`): the Actions-column pane is a separately virtualized section from the data-cell pane, so a freshly created row's action buttons can lag behind its data cells — the fix there is a bounded retry loop that reloads and re-checks rather than a fixed wait.
4. **Ordinary `scrollIntoViewIfNeeded()`** remains correct for elements already mounted but merely outside the viewport — reserve the heavier techniques above only for elements that are actually missing from the DOM.

Locator convention for virtualized rows: `revo-grid revogr-data[type="rgRow"] div[role="row"]`, and outer containers are matched defensively as `[role="treegrid"], [role="grid"]` since the same grid library renders either role depending on feature/version.

## 12. Nested / Expandable-Row Patterns

References: `pages/capexPage.js`, `pages/capexGridStabilityPage.js`, `locators/capexLocator.js`, `locators/retainageLocator.js`, `pages/categoryPage.js`.

- Canonical mechanism: parent/top-level rows carry a `button.tree-toggle`; expanded/child line-item rows never do. Centralized as a locator (`locators/capexLocator.js`'s `treeExpandBtns: page.locator('button.tree-toggle')`) and driven generically:
  - `expandRow(index)` (`pages/capexPage.js`): click the `index`-th toggle button, wait ~800ms.
  - `expandToLeafRow()`: expand index 0 (first top-level row), then — if more toggles appeared — expand index 1 (the first child row that showed up), i.e. drill one level at a time rather than assuming a fixed row count up front.
- The same `.tree-toggle`-presence signal is also used to **distinguish parent rows from their expanded children when aggregating** — e.g. `locators/retainageLocator.js` filters rows `{has: page.locator('.tree-toggle')}` to sum only top-level rows and exclude already-expanded line items from a total.
- A richer variant (`pages/capexGridStabilityPage.js`, for large-dataset expand+scroll stability tests) identifies parent vs. child purely by DOM position plus an indent span's inline `margin-left>=20px` style — with an explicit warning that this check *alone* is insufficient, since parent cells also carry a 0px spacer span; combine it with position, as the existing code does, don't rely on the margin check in isolation.
- A second, unrelated "expand" idiom exists for **left-nav tree sections** (not grid rows): `pages/categoryPage.js`'s `expandFinancialsSection` toggles an `aria-expanded` attribute on a nav button. Don't conflate this with the grid row pattern above — check whether you're expanding a nav section or a data-grid row before picking a pattern.
- `locators/capexSidebarLocator.js` shows a third, ARIA-attribute-based alternative (`[role="row"] button[aria-expanded], [role="gridcell"] button[aria-expanded]`) used only in the currently-unused `capexSidebarPage.js` — the `.tree-toggle` class-based approach is the one actually exercised by the live CapEx suite.

## 13. CapEx — Dedicated Deep Dive

References: `pages/capexPage.js`, `pages/capexGridStabilityPage.js`, `pages/capexColumnPersistencePage.js` (unused), `pages/capexSidebarPage.js` (unused), `locators/capexLocator.js`, `locators/capexGridStabilityLocator.js`, `locators/capexColumnPersistenceLocator.js`, `locators/capexSidebarLocator.js`, `tests/TC19_Capex.spec.js`, `tests/TC04_properties.spec.js` (TC68), `tests/TC07_category.spec.js` (TC106), `pages/addColumnPage.js`, `utils/leftPanelExpander.js`, `data/propertyData.json`, `data/projectData.json`, `scripts/inspect_brooke_capex.js`, `scripts/brooke_capex_data.json`.

**The only live/wired-up CapEx spec is `tests/TC19_Capex.spec.js`** (test IDs TC290–TC310, tagged `@regression @capex`, `test.describe.configure({ retries: 1 })`). Two other page objects exist in the repo (`capexColumnPersistencePage.js`, `capexSidebarPage.js`) but **are never instantiated by any current spec** — treat them as reference implementations to potentially revive, not as live framework surface. Confirm with a fresh grep for `new CapexColumnPersistencePage` / `new CapexSidebarPage` before relying on either.

- **Navigation**: `capexPage.goto()` navigates directly to `${BASE_URL}/financials/capex` (no left-panel click needed to reach it). `ensureLeftPanelExpanded(page)` (`utils/leftPanelExpander.js`) is still called in `beforeEach` afterward, but only to keep the nav rail pinned open for later assertions/screenshots — it is not the mechanism used to enter CapEx.
- **Shell readiness**: `waitForShellReady()` waits for `main`, then column headers, then calls `forceGridFullWidth()`, then waits for rows to reach a `>=7 gridcells` heuristic — with a reload-and-retry-once fallback if rows haven't settled within 45s. Any new CapEx interaction should call through `waitForShellReady()` (or the existing method that already calls it) rather than adding an ad hoc wait.
- **Session/auth assumption**: same as every other suite — `storageState: 'sessionState.json'` (see §3); CapEx does not do anything special for auth.
- **Seeded-data requirement (live suite)**: `TC19_Capex.spec.js` seeds nothing itself. It hard-assumes a **pre-existing shared portfolio** in the target environment already containing multiple properties with real CapEx financial data — including one named in comments as `"Test Property 1_Cottages on Elm"` with exactly 8 children (used by the expand/scroll-stability tests), and an environment fact baked into assertions that year 2025 has $0 CapEx data while year 2026 does not. Don't assume a fresh/empty environment will pass this suite — it requires that specific shared state to already exist.
- **This portfolio is shared and mutable at runtime**: `pages/capexGridStabilityPage.js` documents (MCP-verified) that an external process can mutate the portfolio mid-test, causing RevoGrid to fully remount (resetting scroll position and collapsing any expanded rows) *before* a queued click even fires. The existing recovery strategy is to try every other currently-visible toggle rather than reporting a false result — copy this defensive retry shape for any new expand/scroll logic against this same grid, don't assume a single click-and-verify is safe.
- **Contrast — the unused self-seeding model**: `pages/capexSidebarPage.js`'s `setupSuitePropertyAndSeedBudget()` creates its own property (via `PropertiesHelper`), uploads a budget CSV through the Budget module, and polls up to 90s for non-zero CapEx data, writing the created property name to `data/propertyData.json`; `cleanupSuiteProperty()` deletes it afterward (best-effort, falling back to an external "TC16 cleanup script"). This is a legitimate pattern to reuse **if a ticket specifically calls for a self-contained/isolated CapEx test** — but it is not what the live suite does today, and reviving it means actually instantiating `CapexSidebarPage` somewhere, which no current spec does.
- **`forceGridFullWidth`**: CapEx has its own copy (`pages/capexPage.js`) plus a second copy in the unused `capexColumnPersistencePage.js`. Documented root cause: at narrow widths (MCP-verified at 1366px) RevoGrid drops 3 of 9 financial columns from the DOM entirely and per-row `gridcell` count falls from 9-12 to 6, which breaks the `>=7 gridcells` heuristic used throughout `capexPage.js`. The threshold is font-metric-dependent, so it can trigger differently in CI than locally — don't lower or remove this call to "simplify" a new CapEx method. `capexColumnPersistencePage.js`'s `restoreGridWidth()` exists because the forced 3000px width otherwise persists across chained `test.step()`s on the same page and can silently break a later, unrelated assertion — if you add a new step after a forced-width read, restore or re-check width expectations.
- **Parent/child row expansion**: see §12 — `expandRow(index)`/`expandToLeafRow()` in `capexPage.js`; richer position+indent-based logic in `capexGridStabilityPage.js` for multi-row stability scenarios.
- **Custom-column handling**: CapEx's own "Manage Columns" drawer (`openManageColumnsDrawer`/`toggleColumn`/`selectAllDefaultFinancialColumns` in `capexPage.js`) only shows/hides the **9 fixed financial columns** (`FINANCIAL_COLS` constant at the top of `capexPage.js`) — it does not create new custom columns. **Custom-column coverage now exists — see `TC449` below.** For adding a brand-new custom column to a grid that doesn't yet have coverage, `addColumnPage.js` is the reference implementation to adapt.
- **FEAT-1168 custom-column coverage (`TC449`, `tests/TC19_Capex.spec.js`)** — the CapEx suite's own custom-column test, reusing `addColumnPage.js` directly against the CapEx grid rather than forking a parallel implementation:
  - Instantiates `new AddColumnPage(page, { scope: page.locator('main') })` — the constructor's `options.scope` lets a caller scope the panel/dialog locators to a container narrower than the whole page, which is how the same generic page object is reused against CapEx's layout without a CapEx-specific copy.
  - Calls the existing `addColumnPage.addColumn(columnName, description, columnTypeIndex)` and `addColumnPage.deleteColumn(columnName)` unchanged — no new CapEx-specific add/delete method was written.
  - **Parent/child rows**: verifies the same column (added once, at the table level) renders a cell on both top-level property rows and on child rows exposed by `capex.expandRow(0)` (§12) — asserted via a new small helper, `capexPage.js`'s `getColumnCellsByHeader(columnName)`, which reuses the existing header/cell-count "shift" correction (§13's column-index-shift quirk) to read one arbitrary column (built-in or custom) across every currently rendered row. Returns `null` if the column isn't in the header row at all, so callers can distinguish "column missing" from "row has no data."
  - **Tab coverage**: asserts the custom column's header is present after `capex.clickTab('Fund')` and `capex.clickTab('Region')` (§10's `SegmentedControl`-based tab pattern), in addition to the default Properties tab.
  - Also checks existing financial columns/`Actions` and the Total-row roll-up (`getTotalRowValues()`) are unaffected by the add (within the existing 0.11-style tolerance pattern from §13's formula validation).
  - **Cleanup**: calls `addColumnPage.deleteColumn(columnName)` and re-asserts the column is gone — unlike the rest of the live CapEx suite (which has no cleanup, see below), this test creates data and tears it down itself, following §9's "match cleanup to whether the new test creates data" guidance rather than the suite's dominant no-cleanup default.
- **Column persistence** (sort/resize/server-persisted visibility): implemented in the currently-unused `pages/capexColumnPersistencePage.js` — sort-state cycling (off→asc→desc→off, detected via an SVG path prefix on a `.sort-active-indicator`), a real mouse-drag column resize (`resizeColumn`, with a retry-once-if-no-movement guard), and `isColumnVisibleInGrid`'s optimization of trying a fast DOM check before paying for a full force/restore-width cycle. It also documents that a column's visibility being **persisted server-side** (`PUT`/`GET /api/table-view-config`) is a separate concern from whether it's actually **mounted in the DOM** at default width — persistence can succeed while the DOM check still fails. Before extending this file, note its internal comments reference test IDs (`TC206`, `TC287`, `TC291`, `TC301 S4`) that don't match the live suite's TC290–TC310 range — these are stale, from before a renumbering; verify behavior against the current app rather than trusting those comments' context.
- **Formula validation**: `validateFormulas()` (`pages/capexPage.js`) checks four relationships with a 0.11 rounding tolerance: `Current Budget = Original Budget + Budget Revision`, `Current Contract = Original Contract + Approved Change Orders`, `Budget Remaining = Current Budget - Current Contract`, `Remaining Contract = Current Contract - Invoiced Amount`. Any check is **skipped, not failed**, when an operand is null or the result would be exactly 0 — i.e. formulas are only exercised against non-trivial real data, matching the "shared portfolio, not seeded" model above. If asked to add a new derived-column check, follow this same skip-on-trivial-data shape rather than hard-failing on empty cells.
- **Cleanup**: the live `TC19_Capex.spec.js` has **no `afterEach`/`afterAll`** — it doesn't create data, so there's nothing to tear down. Don't add cleanup to this suite unless a new test in it starts creating data (in which case, follow §9 and the `capexSidebarPage.js` best-effort pattern).
- **Known dead/duplicate code to be aware of when editing `pages/capexPage.js`**: `toggleColumn()` is defined twice (later definition silently wins in JS); `getTopRowPencilCount()`, `getTabPageInfo()`, and `_resetPinnedPropertyPaneScroll()` are each defined twice, and the two `getTabPageInfo()` copies actually **differ** (the second adds an extra 4-second wait) — grep the file for the method name you're about to add/edit before assuming there's only one definition, and be explicit in your ticket/PR if you're intentionally consolidating a duplicate (don't silently "fix" it as a drive-by).
- **Investigation artifacts**: `scripts/inspect_brooke_capex.js` (a standalone Node script, not a Playwright test — run via `node scripts/inspect_brooke_capex.js`, reuses `sessionState.json`) is what originally surfaced CapEx's column-index-shift quirk (its captured `scripts/brooke_capex_data.json` shows dollar amounts landing in a "Category" column slot) — this is the origin of the `shift = allHeaderTexts.length > cells.length ? -1 : 0` correction used throughout `capexPage.js`'s row-reading methods. Useful as a live debugging tool if a new CapEx column-mapping bug needs investigating, but it is not part of the automated suite.

## 14. Visual Testing & Snapshot Conventions

Three genuinely different "snapshot" mechanisms exist in this repo — do not conflate them.

**(A) Playwright native pixel screenshots** — configured in `playwright.config.js` (`expect.toHaveScreenshot.pathTemplate: 'committed_ui_snapshots/{testFilePath}/{arg}{ext}'`). Baselines are committed PNGs under `committed_ui_snapshots/<spec-file>/*.png` (e.g. `committed_ui_snapshots/TC01_login.spec.js/login-visual-01-email-step.png`). `committed_ui_snapshots/README.md` documents the bootstrap workflow (a one-time `npm run snapshots:update-all`-style command) and warns not to move PNGs out of their per-spec subfolder. `committed_ui_snapshots/mcp_reference_crosscheck/` is explicitly **manual-only** — tests never read it; it exists purely for a human to eyeball against an MCP-captured reference. Real call sites target a **scoped locator** (a dialog, toolbar, tablist), not the full page, in most specs (`TC04_properties.spec.js`, `TC06_jobs.spec.js`, `TC07_category.spec.js`, `TC08_invoice.spec.js`, `TC10_approval.spec.js`, `TC18_UnitInterior.spec.js`); `TC01`/`TC02`/`TC03` are the exception, snapshotting the full masked page. Note `tests/TC19_Capex.spec.js` has **commented-out** `toHaveScreenshot` calls against the CapEx grid — pixel-diffing that specific virtualized grid was tried and disabled; don't re-enable it without understanding why it was turned off (likely the same width/virtualization instability documented in §11/§13).

**(B) `utils/uiSnapshotCapture.js` — a separate, DOM-text/JSON "snapshot"**, unrelated to pixel diffing. `captureDrawReportingUi(page, excludeTexts)` walks the live DOM via `page.evaluate` into a plain JSON object of `{tabs, headings, buttons, textLabels}`, filtering out per-run dynamic text. `compareUiSnapshotToBaseline({baselinePath, liveSnapshot, expect})` **self-bootstraps**: if the baseline JSON file doesn't exist yet, it writes the live capture to disk and skips the assertion for that run; on later runs it does a real `expect(liveSnapshot).toEqual(baseline)`. This is a structural/copy-drift check (catches "a button's label changed"), not a layout/pixel check. Sole call site: `tests/TC25_Draw_reporting.spec.js`, against `fixture/drawReportingUiBaseline.json`/`fixture/drawReportingControlsBaseline.json`. If a ticket needs "did the UI text/structure change" coverage for a new page, this is the pattern to reuse — not a new pixel screenshot.

**(C) Hand-maintained "expected copy" fixture JSON** — `fixture/tailorbirdUiMessages.json`, `fixture/authKitMessages.json`, `fixture/fga_cta_texts.json`: plain JSON of exact expected UI strings, read directly and asserted with `toBeVisible`/`toHaveText` (e.g. `pages/loginPage.js` reads `authKitMessages.json` for `expectAuthKitMessage()`). These are **not generated/bootstrapped** the way (B)'s baseline is — they're manually maintained and manually kept in sync with product copy (comments explicitly say "update fixture X if product copy changed"). Use this pattern for a small, fixed set of expected strings; use (B) for a whole page's structural fingerprint.

## 15. Reusable Utilities & Helpers

| Utility | Purpose | Key exports | Representative call sites |
|---|---|---|---|
| `utils/logger.js` | Baseline step/success/error/info logging | `Logger.step/success/error/info/log` | Nearly every `pages/*.js` and `tests/*.spec.js` |
| `utils/InteractionLogger.js` | Rich narration (form fills w/ password masking, UI-drift logging, URL assertions) | `logFormFill`, `logNavigation`, `logUIDrift`, etc. | `pages/loginPage.js`, `pages/unitInteriorPage.js`, `tests/TC01_login.spec.js` |
| `utils/assertUi.js` | Drift-message builder (currently unused/dead) | `driftMessage`, `logExpectation` | none found — don't assume it's wired in |
| `utils/locatorHealer.js` | Self-healing locators + non-throwing health diagnostics | `healingLocator(strategies)`, `logLocatorHealth(...)` | 23+ files incl. `loginPage.js`, `budgetPage.js`, `properties.js` |
| `utils/leftPanelExpander.js` | Idempotently expand + pin the collapsed left nav rail | `ensureLeftPanelExpanded(page)` | Called from `beforeEach` in ~26 spec files |
| `utils/columnResizeHelper.js` | Verify a resized grid column's cell text doesn't wrap; shared `forceGridFullWidth` | `verifyColumnContentDoesNotWrap(...)`, `forceGridFullWidth(page)` | `tests/TC04_properties.spec.js` |
| `utils/resilientRetry.js` | Generic action/operation retry helpers | `withExtendedTerminalWait(...)`, `retryOperation(...)` | `tests/TC03_manageOrganization.spec.js`, `TC17_OOO_OutOfOffice.spec.js`, `TC25_Draw_reporting.spec.js` |
| `utils/tabsDisabledHelper.js` | Cross-test handoff of "are tabs disabled" state | `getTabsDisabledState()`, `setTabsDisabledState(state)` | write: `TC06_jobs.spec.js`; read: `TC08_invoice.spec.js`, `TC09_changeOrder.spec.js` |
| `utils/pdfTextExtractor.js` | Download + extract text from a signed PDF URL | `downloadPdfBuffer(url)`, `downloadAndExtractPdfText(url)` | `tests/TC25_Draw_reporting.spec.js` |
| `utils/propertyUtils.js` | Resolve the current property name across `downloads/`/`data/` fallbacks | `getPropertyName()`, `getPropertyNameFromDownload()` | `tests/TC04_properties.spec.js`, `TC10_approval.spec.js` |
| `utils/uiSnapshotCapture.js` | DOM-text/JSON structural snapshot with self-bootstrapping baseline | `captureDrawReportingUi(...)`, `compareUiSnapshotToBaseline(...)` | `tests/TC25_Draw_reporting.spec.js` (only) |
| `utils/UIInspector.js` | Static DOM-scan debugging helpers | `scanAndLogInteractiveElements`, `captureAllText`, etc. | **Unused** — no call sites outside its own file |

Before writing a new helper, scan this table — grid-width, retry, left-panel, PDF, and cross-test data-handoff needs are almost certainly already covered.

## 16. Strong Existing Test References

Model a new test on whichever of these is closest to your ticket's shape:

- **Session bootstrap / auth**: `tests/TC01_login.spec.js` — the only file that performs a real login and writes `sessionState.json`; also the best example of `InteractionLogger` usage and the `test.step` narration pattern.
- **Grid-heavy feature with documented virtualization/formula workarounds**: `tests/TC19_Capex.spec.js` — the single richest spec in the repo; read it in full before touching any RevoGrid-based feature, even outside CapEx, since its comments explain *why* each workaround exists.
- **Fixture-driven scenario test with a companion design doc**: `tests/TC21_multiApprover.spec.js` / `tests/TC22_Retainage.spec.js`, paired with `tests/multi_approver_happy_path.md` / `tests/retainage_happy_path_pr978.md` — good models for a ticket that arrives as a backend PR needing E2E coverage.
- **PDF content + structural UI-snapshot testing**: `tests/TC25_Draw_reporting.spec.js` — the only spec using `utils/pdfTextExtractor.js` and `utils/uiSnapshotCapture.js`.
- **Cross-file data-handoff chain**: `tests/TC05_project.spec.js` → `TC06_jobs.spec.js` → `TC07_category.spec.js`/`TC08_invoice.spec.js`/`TC09_changeOrder.spec.js` — the clearest example of the `data/*.json` write-then-read convention (§8).
- **Custom-column CRUD across multiple grids**: `pages/addColumnPage.js`, exercised from `TC04_properties.spec.js` (TC250, Projects grid), `TC10_approval.spec.js`, `TC11_approval_workflow.spec.js`, `TC15_Budget.spec.js`, `TC14_manageVendor.spec.js`, and `TC19_Capex.spec.js`'s `TC449` (CapEx grid, §13) — the reference implementation for adding custom-column coverage to any grid; CapEx's own `TC449` is the model for reusing it against a grid with parent/child rows and multiple tabs.

## 17. Feature → Test → Page Object → Locator → Utility Map

Rows marked **(verified)** were read in depth during this study; rows marked **(by convention)** follow the repo's consistent 1:1 file-naming pattern but were not individually opened — confirm by reading the actual files before relying on specifics.

| Feature | Test file(s) | Page object(s) | Locator(s) | Notable utilities |
|---|---|---|---|---|
| Login/session **(verified)** | `TC01_login.spec.js` | `loginPage.js` | `loginLocator.js` | `locatorHealer.js`, `InteractionLogger.js` |
| Properties **(verified)** | `TC04_properties.spec.js` | `properties.js` (`PropertiesHelper`) | `propertyLocator.js` | `propertyUtils.js`, `columnResizeHelper.js`, `leftPanelExpander.js` |
| Project/Job **(verified)** | `TC05_project.spec.js`, `TC06_jobs.spec.js` | `projectPage.js`, `projectJob.js` | `projectPageLocator.js`, `projectJobLocator.js` | data handoff via `data/projectData.json`, `data/lastCreatedJob.json` |
| Category **(verified)** | `TC07_category.spec.js` | `categoryPage.js` | `categoryPageLocator.js` | reads `data/projectData.json` |
| Invoice **(verified)** | `TC08_invoice.spec.js` | `invoicePage.js` | `invoiceLocator.js` | `tabsDisabledHelper.js` |
| Change Order **(verified)** | `TC09_changeOrder.spec.js` | `invoicePage.js` (composes `changeOrderLocator.js`) | `changeOrderLocator.js` | `tabsDisabledHelper.js` |
| Budget **(verified)** | `TC13_Budget.spec.js`/`TC15_Budget.spec.js` | `budgetPage.js` (`BudgetJob`) | `budgetLocator.js` | `columnResizeHelper.js`, `addColumnPage.js` |
| CapEx **(verified)** | `TC19_Capex.spec.js` | `capexPage.js`, `capexGridStabilityPage.js` | `capexLocator.js`, `capexGridStabilityLocator.js` | see §13 in full |
| Retainage **(verified)** | `TC22_Retainage.spec.js` | `retainagePage.js` | `retainageLocator.js` | `.tree-toggle` parent/child aggregation (§12) |
| Multi-Approver **(verified)** | `TC21_multiApprover.spec.js` | `multiApproverPage.js` | `multiApproverLocator.js` | `data/multiApproverInvoices.json`, `data/approverRolesAndUsers.json` |
| Draw Reporting **(verified)** | `TC25_Draw_reporting.spec.js` | `drawReportingPage.js` | `drawReportingLocator.js` | `pdfTextExtractor.js`, `uiSnapshotCapture.js` |
| Reassign Invoice **(verified)** | `TC24_ReassigningInvoice.spec.js` | `reassignInvoicePage.js` | `reassignInvoiceLocator.js` | virtualized Actions-pane retry pattern (§11) |
| Custom columns (cross-feature) **(verified)** | `TC04`, `TC10`, `TC11`, `TC15`, `TC14` | `addColumnPage.js` | `addColumnLocator.js` | shared `forceGridFullWidth` idiom |
| Menu/navigation **(by convention)** | `TC02_menu.spec.js` | uses `leftPanel.js` | `leftPanelLocator.js` | `leftPanelExpander.js` |
| Manage Organization / Team Roles **(by convention)** | `TC03_manageOrganization.spec.js`, `TC03_manageTeam_roles.spec.js` | `organizationHelper.js`, `manageTeamRolesHelper.js` | `organization.js`, `manageTeamRolesLocator.js` | `resilientRetry.js` |
| Approval / Approval workflow **(by convention)** | `TC10_approval.spec.js`, `TC11_approval_workflow.spec.js`, `TC12_myApprovalWorkflow.spec.js` | `approvalPage.js`, `simpleApprovalPage.js` | `approvalLocator.js`, `simpleApprovalLocator.js` | `forceGridFullWidth` copy in `approvalPage.js` |
| Bid **(by convention)** | `TC13_FInalizeBidWithUIFlow.spec.js`, `TC20_Bid.spec.js` | `bidPage.js` | `bidLocator.js` | reads `data/lastCreatedJob.json`/`data/bidData.json` |
| Vendor Directory **(by convention)** | `TC14_manageVendor.spec.js` | `vendorDirectoryPage.js` | `vendorLocator.js` | `forceGridFullWidth` copy |
| Out of Office **(by convention)** | `TC17_OOO_OutOfOffice.spec.js` | `oooPage.js` | `oooLocator.js` | `resilientRetry.js` (`withExtendedTerminalWait`) |
| Unit Interior **(by convention)** | `TC18_UnitInterior.spec.js`, `UnitInterior.spec.js` | `unitInteriorPage.js` | `unitInteriorLocator.js` | `InteractionLogger.js` |
| FGA flow **(by convention)** | `TC23_FGA_flow.spec.js` | `fgaUserManagementPage.js` | `fgaLocator.js` | `data/fgaCreatedUsers.json`, `fixture/fga_cta_texts.json` |
| Multi-Year Budget **(by convention)** | `TC26_MultiYearBudget.spec.js` | `multiYearBudgetPage.js` | `multiYearBudgetLocator.js` | `data/multiYearBudgetPropertyData.json` |
| Images **(by convention)** | `TC27_Images.spec.js` | `imagesPage.js` | `imagesLocator.js` | — |
| CM Fee **(by convention)** | `TC28_CM_Fee.spec.js` | `cmFeePage.js`, `cmFeeDrawPdfPage.js` | `cmFeeLocator.js`, `cmFeeDrawPdfLocator.js` | `pdfTextExtractor.js` (likely, per Draw Reporting pattern — verify) |

## 18. Common Mistakes & Anti-Patterns to Avoid

- **Don't assume every `pages/*.js` file is live.** `capexColumnPersistencePage.js` and `capexSidebarPage.js` are imported by spec files but never instantiated — grep for `new ClassName(` before treating a page object as exercised, wired-up automation.
- **Don't trust a page object's internal comments to reflect the current test-ID scheme** — `capexColumnPersistencePage.js` references stale TC IDs (`TC206`, `TC287`, `TC291`, `TC301 S4`) from before a renumbering; verify behavior against the live app/spec, not against a comment.
- **Don't assume a method has only one definition.** `pages/capexPage.js` defines `toggleColumn()`, `getTopRowPencilCount()`, `getTabPageInfo()`, and `_resetPinnedPropertyPaneScroll()` twice each — the second wins silently, and the two `getTabPageInfo()` copies actually behave differently. Grep the target file for the method name before adding to or editing it.
- **Don't wire in `utils/assertUi.js`** as a side effect of an unrelated ticket just because it looks like the "proper" assertion helper — it's dead code today; the real convention is inline `expect(x, 'FAIL: ...')` (§7).
- **Don't remove or shrink a `forceGridFullWidth()`/wait/retry call to "clean up" a page object** — nearly every one of these has a documented, MCP-verified reason tied to a specific virtualization/timing bug (§11, §13). If it looks redundant, it probably isn't.
- **Don't build a brand-new modal/dropdown/tab helper** before checking §10 — the exact-then-partial-then-fallback dropdown pattern and the scoped-dialog-locator modal pattern already cover most cases.
- **Don't assume `workers: 1` + `fullyParallel: true` means specs are safely isolated from each other** — several features intentionally rely on state left behind by an earlier spec file (§8, §16); check for a `data/*.json` dependency before assuming a test can run standalone.
- **Don't confuse the three "snapshot" mechanisms** (§14) — adding a `toHaveScreenshot()` call when the ticket actually wants a structural/copy-drift check (or vice versa) will produce the wrong kind of test.
- **Don't pick a new `TCnnn` test-ID number by looking only at filenames** — the in-title numbering is a separate, already-high sequence (past 300); grep `tests/*.spec.js` for `'TC\d+'` first.
- **Don't assume the configured 1920×1080 viewport is what tests actually run at, and don't present an unverified UI/layout claim with the same confidence as an MCP-confirmed one** — see §20 (Viewport/Layout Verification) and §21 (MCP/Browser Verification Discipline).

## 19. Rules for Modifying Existing Automation

- Read the entire file you're about to edit, not just the method in question — several page objects share module-scoped state (`budgetPage.js`'s `let budget;`) or have duplicate method definitions (§18) that change behavior depending on where in the file you add code.
- Preserve the existing locator-export style and page-object shape for that file (§4, §5) — don't convert a CommonJS `exports.X = class` file to an ES-module `export class` file (or vice versa) as part of an unrelated change.
- If a locator needs a new fallback, add it to the existing `xxxStrategies(page)` array consumed by `healingLocator(...)` rather than replacing the original selector outright (§5) — this preserves the "index 0 is the untouched original" convention other code may rely on.
- If you must change a shared utility (`utils/*.js`), check every call site first (the tables in §15/§17 list known ones) — several utilities (`forceGridFullWidth`, `resilientRetry`) are duplicated per-page rather than single-sourced, so a fix in one copy won't propagate to the others; decide explicitly whether the ticket wants you to fix just the one page or all copies, and say so rather than silently doing a wider change.
- Keep new `test()` titles' feature tag consistent with the existing tag for that area (§6) so the file continues to work with `npm run Test:<feature>` grep scripts.
- Don't change `playwright.config.js`, global retries/workers, or CI reporter settings for a feature-level ticket — those are cross-cutting and any change there affects every suite.

## 20. Viewport/Layout Verification

Reference: `pages/addColumnPage.js`'s `_clickWithinViewport(target)`.

- **MCP-verified (2026-09-08) actual test viewport**: the `chromium` project's `use: { ...devices['Desktop Chrome'] }` in `playwright.config.js` carries its own 1280×720 viewport, which wins over the top-level config's 1920×1080 in Playwright's use-merge order — every test actually runs at **1280×720**, not 1920×1080.
- The "Add Column" panel is a fixed-position Mantine `Paper` with no internal scroll region (`overflow-y: visible` on every ancestor up to the fixed container). On a page whose header chrome sits taller above the grid than average (e.g. CapEx: breadcrumb + year selector, tab bar + scope filter, 3 KPI cards, then the toolbar the panel anchors to), the panel can be pushed far enough down that its own submit button ends up below the 720px viewport with nothing scrollable to bring it into view — `scrollIntoViewIfNeeded()` then reports "element is outside of the viewport" indefinitely and the click times out, even though the button is visible/enabled/stable.
- **Fix pattern — `_clickWithinViewport(target)`**: checks the target's `boundingBox()` against the current viewport size; if the target extends below it, temporarily grows the viewport height just enough to fit the target, clicks, then restores the original viewport size. It's a no-op whenever the target already fits, so it's safe as the default way to click the Add Column submit button from any calling page, not only CapEx.
- Don't "fix" this instead by hardcoding a taller viewport in `playwright.config.js` (§19 — don't change global config for a feature-level issue) or by adding a blind extra wait — the fix targets this specific fixed-panel/no-scroll-region layout defect, not general flakiness.

## 21. MCP/Browser Verification Discipline

- **Verify against the live app independently — don't just trust code reading.** Several documented behaviors in this playbook (the 1366px CapEx column-drop threshold in §13, the 1280×720 viewport fact in §20, the shared-portfolio mid-test mutation in §13) were confirmed with the Playwright MCP browser tools against the running app, not inferred from source alone — prefer the same before asserting a UI/layout behavior is real.
- **Record what you actually observed, not what you expected to see.** An "MCP-verified" claim should cite a specific observed state (a screenshot, a snapshot, a measured bounding box) at a specific date — see the dated comment in `addColumnPage.js`'s `_clickWithinViewport` for the expected format.
- **Distinguish a transient environment error from a reproducible defect.** A one-off `502`/timeout/connection-reset from the target environment during an MCP session is environment flake, not a bug — don't encode a workaround for it into page-object/test code. Only document an MCP observation as a real defect (like §20's) once it reproduces deliberately (re-navigate and re-check), not because it appeared once.
- **If MCP/browser access is blocked or unavailable, say so explicitly** rather than silently falling back to a code-only guess presented with the same confidence as a verified observation — flag in your response that a claim is unverified/code-inferred, not MCP-confirmed, so the user can weigh it accordingly.

## 22. Recommended Workflow for Implementing a New Ticket

1. Identify the feature area and find its existing test file(s) via §17 (or grep `tests/` for the feature name if not listed there).
2. Read that spec file in full, plus its page object(s) and locator file(s) — understand the existing `beforeEach`, tagging, and data prerequisites (§6, §8, §16).
3. Check whether the new scenario depends on data produced by another spec (§8) — if so, read that producer spec too, and note the run-order dependency.
4. Search `pages/`, `locators/`, and `utils/` (§15, §17) for anything that already does part of what the ticket needs; reuse/extend rather than duplicate (§18 shows what duplication already costs this repo).
5. If the feature touches a RevoGrid-based grid, read §11 and (if CapEx) §13 in full before writing any row/column interaction — don't skip the virtualization handling.
6. Write the new `test()` in the closest existing `TCxx_*.spec.js` (or a new file following the same naming convention if it's a genuinely new feature area), using the next unused `TCnnn` title number (§6) and matching tags.
7. Use `Logger`/`InteractionLogger` and the `expect(x, 'FAIL: ...')` message convention throughout (§7) — no new logging/assertion helper.
8. If new locators are needed, add them to the matching `locators/*.js` file in its existing style (§5); add healing strategies rather than a single brittle selector for anything inside a virtualized grid or a component-library-heavy area (Mantine dropdowns/modals).
9. Match the feature's existing cleanup posture (§9) — most need none; a few need a `data/*.json` write for downstream tests.
10. Validate syntax (§ "Read this first," rule 18) — `node --check` for CommonJS files or `npx playwright test <file> --list` to confirm Playwright can parse and enumerate the test(s).
11. Do not run the full suite, refresh `sessionState.json`, or touch git unless the user explicitly asks.

## 23. Multi-Locator Robustness Requirement for New Locators

This tightens, for NEW automation only, the selector-preference order already described in §5 — it does not ask you to rewrite existing CSS-class-based locators (§18: don't refactor working code as a drive-by).

- **Every new locator added to `locators/*.js` must be a multi-locator**, built via the existing `healingLocator(strategies)` pattern (§5) with at least one primary strategy plus at least one independent fallback strategy — never a single bare selector.
- **Every strategy must be an element-based Playwright locator method** — `page.getByRole(...)`, `page.getByLabel(...)`, `page.getByPlaceholder(...)`, `page.getByText(...)`, `page.getByTestId(...)`. Preference order: `getByRole` > `getByLabel`/`getByPlaceholder` > `getByTestId` > `getByText`.
- Reserve `page.locator(cssSelector)` (class/attribute selectors) only as a last-resort additional fallback strategy — never as the only strategy — for an element that genuinely has no accessible role, label, placeholder, text, or test-id. Never add a new XPath selector (§5 already treats XPath as an explicit last resort).
- Concrete pattern for a brand-new locator, mirroring the existing convention (§5) explicitly:

```js
// locators/xLocator.js
function xElementStrategies(page) {
  return {
    saveButton: [
      { name: 'role', locator: page.getByRole('button', { name: 'Save' }) },
      { name: 'testid', locator: page.getByTestId('save-button') },
      { name: 'text', locator: page.getByText('Save', { exact: true }) },
    ],
  };
}
module.exports = { xElementStrategies };
```

```js
// pages/xPage.js
this.saveButton = healingLocator(xElementStrategies(this.page).saveButton);
```

- This applies to every new locator written for a new feature/ticket, including any locator needed for the full-page static UI elements test case (§24 below).

## 24. Implementing the "Full-Page Static UI Elements" Test Case

The test-case generation skill (`.claude/skills/automation-testcase-generation/SKILL.md` §18) requires exactly one combined test case per relevant page, asserting every static UI element on that page. When automating that test case:

- Add one page-object method (e.g. `verifyStaticUiElements()`, following §4's verb-first naming) that asserts presence/label of every static control identified in the test case's steps. Reuse the page's existing locators wherever they already cover a button/label/dropdown/column header; add new multi-locators (§23) only for elements not yet covered.
- **Assert text/labels ONLY for static, environment-independent content**: button labels, control/tooltip labels, page headers/section titles, dropdown control labels (the control itself, not every option unless the option list is itself fixed/static), tab labels, table/grid **column headers** (the header text — never a cell's data), Export/Filter/manage-columns control labels, and any dialog's title/buttons/labels.
- **Never assert on:**
  - Table/grid row or cell data
  - A specific record's name, amount, date, or status
  - Row counts or any count that depends on how much data currently exists
  - Anything sourced from `data/*.json` (runtime/seeded state, §8) rather than `fixture/*.json` (static expected copy, §14(C))
- Prefer the existing **fixture-JSON "expected copy" pattern** (§14(C): `fixture/tailorbirdUiMessages.json`, `fixture/authKitMessages.json`, `fixture/fga_cta_texts.json`) for the expected label strings this test case checks against — add a new fixture file for the page if one doesn't already exist, rather than hardcoding expected strings inline in the page object.
- If a dialog is among the page's static elements, open it once via its trigger, assert its own static title/buttons/labels, then close it — do not exercise its full submit/cancel workflow here; that belongs to the feature's own functional test case.
- Follow §7's assertion convention (`expect(x, 'FAIL: ...')` with a `Logger.step`/`Logger.success` pair) for every assertion in the new method.

## 25. API Response as Source of Truth — Avoid Hard Waits

This tightens, for NEW automation only, the wait/verification style described in §4 and §10 — §4's note that fixed `page.waitForTimeout(N)` sleeps are "pervasive" and "the house style" describes the repo's *existing* code; it does not override this rule for code you are adding. Do not rewrite an existing passing test to this pattern as a drive-by (§18/§19) — apply it to new actions you write.

**For any action that triggers a backend call** (save, submit, delete, import, export, approve, reassign, add/remove row or column, etc.), the API response is the primary pass/fail signal — not a success toast/toaster alone.

- Capture the response **before or in the same tick as** the triggering click, using `Promise.all` so there's no race between the click firing the request and Playwright starting to listen for it:

```js
const [response] = await Promise.all([
  page.waitForResponse(
    (res) => res.url().includes('/api/invoices') && res.request().method() === 'POST',
    { timeout: 60000 },
  ),
  saveButton.click(),
]);

expect(response.status(), 'FAIL: Save API did not return a successful status').toBeLessThan(300);
```

- Assert the actual status code (or a `< 300` / explicit allow-list like `[200, 201, 204]` check) — a toast can appear optimistically in the UI before (or even if) the backend call actually confirms, so a toast alone is not proof the operation succeeded.
- A success toast/dialog-closed state is still useful as a **secondary UX corroboration** (§10 already asserts this) — keep it, but pair it with the API check above rather than relying on it as the only signal.
- If you don't know the real endpoint path/method, find it via the Playwright MCP browser's network inspection against the live app (§21) — don't guess a URL pattern.

**When you must wait for something to become ready** (a field to populate after a save, a row to appear after a create, a modal to fully render), prefer a **web-first, auto-retrying wait with an explicit timeout** over a blind sleep or a full-page-load wait:

- `await expect(locator).toBeVisible({ timeout: 60000 })` / `.toHaveText(...)` / `.toBeEnabled(...)`, or `await locator.waitFor({ state: 'visible', timeout: 60000 })`.
- These poll and resolve **as soon as the condition becomes true** — if the app responds in 500ms, the test moves on in 500ms; the `timeout` is only the ceiling for a slow/laggy response, not a fixed delay every run pays.
- Do **not** default to `page.waitForTimeout(N)` for a new wait, and do not default to `page.waitForLoadState('networkidle')`/full navigation waits when what you actually need is one specific element or one specific response — wait for the narrowest thing that's actually available.
- This does not forbid `page.waitForTimeout(...)` outright where the existing codebase already relies on it for a documented, MCP-verified reason (§4, §11, §13's `forceGridFullWidth` waits) — don't remove those (§18). It only sets the default for a wait you are adding for a new scenario.
