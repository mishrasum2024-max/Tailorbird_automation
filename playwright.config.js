// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '.env') });

/*
 * Timing — one place for every default wait.
 *
 * DEFAULT_WAIT_MS is the MAXIMUM Playwright waits for an action (click,
 * fill…), a navigation, or a web-first assertion (expect(...).toBeVisible()
 * etc.) that does not pass its own timeout. Playwright continues the moment
 * the condition is met, so a fast page still moves on immediately; a slow
 * page gets up to 60 s instead of failing early. A call that passes its
 * own { timeout } keeps that value.
 *
 * SLOW_FACTOR (env, default 1, max 5) scales every value below for slow
 * days without touching any test, e.g. SLOW_FACTOR=1.5 → 90 s waits.
 */
const SLOW_FACTOR = (() => {
  const value = Number(process.env.SLOW_FACTOR || 1);

  return Number.isFinite(value) && value >= 1 ? Math.min(value, 5) : 1;
})();
/** @param {number} ms */
const scaled = ms => Math.round(ms * SLOW_FACTOR);
const DEFAULT_WAIT_MS = scaled(60 * 1000);

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Whole test (scaled by SLOW_FACTOR; test.setTimeout() in a test still wins) */
  timeout: scaled(280 * 1000),

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if test.only is left */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 0 : 0,

  /* Opt out of parallel tests on CI */
  workers: 1,

  /*
   * CI: write blob reports per run, then merge into one HTML report (see workflow).
   * Local: HTML report as usual.
   */
  reporter:
    process.env.CI === 'true' && process.env.PLAYWRIGHT_BLOB_REPORT === '1'
      ? [
        ['list'],
        ['blob', { outputDir: 'blob-report' }],
        ['json', { outputFile: 'test-results/test-results.json' }],
      ]
      : [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/test-results.json' }],
      ],

  updateSnapshots: 'missing',

  expect: {
    /* Web-first assertions without their own timeout (was Playwright's 5 s default) */
    timeout: DEFAULT_WAIT_MS,
    toHaveScreenshot: {
      pathTemplate:
        'committed_ui_snapshots/{testFilePath}/{arg}{ext}',
    },
  },

  /* Shared settings for all projects */
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    /* click / fill / check … and page.goto / waitForURL / reload */
    actionTimeout: DEFAULT_WAIT_MS,
    navigationTimeout: DEFAULT_WAIT_MS,

    /* Base URL from .env */
    baseURL: process.env.BASE_URL,

    /* Save video for each test */
    video: 'on',

    /* Save screenshots on failure */
    screenshot: 'only-on-failure',

    /* Traces for debugging */
    trace: 'retain-on-failure',

    /* Output directory for artifacts */
    outputDir: 'test-results/',
  },

  /* Browser projects */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
    //   {
    //     name: 'firefox',
    //     use: { ...devices['Desktop Firefox'] },
    //   },
    //   {
    //     name: 'webkit',
    //     use: { ...devices['Desktop Safari'] },
    //   },
  ],

  /* Optional: run local dev server before tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
