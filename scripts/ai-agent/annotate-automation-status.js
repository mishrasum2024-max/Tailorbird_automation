const fs = require("fs");
const path = require("path");
const { AUTOMATION_SUBPATH, LEDGER_SUBDIR, gh } = require("./lib/ticketBatch");

/*
 * ============================================================
 * ANNOTATE AUTOMATION STATUS (ticket picker)
 * ============================================================
 *
 * Runs in ai-ticket-selection.yml between get-notion-tickets.js and
 * send-ticket-approval.js. For every ticket in
 * data/notion-completed-tickets.json it looks up whether the AI agent
 * already raised a PR for it, and if so adds an optional
 * `automationStatus` field that send-ticket-approval.js shows as a tag
 * ("Already automated", ...). The ticket stays selectable.
 *
 * Sources (all written by the agent already):
 *   - PRs whose head branch is the agent's: ai/<ID> (single-PR mode),
 *     ai/<ID>-batch<N>, ai/<ID>-tests, ai/<ID>-selected-tests.
 *     Closed-unmerged PRs (e.g. superseded batch PRs) are ignored.
 *   - The batch record ai-batches/<ID>.json on the PR branch (or main
 *     once merged): which cases pass / still fail.
 *   - Without a batch record: the PR title prefix ([Verified] /
 *     [NEEDS REVIEW]). The legacy selected-tests workflow only opens a
 *     PR after its tests pass.
 *
 * Tickets without such a PR are left exactly as they were, so the
 * Slack message is unchanged for them. Never exits non-zero: on any
 * error the file is left untouched and the picker posts as before.
 *
 * Env: GH_TOKEN, GH_REPO ("owner/repo")
 * ============================================================
 */

const TICKETS_FILE = path.join(__dirname, "..", "..", "data", "notion-completed-tickets.json");
const GH_REPO = String(process.env.GH_REPO || "").trim();

// Same shape as lib/ticketBatch.js (Notion unique_id "<prefix>-<number>").
const TICKET_ID_PATTERN = /^[A-Za-z0-9]{0,20}-\d{1,9}$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BATCH_NUMBER_PATTERN = /^\d{1,4}$/;

// Head branch belongs to this ticket's agent runs (no regex built from the ID).
function isAgentBranch(head, ticketId) {
  const base = `ai/${ticketId}`;

  if (head === base || head === `${base}-tests` || head === `${base}-selected-tests`) return true;

  return head.startsWith(`${base}-batch`) && BATCH_NUMBER_PATTERN.test(head.slice(`${base}-batch`.length));
}

function findAgentPrs(ticketId) {
  const list = JSON.parse(
    gh([
      "pr",
      "list",
      "--repo",
      GH_REPO,
      "--state",
      "all",
      "--search",
      `${ticketId} in:title`,
      "--json",
      "number,title,state,url,headRefName,createdAt",
      "--limit",
      "50",
    ]) || "[]"
  );

  return list
    .filter(pr => isAgentBranch(String(pr.headRefName || ""), ticketId))
    .filter(pr => pr.state === "OPEN" || pr.state === "MERGED")
    .sort((a, b) => {
      // The single-PR ticket branch wins, then the newest PR.
      const single = Number(b.headRefName === `ai/${ticketId}`) - Number(a.headRefName === `ai/${ticketId}`);

      return single || String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

function readLedger(ticketId, refs) {
  const file = `${AUTOMATION_SUBPATH}/${LEDGER_SUBDIR}/${ticketId}.json`;

  for (const ref of refs) {
    try {
      const text = gh([
        "api",
        "-H",
        "Accept: application/vnd.github.raw",
        `repos/${GH_REPO}/contents/${file}?ref=${encodeURIComponent(ref)}`,
      ]);
      const ledger = JSON.parse(text);

      if (Array.isArray(ledger?.batches)) return ledger;
    } catch (error) {
      // Not on this ref (branch deleted, never recorded) — try the next one.
    }
  }

  return null;
}

function idsOf(batches, key) {
  return new Set(batches.flatMap(batch => (Array.isArray(batch?.[key]) ? batch[key] : [])).map(id => String(id).toUpperCase()));
}

function statusFor(ticketId) {
  const prs = findAgentPrs(ticketId);

  if (!prs.length) return null;

  const pr = prs[0];
  const prText = `PR #${pr.number} (${pr.state === "MERGED" ? "merged" : "open"})`;
  const refs = pr.state === "MERGED" ? ["main", pr.headRefName] : [pr.headRefName, "main"];
  const ledger = readLedger(ticketId, refs);

  if (ledger) {
    const passed = idsOf(ledger.batches, "passedIds");
    const pending = [...idsOf(ledger.batches, "failedIds")].filter(id => !passed.has(id));
    const total = Number(ledger.totalGeneratedCases) || 0;
    const counts = `${passed.size}${total ? `/${total}` : ""} generated case(s) automated and passing`;

    if (passed.size && !pending.length) {
      return { state: "automated", icon: "✅", label: `Already automated — ${counts}`, prUrl: pr.url, prText };
    }

    if (passed.size) {
      return {
        state: "partial",
        icon: "🧩",
        label: `Partially automated — ${counts}, ${pending.length} still failing`,
        prUrl: pr.url,
        prText,
      };
    }
  }

  const title = String(pr.title || "");

  if (title.startsWith("[NEEDS REVIEW]")) {
    return { state: "needs_review", icon: "⚠️", label: "Automation PR exists but needs review", prUrl: pr.url, prText };
  }

  // "[Verified]…" or the legacy selected-tests PR (opened only after its tests passed).
  return { state: "automated", icon: "✅", label: "Already automated", prUrl: pr.url, prText };
}

function main() {
  if (!REPO_PATTERN.test(GH_REPO) || !process.env.GH_TOKEN) {
    console.log("GH_REPO / GH_TOKEN not set; tickets are posted without automation status.");
    return;
  }

  if (!fs.existsSync(TICKETS_FILE)) {
    console.log("No tickets file; nothing to annotate.");
    return;
  }

  const tickets = JSON.parse(fs.readFileSync(TICKETS_FILE, "utf8"));

  if (!Array.isArray(tickets)) return;

  let tagged = 0;

  tickets.forEach(ticket => {
    const ticketId = String(ticket?.id || "").trim();

    if (!TICKET_ID_PATTERN.test(ticketId)) return;

    try {
      const status = statusFor(ticketId);

      if (status) {
        ticket.automationStatus = status;
        tagged++;
      }

      console.log(`${ticketId}: ${status ? `${status.icon} ${status.label} — ${status.prText}` : "no agent PR"}`);
    } catch (error) {
      console.warn(`${ticketId}: could not check automation status (${error.message}); shown without a tag.`);
    }
  });

  if (tagged) {
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2), "utf8");
  }

  console.log(`Tagged ${tagged} of ${tickets.length} ticket(s).`);
}

try {
  main();
} catch (error) {
  console.warn(`Automation-status check failed (${error.message}); tickets are posted without tags.`);
}
