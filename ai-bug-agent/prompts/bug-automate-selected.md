
==============================================
AI BUG AGENT: AUTOMATE THE SELECTED REGRESSION CASES
(regression-set mode, ai-bug-automate.yml)
==============================================

Automate EVERY case in the selection below, appended to the existing target
spec. These cases were generated for one bug, checked on the live app, and
selected by a person in Slack.

Read:

- ai-bug-agent/runtime/bug-testcases.json            (ONLY the selected cases + targetSpec + liveStatus)
- ai-bug-agent/runtime/bug-testcase-investigation-notes.json   (what was seen live, per case; may be missing)
- ai-bug-agent/runtime/current-bug-context.json      (the bug report; open its screenshots with Read)

You are pre-authenticated (sessionState.json) through the Playwright MCP
server. Use the MCP browser only to confirm a selector or behavior that the
investigation notes do not settle.

==============================================
FOLLOW THE SKILLS
==============================================

1. .claude/skills/ai-bug-regression-testcase-generation/SKILL.md  (§4 independence, §6 IDs)
2. .claude/skills/ai-bug-replicate-and-automate/SKILL.md          (§2 BASE_URL, §4 how to append, §5 run and repair)
3. .claude/skills/tailorbird-playwright/SKILL.md                  (how tests are written)

The replicate-and-automate skill describes ONE case; here apply its §4 and §5
rules to EACH selected case. Its "one case only" rule (§1, §6) does not apply
to this run. For framework patterns, the playbook wins.

==============================================
YOUR JOB
==============================================

1. For each selected case, append ONE new test to "targetSpec", in the order
   the cases appear in bug-testcases.json, titled
   'TCnnn @regression @<area tag> <CASE-ID> : <case title>'
   - nnn: the next unused number (grep tests/*.spec.js for 'TC\d+', highest + 1,
     then +1 for each further case). Never reuse a number.
   - <CASE-ID>: the case's id, e.g. BUG-1458-TC02. Required: the workflow runs
     the tests with --grep on these IDs.
2. Every test must run ALONE (--grep runs it without the other tests in the
   file). Use the spec's beforeEach, never data created by another test.
3. Add any missing page-object method or locator to the EXISTING page and
   locator files, append-only.
4. Run the selected tests:
   npx playwright test <targetSpec> --grep "<ID1>|<ID2>|..." --workers=1 --reporter=list
5. Fix automation failures (at most 3 runs). If a case fails only because the
   bug is still present (liveStatus "still_reproduces"), leave its assertion
   as is.

==============================================
DO NOT
==============================================

- Open any host other than BASE_URL (ENVIRONMENT section below)
- Edit, reformat or delete ANY existing line in tests/, pages/, locators/ or fixture/
- Create a new spec file
- Automate a case that is not in bug-testcases.json, or skip one that is
- Skip tests, or use .only / .fixme / test.skip
- Create a branch, commit or pull request

==============================================
FINAL REPORT
==============================================

End with:

## Files Modified
- <path>

## Result
One line per case: <CASE-ID>: passed | failed (automation) | failed (bug still present)
