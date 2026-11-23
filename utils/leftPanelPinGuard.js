/**
 * leftPanelPinGuard.js — a separate, recovery-first way to put the left navigation panel into a
 * known pinned / unpinned state. It does NOT replace utils/leftPanelExpander.js (left untouched);
 * call it just BEFORE ensureLeftPanelExpanded(page) where that helper has been failing — the
 * existing helper then finds the panel already pinned and returns immediately.
 *
 * Why (2026-11-23): in a CI run 5 tests (TC72, TC588, TC496, TC357, TC337) failed inside
 * ensureLeftPanelExpanded — the hover never revealed "Pin sidebar" within 3 × 45s. Locally the
 * same helper works headed and headless from a collapsed sidebar (13–22s), so hover-reveal is the
 * fragile step on a slow/loaded runner.
 *
 * Verified live (MCP + headless script, 2026-11-23):
 * - Collapsed rail = ~68px, no buttons; hover → ~224px with button[aria-label="Pin sidebar"];
 *   pinned → button[aria-label="Unpin sidebar"].
 * - The pinned state lives in localStorage "tb-sidebar-pinned" ("true"/"false"); clicking Unpin
 *   writes "false". From a collapsed sidebar, setting it to "true" and reloading renders the panel
 *   pinned (224px + Unpin button) in ~5s with no hover at all — the fallback used below.
 */
const { expect } = require("@playwright/test");
const { Logger } = require("./logger");

const NAVBAR = ".mantine-AppShell-navbar";
const PIN = 'button[aria-label="Pin sidebar"]';
const UNPIN = 'button[aria-label="Unpin sidebar"]';
const STORAGE_KEY = "tb-sidebar-pinned";
const WIDE_ENOUGH = 120; // collapsed ~68px, pinned ~224px (native scale)

async function navbarState(page) {
  const navbar = page.locator(NAVBAR).first();
  const unpinVisible = await navbar
    .locator(UNPIN)
    .first()
    .isVisible()
    .catch(() => false);
  // Zoom-aware width: the logo is 35px wide at native scale (same signal leftPanelExpander uses).
  const { width, zoom } = await navbar
    .evaluate(el => {
      const logo = el.querySelector('img[alt="Tailorbird Logo"]');
      const logoWidth = logo ? logo.getBoundingClientRect().width : 0;
      return {
        width: el.getBoundingClientRect().width,
        zoom: logoWidth ? logoWidth / 35 : 1,
      };
    })
    .catch(() => ({ width: 0, zoom: 1 }));
  return { unpinVisible, wide: width >= WIDE_ENOUGH * zoom, width };
}

/**
 * Makes sure the left panel is pinned open. Order: already pinned → hover reveal + Pin click →
 * localStorage "tb-sidebar-pinned"=true + reload. Each wait is sized for a slow beta (up to 80s).
 * @param {import('@playwright/test').Page} page
 */
async function ensureLeftPanelPinnedRobust(page, { timeout = 80000 } = {}) {
  const navbar = page.locator(NAVBAR).first();
  await navbar.waitFor({ state: "visible", timeout });
  // A pinned sidebar can render its Unpin button a moment after the shell (hydration).
  await navbar
    .locator(UNPIN)
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() => {});
  let state = await navbarState(page);
  if (state.unpinVisible && state.wide) {
    Logger.info("[LeftPanelPinGuard] Panel already pinned.");
    return;
  }

  // 1) Hover reveal — move the pointer off the rail first so the move onto it is a fresh enter.
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  await page.mouse
    .move(viewport.width - 5, viewport.height - 5, { steps: 5 })
    .catch(() => {});
  const box = await navbar.boundingBox().catch(() => null);
  if (box) {
    await page.mouse
      .move(box.x + box.width / 2, box.y + Math.min(100, box.height / 2), {
        steps: 15,
      })
      .catch(() => {});
  }
  await navbar.dispatchEvent("mouseover").catch(() => {});
  const pin = navbar.locator(PIN).first();
  if (
    await pin
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await pin.click().catch(() => {});
    const pinned = await navbar
      .locator(UNPIN)
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    state = await navbarState(page);
    if (pinned && state.wide) {
      Logger.success("[LeftPanelPinGuard] Pinned via hover + Pin sidebar.");
      return;
    }
  }

  // 2) Fallback — persist the app's own pinned flag and reload (no hover needed). Reproduced
  // 2026-11-23 (TC337 local run, trace + screenshot): when the dashboard's
  // "organization_membership" query fails ("Error Loading Data"), the left panel renders EMPTY at
  // full width (only "Get Help", no nav items, no Pin/Unpin button), so no hover can ever pin it;
  // a reload re-runs the query. Reload up to 3 times until the Unpin button renders.
  for (let reload = 1; reload <= 3; reload++) {
    Logger.info(
      `[LeftPanelPinGuard] Panel not pinnable (width=${state.width}px, Unpin/Pin not rendered) — setting ${STORAGE_KEY}=true and reloading (${reload}/3).`
    );
    await page.evaluate(
      key => localStorage.setItem(key, "true"),
      STORAGE_KEY
    );
    await page.reload({ waitUntil: "load" });
    await navbar.waitFor({ state: "visible", timeout });
    const pinnedAfterReload = await navbar
      .locator(UNPIN)
      .first()
      .waitFor({ state: "visible", timeout: 40000 })
      .then(() => true)
      .catch(() => false);
    if (pinnedAfterReload) break;
    state = await navbarState(page);
  }
  await expect(
    navbar.locator(UNPIN).first(),
    "FAIL: left panel must be pinned (Unpin sidebar visible) after the localStorage fallback"
  ).toBeVisible({ timeout });
  await expect
    .poll(async () => (await navbarState(page)).wide, {
      message: "FAIL: pinned left panel must be expanded",
      timeout: 30000,
    })
    .toBe(true);
  Logger.success("[LeftPanelPinGuard] Pinned via localStorage + reload.");
}

/**
 * Makes sure the left panel is NOT pinned (collapsed rail). Clicks "Unpin sidebar" when it is
 * shown; otherwise persists "tb-sidebar-pinned"=false and reloads.
 * @param {import('@playwright/test').Page} page
 */
async function ensureLeftPanelUnpinnedRobust(page, { timeout = 80000 } = {}) {
  const navbar = page.locator(NAVBAR).first();
  await navbar.waitFor({ state: "visible", timeout });
  const unpin = navbar.locator(UNPIN).first();
  if (await unpin.isVisible().catch(() => false)) {
    await unpin.click().catch(() => {});
  }
  const stored = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  if (stored !== "false") {
    await page.evaluate(key => localStorage.setItem(key, "false"), STORAGE_KEY);
    await page.reload({ waitUntil: "load" });
    await navbar.waitFor({ state: "visible", timeout });
  }
  await expect(
    navbar.locator(UNPIN).first(),
    "FAIL: left panel must not be pinned"
  ).toBeHidden({ timeout: 30000 });
  Logger.success("[LeftPanelPinGuard] Panel unpinned.");
}

module.exports = { ensureLeftPanelPinnedRobust, ensureLeftPanelUnpinnedRobust };
