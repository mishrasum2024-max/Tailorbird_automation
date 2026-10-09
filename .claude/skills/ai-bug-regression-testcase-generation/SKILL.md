---
name: ai-bug-regression-testcase-generation
description: Bug-regression agent only (ai-bug-agent/). How to turn one fixed Notion bug into a small set of focused regression test cases and choose the existing spec file they will be appended to. Not for feature tickets — those use automation-testcase-generation.
---

# Bug-Regression Test Case Generation Skill

Used by the bug-regression agent (`ai-bug-agent/`, workflows `ai-bug-*.yml`).
The feature agent's `automation-testcase-generation` skill is for feature
tickets (20–25 cases covering a whole ticket). **A bug is different:** the goal
is a *small, sharp* set of cases that fails if **this bug** ever comes back.

This skill covers test-case design only. Automation (Phase 3) follows
`.claude/skills/tailorbird-playwright/SKILL.md`.

---

## 1. Read the whole bug first

Input: `ai-bug-agent/runtime/current-bug-context.json`.

- `title`, `status`, `priority`, `tags`, `customers`, `property`
- `sections.description`, `sections.stepsToReproduce`, `sections.urls`,
  `sections.developerNotes`, plus any other heading found on the page
- `appUrl` — the in-app page where the bug happens (often the best starting point)
- `attachments[]` — screenshots downloaded locally. **Open every image with
  the Read tool**; screenshots usually show the broken state more precisely
  than the text.
- `comments[]` (may be empty when comments are unavailable — see `commentsNote`)
- `relatedBugs[]` — e.g. a bug that is a *recurrence* of an earlier one. A
  recurrence means the first fix did not hold: cover the path that regressed.
- `quality.warnings[]` — thin reports (no steps, no URL). Compensate by
  exploring the live app in the investigation step; never invent behavior.

Template placeholders ("[Briefly describe the issue]", "Step1") have already
been removed. Email addresses are redacted on purpose.

## 2. State the root-cause hypothesis

Before writing cases, write one or two sentences in `rootCauseHypothesis`:
*what* was broken, *where* (page / component / action), and *under what
condition* (data state, role, org, property type). Every test case must trace
back to it. Example for "MYB only shows current budget items":

> When a property has no existing Multi-Year Budget, the budget-item picker is
> scoped to that property's items instead of all category items, and "add new
> item" is unavailable.

## 3. Case design — three kinds, in this order

| `type` | Purpose | Count |
|---|---|---|
| `Bug Reproduction` | The exact failing path from the report, asserting the **correct (fixed)** behavior. Always first. | 1–2 |
| `Variant` | Same root cause, different trigger: other data state, role, org, property, boundary values, empty/large data. | 1–4 |
| `Neighbouring Flow` | Closely related behavior the fix could have broken (same component, sibling action, save/reload persistence). | 0–2 |

- **Total 3–8 cases. Never more than 8.** Fewer is fine when the bug is narrow.
  Do not pad.
- Expected results assert the *fixed* behavior, never the bug.
- Be concrete: name the page, control and value. Avoid "verify it works".
- **No customer data.** Never use customer names, emails, or customer-specific
  records from the report. Use the framework's test accounts and test data
  (the existing specs and `data/`/`fixture/` show what exists).

## 4. Every case must run on its own

Phase 3 runs new tests with `--grep <case id>`, i.e. **alone**, even inside a
file whose other tests run in serial mode. So a case may rely on the target
spec's `beforeEach` setup and on pre-existing shared environment data, but
**never** on data created by another test in that file. Put any required state
in `preconditions` explicitly.

## 5. Choose the target spec (append-only)

Regression tests are **appended to an existing spec**, never a new file.

1. Identify the feature area from the bug (title, `appUrl` path, screenshots).
2. Use the Feature → Test map in §17 of
   `.claude/skills/tailorbird-playwright/SKILL.md`, then **open the candidate
   spec(s)** and confirm they exercise that page/flow.
3. Pick exactly one: `targetSpec` (repo-relative, e.g.
   `tests/TC26_MultiYearBudget.spec.js`) and a one-line `targetSpecReason`.
4. Read that spec's existing tests. **Drop any case it already covers** (note
   it in `alreadyCoveredBy` instead of duplicating).

## 6. IDs

- Case IDs: `<BUG-ID>-TC01`, `<BUG-ID>-TC02`, … (e.g. `BUG-1458-TC01`),
  two digits, sequential, unique.
- These IDs will appear inside the appended test titles so the runner can grep
  them. They are separate from the framework's global `TCnnn` title numbers,
  which Phase 3 assigns.

## 7. Output — `ai-bug-agent/runtime/bug-testcases.json`

```json
{
  "bugId": "BUG-1458",
  "bugTitle": "…",
  "rootCauseHypothesis": "…",
  "affectedArea": "Multi-Year Budget › budget item picker",
  "targetSpec": "tests/TC26_MultiYearBudget.spec.js",
  "targetSpecReason": "Existing MYB suite; already navigates to the budget editor in beforeEach.",
  "alreadyCoveredBy": [],
  "liveStatus": "unverified",
  "liveEvidence": "",
  "testCases": [
    {
      "id": "BUG-1458-TC01",
      "title": "…",
      "type": "Bug Reproduction",
      "priority": "P1",
      "preconditions": ["…"],
      "steps": ["…"],
      "expectedResult": "…",
      "coversRootCause": "How this case would catch the bug returning."
    }
  ]
}
```

- `type` ∈ `Bug Reproduction` | `Variant` | `Neighbouring Flow`, ordered in
  that sequence.
- `priority` ∈ `P0`–`P3`; the reproduction case inherits the bug's priority.
- `liveStatus` stays `unverified` in the drafting step; the live
  investigation step sets it (see §8).
- Do not write Markdown — it is rendered from the JSON automatically.

## 8. Live investigation (second step)

With the Playwright MCP browser (pre-authenticated test session):

1. Follow the reproduction case on the live app.
2. Set `liveStatus`:
   - `fixed` — the correct behavior is observed.
   - `still_reproduces` — the bug is still present. **Keep the cases** (they
     describe correct behavior); the automation phase will handle it.
   - `not_reproducible` — the path/state could not be reached (explain why).
   - `unverified` — you could not finish the check.
3. Write a short factual `liveEvidence` (what you saw, where).
4. Verify each remaining case's page/controls exist; replace an unverifiable
   case in place once, else move it to `bug-dropped-testcases.json`.
5. Record observed URLs/elements per case in
   `bug-testcase-investigation-notes.json` for the automation phase.

## 9. Never

- Create or edit anything under `tests/`, `pages/`, `locators/`, `fixture/`.
- Write automation code, create branches, commits or PRs.
- Exceed 8 cases, use customer data, or assert the buggy behavior.
