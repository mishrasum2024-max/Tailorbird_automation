# Automation Test Case Generation Skill

## Purpose

This skill defines how to analyze a product ticket and generate high-quality, practical, ticket-specific QA test cases.

The goal is to:

* Fully understand the complete ticket
* Read and interpret Acceptance Criteria
* Respect the current state/formatting of Acceptance Criteria
* Read ticket comments and requirement clarifications
* Analyze screenshots and images attached to the ticket
* Identify important business workflows
* Cover important functional areas such as tabs, subtabs, search, filters, import, export, AI Chat, dropdowns, historical data, View Details, and a single combined full-page static UI elements assertion
* Generate focused and meaningful test cases
* Prioritize E2E and Positive scenarios
* Include relevant Negative and Edge scenarios
* Avoid duplicate and generic test cases
* Keep the total number of test cases between 20–25 whenever the ticket has sufficient scope
* Never exceed 25 test cases

This skill is ONLY for test-case generation and QA analysis.

It must not be used to create or modify Playwright automation.

---

# 1. Analyze the Entire Ticket First

Before generating test cases, fully understand the ticket.

The agent MUST read and analyze all available information in the ticket, including:

* Ticket ID
* Ticket title
* Ticket description
* Acceptance Criteria
* Ticket comments
* Screenshots
* Images
* Business rules
* Validation rules
* UI changes
* Data changes
* Permissions or role restrictions
* Integrations
* Dependencies
* Existing behavior
* Historical behavior
* Regression impact
* Any additional context provided with the ticket

Do NOT start generating test cases after reading only the ticket description.

The agent must first build a complete understanding of the ticket.

If the ticket contains ambiguous or conflicting information:

* Do not invent behavior.
* Use the latest explicitly supported information.
* Do not generate unsupported scenarios.
* Prefer clearly applicable requirements over assumptions.

---

# 2. Acceptance Criteria Are the Primary Source of Truth

Acceptance Criteria must be carefully analyzed before generating test cases.

The agent MUST inspect the formatting and current state of every Acceptance Criteria item.

## CRITICAL ACCEPTANCE CRITERIA RULE

For this project:

**A non-struck-through Acceptance Criteria item represents a scenario that is NOT currently available for testing and MUST NOT result in a test case.**

Only applicable Acceptance Criteria should be used for test-case generation.

Do NOT generate a test case for an excluded/non-struck-through Acceptance Criteria item simply because:

* It appears in the ticket description
* It sounds like a valid scenario
* It would normally be a good QA test
* Similar functionality exists elsewhere
* The behavior is technically possible
* A screenshot appears to show it
* A comment mentions it without making it currently applicable

## Acceptance Criteria Validation Process

Before generating test cases:

1. Identify every Acceptance Criteria item.
2. Inspect its strikethrough/current state.
3. Determine whether it is applicable.
4. Use only applicable criteria as functional requirements.
5. Exclude non-applicable criteria from test generation.

Before finalizing:

1. Map every generated test case to an applicable requirement or supported ticket context.
2. Verify that no test case was created solely from an excluded/non-struck-through Acceptance Criteria item.
3. Remove any test case that violates this rule.

---

# 3. Read and Understand Ticket Comments

Ticket comments are an important part of the requirement context.

The agent MUST read relevant comments before generating test cases.

Comments may contain:

* Requirement clarifications
* Requirement changes
* Updated business rules
* Removed functionality
* Deferred functionality
* Additional scenarios
* Known limitations
* Developer explanations
* QA clarifications
* Expected behavior
* Data requirements
* Workflow details
* Examples
* Information about scenarios that should no longer be tested

## Comment Rules

If a comment clarifies or updates a requirement, use that information when generating test cases.

If a comment explicitly states that a scenario is:

* Removed
* Deferred
* Unavailable
* Out of scope
* No longer applicable

then DO NOT generate a test case for that scenario.

Comments must not be used to invent unrelated functionality.

If comments conflict with the ticket and the latest intended behavior cannot be determined:

* Do not guess.
* Do not invent behavior.
* Avoid unsupported test cases.

---

# 4. Analyze Screenshots and Images

Screenshots and images attached to the ticket are part of the available requirement context.

The agent MUST inspect screenshots/images whenever they are available.

Screenshots may provide information about:

* UI states
* Field names
* Labels
* Buttons
* Dropdowns
* Tabs
* Subtabs
* Tables
* Grid data
* Filters
* Search
* Statuses
* Modals
* Validation messages
* Data relationships
* Calculated values
* Workflow states
* Before/after behavior
* Expected information displayed to the user

Use screenshots to understand the intended functional behavior.

## Screenshot Rules

Do not create a test case merely because something appears visually in a screenshot.

Instead, use screenshots to identify meaningful functional scenarios.

For example, if a screenshot shows:

* Data reflected in a tab
* A selected dropdown value
* A calculated value
* A status change
* A validation message
* A new field
* A View Details screen
* Search/filter results
* AI Chat response

then create relevant functional coverage when supported by the ticket.

Do NOT create separate Visual test cases just because screenshots exist.

---

# 5. Build a Coverage Model

Before writing individual test cases, mentally divide the ticket into meaningful testing areas.

Consider:

## Functional Behavior

* Primary workflow
* Alternate workflows
* E2E workflows
* Create/update/delete behavior
* Save behavior
* Persistence
* Navigation
* State changes
* Data reflection
* View Details
* Search
* Filter
* Import
* Export

## Business Logic

* Calculations
* Conditional rules
* Dependencies
* Derived values
* Relationships between fields/entities
* State transitions
* Business validations

## Validation

When supported by the ticket:

* Required fields
* Optional fields
* Invalid values
* Boundary values
* Empty values
* Invalid combinations
* Duplicate values
* Format validation
* Minimum/maximum values

Do NOT invent validation rules or limits.

## Error Handling

When relevant:

* Validation errors
* Failed operations
* Error messages
* Prevented actions
* Recovery behavior
* Missing dependencies

## Permissions

When relevant:

* Authorized users
* Unauthorized users
* Role-specific behavior
* Visibility restrictions
* Action restrictions

---

# 6. Test Case Categories

Only TWO categories are allowed.

Every generated test case MUST belong to exactly ONE of these categories:

1. `E2E + Positive`
2. `Negative + Edge`

Do NOT use:

* UI
* Visual
* E2E
* Positive
* Negative
* Edge

as separate type values.

## E2E + Positive

Use this category for:

* Complete realistic business workflows
* Successful user journeys
* Valid inputs
* Successful operations
* Data creation
* Data updates
* Data persistence
* Data reflection
* Successful navigation
* Successful Import
* Successful Export
* Successful Search
* Successful Filter
* Successful AI Chat interaction
* Tabs/subtabs data validation
* View Details
* Dropdown selection
* Historical data verification

Target:

**10–15 cases whenever ticket scope allows.**

## Negative + Edge

Use this category for:

* Invalid inputs
* Validation failures
* Rejected operations
* Missing required information
* Boundary values
* Empty states
* Zero values
* Maximum/minimum values when supported
* Invalid combinations
* Unusual but valid conditions
* Dependency failures
* Incorrect state transitions
* Important failure/recovery scenarios

Target:

**10–15 cases depending on ticket scope.**

Both categories should carry roughly comparable weight — this is a deliberate change from a "mostly positive" suite to a suite with strong negative/edge coverage as well.

---

# 7. Test Case Quantity

Generate:

**20–25 test cases maximum.**

Never generate more than 25.

For a sufficiently complex ticket, aim for approximately:

* 10–15 `E2E + Positive`
* 10–15 `Negative + Edge`

For a smaller ticket, fewer cases are acceptable — but still aim to keep both categories represented rather than skewing heavily toward one.

Do NOT create unnecessary cases merely to reach 25.

Do NOT exceed 25.

When there are more than 25 possible scenarios:

1. Remove duplicates.
2. Remove low-value variations.
3. Combine closely related validations into meaningful E2E workflows.
4. Remove generic cases.
5. Preserve applicable Acceptance Criteria coverage.
6. Preserve mandatory functional coverage.
7. Preserve important business workflows.
8. Preserve meaningful Negative and Edge cases.

---

# 8. Mandatory Functional Coverage

The following functionality MUST be considered whenever it exists or is affected by the ticket.

These are mandatory coverage areas and must not be ignored simply because they appear simple.

---

## 8.1 Import

If Import functionality exists or is affected:

Create a **separate dedicated Import scenario**.

Verify the relevant workflow, including where applicable:

* Open Import functionality
* Select/upload supported file
* Start/process import
* Verify successful import
* Verify imported data is reflected correctly
* Verify relevant validation/error behavior

Do NOT combine Import with Export or unrelated functionality.

---

## 8.2 Export

If Export functionality exists or is affected:

Create a **separate dedicated Export scenario**.

Verify where applicable:

* Export action is available
* Export can be initiated
* Export completes successfully
* Expected data is included
* Exported data matches the relevant current/selected data
* Exported information is accurate

Do NOT combine Export with Import or unrelated functionality.

---

## 8.3 Import and Export Must Be Separate

If both Import and Export exist:

Generate separate scenarios:

* Import functionality
* Export functionality

Never create only:

`Verify Import and Export functionality`

If an Import → Export end-to-end business flow exists and provides additional meaningful coverage, it may be added as another E2E scenario if the 25-case limit allows.

---

# 9. Search

If Search functionality exists or is affected:

Create a **separate Search scenario**.

Verify where applicable:

* Search using a valid value
* Matching records are displayed
* Search results match the entered criteria
* Non-matching search produces the expected result/empty state
* Clearing search restores expected data

Search must not be hidden inside an unrelated scenario.

---

# 10. Filter

If Filter functionality exists or is affected:

Create a **separate Filter scenario**.

Verify where applicable:

* Filter options are available
* Filter can be selected
* Displayed records match the selected filter
* Filtered data is correct
* Clearing/resetting the filter restores expected data

Search and Filter should normally be separate test cases.

Do NOT combine Search and Filter just to reduce the number of test cases.

---

# 11. AI Chat / AI Assistant

If AI Chat or AI Assistant functionality exists or is affected:

Create a **separate AI Chat scenario**.

Verify the complete relevant interaction:

1. Open/access AI Chat.
2. Enter a meaningful supported request/question.
3. Submit the request.
4. Wait for the response.
5. Verify the AI response is displayed.
6. Verify the response is associated with the user's request.
7. Verify the expected information/display state is shown.

If the ticket specifies particular AI behavior, validate that behavior specifically.

Do NOT create a generic:

`Verify AI works`

test case.

---

# 12. Tabs

When the ticket contains multiple tabs, every relevant tab MUST be considered for data coverage.

For each relevant tab:

* Navigate to the tab.
* Verify expected data is available.
* Verify expected data is reflected correctly.
* Verify displayed data belongs to the correct tab.
* Verify expected state/content is present.

Do NOT assume that validating one tab covers all other tabs.

### Example

If the ticket contains:

* Overview
* Details
* History
* Financials

the test coverage must explicitly account for data in each relevant tab.

The validations may be combined into one meaningful E2E test case when appropriate.

However, the Expected Result MUST explicitly verify the data/state of every relevant tab.

---

# 13. Subtabs

When tabs contain subtabs, subtabs MUST also be considered.

For every relevant subtab:

* Open the subtab.
* Verify expected data is available.
* Verify expected data is reflected.
* Verify correct content/state is displayed.
* Verify data belongs to the correct subtab.

Do NOT assume that testing the parent tab automatically covers all subtabs.

If multiple subtabs can be efficiently validated in one E2E workflow, they may be combined into that workflow.

The Expected Result must explicitly mention the relevant subtabs and their expected data.

---

# 14. Tab and Subtab Data Must Be Asserted

Whenever tabs/subtabs are relevant, the test case must not merely navigate through them.

It must ASSERT the expected data/state.

Bad:

`Navigate through all tabs.`

Good:

`Navigate through Overview, Details, History, and Financials tabs and verify each tab displays the expected ticket-related data.`

Expected result:

`Each tab displays its expected data, and no tab shows an empty or unrelated state when the ticket context indicates data should be available.`

Do not assume that navigation alone proves functionality.

---

# 15. Dropdowns

If dropdowns exist or are relevant:

Verify where applicable:

* Dropdown is available
* Expected options are displayed
* Correct option can be selected
* Selected value is reflected
* Dependent data updates correctly
* Selected value persists after save/reopen when applicable

Do NOT create one test case for every dropdown option unless the options represent materially different business behavior.

---

# 16. Historical Data

If the ticket involves existing records, historical records, previous records, migrated data, or changes to an existing workflow:

Create coverage for historical data.

Verify where applicable:

* Historical records remain available
* Historical data is displayed correctly
* Historical values remain accurate
* New functionality does not incorrectly modify historical records
* Historical records can still be viewed
* Existing data remains compatible with the new functionality

Do NOT test only newly created records when historical data is relevant.

---

# 17. View Details

If View Details / Details / View functionality exists or is affected:

Create a **separate View Details scenario**.

Verify:

* View Details action is available
* Correct record can be opened
* Correct details are displayed
* Displayed details correspond to the selected record
* Relevant fields/data are present
* Information is accurate
* Navigation back works where applicable

Do NOT combine View Details with unrelated CRUD functionality when it represents a distinct workflow.

---

# 18. Full-Page Static UI Elements Assertion

If the ticket's page(s)/screen(s) render static UI controls — buttons, other controls, links, labels, dropdowns, table/grid column headers, Export, Filter, column visibility/manage-columns, view switchers, tabs, or a dialog/modal opened from the page — create exactly **ONE dedicated test case per relevant page** that asserts every one of those static elements is present and correctly labeled.

Cover, wherever applicable to the page:

* All primary and secondary action buttons/CTAs
* Other page-level interactive controls (toggles, icon buttons, view switchers)
* Links
* Static labels/headings/section titles
* Dropdown/select controls (that the control exists and shows its expected options — not every possible selection's downstream effect)
* Table/grid column headers (the header text itself, never a row's data)
* Export control
* Filter control
* Column visibility / manage-columns control
* Tabs
* Any dialog/modal that opens from the page (its title and its own static buttons/labels/fields — opened once to confirm it renders correctly, not exercised end-to-end)

This is a single **E2E + Positive** test case per page — NOT a separate test case per element.

## Rules

* Only ONE such test case per page/screen the ticket touches — combine every static element for that page into it.
* This test case verifies **presence and correct label/copy** of static UI, not functional behavior. Functional behavior (Save actually saves, Export actually exports, Filter actually filters) is already covered by the dedicated Import/Export/Search/Filter/etc. scenarios (Sections 8–17) — do not duplicate that coverage here.
* Only assert elements that are **always present regardless of data state** — static chrome such as buttons, labels, headers, dropdown/tab controls, and column headers. Do NOT assert:
  * Table/grid row or cell data
  * Record-specific values (a specific job name, amount, date, status)
  * Counts that depend on how much data currently exists
  * Anything that could differ between environments/runs
* Only include controls that actually exist on that page per the ticket/screenshots — do not invent controls.
* This test case still counts toward the 20–25 total and the `E2E + Positive` category target (Sections 6–7); it does not get a separate budget.

## Title convention

`TCxxx Verify all static UI elements (buttons, controls, links, labels, dropdowns, column headers, and dialogs) are present and correctly labeled on the <page/feature> page`

## Example

Bad (split into many small cases):

* `TC010 Verify Save button is visible`
* `TC011 Verify Export button is visible`
* `TC012 Verify Filter dropdown is visible`

Good (single combined case):

`TC010 Verify all static UI elements (buttons, controls, links, labels, dropdowns, column headers, and dialogs) are present and correctly labeled on the Bids page`

Expected Result:

`Every static button, control, link, label, dropdown, table column header, Export control, Filter control, view control, and dialog on the Bids page is present with the correct label/copy; no static control is missing, mislabeled, or broken.`

---

# 19. Mandatory Functional Discovery Checklist

Before generating cases, check whether the ticket contains or affects:

* Import
* Export
* Search
* Filter
* AI Chat / AI Assistant
* Multiple tabs
* Multiple subtabs
* Dropdowns
* Historical data
* View Details
* Create
* Edit
* Delete
* Save
* Navigation
* Data persistence
* Business calculations
* Status/state changes
* Full-page static UI elements (buttons, controls, links, labels, dropdowns, column headers, dialogs) — Section 18

For every functionality that is actually present and relevant:

**Ensure the final test suite contains meaningful coverage.**

---

# 20. Do Not Treat Mandatory Coverage as UI Testing

The following are functional scenarios, NOT UI/Visual test cases:

Correct:

`TC005 Verify exported project data contains the expected records`

Incorrect:

`TC005 Verify Export button is visible`

Correct:

`TC006 Verify search returns records matching the entered project name`

Incorrect:

`TC006 Verify Search field is visible`

Correct:

`TC007 Verify each project tab displays its expected data`

Incorrect:

`TC007 Verify tabs are displayed correctly`

Correct:

`TC008 Verify View Details displays information for the selected record`

Incorrect:

`TC008 Verify View Details button is visible`

The focus must be on functional behavior, data, and observable outcomes.

---

# 21. E2E and Positive Case Priority

E2E + Positive and Negative + Edge should carry roughly comparable weight in the final suite (see Section 6/7 targets).

When deciding which scenarios to keep, prioritize:

1. Complete business workflows
2. Applicable Acceptance Criteria
3. Successful user journeys
4. Data creation/update/persistence
5. Mandatory functional areas
6. Important state changes
7. Negative scenarios
8. Edge scenarios
9. Lower-value variations

The final suite should feel like a practical regression/automation candidate list rather than a large checklist of tiny UI validations.

---

# 22. Avoid Category Duplication

Do not create multiple test cases for the same behavior merely because the cases could have different categories.

For example, do not create:

* Verify vendor assignment succeeds
* Verify successful vendor assignment
* Verify vendor can be assigned
* Verify vendor assignment works

These are duplicates.

Instead, vary the actual:

* Workflow
* Condition
* State
* Input
* Business rule
* Expected outcome
* Data
* Boundary
* Dependency

---

# 23. Test Case Quality

Every test case must be:

* Specific to the ticket
* Meaningful
* Independently understandable
* Actionable
* Observable
* Suitable for future automation evaluation
* Based on actual ticket context

Avoid generic cases such as:

* Verify functionality
* Verify page loads
* Verify button works
* Verify data is displayed

unless the ticket specifically changes that behavior.

---

# 24. Test Case Titles

Titles must be:

* Human-written
* Clear
* Specific
* Concise
* Descriptive
* Easy to understand

Preferred format:

`TCxxx Verify <specific behavior>`

Examples:

`TC001 Verify user can import valid project data successfully`

`TC002 Verify exported project data contains the expected records`

`TC003 Verify search returns records matching the entered project name`

`TC004 Verify each project tab displays its expected data`

`TC005 Verify View Details displays information for the selected record`

Avoid vague titles such as:

`TC001 Verify functionality`

---

# 25. Preconditions

Describe the state required before the test starts.

Examples:

* User is logged in
* User has access to the required project
* Required project exists
* Required configuration exists
* Required test data exists
* User is on the required page

Do NOT put test actions into preconditions.

Use an empty list when no specific precondition exists.

Write preconditions the automation can actually reach: name the role (owner /
vendor / approver) and the records in the state the case needs, following the
real chains in `.claude/skills/tailorbird-site-flows/SKILL.md` (for example, an
invoice on a new property needs property → budget → project → job → finalized
contract; it is Approved immediately unless an Invoice approval template exists).

---

# 26. Test Steps

Steps must be:

* Specific
* Actionable
* Ordered
* Clear
* Easy to execute

Good:

1. Open the required project.
2. Navigate to the required tab.
3. Select the required dropdown value.
4. Save the changes.
5. Reopen the project.
6. Verify the selected value and related data.

Bad:

`Test the project functionality.`

Avoid vague or compound steps that hide multiple unrelated actions.

---

# 27. Expected Results

Expected results must describe observable behavior.

They should explain what should:

* Appear
* Change
* Remain unchanged
* Be saved
* Be rejected
* Be displayed
* Be prevented
* Persist
* Navigate
* Be reflected in related tabs/subtabs

Bad:

`The feature works successfully.`

Good:

`The selected value is saved successfully and remains reflected after reopening the record.`

Expected results must be specific enough for a tester to determine whether the test passed or failed.

---

# 28. Boundary and Edge Analysis

For each applicable ticket, consider:

* Minimum valid value
* Maximum valid value
* Zero
* Empty value
* Missing required data
* Large input
* Date/time boundaries
* Dependent data unavailable
* Previously selected value changed
* Save
* Refresh
* Navigation
* Reopening
* Existing/historical records

Only create scenarios supported by the ticket or provided context.

Do NOT invent limits or boundaries.

---

# 29. Business Rule Analysis

For every applicable business rule:

1. Identify the valid condition.
2. Identify the expected successful behavior.
3. Identify invalid conditions.
4. Identify relevant boundaries.
5. Identify dependent behavior.
6. Verify resulting state/data.
7. Verify persistence where applicable.

For calculations:

* Test valid calculation.
* Test relevant boundary calculation.
* Test invalid combinations when supported.
* Verify resulting value.
* Verify persistence where applicable.

Only apply these checks when relevant to the ticket.

---

# 30. Regression Analysis

Ask:

> What existing behavior could this change accidentally break?

Focus only on directly affected functionality.

For example, if a ticket changes how a field is populated, consider:

* Existing automatic population
* Manual override behavior
* Save behavior
* Edit behavior
* Existing records
* Historical records
* Dependent calculations
* Dependent workflows

Do NOT create unrelated application-wide regression cases.

---

# 31. Do Not Invent Application Behavior

Never assume behavior merely because it is common in other applications.

Do NOT assume:

* A field is required
* A value has a maximum
* A button becomes disabled
* A confirmation dialog appears
* A user is redirected
* Data is automatically saved
* A particular role has access
* A particular error message appears

unless supported by:

1. Applicable Acceptance Criteria
2. Ticket description
3. Ticket comments
4. Screenshots/images
5. Provided project context

When behavior is unclear:

**Do not create an unsupported test case.**

---

# 32. Mandatory Coverage vs Case Limit

The maximum number of test cases is 25.

When mandatory functional areas exist, they must be considered before removing cases.

If there are too many possible cases:

1. Remove duplicates.
2. Combine related validations into meaningful E2E workflows.
3. Remove low-value variations.
4. Remove generic cases.
5. Preserve Acceptance Criteria coverage.
6. Preserve Import coverage.
7. Preserve Export coverage.
8. Preserve Search coverage.
9. Preserve Filter coverage.
10. Preserve AI Chat coverage.
11. Preserve tab/subtab data coverage.
12. Preserve dropdown coverage.
13. Preserve Historical Data coverage.
14. Preserve View Details coverage.
15. Preserve the full-page static UI elements assertion (Section 18).
16. Preserve critical business workflows.
17. Preserve important Negative/Edge scenarios.

Do NOT remove an important functional area merely to make the count smaller.

---

# 33. Final Coverage Audit

Before returning the final test cases, perform an internal Senior QA review.

## Acceptance Criteria

Verify:

* Every applicable Acceptance Criteria item has appropriate coverage.
* Excluded/non-struck-through Acceptance Criteria items are NOT covered.
* No test case was generated from an excluded requirement.

## Comments

Verify:

* Relevant comments were read.
* Clarifications were incorporated.
* Removed/deferred functionality was excluded.

## Screenshots

Verify:

* Available screenshots were inspected.
* Relevant data/state/workflow information was considered.
* Screenshot-derived information was used only when supported.

## Mandatory Functional Coverage

Check:

* Import covered if present
* Export covered if present
* Import and Export are separate
* Search covered separately if present
* Filter covered separately if present
* AI Chat covered separately if present
* Every relevant tab has data coverage
* Every relevant subtab has data coverage
* Dropdowns are validated when relevant
* Historical data is validated when relevant
* View Details is covered when present
* Exactly one combined full-page static UI elements assertion exists per relevant page (Section 18), and it does not assert table/row/record-specific data

## Category

Every test case must use exactly one of:

* `E2E + Positive`
* `Negative + Edge`

No UI or Visual categories.

## Quantity

Verify:

* Minimum target is approximately 20 for sufficiently complex tickets.
* Maximum is 25.
* Never exceed 25.
* `E2E + Positive` is roughly 10–15 cases.
* `Negative + Edge` is roughly 10–15 cases.
* Neither category is left thin relative to the other.

## Quality

Verify:

* No duplicate scenarios
* No generic scenarios
* No unsupported assumptions
* Clear titles
* Actionable steps
* Specific expected results
* Correct priority
* Sequential unique IDs
* Every test has at least one actionable step

---

# 34. Automation Suitability

Test cases must contain enough information for a future automation engineer to understand:

* Starting state
* Required data
* User actions
* Expected outcome

However, this skill must NOT prescribe implementation details.

Do NOT specify:

* CSS selectors
* XPath
* Playwright locators
* Page object names
* JavaScript code
* Playwright APIs
* Fixture implementation

Those decisions belong to the Playwright automation skill.

---

# 35. Output Structure

When generating test cases, use exactly this JSON structure:

```json
{
  "ticketId": "...",
  "ticketTitle": "...",
  "testCases": [
    {
      "id": "TC001",
      "title": "TC001 Verify specific behavior",
      "type": "E2E + Positive",
      "priority": "P1",
      "preconditions": [],
      "steps": [
        "Step 1",
        "Step 2"
      ],
      "expectedResult": "Specific observable expected result."
    }
  ]
}
```

Every test case MUST contain:

* id
* title
* type
* priority
* preconditions
* steps
* expectedResult

Every test case must contain at least one actionable step.

Every test case must have a unique ID.

IDs must be sequential.

Allowed type values:

* `E2E + Positive`
* `Negative + Edge`

Allowed priority values:

* P0
* P1
* P2
* P3

---

# 36. Final Generation Workflow

The agent MUST follow this sequence:

```text
Ticket
  ↓
Read entire description
  ↓
Analyze Acceptance Criteria
  ↓
Check Acceptance Criteria formatting/strikethrough
  ↓
Exclude non-applicable criteria
  ↓
Read all relevant comments
  ↓
Inspect screenshots/images
  ↓
Understand business rules
  ↓
Identify affected workflows
  ↓
Identify mandatory functional areas
  ↓
Build coverage model
  ↓
Generate E2E + Positive cases (~10-15)
  ↓
Generate Negative + Edge cases (~10-15)
  ↓
Ensure Import/Export/Search/Filter/AI Chat coverage when applicable
  ↓
Ensure tab/subtab data coverage
  ↓
Ensure dropdown/Historical/View Details coverage when applicable
  ↓
Add one combined full-page static UI elements assertion case per relevant page
  ↓
Remove duplicates
  ↓
Remove unsupported assumptions
  ↓
Limit to maximum 25 cases
  ↓
Run final coverage audit
  ↓
Generate JSON
```

---

# 37. Strict Scope

This skill is ONLY for QA test-case generation.

DO NOT:

* Create Playwright tests
* Create `.spec.js` files
* Modify files inside `tests/`
* Create page objects
* Create locators
* Modify fixtures
* Write automation code
* Use Playwright
* Use Playwright MCP
* Open or interact with the application
* Create branches
* Create commits
* Create pull requests

The Playwright implementation phase must use:

`.claude/skills/tailorbird-playwright/SKILL.md`

The two skills have separate responsibilities:

```text
Ticket / Requirements
        ↓
automation-testcase-generation
        ↓
QA Test Cases
        ↓
Selected Test Cases
        ↓
tailorbird-playwright
        ↓
Playwright Automation
```

Do not mix the responsibilities of the two skills.
