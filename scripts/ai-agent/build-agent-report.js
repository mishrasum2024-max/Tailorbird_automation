const fs = require("fs");
const path = require("path");
const { splitIds, findSpecsForCases } = require("./lib/caseSpecs");

/*
 * ============================================================
 * BUILD AGENT REPORT (AI_FLOWS_V2)
 * ============================================================
 *
 * One honest, per-case picture of the run: what was automated,
 * what fails, what was never written, what is blocked and why,
 * what the agent found, lacked and created.
 *
 * Claude's own report (.ai-run/report.json, see
 * prompts/agent-report-instruction.md) is NOT trusted on its own:
 * every case is checked against the facts —
 *   - is there a test titled <TICKET>-<CASE> in tests/ ?
 *   - did it pass or fail in this run (PASSED/FAILED_TEST_CASES) ?
 * and a disagreement is reported as such.
 *
 * Env: TICKET_ID, SELECTED_TEST_CASES, PASSED_TEST_CASES,
 *      FAILED_TEST_CASES, TEST_STATUS, HAS_CHANGES
 *
 * Writes:
 *   .ai-run/agent-report.json   structured (Slack, memory)
 *   .ai-run/agent-report.md     GitHub markdown (PR body)
 *   $GITHUB_OUTPUT              has_report, automated_ids,
 *                               failing_ids, not_implemented_ids,
 *                               blocked_ids
 * Never exits non-zero.
 * ============================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const RUN_DIR = path.join(ROOT, ".ai-run");
const CLAUDE_REPORT = path.join(RUN_DIR, "report.json");
const SESSIONS_FILE = path.join(RUN_DIR, "sessions.json");
const SELECTED_FILE = path.join(ROOT, "data", "selected-testcases.json");
const OUT_JSON = path.join(RUN_DIR, "agent-report.json");
const OUT_MD = path.join(RUN_DIR, "agent-report.md");

const MAX_ITEMS = 8;
const MAX_TEXT = 300;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function clean(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

function cleanList(list) {
  return (Array.isArray(list) ? list : [])
    .map(item => (typeof item === "string" ? item : JSON.stringify(item)))
    .map(clean)
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

// Final "could not automate" statuses from the blocker-resolution skill
// (.claude/skills/automation-blocker-resolution/SKILL.md §4); "blocked"
// is the legacy generic value.
const BLOCKED_STATUSES = {
  blocked: "blocked — not automated",
  product_blocked: "PRODUCT_BLOCKED — the product does not support it",
  environment_blocked: "ENVIRONMENT_BLOCKED — app/backend/session unavailable",
  unknown_blocker: "UNKNOWN_BLOCKER — still unclear after investigation",
};
const BLOCKER_ID_PATTERN = /^BLK-[A-Z0-9]+(-[A-Z0-9]+)+$/;

function verdictFor({ id, specs, passed, failed, claude, ran }) {
  const claimed = String(claude?.status || "").toLowerCase();

  if (specs.length && passed.has(id) && claimed === "automated_with_gap") {
    return { verdict: "passing", icon: "✅", label: "automated, passing — WITH GAP (not every expected result is asserted)" };
  }
  if (specs.length && passed.has(id)) return { verdict: "passing", icon: "✅", label: "automated, passing" };
  if (specs.length && failed.has(id)) return { verdict: "failing", icon: "❌", label: "automated, failing" };
  // A test exists but was not part of this run's results (its spec
  // was not changed by this batch, or nothing ran at all).
  if (specs.length) {
    return {
      verdict: "existing",
      icon: "ℹ️",
      label: ran ? "test exists but was not run in this batch" : "test exists (earlier batch), not re-run",
    };
  }
  if (BLOCKED_STATUSES[claimed]) return { verdict: "blocked", icon: "⛔", label: BLOCKED_STATUSES[claimed] };
  if (claimed === "resolvable" || claimed === "repairable") {
    return { verdict: "not_implemented", icon: "⚠️", label: `NOT implemented — ${claimed.toUpperCase()} (understood, not finished this run)` };
  }
  if (claimed === "automated" || claimed === "partial" || claimed === "automated_with_gap") {
    return { verdict: "not_implemented", icon: "⚠️", label: `NOT implemented (agent claimed "${claimed}", but no test titled with this case exists)` };
  }

  return { verdict: "not_implemented", icon: "⚠️", label: "NOT implemented" };
}

function main() {
  const ticketId = String(process.env.TICKET_ID || "").trim().toUpperCase();
  const selected = splitIds(process.env.SELECTED_TEST_CASES);
  const passed = new Set(splitIds(process.env.PASSED_TEST_CASES));
  const failed = new Set(splitIds(process.env.FAILED_TEST_CASES));
  const ran = process.env.HAS_CHANGES === "true";
  const claudeReport = readJson(CLAUDE_REPORT, null);
  const sessions = readJson(SESSIONS_FILE, {});
  const selectedFile = readJson(SELECTED_FILE, {});
  const titles = Object.fromEntries(
    (selectedFile.selectedTestCases || []).map(testCase => [String(testCase.id).toUpperCase(), testCase.title])
  );
  const claudeCases = Object.fromEntries(
    ((claudeReport && claudeReport.cases) || [])
      .filter(entry => entry && entry.id)
      .map(entry => [String(entry.id).toUpperCase(), entry])
  );
  const specsByCase = findSpecsForCases(ticketId, selected);

  const cases = selected.map(id => {
    const claude = claudeCases[id] || null;
    const specs = specsByCase[id] || [];
    const { verdict, icon, label } = verdictFor({ id, specs, passed, failed, claude, ran });

    return {
      id,
      title: clean(titles[id] || ""),
      verdict,
      icon,
      label,
      specs,
      agentStatus: claude ? clean(claude.status) : "no report",
      roles: cleanList(claude?.roles),
      prerequisites: (Array.isArray(claude?.prerequisites) ? claude.prerequisites : [])
        .slice(0, MAX_ITEMS)
        .map(item => ({ need: clean(item?.need), state: clean(item?.state), how: clean(item?.how) })),
      found: cleanList(claude?.found),
      lacks: cleanList([...(claude?.lacks || []), ...(claude?.missing || [])]),
      created: cleanList(claude?.created),
      reason: clean(claude?.reason),
      nextStep: clean(claude?.nextStep || claude?.nextAction),
      blockerId: BLOCKER_ID_PATTERN.test(String(claude?.blockerId || "")) ? claude.blockerId : "",
      blockerType: clean(claude?.blockerType),
      requiredState: clean(claude?.requiredState),
      resolutionAttempted: cleanList(claude?.resolutionAttempted),
      resolution: clean(claude?.resolution),
      filesChanged: cleanList(claude?.filesChanged),
      verification: clean(claude?.verification),
    };
  });

  const resolvedBlockers = recordVerifiedBlockerResolutions({
    ticketId,
    claudeReport,
    passingIds: new Set(cases.filter(item => item.verdict === "passing").map(item => item.id)),
  });

  const sessionRows = Object.values(sessions).map(session => ({
    role: session.role,
    file: session.file,
    status: session.status,
  }));
  const general = {
    found: cleanList(claudeReport?.general?.found),
    lacks: cleanList(claudeReport?.general?.lacks),
  };

  sessionRows
    .filter(session => session.status !== "valid")
    .forEach(session => general.lacks.unshift(`${session.role} session (${session.file}) is ${session.status}`));

  if (!claudeReport) {
    general.lacks.unshift("The agent did not write .ai-run/report.json; statuses below come from the spec files and test results only.");
  }

  const byVerdict = verdict => cases.filter(item => item.verdict === verdict).map(item => item.id);
  const report = {
    ticketId,
    testStatus: process.env.TEST_STATUS || "",
    ran,
    sessions: sessionRows,
    counts: {
      selected: cases.length,
      passing: byVerdict("passing").length,
      failing: byVerdict("failing").length,
      existing: byVerdict("existing").length,
      notImplemented: byVerdict("not_implemented").length,
      blocked: byVerdict("blocked").length,
    },
    cases,
    resolvedBlockers,
    general,
  };

  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_MD, toMarkdown(report), "utf8");

  console.log(fs.readFileSync(OUT_MD, "utf8"));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        "has_report=true",
        `automated_ids=${byVerdict("passing").join(",")}`,
        `failing_ids=${byVerdict("failing").join(",")}`,
        `not_implemented_ids=${byVerdict("not_implemented").join(",")}`,
        `blocked_ids=${byVerdict("blocked").join(",")}`,
      ].join("\n") + "\n",
      "utf8"
    );
  }
}

// Stores the blocker resolutions the agent reported in the EXISTING memory
// store (utils/playwrightMemory.js#recordFix → memory/fixHistory.json, persisted
// by scripts/ai-agent/persist-memory.js), keyed by the stable blocker ID — but
// only when at least one of its source test cases really passed in this run.
// Unverified entries are listed in the report as "not remembered", never stored.
function recordVerifiedBlockerResolutions({ ticketId, claudeReport, passingIds }) {
  const entries = Array.isArray(claudeReport?.resolvedBlockers) ? claudeReport.resolvedBlockers : [];
  const results = [];

  entries.slice(0, MAX_ITEMS).forEach(entry => {
    const blockerId = String(entry?.blockerId || "").trim();
    const sources = splitIds((entry?.sourceTestCases || []).join(","));
    const passedSources = sources.filter(id => passingIds.has(id));
    const result = {
      blockerId: clean(blockerId),
      category: clean(entry?.category),
      resolution: clean(entry?.resolution),
      sourceTestCases: sources,
      remembered: false,
      note: "",
    };

    if (!BLOCKER_ID_PATTERN.test(blockerId)) {
      result.note = "not remembered: blocker ID is not in BLK-<TYPE>-<SUBJECT> form";
    } else if (!passedSources.length) {
      result.note = "not remembered: none of its source test cases passed in this run";
    } else {
      try {
        const playwrightMemory = require("../../utils/playwrightMemory");
        const details = [
          clean(entry?.resolution),
          entry?.reusableMethods?.length ? `Reusable: ${cleanList(entry.reusableMethods).join(", ")}` : "",
          entry?.requiredData ? `Needs: ${clean(entry.requiredData)}` : "",
          entry?.requiredRole ? `Role: ${clean(entry.requiredRole)}` : "",
          entry?.verification ? `Verified: ${clean(entry.verification)}` : "",
        ].filter(Boolean);

        playwrightMemory.recordFix({
          ticketId,
          testCaseId: passedSources.join(","),
          component: clean(entry?.feature) || clean(entry?.category),
          errorSignature: blockerId,
          rootCause: `[${blockerId}] ${clean(entry?.originalProblem)}`,
          fixApplied: details.join(" | "),
          filesChanged: cleanList(entry?.filesChanged),
        });
        result.remembered = true;
        result.note = `remembered (verified by ${passedSources.join(", ")})`;
      } catch (error) {
        result.note = `not remembered: ${clean(error.message)}`;
      }
    }

    results.push(result);
  });

  return results;
}

function bullets(items, prefix = "  - ") {
  return items.map(item => `${prefix}${item}`);
}

function toMarkdown(report) {
  const c = report.counts;
  const lines = [
    "## 🤖 Agent report",
    "",
    `**${c.selected} selected:** ✅ ${c.passing} passing · ❌ ${c.failing} failing · ⚠️ ${c.notImplemented} not implemented · ⛔ ${c.blocked} blocked` +
      (c.existing ? ` · ℹ️ ${c.existing} already automated earlier` : ""),
    "",
  ];

  if (report.sessions.length) {
    lines.push(
      "**Role sessions:** " +
        report.sessions
          .map(session => `${session.role} ${session.status === "valid" ? "✅" : `❌ (${session.status})`}`)
          .join(" · "),
      ""
    );
  }

  report.cases.forEach(item => {
    lines.push(`### ${item.icon} ${item.id} — ${item.label}`);
    if (item.title) lines.push(`_${item.title}_`);
    if (item.specs.length) lines.push(`- Spec: ${item.specs.map(spec => `\`${spec}\``).join(", ")}`);
    if (item.parkedRef) lines.push(`- 📦 Not in this PR — the failing attempt is kept on \`${item.parkedRef}\``);
    if (item.roles.length) lines.push(`- Roles: ${item.roles.join(", ")}`);
    if (item.blockerId || item.blockerType) {
      lines.push(`- Blocker: ${[item.blockerId, item.blockerType].filter(Boolean).join(" · ")}${item.requiredState ? ` — needs: ${item.requiredState}` : ""}`);
    }
    if (item.resolutionAttempted.length) lines.push("- Resolution attempted:", ...bullets(item.resolutionAttempted));
    if (item.resolution) lines.push(`- Resolution: ${item.resolution}`);
    if (item.verification) lines.push(`- Verification: ${item.verification}`);
    if (item.prerequisites.length) {
      lines.push("- Prerequisites:");
      item.prerequisites.forEach(pre =>
        lines.push(`  - ${pre.need} — **${pre.state || "?"}**${pre.how ? ` (${pre.how})` : ""}`)
      );
    }
    if (item.found.length) lines.push("- Found:", ...bullets(item.found));
    if (item.lacks.length) lines.push("- Lacks:", ...bullets(item.lacks));
    if (item.created.length) lines.push("- Created:", ...bullets(item.created));
    if (item.reason) lines.push(`- Why: ${item.reason}`);
    if (item.nextStep) lines.push(`- Next step: ${item.nextStep}`);
    lines.push("");
  });

  if (report.resolvedBlockers.length) {
    lines.push("### Resolved blockers");
    report.resolvedBlockers.forEach(entry =>
      lines.push(`- ${entry.remembered ? "🧠" : "•"} **${entry.blockerId || "?"}**${entry.category ? ` (${entry.category})` : ""}: ${entry.resolution || "—"} — _${entry.note}_`)
    );
    lines.push("");
  }

  if (report.general.found.length || report.general.lacks.length) {
    lines.push("### Run-wide");
    if (report.general.found.length) lines.push("- Found:", ...bullets(report.general.found));
    if (report.general.lacks.length) lines.push("- Lacks:", ...bullets(report.general.lacks));
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

// publish-ticket-pr.js re-renders the report after parking failing tests
// (single-PR mode), so the renderer is exported; running the file still
// builds the report exactly as before.
module.exports = { toMarkdown };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.log(`Could not build the agent report: ${error.message}`);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, "has_report=false\n", "utf8");
    }
  }
}
