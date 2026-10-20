const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * WRITE MCP CONFIG — one isolated browser per role (AI_FLOWS_V2)
 * ============================================================
 *
 * @playwright/mcp only loads --storage-state for ISOLATED sessions
 * ("path to the storage state file for isolated sessions", MCP
 * README). The old config passed --storage-state without --isolated,
 * so every CI MCP browser was silently logged out (FEAT-1170 batches
 * 1/3/5/6: "redirected to the authkit sign-in page"). The bug agent
 * already fixed this the same way (ai-bug-generate-testcases.yml).
 *
 * Servers (a server is added only when its session file exists):
 *   playwright           owner / admin   sessionState.json
 *                        (name unchanged, so existing prompts and
 *                        mcp__playwright__* keep working)
 *   playwright_vendor    vendor portal   vendorsession.json
 *   playwright_approver  2nd approver    OtherSessionState.json
 *
 * Reads .ai-run/sessions.json (check-role-sessions.js) for each
 * role's validity, if present.
 *
 * Writes:
 *   .mcp.json                   the MCP config
 *   .ai-run/role-sessions.md    prompt section: which browser = which role
 *   $GITHUB_ENV                 MCP_ALLOWED_TOOLS (for --allowedTools)
 * ============================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const MCP_FILE = path.join(ROOT, ".mcp.json");
const RUN_DIR = path.join(ROOT, ".ai-run");
const SESSIONS_FILE = path.join(RUN_DIR, "sessions.json");
const ROLE_PROMPT_FILE = path.join(RUN_DIR, "role-sessions.md");

const SERVERS = [
  // abs: built from literals only (semgrep path-join-resolve-traversal).
  {
    server: "playwright",
    role: "owner",
    file: "sessionState.json",
    abs: path.join(ROOT, "sessionState.json"),
    who: "Owner / admin (TEST_EMAIL): properties, projects, jobs, contracts, owner-side invoices and change orders, bids, approvals, approval templates, budgets, draws, organization.",
  },
  {
    server: "playwright_vendor",
    role: "vendor",
    file: "vendorsession.json",
    abs: path.join(ROOT, "vendorsession.json"),
    who: 'Vendor portal user of the vendor org "sumit corp" (VENDOR_LOGIN_EMAIL): /bids-and-contracts dashboard, bids (accept/submit), contracts, vendor-raised change orders, vendor invoices, vendor profile.',
  },
  {
    server: "playwright_approver",
    role: "approver",
    file: "OtherSessionState.json",
    abs: path.join(ROOT, "OtherSessionState.json"),
    who: "Second owner-side user (NEW_TEST_EMAIL), used as an approver: My Approvals / All Approvals, draw and invoice approvals, reassigning invoices.",
  },
];

function readSessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
  } catch (error) {
    return {};
  }
}

function main() {
  const sessions = readSessions();
  const mcpServers = {};
  const rows = [];
  const allowed = [];

  SERVERS.forEach(entry => {
    const exists = fs.existsSync(entry.abs);
    const status = sessions[entry.role]?.status || (exists ? "unchecked" : "missing");

    // The owner server always exists (logged out when there is no
    // session) so prompts that use mcp__playwright__* keep working.
    if (!exists && entry.server !== "playwright") {
      rows.push({ ...entry, status: "missing", added: false });
      return;
    }

    mcpServers[entry.server] = {
      command: "npx",
      args: [
        "-y",
        "@playwright/mcp@latest",
        "--headless",
        "--isolated",
        ...(exists ? ["--storage-state", entry.file] : []),
      ],
    };
    allowed.push(`mcp__${entry.server}__*`);
    rows.push({ ...entry, status: exists ? status : "missing", added: true });
  });

  fs.writeFileSync(MCP_FILE, `${JSON.stringify({ mcpServers }, null, 2)}\n`, "utf8");

  const lines = [
    "",
    "==============================================",
    "BROWSERS PER ROLE (Playwright MCP)",
    "==============================================",
    "",
    "Each MCP server below is a separate, isolated browser already logged in",
    "as one role. Use the browser of the role the step needs (e.g. the vendor",
    "raises a change order in playwright_vendor, the owner approves it in",
    "playwright). Never log in with credentials inside the MCP browser and",
    "never use a customer account.",
    "",
    "| MCP server | Role | Session file | Status | Use it for |",
    "|---|---|---|---|---|",
    ...rows.map(
      row =>
        `| ${row.added ? `\`${row.server}\` (tools \`mcp__${row.server}__*\`)` : "not available"} | ${row.role} | \`${row.file}\` | ${row.status} | ${row.who} |`
    ),
    "",
    "Rules:",
    "- Before exploring, read .claude/skills/tailorbird-site-flows/SKILL.md:",
    "  the order in which records must exist (property → budget → project → job",
    "  → finalized contract → invoice/CO, …) and which role does each step.",
    "  Walk that chain in the matching role's browser; reuse existing data.",
    "- If a browser lands on a sign-in page, that role's session is broken:",
    "  do not continue logged out. Record it in the agent report under",
    '  "lacks" (e.g. "vendor session invalid") and continue with what the',
    "  other roles allow.",
    "- Playwright tests pick the role with test.use({ storageState: '<file>' })",
    "  or browser.newContext({ storageState: '<file>' }) using the same files.",
    "",
  ];

  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(ROLE_PROMPT_FILE, lines.join("\n"), "utf8");

  const allowedTools = allowed.join(",");

  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `MCP_ALLOWED_TOOLS=${allowedTools}\n`, "utf8");
  }

  console.log(fs.readFileSync(MCP_FILE, "utf8"));
  console.log(`MCP_ALLOWED_TOOLS=${allowedTools}`);
  rows.forEach(row =>
    console.log(`${row.server.padEnd(20)} ${row.role.padEnd(9)} ${row.file.padEnd(24)} ${row.status}`)
  );
}

main();
