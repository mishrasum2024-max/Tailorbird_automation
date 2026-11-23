const { expect } = require("@playwright/test");
const { Logger } = require("./logger");

/**
 * Waits for a page/panel to become ready on a slow beta and recovers from the app's transient
 * "Error Loading Data" banner.
 *
 * MCP-verified 2026-11-23 (dashboard → Projects, one failed list request): the list renders an
 * "Error Loading Data" card (e.g. "Failed query: select "role" from "organization_membership"…" or
 * "HTTP error! status: 400") with "Retry" and "Refresh Page" buttons, and clicking Retry brings the
 * list back. Seen in the 2026-11-23 2-worker run on Projects (TC595 setup) and Approval Templates
 * (TC576 setup).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} ready  element that proves the page is usable
 * @param {{ label: string, timeout?: number, attempts?: number, afterRecover?: () => Promise<void> }} options
 *   timeout — per-attempt wait (default 80s, worst case on beta); afterRecover — re-applies state
 *   (e.g. a search) after a Retry.
 */
async function waitForReadyRecoveringErrors(
  page,
  ready,
  { label, timeout = 80000, attempts = 3, afterRecover } = {}
) {
  const banner = page.getByText("Error Loading Data", { exact: true }).first();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const state = await Promise.race([
      ready
        .waitFor({ state: "visible", timeout })
        .then(() => "ready"),
      banner.waitFor({ state: "visible", timeout }).then(() => "error"),
    ]).catch(() => "timeout");
    if (state === "ready") return;
    Logger.info(
      `${label}: ${state === "error" ? '"Error Loading Data" shown' : `not ready after ${timeout / 1000}s`} (attempt ${attempt}/${attempts}) — recovering`
    );
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    if (state === "error" && (await retry.isVisible().catch(() => false))) {
      await retry.click().catch(() => {});
    } else {
      await page.reload({ waitUntil: "load" }).catch(() => {});
    }
    if (afterRecover) await afterRecover().catch(() => {});
  }
  await expect(ready, `FAIL: ${label} must load`).toBeVisible({ timeout });
}

module.exports = { waitForReadyRecoveringErrors };
