import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the accubook smoke audit.
 *
 * Targets production by default (the live deployment hits real DB + Vercel
 * runtime, which is the most honest end-to-end check). Override via
 * `PLAYWRIGHT_BASE_URL=http://localhost:3000` for local runs.
 *
 * Tests live in `tests/playwright/`. Vitest unit tests live elsewhere
 * (under `src/**\/__tests__/`) so the two runners do not collide.
 */
export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ["list"],
    ["html", { outputFolder: "tests/playwright/report", open: "never" }],
    ["json", { outputFile: "tests/playwright/report/results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://accubook.tensparrows.com",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
