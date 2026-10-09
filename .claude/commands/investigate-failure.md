# Investigate Playwright Failure

You are starting a failure investigation for this Playwright automation repository.

Follow the instructions in:

ai-agent/prompts/investigate.md

## Your task

Investigate the latest failed Playwright test.

Do NOT modify any source code.

Do NOT create a branch.

Do NOT create a Pull Request.

Do NOT attempt self-healing yet.

This execution is investigation-only.

---

## Step 1 — Find the latest investigation

Inspect:

ai-agent/investigations/

Find the most recent investigation containing:

- failure.json
- context.md

Do not assume a test name.

Read the actual files.

---

## Step 2 — Read the investigation rules

Read:

ai-agent/prompts/investigate.md

You must follow those rules exactly.

---

## Step 3 — Analyze the evidence

Read the selected:

failure.json

and:

context.md

Identify:

- Test case
- Test file
- Test location
- Failed assertion
- Locator
- Expected behavior
- Actual behavior
- Retry behavior
- Test steps
- stdout/stderr
- Screenshot
- Trace
- Error context

---

## Step 4 — Inspect source code

Open the failed test.

Start around the failing line.

Inspect enough surrounding code to understand:

- the test flow
- the locator
- the preceding actions
- waits
- API waits
- assertions
- dynamic test data
- relevant helpers

Do not modify anything.

---

## Step 5 — Inspect Git history

Inspect:

- current branch
- git status
- current commit
- recent commits
- relevant diff

Determine whether recent changes could be related.

Do not modify anything.

---

# Step 6 — Form hypotheses

Create at least 2 plausible root-cause hypotheses when the evidence allows it.

For each hypothesis provide:

- explanation
- supporting evidence
- contradicting evidence
- what must be verified

Do not select a final root cause yet.

---

# Step 7 — REQUIRED PLAYWRIGHT MCP VERIFICATION

This step is mandatory.

Use the configured Playwright MCP browser.

Do not make a final root-cause decision without browser verification unless MCP itself is unavailable.

Use the real application.

Reproduce the relevant user flow from the failed test.

For the failed test:

- navigate to the relevant page
- perform the relevant actions
- inspect the UI
- inspect the failed element
- inspect its role/name
- verify whether the expected element exists
- verify whether it appears after a delay
- verify relevant page/application state
- inspect relevant network/API behavior when useful

The goal is to determine what actually happens in the application.

Do not change the application.

Do not modify the test.

---

# Step 8 — Decide the classification

After MCP verification classify the failure as exactly one of:

PRODUCT_BUG

AUTOMATION_BUG

TIMING_OR_SYNCHRONIZATION

FLAKY_TEST

ENVIRONMENT_FAILURE

UNKNOWN

Provide a confidence percentage.

Do not claim high confidence without direct supporting evidence.

---

# Step 9 — Generate the investigation report

Create:

ai-agent/investigations/<same-investigation-directory>/investigation-report.md

The report must contain:

# Failure Investigation Report

## Test

Test Case:

Test File:

Browser:

Failure Location:

## Classification

Type:

Confidence:

## Initial Hypotheses

1.

2.

3.

## Test Evidence

-

## Source Evidence

-

## Git Evidence

-

## MCP Browser Evidence

-

## MCP Verification

Browser flow:

Actual behavior:

Expected behavior:

Reproduction result:

Verified root cause:

## Root Cause

## Self-Healing Decision

Allowed: YES / NO

Reason:

## Proposed Fix

Only provide a proposed fix if the evidence indicates an automation issue.

Do not apply it.

## Validation Plan

Describe how the proposed fix should eventually be validated.

---

# Final rule

This command is investigation-only.

Even if the failure appears obviously fixable:

DO NOT modify code.

DO NOT create a branch.

DO NOT create a PR.

The next stage will handle self-healing after the root cause has been reviewed.