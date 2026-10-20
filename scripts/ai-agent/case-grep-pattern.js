const { splitIds, readPlan } = require("./lib/ticketBatch");

/*
 * ============================================================
 * CASE GREP PATTERN
 * ============================================================
 *
 * Prints the `npx playwright test --grep` pattern for a list of
 * test-case IDs (argv[2], comma-separated) in ai-approved-ticket.yml.
 *
 * Case IDs (TC001 …) repeat across tickets, so a plain "TC001|TC002"
 * grep also runs OTHER tickets' tests in the same spec file. When a
 * batch plan exists, Claude was told to title every test
 * "<TICKET>-<CASE_ID>" (plan-ticket-batch.js TITLE_RULE), so the
 * pattern is ticket-scoped: "FEAT-1170-TC001|FEAT-1170-TC002".
 * Without a plan (batching skipped) the legacy plain pattern is
 * printed, exactly as before.
 *
 * IDs are validated by splitIds (letters, digits, _ and - only), and
 * the ticket ID by the planner, so nothing here is a regex special
 * character.
 *
 * Env: TICKET_ID
 * ============================================================
 */

const ids = splitIds(process.argv[2]);
const plan = readPlan();
const ticketId = String(process.env.TICKET_ID || "").trim();
const scoped = Boolean(plan && ticketId && plan.ticketId === ticketId);

// An empty --grep would run EVERY test; match nothing instead.
process.stdout.write(
  ids.length
    ? ids.map(id => (scoped ? `${ticketId}-${id}` : id)).join("|")
    : "__no_selected_test_cases__"
);
