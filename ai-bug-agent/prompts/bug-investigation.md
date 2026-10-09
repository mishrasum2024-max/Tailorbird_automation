
==============================================
AI BUG-REGRESSION LIVE INVESTIGATION
==============================================

Read the drafted regression test cases from:

ai-bug-agent/runtime/bug-testcases.json

Read the bug context from:

ai-bug-agent/runtime/current-bug-context.json

You are pre-authenticated (sessionState.json) through the Playwright MCP
server's --storage-state configuration. Do not log in manually unless you are
not already authenticated. This is the framework's TEST account — never try to
use a customer account from the bug report.

Follow §8 of:

.claude/skills/ai-bug-regression-testcase-generation/SKILL.md

==============================================
YOUR JOB
==============================================

1. CHECK THE BUG ON THE LIVE APP

   Follow the "Bug Reproduction" case(s) in the live application (start from
   the bug's appUrl path when given, on the environment you are logged in to).
   Then set in bug-testcases.json:

   - "liveStatus": "fixed" | "still_reproduces" | "not_reproducible" | "unverified"
   - "liveEvidence": one to three factual sentences — what you saw, on which page.

   "still_reproduces" is a valid, useful outcome: keep the cases (they describe
   the correct behavior). Do not rewrite cases to match the buggy behavior.

2. VERIFY EACH CASE

   For every case, confirm the page, controls and flow it describes exist.
   Spend at most ~3 MCP browser actions per case; prefer navigation and
   DOM/role inspection over completing full create/save flows. If a case is
   still ambiguous after that, keep it.

   If a case does not check out, replace it IN PLACE (same index, same type,
   same id) with one verified live. One replacement attempt per case; if that
   also fails, remove it and record it in the dropped file below.

3. CONFIRM THE TARGET SPEC

   If what you saw shows the chosen "targetSpec" is the wrong feature area,
   change "targetSpec" and "targetSpecReason" (it must stay an existing file
   under tests/).

==============================================
DO NOT
==============================================

- Create or modify any file under tests/, pages/, locators/ or fixture/
- Write automation code
- Create a branch, commit or pull request
- Save, delete or change real records unless a case genuinely cannot be
  verified any other way

==============================================
OUTPUT FILES
==============================================

1. Overwrite ai-bug-agent/runtime/bug-testcases.json in place with the final
   set (same structure, liveStatus/liveEvidence filled).

2. Write ai-bug-agent/runtime/bug-dropped-testcases.json — a JSON array:

   [ { "id": "BUG-1458-TC04", "title": "...", "reason": "..." } ]

   Write [] if nothing was dropped.

3. Write ai-bug-agent/runtime/bug-testcase-investigation-notes.json — keyed by
   final case id, what you actually observed live, for the automation phase:

   {
     "BUG-1458-TC01": {
       "url": "...",
       "keyElements": ["role=button name=Add budget item", "..."],
       "notes": "..."
     }
   }

==============================================
FINAL CHECK BEFORE FINISHING
==============================================

1. bug-testcases.json is valid, has liveStatus and liveEvidence filled.
2. Case IDs are unchanged for kept cases; no two cases share an ID.
3. No case is in both bug-testcases.json and bug-dropped-testcases.json.
4. bug-testcase-investigation-notes.json covers the final cases.
5. Nothing under tests/, pages/, locators/ or fixture/ was changed.
