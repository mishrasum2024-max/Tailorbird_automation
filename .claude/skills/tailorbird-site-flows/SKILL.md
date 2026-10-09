---
name: tailorbird-site-flows
description: Read BEFORE automating or exploring anything in Tailorbird (feature agent, repair, bug agent, MCP exploration). The site's end-to-end flow map — what must exist before any operation (invoice, change order, contract, draw, CM fee, bids, vendor portal, approvals, budgets, users), in which order, by which role, with which existing page-object method, and the automation rules this repository follows.
---

# Tailorbird Site Flows — what must exist before you can do anything

Read this before writing or exploring any test. Most "blocked" cases are a
missing step from these chains, not an impossible feature. Each step names the
existing method that performs it (reuse it — do not re-implement), the role, and
the data file it writes. Full per-step table with file:line evidence:
`flow-prerequisites.csv` (automation folder root). How code is written:
`.claude/skills/tailorbird-playwright/SKILL.md`. When something is still missing:
`.claude/skills/automation-blocker-resolution/SKILL.md`.

Facts here are verified in code unless marked **(unverified — check live)**.

## 1. Roles and sessions

| Role | Session file | MCP browser | Used for |
|---|---|---|---|
| Owner / admin | `sessionState.json` | `playwright` | everything owner-side: properties, budgets, projects, jobs, contracts, invoices, COs, bids, approvals, templates, draws, org, vendors |
| Vendor "sumit corp" (id 237) | `vendorsession.json` | `playwright_vendor` | `/bids-and-contracts`: dashboard, bids (accept/submit), contracts, vendor COs, vendor invoices, profile |
| Approver (2nd owner user) | `OtherSessionState.json` | `playwright_approver` | My/All Approvals, draw/invoice approvals, reassign invoice |
| Single-org user | `OneOrganizationUserSessionState.json` | — | not used by specs today |

Sessions come from `tests/TC01_login.spec.js` (TC01 owner, TC03 approver,
TC04 single-org, TC451 vendor). Tests pick a role with
`test.use({ storageState })` or `browser.newContext({ storageState })`; never log
in inside a feature test. The owner test user is also the default approver on
the seeded properties.

## 2. The master chain (brand-new property → invoice / change order)

```
F02 Property ─► F03 Budget (submitted) ─► F04 Project ─► F05 Job (Financial Type = Contract)
                                                              │
                         (optional) F09 Approval template(s) ─┤
                                                              ▼
                                                   F06 Contract rows + FINALIZE
                                                              │
                                     ┌────────────────────────┴───────────────┐
                                     ▼                                        ▼
                              F07 Change Order                          F08 Invoice
                                     │                                        │
                    template? ─► Pending Approval ─► F10 approve      template? ─► Pending ─► F10
                    none      ─► Approved directly                     none      ─► Approved directly
```

Step by step for "create an invoice and a change order on a brand-new property":

1. **Property** (owner) — `PropertiesHelper.createPropertyRobust()`
   (`pages/properties.js`). Writes `data/propertyData.json` when it is the shared
   chain (TC49). Reload before searching the Properties listing; search needs Enter.
2. **Budget assigned to the property** (owner) — `BudgetJob.navigateToBudget()` →
   `selectPropertyByName()` → `openRevisionEditor()` → `uploadFileInRevision(files/budget_data_for_E2EFlow.csv)`
   → `ensureSubmitEnabledAfterUpload()` → `clickSubmitForApproval()` (`pages/budgetPage.js`).
   Creates the budget items that projects/jobs/contract rows need as **Budget Category**.
   A brand-new property has no Budget template, so the revision applies at once.
3. **Approval template(s)** (owner) — OPTIONAL, decide by what the case tests:
   - want invoices/COs to need approval → create an **Invoice** / **Change Order**
     template first: `ApprovalJob.createTemplateWorkflow(name, type, property, amount, submit)`
     (`pages/approvalPage.js`); one template per type per property
     (`deleteConflictingTemplatesForProperty()` on TEMPLATE_CONFLICT);
   - want them **Approved immediately** → create **no** template.
   Finalizing a contract itself needs NO template (TC81–TC84 create none).
4. **Project** (owner) — `ProjectPage.openCreateProjectModal()` → `fillProjectDetails({ property, budget category … })`
   (`pages/projectPage.js`). Writes `data/projectData.json`. The name is generated
   (`Automa_Test_<yymmdd>_<RAND>`).
5. **Job in that project** (owner) — open the project → Jobs tab →
   `ProjectPage.openCreateJobModal()` → `fillJobForm({ title, jobType: 'Capex' | 'Unit Interior', financialType: 'Contract', vendor: 'Sumit_Corp', selectBudgetCategory: true })`
   → `submitJob()`. Writes `data/lastCreatedJob.json`. Fill the title last.
   Then Contracts tab → Edit → Estimated Total Cost → Save.
6. **Contract rows + Finalize** (owner) — Jobs (left panel) → the job → Contracts tab:
   import `files/contract_data.csv` (TC83) or build the row in the UI with
   `ProjectJob.runTc47NewUiContractFinalize()` (`pages/projectJob.js`, TC224) → set
   **Cost Item, Contract Amount and Budget Category** (Budget Category is REQUIRED;
   without it the Change Order/Invoice tabs stay disabled) → Save Changes →
   **Finalize Contract**. Reset the page zoom to 100% before grid edits (70% zoom
   breaks RevoGrid click mapping). Result: Change Orders + Invoice tabs enabled,
   Retainage % locked (`data/tabsDisabled.json` via TC84).
7. **Change order** (owner) — `InvoicePage.clickAddChangeOrder()` →
   `createCompleteChangeOrder()` → `confirmChangeOrderAndHandleModal()` (`pages/invoicePage.js`).
8. **Invoice** (owner) — `InvoicePage.clickAddInvoice()` → `createCompleteInvoice()`
   (grid amount + budget category) → `confirmInvoiceAndHandleModal()`. Never call
   `saveInvoice()` twice (leaves Draft); Confirm can stay disabled up to 45s.

Reference specs for the whole chain: `tests/TC13_FInalizeBidWithUIFlow.spec.js`
(TC224 property → budget → project → Unit-Interior job → finalize; TC225 Invoice
template + invoice), and the @mandatory chain TC49 → TC71 → TC81 → TC83 → TC84.

## 3. Operation → prerequisites (quick lookup)

| To do this | You first need (in order) | Role |
|---|---|---|
| Budget revision | property | owner |
| Budget approval | property + **Budget** template (`createBudgetApprovalTemplateForTest`) + submitted revision → `approveRevisionOnBehalfByPropertyInAllApprovals` | owner |
| Project | property + budget items | owner |
| Job | project (+ vendor Sumit_Corp, budget category) | owner |
| Finalize contract | job with Financial Type Contract + contract row with Budget Category | owner |
| Owner change order | finalized contract (CO tab enabled) | owner |
| Invoice | finalized contract (Invoice tab enabled) | owner |
| Invoice/CO needing approval | the above + **Invoice / Change Order** template on the property | owner |
| Approve / reject | item submitted under a template → All Approvals (owner, on behalf) or My Approvals (approver) | owner / approver |
| Multi-approver invoice | Invoice template with ≥2 approvers + invoice → approve per approver | owner + approver |
| Retainage | Retainage % set **before** finalize (locked after) + invoice | owner |
| Reassign invoice | Approved invoice + property with ≥2 projects with jobs/scopes | approver |
| Draw | property with approved budget + ≥1 **Approved invoice never in a draw** + no other Pending draw (`ensureNoBlockingPendingDraw`) ; optional Draw template | owner (+ approver) |
| CM Fee invoice | submitted budget with a budget item + CM Fee config (`CMFeePage`) + an approved draw | owner |
| Multi-year budget | property + submitted single-year budget item | owner |
| Bid + AI bid book | property; **bid type must match the line items** (roofing CSV ⇒ `CapEx`, the AI refuses mixed job types) | owner |
| Invite vendor to bid | generated bid-book table + vendor "sumit corp" (`assertSendToVendorsFlowByEmail`) — or `ensureInvitedBidForVendor()` | owner |
| Vendor accepts/submits bid | an Invited bid for sumit corp | vendor |
| Award bid | a Submitted vendor bid → Award dialog creates a NEW project + job (`BidAwardPage.awardRow`); a job links to ONE bid | owner |
| Vendor sees a contract | a contract with vendor sumit corp (seeded: "Automation_Job — Test Property 1_Cottages on Elm"); for a NEW property **(unverified — check live)** | vendor |
| Vendor change order | vendor contract with a line item → New Change Order → Create Draft → Submit (`POST /api/ai-change-order-draft/:id/confirm`) → owner sees it Pending in All Approvals (verified 2026-10-08) | vendor → owner |
| Invite org user / FGA member | owner (org admin); FGA activation via mailinator (`UserActivationPage`) | owner |
| Invite / edit vendor | owner; edit/save ONLY "sumit corp" (others Cancel); dialog data loads after `GET /api/trades` | owner |
| Out of Office | delegate role/user; `ensureOooInactive()` before, `DELETE /api/ooo` after | owner |
| Unit interior status | Unit Interior job with units (seed JOB_ID 3828) | owner |
| Category codes | owner (upload `files/category_data.csv`) | owner |

## 4. Data lifecycle

- **Daily cleanup 06:00–09:00 Asia/Kolkata** deletes test-created properties,
  projects, jobs and invoices. AI runs are blocked in that window
  (`scripts/ai-agent/check-cleanup-window.js`). Create what a test needs inside
  the test / `beforeAll`, so it runs on its own after cleanup.
- **@mandatory chain** (1 worker) regenerates the shared data:
  TC01 → TC49 → TC71 → TC81 → TC83 → TC84 → `sessionState.json`,
  `data/propertyData.json`, `projectData.json`, `lastCreatedJob.json`,
  `tabsDisabled.json`. Read names from these files; never hardcode them.
- **Permanent seeds** (read-only or as existing specs use them): Test Property
  1_Cottages on Elm, Test Property 2_The Westerham, Test Property5_Reassigning_Automation,
  Test Property 6_Draw reporting (+ job 4330), Test_property7_CM_Fee_Automation
  (11063, job 4767), retainage job 4304, Unit Interior job 3828, "Automation job
  for multi approver flow", vendor "sumit corp" (237). Never delete or rename them.
- **Shared, consumable state** (parallel workers in CI): the vendor's Invited
  bids, approval queues, custom columns — never assert totals or fixed counts;
  create your own uniquely named records.

## 5. Automation rules this repository follows

1. **Never change an existing line** of a working test, page object, locator or
   helper. Add new methods/locators/lines next to them (insert-only).
2. **Verify in the live app (MCP) before writing; never assume.** Find the root
   cause before fixing a failure; tell automation defects apart from app or
   environment problems.
3. **Reuse before you write**: existing page objects, methods, helpers,
   `data/*.json`, seeds, specs (`tailorbird-playwright` §15–§17).
4. **Flexible assertions** on data that changes (counts ≥, regex shapes, currency
   parsed) — no hardcoded row counts or IDs.
5. **Wait on real signals**, not fixed sleeps: the API response that loads the
   data (register `waitForResponse` before the click), the input re-enabling,
   the element appearing. `isVisible({ timeout })` does NOT wait — use
   `waitFor`/`expect(...).toBeVisible`.
6. **Reload after creating/changing data** before searching a listing (in-app
   navigation reuses cached data); listing search filters on Enter.
7. **Uploads**: set the file on Uploadcare's `<input type=file>` directly (the
   CI-safe method used by the @mandatory suite); the filechooser path fails in CI.
8. **Grids** (RevoGrid/BirdTable) virtualize rows and columns: read data from the
   CSV export or the API, find row actions by `data-rgrow`, force full width when
   columns are missing.
9. **Locators**: multi-locator `healingLocator()` strategies (role → label →
   test id → text), scoped to the dialog/panel; no new XPath.
10. **Semgrep-clean**: literal regexes only, no `path.join` on function
    arguments, no secrets in code or logs.
11. **Only "sumit corp"** may be edited/saved in the vendor directory; never use
    customer accounts or hosts other than `BASE_URL`.
12. **Keep tests bounded** (well under 10 minutes); retries must be
    deadline-aware and never re-click an action that already succeeded.
13. Validate changes by running the case alone (headed for local review,
    headless for CI parity); no `test.only` in committed code.
14. **Shared configuration is off-limits on permanent seeds.** Create or delete
    approval templates ONLY on properties your test created — never on Test
    Property 1/2/5/6/7 or the mandatory-chain property (other suites depend on
    their templates, e.g. vendor COs reach Pending Approval because of the
    Change Order template on Test Property 1; TC25 uses Property 6's draw flow).
15. **Out of Office is global for a user.** A test that activates OOO must
    deactivate it in `afterEach` (`DELETE /api/ooo`, see TC17); never leave it on.
16. **Reuse test identities before creating new ones.** Use the existing test
    vendors ("sumit corp"), users and roles; create a new vendor org, user or
    role only when the case is about creating one (the daily cleanup does not
    remove them, so they accumulate).

## 6. MCP exploration rules

- Read this map first, then explore in the browser of the role that owns the
  step (§1). Never log in by typing credentials into an MCP browser.
- Walk the chain in order (§2–§3); when a step's data already exists (data/*.json,
  seeds), reuse it instead of creating it again.
- Watch the network: note the API call that finishes each step — it becomes the
  test's wait signal.
- Do not perform irreversible actions you do not need (award, delete, editing
  non-test vendors); cancel dialogs you only inspected.
- Write what you verified (one line each) into the agent report's `found` list
  and the batch notes, so the next run starts from it.
