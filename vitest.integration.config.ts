// Load .env before anything reads process.env. Vitest does not read it on
// its own, and `prisma.config.ts` already pulls it in the same way.
import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration-test config — DB-backed, run separately from the unit suite.
 *
 * `vitest.config.ts` stays exactly as it was: `npm test` remains fast and
 * requires no database. These tests need a live PostgreSQL and are opted into
 * explicitly via `npm run test:integration`.
 *
 * `fileParallelism: false` matters. Every test truncates the whole schema
 * between cases, so two files running in parallel would delete each other's
 * fixtures. Concurrency here is created deliberately *inside* a test via the
 * `interleave` helper, never by running test files side by side.
 *
 * DATABASE SELECTION, and why there are two variables after all:
 *
 * The suite reads the same `DATABASE_URL` the application does. That is the
 * simplification the safety guard in `support/guard.ts` is built around — it
 * refuses to start unless that variable provably names a local database called
 * `accubook_test`, so a stale `.env` cannot quietly truncate real books.
 *
 * `TEST_DATABASE_URL` is an *optional* override applied here, before the guard
 * runs. It exists because the alternative — editing the one line in `.env` that
 * aims the live application at production, then remembering to put it back — is
 * a manual step whose second half is exactly what gets forgotten. CI sets the
 * override rather than rewriting `.env`.
 *
 * The override weakens nothing: whatever it resolves to still goes through the
 * same allow-list check. It only removes the need to touch the file that points
 * at production.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/src/generated/**"],
    // Runs the safety guard before any application module is imported, which
    // is the only point at which the database choice can still be refused.
    globalSetup: ["tests/integration/support/global-setup.ts"],
    // A clean schema in front of every test. Files that manage their own
    // fixtures call `resetDatabase()` themselves as well; truncating twice is
    // harmless, and having the default here means a new test file cannot
    // silently inherit the previous file's rows.
    setupFiles: ["tests/integration/setup.ts"],
    // Real transactions against a real server; the unit suite's implicit 5s is
    // too tight once a test deliberately parks a transaction.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One file at a time (Vitest 4 spelling of the old singleThread).
    fileParallelism: false,
    env: {
      // Cron routes authorise on this alone, so the suite needs it set to be
      // able to exercise the authorised path at all.
      CRON_SECRET: "integration_cron_secret_at_least_32_chars_x",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
