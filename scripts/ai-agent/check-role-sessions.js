require("dotenv").config({ quiet: true });

const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

/*
 * ============================================================
 * CHECK ROLE SESSIONS (AI_FLOWS_V2)
 * ============================================================
 *
 * check-cached-session.js only probes the owner session. The agent
 * also needs the vendor and approver sessions to explore and
 * automate cross-role flows (vendor raises a change order, owner
 * approves it, ...), so this probes every role's storage-state
 * file the same cheap way: open the role's landing page and check
 * the browser was NOT bounced to the sign-in page.
 *
 *   owner     sessionState.json        DASHBOARD_URL
 *   vendor    vendorsession.json       BASE_URL/bids-and-contracts/dashboard
 *   approver  OtherSessionState.json   DASHBOARD_URL
 *
 * (Files are produced by tests/TC01_login.spec.js TC01 / TC451 / TC03.)
 *
 * Never throws and never exits non-zero: anything ambiguous is
 * "invalid", so the workflow re-runs the login tests.
 *
 * Writes:
 *   .ai-run/sessions.json      { owner: {file, status, landedOn}, ... }
 *   $GITHUB_OUTPUT             owner_session, vendor_session,
 *                              approver_session (valid|invalid|missing),
 *                              all_valid=true|false
 * ============================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const RUN_DIR = path.join(ROOT, ".ai-run");
const SESSIONS_FILE = path.join(RUN_DIR, "sessions.json");
const NAVIGATION_TIMEOUT_MS = 30000;
const SETTLE_MS = 3000;

const DASHBOARD_URL = String(process.env.DASHBOARD_URL || "").trim();
const BASE_URL = String(process.env.BASE_URL || "").trim().replace(/\/+$/, "");

// Absolute paths are built from literals only (semgrep
// path-join-resolve-traversal: no path.join on function arguments).
const ROLES = [
  {
    role: "owner",
    file: "sessionState.json",
    abs: path.join(ROOT, "sessionState.json"),
    url: DASHBOARD_URL,
  },
  {
    role: "vendor",
    file: "vendorsession.json",
    abs: path.join(ROOT, "vendorsession.json"),
    url: BASE_URL ? `${BASE_URL}/bids-and-contracts/dashboard` : "",
  },
  {
    role: "approver",
    file: "OtherSessionState.json",
    abs: path.join(ROOT, "OtherSessionState.json"),
    url: DASHBOARD_URL,
  },
];

// Bounced to the identity provider or a sign-in route = not logged in.
function looksSignedOut(landedOn, targetUrl) {
  let landed;
  let target;

  try {
    landed = new URL(landedOn);
    target = new URL(targetUrl);
  } catch (error) {
    return true;
  }

  if (landed.host !== target.host) return true;

  return /(sign-?in|log-?in|authkit|auth\/callback)/i.test(landed.pathname);
}

async function probe(browser, { role, file, abs: absFile, url }) {
  if (!fs.existsSync(absFile)) {
    return { role, file, status: "missing", landedOn: "" };
  }

  if (!url) {
    return { role, file, status: "invalid", landedOn: "", note: "no target URL" };
  }

  let context;

  try {
    context = await browser.newContext({ storageState: absFile });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
    // Client-side auth redirects happen after "load".
    await page.waitForTimeout(SETTLE_MS);

    const landedOn = page.url();

    return {
      role,
      file,
      status: looksSignedOut(landedOn, url) ? "invalid" : "valid",
      landedOn,
    };
  } catch (error) {
    return { role, file, status: "invalid", landedOn: "", note: error.message };
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

function writeOutputs(results) {
  const allValid = results.every(result => result.status === "valid");
  const lines = [
    ...results.map(result => `${result.role}_session=${result.status}`),
    `all_valid=${allValid}`,
  ];

  lines.forEach(line => console.log(line));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
  }

  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(
    SESSIONS_FILE,
    `${JSON.stringify(
      Object.fromEntries(results.map(result => [result.role, result])),
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function main() {
  console.log("======================================");
  console.log("CHECKING ROLE SESSIONS");
  console.log("======================================");

  let browser;
  const results = [];

  try {
    browser = await chromium.launch();

    for (const role of ROLES) {
      const result = await probe(browser, role);

      console.log(
        `${result.role.padEnd(8)} ${result.file.padEnd(24)} ${result.status}` +
          (result.landedOn ? `  (landed on ${result.landedOn})` : "") +
          (result.note ? `  [${result.note}]` : "")
      );
      results.push(result);
    }
  } catch (error) {
    console.log(`Session check could not run: ${error.message}`);
    ROLES.filter(role => !results.some(result => result.role === role.role)).forEach(
      role => results.push({ role: role.role, file: role.file, status: "invalid", landedOn: "" })
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  writeOutputs(results);
}

main().catch(error => {
  console.log(`Unexpected error (treating sessions as invalid): ${error.message}`);
  writeOutputs(
    ROLES.map(role => ({ role: role.role, file: role.file, status: "invalid", landedOn: "" }))
  );
});
