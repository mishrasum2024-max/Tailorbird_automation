==============================================
AI BUG AGENT: AUTOMATE THE BUG DIRECTLY (single-case mode)
==============================================

The bug itself is the test case. Do not design test cases, variants or
neighbouring cases. In ONE session: reproduce the bug's steps live with the
Playwright MCP browser, then append ONE Playwright test for it to the existing
spec for that feature area, and run it until it passes.

Read the complete bug context from:

ai-bug-agent/runtime/current-bug-context.json

Open every screenshot listed in its "attachments" array with the Read tool.

The login and @mandatory suites have already run. You are pre-authenticated
(sessionState.json) through the Playwright MCP server's --storage-state
configuration. Do not log in manually unless you are not already
authenticated. This is the framework's TEST account; never try to use a
customer account from the bug report.

==============================================
FOLLOW THE SKILLS
==============================================

1. .claude/skills/ai-bug-replicate-and-automate/SKILL.md (all sections)
2. .claude/skills/tailorbird-playwright/SKILL.md (how tests are written;
   §17 Feature → Test map to find the target spec)
3. .claude/skills/tailorbird-site-flows/SKILL.md (read FIRST: what must exist
   before each operation, in which order, by which role and method)
4. .claude/skills/automation-blocker-resolution/SKILL.md (when the bug's state
   or a capability is missing — before reporting not_reproducible). Use only its
   RESOLUTION ORDER and guardrails; keep THIS prompt's final report format and
   statuses (fixed | still_reproduces | not_reproducible | unverified) and do
   not write .ai-run/report.json.

Before writing code, open the candidate spec and the existing tests, page
objects and locators for that area, and reuse them.

If they disagree about the bug case itself (count, title, append-only,
BASE_URL), the bug skill wins. For framework patterns, the playbook wins.

==============================================
PRIOR MEMORY
==============================================

A "Known Prior Issues" section (shared AI-agent memory) is prepended above
these instructions. Use it if this area has recorded history.

==============================================
YOUR JOB
==============================================

1. Reproduce the bug on BASE_URL with the MCP browser (skill §3) and note what
   you see: the correct behavior (fixed) or the bug (still present).
2. Pick the existing target spec (skill §3.6).
3. Append ONE new test to it, titled
   'TCnnn @regression @<area tag> <BUG-ID>-TC01 : <bug title>' (skill §4).
   Add any missing page-object method or locator to the EXISTING page and
   locator files, append-only.
4. Run it alone:
   npx playwright test <targetSpec> --grep "<BUG-ID>-TC01" --workers=1 --reporter=list
5. Fix automation failures (at most 3 runs). If it fails only because the bug
   is still present, leave the assertion as is.

Do not write any test-case or record file: the workflow derives the case
ID, the target spec (the spec you changed) and the live status (your final
report) itself.

If a page redirects to the sign-in page, the pre-authenticated session is not
working: stop, change nothing, and report it in the Result section.

==============================================
DO NOT
==============================================

- Open any host other than BASE_URL (ENVIRONMENT section below)
- Edit, reformat or delete ANY existing line in tests/, pages/, locators/ or fixture/
- Create a new spec file, or add more than one test
- Skip the test, or use .only / .fixme / test.skip
- Weaken an assertion so a still-present bug passes
- Run the @mandatory suite (already done)
- Create a branch, commit or pull request

==============================================
FINAL REPORT
==============================================

End with:

## Files Modified

- <path>

## Result

passed | failed (automation) | failed (bug still present) — one sentence why

Live status: fixed | still_reproduces | not_reproducible | unverified
