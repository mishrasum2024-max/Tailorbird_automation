---
name: automation-blocker-resolution
description: Feature AI automation agent (ai-approved-ticket.yml). Use whenever a selected test case looks blocked — missing page object, locator, helper, test data, prerequisite state, role/session, or a failing environment — BEFORE reporting it blocked. Investigates memory, repository, existing tests, prerequisites, data, roles and the live UI (role MCP browsers), resolves the gap with the framework's own patterns, verifies it, records the verified solution, and only then classifies a case as genuinely blocked.
---

# Automation Blocker Resolution

## 1. Purpose

Turn "I could not automate this" into a verified decision. A missing capability
(page object, locator, helper, data, prerequisite state, role action) is **not**
the same as an impossible test case. This skill makes you investigate, reuse,
resolve, verify and remember before you classify anything as blocked.

The goal is **correct** automation, not forcing tests to pass. A case the product
genuinely cannot support today must still end as blocked — with evidence.

It complements, never replaces:

- `.claude/skills/tailorbird-playwright/SKILL.md` — HOW code is written (page
  objects, multi-locators §23, waits §25, viewport §20, MCP discipline §21).
  For framework patterns the playbook wins.
- `.claude/skills/automation-testcase-generation/SKILL.md` — how cases are designed.
- The batch context (`.ai-batch/batch-context.md` content in your prompt) — earlier
  batches' code you must not break.

## 2. When to Use

Use it the moment any selected case would otherwise end as "blocked",
"not automated", "skipped", "could not automate" or "needs X", including:

- "no page object / method exists for <screen or action>"
- "no locator for <element>"
- "no record in state X" (no vendor with zero contracts, no rejected CO, no
  contract without an approval flow, …)
- "needs another role" (owner approves what the vendor submitted, approver acts, …)
- "session invalid / redirected to sign-in"
- network or backend errors while exploring or running
- the test runs but cannot assert part of the expected result

Also use it in the **repair step** when a failing case's error suggests a missing
capability rather than a broken locator or wait.

## 3. Core Principle

> Investigate first. Reuse first. Resolve first. Verify first.
> Remember what worked. Only then report blocked.

`blocked` is never a shortcut for "I don't know" or "it would take effort".
If you did not search, explore and attempt, the case is not blocked — it is
unfinished (`not_attempted`).

## 4. Blocker Classification

Every case ends in exactly one status in `.ai-run/report.json`:

| Status | Meaning | Repair step retries it? |
|---|---|---|
| `automated` | Test exists, runs, verifies all expected results | — (passes) |
| `AUTOMATED_WITH_GAP` | Test runs and passes, but part of the expected result is not asserted (§19) | — (passes) |
| `partial` | Test exists but deliberately covers only part (legacy; prefer `AUTOMATED_WITH_GAP`) | — |
| `REPAIRABLE` | Test exists and fails for an automation reason (locator, wait, data) | yes |
| `RESOLVABLE` | Blocker understood and solvable with framework extension/data, but not finished this run (turn budget) — say exactly what is left | yes |
| `ENVIRONMENT_BLOCKED` | App/backend/auth unavailable (§17); retry later, change no code | no |
| `PRODUCT_BLOCKED` | The product does not support it (feature absent, behaviour contradicts the ticket, app bug) — with evidence | no |
| `UNKNOWN_BLOCKER` | Investigated per §5 and still cannot tell what is missing — say what was tried | yes |
| `blocked` | Legacy generic value — do not use for new reports | no |
| `not_attempted` | Ran out of turns before reaching the case | — |

Blocker **types** (`blockerType`): `PAGE_OBJECT`, `LOCATOR`, `HELPER`, `DATA`,
`PREREQUISITE`, `ROLE_SESSION`, `CROSS_ROLE`, `WORKFLOW_CONFIG`, `ENVIRONMENT`,
`PRODUCT`, `COVERAGE_GAP`.

`PAGE_OBJECT`, `LOCATOR`, `HELPER`, `DATA`, `PREREQUISITE`, `CROSS_ROLE` and
`WORKFLOW_CONFIG` are **resolvable by default**: they may only end as
`PRODUCT_BLOCKED` / `UNKNOWN_BLOCKER` after §5 was followed and the attempt is
described in the report.

## 5. Mandatory Resolution Order

Follow in order; stop as soon as the blocker is resolved and verified.

1. Understand the requirement: roles, records, states and the exact assertion.
2. Name the exact missing state or capability (one sentence). Give it a stable
   blocker ID (§23).
3. Search persistent memory (§6).
4. Search previous fix history and batch notes (§6).
5. Search the repository (§7).
6. Search existing tests for the same flow (§8).
7. Search prerequisite flows (§9).
8. Search existing data (§10).
9. Check the correct role/session (§14).
10. Check page objects/helpers (§11–§13).
11. Explore the live UI with the right role's MCP browser (§16).
12. Extend the framework (additively) if required.
13. Create or reuse the prerequisite state if the product supports it.
14. Run the test case alone.
15. Verify the expected result (§24).
16. Record the verified solution (§22).
17. Only then classify as `PRODUCT_BLOCKED` / `ENVIRONMENT_BLOCKED` / `UNKNOWN_BLOCKER`.

**Time-box.** You share a fixed turn budget with every other selected case.
Spend at most ~15 turns on one distinct blocker before deciding. If a blocker is
understood but not finished, report `RESOLVABLE` with the exact remaining step —
never `blocked`.

## 5a. User Instructions (Slack "Instruct & retry")

When the prompt contains **USER INSTRUCTIONS FOR THIS BATCH**, a team member
told you how to handle these cases (via the Slack form and/or replies in the
agent-report thread; earlier batches' instructions appear in the batch context).

- They are the **plan**: follow them exactly for the cases they mention — what to
  create, order, data, role and assertions — before your own resolution order.
- Cases they do not mention: use §5 as usual.
- Still verify every instructed step live in the role's MCP browser. If the app
  does not match, do not fake it — report what you saw and where it diverged.
- Safety rules (§28) always win over instructions.
- Report it: say in each affected case's `resolution` / `resolutionAttempted`
  that user instructions were followed, and record a verified outcome under
  `resolvedBlockers` like any other resolution.

## 6. Persistent Memory Search

The framework has ONE memory system — use it, do not create another:

- `data/memory-digest.md` — already prepended to your prompt ("Known Prior
  Issues"), built by `scripts/ai-agent/build-memory-digest.js` from
  `memory/fixHistory.json`.
- `memory/fixHistory.json` — full history (`utils/playwrightMemory.js#recordFix`),
  keyed by error signature or blocker ID. Search it directly:
  `grep -n "BLK-" memory/fixHistory.json` and grep for the feature name.
- Batch notes: earlier batches' `quirks` / `setup` notes are in your batch
  context; the raw ledger is `ai-batches/<TICKET>.json` on the batch branch.
- `flow-prerequisites.csv` (repo root of the automation folder, when present) —
  one row per required step of 30 framework flows, with the method and
  file:line that performs it.

Memory is a **hint**: the app may have changed. Re-verify before reapplying.
Note: as of 2026-10-08 `memory/` on `main` is empty (no memory commit has ever
landed), so expect little there; the repository and live UI are the reliable
sources.

## 7. Repository Search

Search before writing anything new (use Bash `grep -rn` / `ls`):

```
grep -rn "<screen or action words>" pages/ locators/ utils/ tests/
grep -rn "async <likelyVerb>" pages/          # approve, reject, award, invite, create…
grep -rn "/api/<resource>" pages/ tests/       # API helpers already used
ls pages/ locators/ utils/
```

Name-based search finds most capabilities: approval (`approvalPage.js`,
`multiApproverPage.js`, `simpleApprovalPage.js`), vendor portal
(`vendor*.js`), bids (`bidPage.js`, `bidAwardPage.js`), contracts/jobs
(`projectPage.js`, `projectJob.js`), invoices/COs (`invoicePage.js`),
organization (`organizationHelper.js`, `fgaUserManagementPage.js`,
`userActivationPage.js`), OOO (`oooPage.js`), seeding (`utils/ensureVendorBidPool.js`).

## 8. Existing Test Search

The same flow is often already automated for another feature:

```
grep -rln "<feature words>" tests/
grep -n "test(" tests/<candidate>.spec.js
```

Reuse its page-object calls and setup order (often in `beforeAll`/`beforeEach`).
`.claude/skills/tailorbird-playwright/SKILL.md` §16–§17 map features to specs.

## 9. Prerequisite Search

Look up how the required state is produced — the chain is usually longer than it
looks. The authoritative map is `.claude/skills/tailorbird-site-flows/SKILL.md`
(master chain + operation → prerequisites table); read it first. Examples
verified in code (see `flow-prerequisites.csv` for all 30):

- **Finalized contract**: property → budget (budget items) → project → job
  (Capex, Financial Type `Contract`, vendor `Sumit_Corp`, Budget Category) →
  Contracts tab import `files/contract_data.csv` → edit Cost Item, Contract
  Amount, **Budget Category** (required) → Save → Finalize. No approval template
  is involved. (`tests/TC06_jobs.spec.js` TC81/TC83)
- **Invoice / owner CO**: needs a finalized contract (Invoice / Change Order tabs
  enabled; `data/tabsDisabled.json`).
- **Draw**: approved budget + an Approved invoice never included in a draw + no
  other Pending draw on the property.
- **Vendor bid states**: Invited (owner Send to Vendors) → Accepted/Submitted
  (vendor) → Awarded (owner; creates project + job). `ensureInvitedBidForVendor()`
  produces Invited on demand.
- **AI bid book**: the bid type must match the line items (roofing CSV ⇒ `CapEx`);
  the AI refuses mixed job types.

## 10. Test Data Resolution

Order: **reuse deterministic data → create fresh data → only then blocked.**

1. Reuse the day's chain from `data/*.json` (TEST DATA section of your prompt):
   `propertyData.json`, `projectData.json`, `lastCreatedJob.json`,
   `tabsDisabled.json`. Read names in code; never hardcode them.
2. Reuse permanent seed records only read-only or as documented in existing
   specs (Test Property 1_Cottages on Elm, Test Property 5/6/7, job 4304,
   job 3828, "Automation_Job" contract, vendor "sumit corp" id 237).
3. Otherwise create fresh, timestamped records with existing methods
   (`createPropertyRobust`, `fillProjectDetails`, `fillJobForm`, …), inside the
   test or its `beforeAll`, so the test runs on its own after the daily cleanup.
4. A statement like "no vendor with zero awarded contracts exists" is a
   **question to investigate**, not a blocker: can it be created (new vendor
   org via `inviteVendorComplete`), reached (a contract left unawarded), or
   reused (an existing record in that state)? Only after reasonable attempts
   fail is it a blocker — and then report exactly what is needed.

Never: delete or mutate permanent data to create a state; edit vendors other
than "sumit corp" (others are Cancel-only); invent IDs or names; rely on data
created by another test in the same run unless that is the existing pattern.
Never create or delete approval templates on a property your test did not
create (`deleteConflictingTemplatesForProperty` only on your own property —
seeded properties' templates are what other suites rely on); deactivate any OOO
your test activated (`DELETE /api/ooo` in `afterEach`); reuse existing test
vendors/users and create new orgs/users/roles only when the case is about
creating them (cleanup does not remove them).

## 11. Missing Page Object Resolution

"No page object exists" is never a final reason while the role's session works.

1. Search page objects, methods, locators, tests, helpers and API usage (§7–§8).
2. Explore the screen with the right role's MCP browser (§16).
3. Decide: extend the closest existing page object (preferred) or add a method
   to the existing file for that screen. Do not create a duplicate page object.
4. Add only the missing reusable capability; name it verb-first like its
   neighbours; keep `expect(…, 'FAIL: …')` and `Logger` conventions.
5. Run the affected case alone; verify (§24); record it (§22).

## 12. Missing Locator Resolution

- Verify the element live; build a multi-locator with `healingLocator()`
  (playbook §23: `getByRole` > `getByLabel`/`getByPlaceholder` > `getByTestId`
  > `getByText`; CSS only as an extra fallback; no new XPath).
- Add it to the existing locator file next to related locators.
- Do not edit existing strategies; add a new locator if behaviour must differ.
- Mantine/RevoGrid specifics: scope `listbox`/options with `:visible`; grid row
  actions live in a separate pinned pane — match by `data-rgrow`, not as a child
  of the data row.

## 13. Missing Helper Resolution

- Prefer an existing util (`utils/resilientRetry.js`, `filterResetHelper.js`,
  `leftPanelExpander.js`, `ensureVendorBidPool.js`, `tabsDisabledHelper.js`).
- A new "ensure state" helper follows `ensureInvitedBidForVendor()`: check the
  state, create it only if missing, verify it, return what the test needs.
- Semgrep-clean code: literal regexes only (no `new RegExp(variable)`), no
  `path.join` on function arguments (build paths from constants), no secrets in
  code or logs.

## 14. Role/Session Resolution

Sessions are produced by `tests/TC01_login.spec.js` and checked by
`scripts/ai-agent/check-role-sessions.js` before you start; the result is the
"BROWSERS PER ROLE" table in your prompt.

| Role | Session file | MCP server (tools) |
|---|---|---|
| Owner/admin (TEST_EMAIL) | `sessionState.json` | `playwright` (`mcp__playwright__*`) |
| Vendor "sumit corp" (VENDOR_LOGIN_EMAIL) | `vendorsession.json` | `playwright_vendor` (`mcp__playwright_vendor__*`) |
| Approver (NEW_TEST_EMAIL) | `OtherSessionState.json` | `playwright_approver` (`mcp__playwright_approver__*`) |
| Single-org user | `OneOrganizationUserSessionState.json` | — (tests only) |

- A case needing another role is **not** blocked: use that role's MCP browser
  to explore and `test.use({ storageState })` / `browser.newContext({ storageState })`
  in the test.
- Never type credentials into an MCP browser and never use a customer account.
- A browser that lands on sign-in means that session is broken for this run
  (MCP browsers are fixed at start): report `ENVIRONMENT_BLOCKED` with blocker
  `BLK-SESSION-<ROLE>` for steps that need it, and continue with other roles.
  Tests can still regenerate a session file by running
  `npx playwright test tests/TC01_login.spec.js --grep "TC01 |TC03 |TC451 " --workers=1`.
- A role that does not exist at all (e.g. a vendor with zero contracts, a user
  without a permission) is a `DATA`/`ROLE_SESSION` blocker — see §10.4.

## 15. Cross-Role Resolution

For Owner → Vendor, Vendor → Owner, Owner → Approver, Owner → Vendor → Owner, …:

1. List each step with its role.
2. Explore each step in that role's MCP browser; keep the record identifiers
   (timestamped names) to carry state across roles — never shared mutable globals.
3. In the test, open one context per role from its session file (pattern:
   `utils/ensureVendorBidPool.js`, `tests/TC29_VendorBidAccepting.spec.js`).
4. Verify the final state from the role that owns the assertion.
5. Reload before searching a listing after another role changed data
   (in-app navigation reuses cached data).

## 16. MCP Exploration

- Use the role's own MCP server; navigate on `BASE_URL` only.
- Prefer observing the network: the API call that fires (and its response)
  is the deterministic "done" signal — e.g. the vendor Edit dialog renders
  after `GET /api/trades`, a vendor CO submit is `POST /api/ai-change-order-draft/:id/confirm`.
- Read state from the API where it exists (`page.request.get` with the session's
  cookies) — e.g. `GET /api/bids/:id` returns `bid_type`.
- Do not perform irreversible actions you do not need (awards, deletes, edits of
  non-test vendors). Cancel dialogs you only inspected.
- Write what you verified (one line each) into the report's `found` list.

## 17. Environment Failure Handling

Environment signals — **not** framework problems:

- `Failed to fetch`, HTTP 502 / 503 / 504, `ERR_CONNECTION_*`, app error page
  ("Application error"), API timeouts with no response, auth service
  (authkit) down, OTP/captcha/email services unavailable.

Then:

1. Re-check once (reload / repeat the API call after a short wait).
2. If it persists: classify `ENVIRONMENT_BLOCKED` with blocker
   `BLK-ENV-<AREA>` (e.g. `BLK-ENV-API-UNAVAILABLE`), quote the status/URL.
3. Change **no** code because of it — no new waits, locators or helpers.

Not environment: a missing element, wrong text, a 4xx caused by wrong input,
a redirect to sign-in (that is `BLK-SESSION-*`).

## 18. Product Blocker Handling

`PRODUCT_BLOCKED` only with evidence that the product cannot do it today:

- the screen/action does not exist for any role (checked live),
- behaviour contradicts the ticket (quote what the app does),
- an app error reproducible on the step itself.

Report URL, role, exact observation and the API response if any. Do not weaken
assertions to make it pass; if the case can still verify the parts that work,
use `AUTOMATED_WITH_GAP` instead.

## 19. Automated With Gap

If the test runs and passes but does not assert everything the case expects,
report `AUTOMATED_WITH_GAP` with:

- `verification` — what is asserted,
- `missing` — what is not asserted and why,
- `nextAction` — the capability that would close the gap.

Never report full automation for a partial check.

## 20. Batch Awareness

- Earlier batches' tests and methods are in the working tree: reuse them; do
  not edit their existing lines (add new methods next to them). The only
  exception is re-selected failing cases listed in the batch context.
- Cases listed as "never automated (no test exists)" need a NEW test.
- One blocked case must never stop independent cases: finish the others first
  if a blocker is expensive.

## 21. Shared Blocker Resolution

Before resolving, group the selected cases by blocker ID. Resolve each blocker
**once**, as one reusable capability, and use it in every case that needs it.

Example (FEAT-1170): TC017, TC019 (and TC022's owner check) all need
`BLK-PAGE-OWNER-CO-APPROVAL` → one owner approve/reject method, used by all.

## 22. Memory Persistence

Record only **verified** solutions — a test that uses it ran and passed this
run. Never record guesses, plans or unverified hypotheses.

Add them to `.ai-run/report.json` → `resolvedBlockers` (shape in §26). The
workflow (`scripts/ai-agent/build-agent-report.js`) writes each entry whose
source test case actually passed into the existing memory store via
`utils/playwrightMemory.js#recordFix` (key = blocker ID), and
`scripts/ai-agent/persist-memory.js` persists `memory/` at the end of the run.
Code you added (page objects, helpers, locators) persists through the PR.
Also put one-line reusable facts into `.ai-batch/notes.json` (batch notes).

## 23. Stable Blocker IDs

`BLK-<TYPE>-<SUBJECT>`, uppercase, no dates or random parts, reused across
tickets for the same blocker:

| ID | Meaning |
|---|---|
| `BLK-PAGE-OWNER-CO-APPROVAL` | owner approves/rejects a (vendor-raised) change order |
| `BLK-FLOW-CONTRACT-NO-APPROVAL` | contract whose property has no Change Order approval flow |
| `BLK-FLOW-ESCALATION-CONTACT` | blocked CO submission showing the contract creator's contact |
| `BLK-DATA-OTHER-VENDOR-CONTRACT` | contract awarded to a vendor other than "sumit corp" |
| `BLK-DATA-EMPTY-VENDOR` | vendor login with zero awarded contracts |
| `BLK-SESSION-VENDOR` / `BLK-SESSION-OWNER` / `BLK-SESSION-APPROVER` | role session invalid |
| `BLK-ENV-API-UNAVAILABLE` | backend/API unavailable |

New blockers: follow the same pattern (e.g. `BLK-PAGE-OWNER-APPROVAL-FLOW-CONFIG`).

### Known blockers (FEAT-1170, 2026-10-07/08)

- `BLK-PAGE-OWNER-CO-APPROVAL` — **RESOLVABLE (verified 2026-10-08)**: vendor-raised
  COs appear in the owner's Approvals → All Approvals (Approval Type "Change Order",
  Vendor "sumit corp", Status "Pending Approval", approver = the owner test user).
  Existing approve-on-behalf patterns to extend: `approvalPage.js`
  (`approveRevisionOnBehalfByPropertyInAllApprovals`, budget) and
  `multiApproverPage.js` (`clickApproveOnBehalf`, invoices). Row actions are in the
  grid's pinned Actions pane (`data-rgrow`); the toolbar "View" button is the
  table-view menu, not a row action. Explore the row action to reach Approve/Reject.
- `BLK-FLOW-CONTRACT-NO-APPROVAL`, `BLK-FLOW-ESCALATION-CONTACT` — likely
  resolvable: approval templates are per property and type
  (`createTemplateWorkflow`, `deleteConflictingTemplatesForProperty`); a fresh
  property has none. **Unverified** whether such a contract reaches the vendor
  portal — verify live before relying on it.
- `BLK-DATA-OTHER-VENDOR-CONTRACT` — likely resolvable: an owner job/contract with
  another directory vendor; assert it is absent from the vendor's Contracts.
  **Unverified.**
- `BLK-DATA-EMPTY-VENDOR` — needs a second vendor login. Investigate
  `inviteVendorComplete` + activation; if activation cannot be automated, report
  `UNKNOWN_BLOCKER` with "needs a vendor test account with zero contracts".

## 24. Verification

A resolution is verified only when:

1. the new/changed code passes `node --check`,
2. the case runs alone and passes:
   `npx playwright test <spec> --grep "<TICKET>-<CASE>" --workers=1 --reporter=list`,
3. the assertion checks the case's expected result (not just "page loaded"),
4. earlier batches' tests were not edited (only added to).

## 25. Final BLOCKED Criteria

A case may end `PRODUCT_BLOCKED` / `ENVIRONMENT_BLOCKED` / `UNKNOWN_BLOCKER`
only if ALL are true:

- §5 steps 1–11 were done and are summarised in `resolutionAttempted`,
- the right role's browser was used (or its session is proven broken),
- no existing or creatable data/state satisfies the requirement,
- the reason is one of: product cannot do it (evidence), environment down
  (evidence), or still unknown after investigation (what was tried),
- `nextAction` says exactly what would unblock it.

"No page object existed", "no method", "would need exploration" or "not enough
time" are never valid final reasons (use `RESOLVABLE` / `not_attempted`).

## 26. Required Report

`.ai-run/report.json` (see the AGENT REPORT section of your prompt for the
full shape). Per case, in addition to `id`, `status`, `testTitle`, `roles`:

```json
{
  "blockerId": "BLK-PAGE-OWNER-CO-APPROVAL",
  "blockerType": "PAGE_OBJECT",
  "requiredState": "vendor CO pending owner approval",
  "found": ["verified facts"],
  "missing": ["what is still missing"],
  "created": ["records / methods created"],
  "resolutionAttempted": ["searched pages/approvalPage.js", "explored All Approvals as owner"],
  "resolution": "added approveChangeOrderInAllApprovals() to pages/approvalPage.js",
  "filesChanged": ["pages/approvalPage.js"],
  "verification": "TC017 ran alone and passed",
  "nextAction": ""
}
```

Run-wide, verified solutions only:

```json
"resolvedBlockers": [
  {
    "blockerId": "BLK-PAGE-OWNER-CO-APPROVAL",
    "category": "PAGE_OBJECT",
    "feature": "Change Orders / Approvals",
    "originalProblem": "no owner method to approve a vendor CO",
    "resolution": "how it was solved, one or two sentences",
    "filesChanged": ["pages/approvalPage.js"],
    "reusableMethods": ["ApprovalJob.approveChangeOrderInAllApprovals"],
    "requiredData": "a vendor CO in Pending Approval",
    "requiredRole": "owner",
    "verification": "TC017 passed",
    "sourceTestCases": ["TC017", "TC019"]
  }
]
```

No record IDs, emails, passwords, cookies or tokens anywhere in the report.

## 27. Decision Tree

```
Case looks blocked
├─ Network/5xx/app down/auth service down? ──► re-check once ──► still down ► ENVIRONMENT_BLOCKED
├─ Role browser on sign-in? ─────────────────► ENVIRONMENT_BLOCKED (BLK-SESSION-<ROLE>); continue other roles
├─ Memory / batch notes / CSV have a verified recipe? ─► re-verify ► apply ► run ► verify
├─ Capability missing (page object / locator / helper)?
│     └─ search repo + tests ► explore with role MCP ► extend existing file ► run ► verify ► record
├─ Data / state missing?
│     └─ reuse data/*.json or seed ► else create fresh via existing flows ► run ► verify ► record
├─ Needs another role? ──► use that role's MCP + storageState ► verify from the asserting role
├─ Test passes but cannot assert everything? ──► AUTOMATED_WITH_GAP
├─ Product cannot do it (evidence)? ──► PRODUCT_BLOCKED
├─ Understood, not finished in budget? ──► RESOLVABLE (+ exact remaining step)
└─ Still unclear after all of the above? ──► UNKNOWN_BLOCKER (+ what was tried)
```

## 28. Safety / Guardrails

- Additive changes only: never edit, reorder or delete existing lines in
  `tests/`, `pages/`, `locators/`, `utils/`, `fixture/` except the re-selected
  failing cases' own tests named in the batch context.
- Never change workflows, cleanup, seeding, memory architecture, MCP
  configuration or `playwright.config.js`.
- Never delete or edit permanent data; never save vendors other than "sumit corp";
  never use customer accounts or hosts other than `BASE_URL`.
- Never add/remove approval templates on properties the test did not create;
  always switch off OOO the test switched on; do not create extra vendor orgs,
  users or roles unless the case is about creating them.
- Respect the daily cleanup window (06:00–09:00 Asia/Kolkata): records you create
  may be deleted then — create them in the test, not once by hand.
- No new dependencies, frameworks, auth mechanisms or memory stores.
- Never weaken an assertion, add `test.skip`/`.only`/`.fixme`, or swallow a
  failure to make a case pass.
- Record only verified solutions; never record guesses.
