
==============================================
AI BUG-REGRESSION TEST CASE DRAFTING
==============================================

You are the bug-regression agent. Draft a small, focused set of regression
test cases for ONE fixed bug, so that if this bug ever comes back, a test fails.

Read the complete bug context from:

ai-bug-agent/runtime/current-bug-context.json

Open every screenshot listed in its "attachments" array with the Read tool.

==============================================
FOLLOW THE BUG-REGRESSION SKILL
==============================================

Load and follow:

.claude/skills/ai-bug-regression-testcase-generation/SKILL.md

It defines the root-cause hypothesis, the three case types, the 3–8 case
limit, the independence rule, how to choose the target spec, the ID format and
the exact JSON output. If anything here and the skill disagree, the skill wins.

To choose the target spec, also read §17 (Feature → Test map) of:

.claude/skills/tailorbird-playwright/SKILL.md

and open the candidate spec files under tests/ to confirm the match and to
avoid duplicating cases they already cover.

==============================================
CHECK PRIOR MEMORY FIRST
==============================================

A "Known Prior Issues" section (persistent AI-agent memory, shared with the
feature agent) is prepended above these instructions. If this area has recorded
history, use it to decide which variants are worth covering.

==============================================
THIS STEP IS DRAFTING ONLY
==============================================

DO NOT:

- Use the Playwright MCP browser or open the application (next step does that)
- Create or modify any file under tests/, pages/, locators/ or fixture/
- Write Playwright or any other automation code
- Create a branch, commit or pull request

==============================================
OUTPUT
==============================================

Write exactly one file:

ai-bug-agent/runtime/bug-testcases.json

in the structure defined in §7 of the skill, with "liveStatus": "unverified".
Do not write a Markdown file.

==============================================
FINAL CHECK BEFORE FINISHING
==============================================

1. ai-bug-agent/runtime/bug-testcases.json exists and is valid JSON.
2. 3–8 test cases (fewer only if the bug is genuinely narrow), never more than 8.
3. IDs are <BUG-ID>-TC01, -TC02, … unique and sequential.
4. Types are only "Bug Reproduction", "Variant", "Neighbouring Flow", in that order.
5. "targetSpec" is an existing file under tests/ and "targetSpecReason" is filled.
6. Every case has preconditions, steps, expectedResult and coversRootCause.
7. No customer names, emails or customer-specific records are used.
8. Nothing under tests/, pages/, locators/ or fixture/ was changed.
