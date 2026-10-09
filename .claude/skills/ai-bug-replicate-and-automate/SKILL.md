---
name: ai-bug-replicate-and-automate
description: Bug agent (ai-bug-agent/, always single mode). The bug itself is ONE test case - no test cases or record files are generated. In one session, reproduce it live on BASE_URL (whatever host the bug's URL uses) with the MCP browser, then automate it by appending one test to the existing spec for that feature area. No variants or neighbouring cases.
---

# Bug Replicate-and-Automate Skill (single-case mode)

Used by `ai-bug-generate-testcases.yml`, which always runs this single mode.
Login and the @mandatory suite have already run when you start, and the MCP
browser is pre-authenticated. You reproduce the bug (§3) and automate it (§4)
in the SAME Claude session; nothing is sent to Slack for selection, and you
write no test-case or record file. For reading the bug (§1), the root-cause
hypothesis (§2), test independence (§4) and choosing the target spec (§5),
follow `ai-bug-regression-testcase-generation`'s rules.

Automation follows `.claude/skills/tailorbird-playwright/SKILL.md`, the same
as the feature agent.

---

## 1. One bug = one test case

- Write **exactly one** case: `<BUG-ID>-TC01`, `type: "Bug Reproduction"`.
- It follows the bug report's own steps and asserts the **correct (fixed)**
  behavior. Never assert the buggy behavior.
- **No `Variant` and no `Neighbouring Flow` cases.** Do not pad.
- The case inherits the bug's priority (`P0`–`P3`, default `P2`).

## 2. Always test on BASE_URL

The workflow gives you `BASE_URL`, the environment the test session is logged
in to. It is the **only** host you may open.

- Ignore the host of the bug's `appUrl`, `sections.urls` and any link in the
  report (production, customer or feature-env hosts). Keep only the **path and
  query string** and open them on `BASE_URL`.
  Example: `https://app.example.com/multi-year-budget?propertyId=276` becomes
  `${BASE_URL}/multi-year-budget?propertyId=276`.
- IDs in the report (`propertyId=276`, project/job IDs) belong to a customer
  environment and often do not exist on `BASE_URL`. If the page is empty,
  errors or redirects, open the same page without the ID, or with an
  equivalent record from the test environment's own data, in the state the
  bug needs (for example "a property with no Multi-Year Budget").
- Never log in with any account other than the pre-authenticated test session.
  Never use customer names, emails or records.

## 3. Reproduce live (MCP), before writing code

0. Read `.claude/skills/tailorbird-site-flows/SKILL.md`: the records and order
   the bug's screen needs (e.g. an invoice needs a finalized contract) and which
   role/method creates each. If reproducing needs a state that does not exist,
   follow the resolution order of
   `.claude/skills/automation-blocker-resolution/SKILL.md` before reporting
   `not_reproducible` — but keep this skill's statuses and final report (no
   `.ai-run/report.json`).
1. Read the bug context and open every screenshot (bug skill §1).
2. Form a root-cause hypothesis (bug skill §2).
3. Follow the reproduction steps on `BASE_URL` with the Playwright MCP browser.
   If a page redirects to sign-in, the session is not working: stop, change
   nothing and say so in your report.
4. Decide the live status:
   - `fixed`: the correct behavior is observed.
   - `still_reproduces`: the bug is still present. Still automate it: the test
     asserts the correct behavior, so it fails until the bug is fixed.
   - `not_reproducible`: the page or state could not be reached on `BASE_URL`.
     Say why.
   - `unverified`: you could not finish the check.
5. Choose the target spec (bug skill §5). If it already covers this exact
   behavior, say so in your report and name the existing test.
6. Base the test's steps on what you **actually did** on `BASE_URL`
   (including any substitute test data), not on the customer's report.

No files for this step: the workflow derives the case ID, the target spec
(the spec you changed) and the live status from your final report, which must
end with one line `Live status: <fixed|still_reproduces|not_reproducible|unverified>`.

## 4. Automate the one case (same session)

Follow `.claude/skills/tailorbird-playwright/SKILL.md` for everything about
how the test is written: page objects, locators, `Logger`, fixtures and
assertions.

- **Append-only.** Add one new `test(...)` to `targetSpec`, inside the
  existing `test.describe` block that holds that feature's tests, after its
  last test. Do not reorder, reformat, rename or edit any existing line in any
  file.
- Reuse existing page-object methods and locators. If one is missing, **add**
  a new method or locator to the existing page or locator file (append-only
  there too, following the multi-locator rule in playbook §23). No new spec
  files.
- **Title:** `'TCnnn @regression @<area tag> <BUG-ID>-TC01 : <case title>'`.
  - `nnn` is the next unused number: grep `tests/*.spec.js` for `'TC\d+'` and
    take the highest + 1 (playbook §6).
  - `<area tag>` is the spec's existing feature tag (for example
    `@multiYearBudget`, `@capex`).
  - The `<BUG-ID>-TC01` text is required: the workflow runs the test with
    `--grep "<BUG-ID>-TC01"`.
- The test must run **alone** (bug skill §4). It may use the spec's
  `beforeEach`, but never data created by another test in the file.
- Navigate with the framework's existing helpers or relative paths, which
  resolve against `BASE_URL`. Never hardcode a host.
- Assert the fixed (correct) behavior the bug report describes, using the
  elements you verified live with the MCP browser in §3.

## 5. Run and repair

Run only the new test:

```
npx playwright test <targetSpec> --grep "<BUG-ID>-TC01" --workers=1 --reporter=list
```

- If it fails because of the **automation** (wrong locator, timing, missing
  wait), fix it and run again. At most 3 attempts in this session; the
  workflow runs a separate repair step afterwards if needed.
- If it fails because the **bug is still present** (`liveStatus:
  still_reproduces`), do not weaken the assertion to make it pass. Leave it
  failing. The workflow raises a PR only when the test passes, so no PR is
  opened and the bug channel is told the bug still reproduces.
- Do not run the @mandatory suite; the workflow ran it before you started.
- Never skip, `.only`, `.fixme` or comment out the test.

## 6. Never

- Open any host other than `BASE_URL`.
- Write more than one case, or any `Variant` / `Neighbouring Flow` case.
- Edit or delete existing lines in `tests/`, `pages/`, `locators/` or
  `fixture/`, or create a new spec file.
- Create branches, commits or PRs. The workflow does that.
- Use customer data, or assert the buggy behavior.
