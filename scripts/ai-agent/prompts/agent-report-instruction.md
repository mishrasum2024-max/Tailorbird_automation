
==============================================
PRECONDITIONS FIRST, THEN THE AGENT REPORT (required)
==============================================

## Which instruction wins (when instructions seem to conflict)

1. USER INSTRUCTIONS FOR THIS BATCH (if present) — for the cases they mention.
2. The repository's safety rules — always (never change existing lines, never
   touch permanent seed data/templates/OOO of shared users, only "sumit corp").
3. For a case that looks blocked: the blocker-resolution skill (investigate
   before giving up), within its ~15-turn time-box per blocker.
4. For everything else: "a working PR first" — keep exploration focused.
Running the selected cases with `npx playwright test` is ALWAYS allowed and
expected in this workflow (the playbook's "run only when requested" rule is for
interactive sessions).

## Before anything else: read the site flow map

Before automating or exploring ANY case, read
`.claude/skills/tailorbird-site-flows/SKILL.md` (`cat` it): what must exist
before each operation (e.g. a new property's invoice/change order needs
property → budget → (optional approval template) → project → job → finalized
contract), which role and existing method does each step, the data lifecycle,
and the automation rules this repository follows. Plan every case against it.

## Before writing a test: make its preconditions true

For EACH selected case, before automating it:

1. List what the case needs: the role(s) (owner / vendor / approver) and
   the records in the state it needs. Example: an invoice needs
   property → project → job → contract (with a budget category) FINALIZED.
2. Check what already exists (data/*.json names from TEST DATA, the app via
   the MCP browser of that role).
3. Anything missing: CREATE it with the repo's existing page-object methods
   (for example `ensureInvitedBidForVendor` in utils/ensureVendorBidPool.js
   is the pattern: check, create if missing, continue). If no method exists
   for that step, ADD a new method to the existing page object (never edit
   existing lines), verify it live in the MCP browser, and use it. Prefer
   creating the record inside the test (or its beforeAll) so the test can
   run on its own after the daily cleanup.
4. Only when the application itself cannot provide it (missing feature,
   app bug, role not available, no permission) mark the case blocked,
   with the evidence you saw.

Do not silently drop a case. Every selected case must appear in the report.

## When a case looks blocked: run the blocker-resolution skill first

Before you report ANY case as blocked, not automated, or partially automated,
read and follow `.claude/skills/automation-blocker-resolution/SKILL.md`
(`cat` it). It defines the mandatory resolution order (memory → repository →
existing tests → prerequisites → data → role/session → page objects → live UI
with the role's MCP browser → extend → verify → record), the statuses below,
stable blocker IDs, and when a case may genuinely end blocked. A missing page
object, locator, helper, record or role action is resolvable by default — not a
reason to stop. Resolve a blocker shared by several cases once and reuse it.

## The agent report: write `.ai-run/report.json` at the very end

Your final steps are writing BOTH `.ai-batch/notes.json` (batch notes, if
that instruction is present) AND `.ai-run/report.json` — either order, both
required. Valid JSON, exactly this shape (one entry per selected case):

```json
{
  "cases": [
    {
      "id": "TC006",
      "status": "automated | AUTOMATED_WITH_GAP | REPAIRABLE | RESOLVABLE | ENVIRONMENT_BLOCKED | PRODUCT_BLOCKED | UNKNOWN_BLOCKER | not_attempted",
      "testTitle": "exact title of the test you added or fixed, or empty",
      "roles": ["owner", "vendor"],
      "blockerId": "stable ID like BLK-PAGE-OWNER-CO-APPROVAL, or empty",
      "blockerType": "PAGE_OBJECT | LOCATOR | HELPER | DATA | PREREQUISITE | ROLE_SESSION | CROSS_ROLE | WORKFLOW_CONFIG | ENVIRONMENT | PRODUCT | COVERAGE_GAP, or empty",
      "requiredState": "the state/capability the case needs, or empty",
      "prerequisites": [
        { "need": "finalized contract on a job", "state": "existed | created | missing", "how": "method used, or why it is missing" }
      ],
      "found": ["one-sentence facts you verified live (where a control is, what a status shows)"],
      "lacks": ["what is still missing to finish (same as the skill's 'missing')"],
      "created": ["records or new page-object methods you created (no IDs, emails or secrets)"],
      "resolutionAttempted": ["what you searched / explored / tried for the blocker"],
      "resolution": "how the blocker was resolved, or empty",
      "filesChanged": ["files you added to or changed for this case"],
      "verification": "what the test asserts / how it was verified",
      "reason": "one sentence: why this status",
      "nextStep": "one sentence: what would unblock or finish it, or empty"
    }
  ],
  "resolvedBlockers": [
    {
      "blockerId": "BLK-...",
      "category": "PAGE_OBJECT",
      "feature": "area of the app",
      "originalProblem": "what was missing",
      "resolution": "how it was solved",
      "filesChanged": ["pages/..."],
      "reusableMethods": ["Class.method"],
      "requiredData": "state the solution needs",
      "requiredRole": "owner | vendor | approver",
      "verification": "which test passed with it",
      "sourceTestCases": ["TC017"]
    }
  ],
  "general": {
    "found": ["run-wide facts worth keeping (UI quirks, flow rules)"],
    "lacks": ["run-wide gaps (e.g. 'vendor MCP session redirected to sign-in')"]
  }
}
```

Rules for the report:

- `automated`: a test for the case exists in the spec, you ran it, and it
  verifies the whole expected result. `AUTOMATED_WITH_GAP`: it runs and passes
  but does not assert part of the expected result (say which part in `lacks`).
  `REPAIRABLE` / `RESOLVABLE`: understood and fixable, not finished this run
  (say the exact remaining step in `nextStep`). `ENVIRONMENT_BLOCKED` /
  `PRODUCT_BLOCKED` / `UNKNOWN_BLOCKER`: only after the skill's resolution
  order, with evidence and `resolutionAttempted`. `not_attempted`: you ran out
  of turns or time. (Legacy values `partial` and `blocked` are still accepted.)
- `resolvedBlockers`: ONLY blockers you resolved AND whose source test case
  ran and passed this run. The workflow stores them in the agent's persistent
  memory (memory/fixHistory.json) only if that test really passed.
- Never put record IDs, emails, passwords, cookies or tokens in the report.
- The workflow checks your report against the real test results and the spec
  files, and publishes both to Slack and the PR, so be accurate rather than
  optimistic.
