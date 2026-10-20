require("dotenv").config();

const { chromium } = require("@playwright/test");
const fs = require("fs");

/*
 * ============================================================
 * CHECK CACHED SESSION VALIDITY
 * ============================================================
 *
 * Cheap liveness probe for a session file downloaded from an
 * earlier ai-generate-testcases.yml run's session-investigation-bundle
 * artifact. Does NOT perform a login — it only checks whether the
 * cached cookies still work, so ai-approved-ticket.yml can decide
 * whether to skip re-running TC01/TC03/TC04/TC451.
 *
 * Mirrors the exact check TC02 already performs in
 * tests/TC01_login.spec.js (goto DASHBOARD_URL, assert the page
 * actually stayed there instead of being redirected to login) —
 * reused here rather than inventing a new heuristic.
 *
 * Env vars:
 *   SESSION_STATE_PATH   Path to the storageState file (default:
 *                        "sessionState.json")
 *   DASHBOARD_URL        Required.
 *
 * Never throws and never exits non-zero — any ambiguity resolves to
 * session_valid=false so the caller safely falls back to a full
 * fresh login instead of trusting a session that might not work.
 *
 * Output:
 *   Writes session_valid=true|false to $GITHUB_OUTPUT (if set) and
 *   prints it to stdout either way.
 * ============================================================
 */

const SESSION_STATE_PATH =
  process.env.SESSION_STATE_PATH || "sessionState.json";

const DASHBOARD_URL = process.env.DASHBOARD_URL;

const NAVIGATION_TIMEOUT_MS = 15000;

function writeOutput(isValid) {
  console.log(`session_valid=${isValid}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `session_valid=${isValid}\n`,
      "utf8"
    );
  }
}

async function checkSession() {
  if (!fs.existsSync(SESSION_STATE_PATH)) {
    console.log(
      `No cached session file found at: ${SESSION_STATE_PATH}`
    );
    return false;
  }

  if (!DASHBOARD_URL) {
    console.log(
      "DASHBOARD_URL is not set — cannot verify the cached session."
    );
    return false;
  }

  let browser;

  try {
    browser = await chromium.launch();

    const context = await browser.newContext({
      storageState: SESSION_STATE_PATH,
    });

    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, {
      waitUntil: "load",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const currentUrl = page.url();

    const isValid = currentUrl === DASHBOARD_URL;

    console.log(
      `Navigated to DASHBOARD_URL, landed on: ${currentUrl}`
    );

    return isValid;
  } catch (error) {
    console.log(
      `Session check failed (treating as invalid): ${error.message}`
    );

    return false;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function main() {
  console.log("======================================");
  console.log("CHECKING CACHED SESSION VALIDITY");
  console.log("======================================");

  const isValid = await checkSession();

  console.log("======================================");

  writeOutput(isValid);
}

main().catch((error) => {
  console.log(
    `Unexpected error (treating session as invalid): ${error.message}`
  );

  writeOutput(false);
});
