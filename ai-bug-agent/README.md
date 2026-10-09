# AI Bug-Regression Agent

A second AI agent, separate from the feature agent (`scripts/ai-agent/`).
It reads **fixed bugs** from the Notion bug database, generates focused
regression test cases, and **appends** them to the existing spec for that
feature area. If a bug comes back, a test already guards it.

It reuses the feature agent's skills, framework and memory **read-only /
additively**, and never changes the feature agent's files, variables,
Slack channel or workflows.

## What belongs to this agent

| Location                         | Owner                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ai-bug-agent/**`                | Bug agent (this folder)                                                                                                   |
| `.github/workflows/ai-bug-*.yml` | Bug agent (GitHub only runs workflows from `.github/workflows/`)                                                          |
| `.claude/skills/ai-bug-*/`       | Bug agent (Claude Code only discovers skills in `.claude/skills/`)                                                        |
| Everything else                  | Feature agent / shared framework: never modified by this agent, except the one-line hook in `scripts/slack-http-agent.js` |

## Flow

The bug itself is the test case. No test cases are generated or sent to
Slack for selection.

```
ai-bug-selection.yml          Notion (Status = Validating) ──► #bug channel (approve_bug)
ai-bug-generate-testcases.yml login + @mandatory suite ──► fresh MCP session
  (job replicate-and-automate-bug)
                              ──► Claude (bug skill + framework skill + MCP):
                                  reproduce on BASE_URL, append ONE test to the existing spec
                              ──► run bug test ──► repair (2 attempts)
                              ──► append-only + architecture checks
                              ──► PR ai-bug/BUG-<n>-regression ONLY if the test passes
                              ──► #bug channel (PR link, or why no PR) ──► persist memory
```

### Always single mode

`approve_bug` in Slack starts the flow above; there is no mode choice (the
workflow's `mode` input is ignored). Claude writes no test-case or record
file: `scripts/derive-bug-case.js` derives the case ID (`<BUG-ID>-TC01`), the
target spec (the spec the run changed) and the live status (Claude's final
`Live status:` line).

- PR is `[Verified]` when the mandatory suite also passed, otherwise a draft
  `[NEEDS REVIEW]` (mandatory runs before any change, so a failure there is
  environmental).
- If the bug still reproduces, or the test cannot be made to pass, no PR is
  raised and the bug channel says why.
- If no test was added at all (e.g. the MCP browser was not signed in), the
  bug channel gets Claude's reason and the run is marked failed.
- The MCP browser loads the saved login with `--isolated --storage-state`
  (`@playwright/mcp` ignores `--storage-state` without `--isolated`).

The regression-set scripts and `ai-bug-automate.yml` below are no longer
reachable from Slack or this workflow.

## Configuration

| Variable                                                                    | Where                      | Value                                                                                              |
| --------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `BUG_NOTION_DATA_SOURCE_ID`                                                 | GitHub secret              | `263aef20-7051-8137-a348-000bfe444dd5` (data source id, **not** the database id in the Notion URL) |
| `BUG_SLACK_CHANNEL_ID`                                                      | GitHub secret              | `C0C5AR23MNG`                                                                                      |
| `BUG_TARGET_STATUS`                                                         | ignored                    | statuses are hardcoded: `Complete` or `Release Ready` (bugConfig.js)                               |
| (base URL)                                                                  | hardcoded                  | `beta.tailorbird.com` — bug "URL" with or without `https://`                                       |
| `BUG_TARGET_PRIORITY`                                                       | ignored                    | no priority filter; `/ai-bug-selection P0` priorities are ignored too                              |
| `BUG_MAX_TICKETS`                                                           | GitHub variable (optional) | `10` (default, Slack radio limit)                                                                  |
| `BUG_NOTION_API_KEY`                                                        | GitHub secret (optional)   | only if the bug DB needs its own integration                                                       |
| `NOTION_API_KEY`, `SLACK_BOT_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, test logins | existing secrets           | reused, unchanged                                                                                  |

All bug-agent env reading goes through `scripts/lib/bugConfig.js`. Bug IDs
have no default and never fall back to the feature agent's variables.

## Automation (Phase 3, legacy regression-set — no longer reachable)

`ai-bug-automate.yml` is started by the **Automate Selected Regression Tests**
button. It downloads the generation run's `bug-generated-testcases` (and, if
still valid, its session + mandatory-test cache), appends the ticked cases to
the target spec, runs mandatory + selected tests, repairs up to 3 times, runs
the whole target spec once (informational), enforces append-only, and opens a
PR `ai-bug/BUG-<n>-regression` (draft when anything failed).

Feature workflows `ai-approved-ticket.yml` and `ai-automate-selected-testcases.yml`
refuse `BUG-` ticket IDs with a clear error (job-level guard; `FEAT-` runs are
unchanged), so bug output can no longer be sent to them by mistake.

## Reused shared scripts (unchanged)

`scripts/ai-agent/build-memory-digest.js` and `scripts/ai-agent/persist-memory.js`.
`process-approved-bug.js` writes a compat copy of the bug context to
`data/current-ticket-context.json` (CI runner only) so the digest works as-is.

## Committing

`.claude/` is gitignored at the repo root, so the bug skills must be force-added:
`git add -f .claude/skills/ai-bug-regression-testcase-generation/SKILL.md .claude/skills/ai-bug-replicate-and-automate/SKILL.md`

## Bug IDs

The Notion `id` property has no prefix, so the agent formats IDs as
`BUG-<number>` (the format the team already uses). Test titles carry the
test-case ID (`BUG-1458-TC01 …`) so the existing `--grep` test runner picks
them up.

## Memory

- **Reads** shared `memory/fixHistory.json` / `patterns.json` (feature agent's learning).
- **Writes** shared memory tagged with `BUG-<n>` IDs, plus bug-only
  `ai-bug-agent/memory/bugRegressions.json` (bug → spec → tests → PR).
- `runtime/` holds per-run scratch files and is gitignored.

## Scripts

| Script                                                      | Phase      | Purpose                                                                                                                          |
| ----------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/bugConfig.js`                                  | 0          | The only env reader for this agent                                                                                               |
| `scripts/lib/notionBugMapper.js`                            | 0          | Bug DB property mapping                                                                                                          |
| `scripts/check-bug-source.js`                               | 0          | Read-only check: config, schema, matching bugs                                                                                   |
| `scripts/lib/bugSource.js`                                  | 1          | Notion client + target-bug query                                                                                                 |
| `scripts/lib/bugRegressionsMemory.js`                       | 1          | Reads `memory/bugRegressions.json` to skip covered bugs                                                                          |
| `scripts/get-notion-bugs.js`                                | 1          | Fetch bugs → `runtime/notion-bug-tickets.json`                                                                                   |
| `scripts/send-bug-approval.js`                              | 1          | Post bugs to the bug channel (`selected_bug` / `approve_bug`)                                                                    |
| `scripts/lib/bugPaths.js`                                   | 2          | All runtime file paths (+ the feature-context compat path)                                                                       |
| `scripts/process-approved-bug.js`                           | 2          | Bug page → sections, screenshots, comments, related bugs, quality → `runtime/current-bug-context.json`                           |
| `scripts/verify-bug-testcases.js`                           | 2          | Validates/sorts Claude's JSON against the skill contract, renders the Markdown                                                   |
| `scripts/record-bug-testcase-generation.js`                 | 2          | Records cases in shared memory under `BUG-<n>`                                                                                   |
| `scripts/send-bug-testcase-selection.js`                    | 2          | Live status + target spec + checkboxes (`selected_bugcase_*`, `automate_bug_testcases`)                                          |
| `scripts/notify-bug-status.js`                              | 2          | Failure notice to the bug channel                                                                                                |
| `prompts/bug-generation.md`, `prompts/bug-investigation.md` | 2          | Claude prompts (memory digest is prepended by the workflow)                                                                      |
| `prompts/bug-automate.md`                                   | single     | One Claude prompt: reproduce the bug live via MCP and append its test, in one session                                            |
| `scripts/derive-bug-case.js`                                | single     | Derives case ID / target spec / live status after automation; writes `runtime/bug-testcases.json`                                |
| `scripts/check-append-only.js`                              | single + 3 | Fails if any existing line changed, another spec changed, a new spec was created, or any case ID is missing from the added lines |
| `scripts/record-bug-regression.js`                          | single + 3 | Writes `memory/bugRegressions.json` on the PR branch (records the mode)                                                          |
| `scripts/prepare-bug-automation.js`                         | 3          | Validates the Slack selection, keeps only the ticked cases, exposes spec / IDs / grep pattern                                    |
| `prompts/bug-automate-selected.md`                          | 3          | Claude prompt: append every ticked case to the target spec                                                                       |

Run locally: `node ai-bug-agent/scripts/check-bug-source.js`

## Slack handlers

`slack/registerBugHandlers.js` is loaded by one `require` in
`scripts/slack-http-agent.js` and registers only bug-specific IDs.

| Phase | Command / action                | Dispatches                                                                                     |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1     | `/ai-bug-selection [P0,P1]`     | `ai-bug-selection.yml` (`priorities` overrides `BUG_TARGET_PRIORITY` for that run; P0–P3 only) |
| 1     | `/ai_bug_automation`            | `ai-bug-selection.yml` (same workflow; no arguments, `priorities` sent empty)                  |
| 2     | `selected_bug`                  | — (ack only)                                                                                   |
| 2     | `selected_bug_mode`             | — (ack only; legacy radio on old messages, ignored)                                            |
| 2     | `approve_bug`                   | `ai-bug-generate-testcases.yml` (`bug_id`, `mode=single`)                                      |
| 2     | `selected_bugcase_<run>_<case>` | — (stores selection per user + run)                                                            |
| 3     | `automate_bug_testcases`        | `ai-bug-automate.yml` (`bug_id`, ticked `test_case_ids`, `generation_run_id`)                  |

Handlers are added only once the workflow they dispatch is on `main`
(the listener always dispatches with `ref: main`).
