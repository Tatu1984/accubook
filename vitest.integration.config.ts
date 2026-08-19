import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration-test config — DB-backed, run separately from the unit suite.
 *
 * `vitest.config.ts` stays exactly as it was: `npm test` remains fast and
 * requires no database. These tests need a live PostgreSQL and are opted
 * into explicitly via `npm run test:integration`.
 *
 * `fileParallelism: false` matters. Every test truncates the whole schema between
 * cases, so two files running in parallel would delete each other's
 * fixtures. Concurrency here is created deliberately *inside* a test via
 * the `interleave` helper, never by running test files side by side.
 *
 * CI: this suite is not wired into .github/workflows/ci.yml, which has no
 * database. To enable it, give the job a Postgres service and export
 * TEST_DATABASE_URL, e.g.
 *
 *   services:
 *     postgres:
 *       image: postgres:18
 *       env:
 *         POSTGRES_PASSWORD: password
 *       ports: ["5432:5432"]
 *       options: >-
 *         --health-cmd pg_isready --health-interval 10s
 *         --health-timeout 5s --health-retries 5
 *
 *   - run: npm run test:integration:setup
 *   - run: npm run test:integration
 *     env:
 *       TEST_DATABASE_URL: postgresql://postgres:password@localhost:5432/accubook_test?schema=public
 *
 * Left as documentation rather than an edit to the workflow: turning it on
 * changes CI runtime and cost, which is a call for whoever owns the pipeline.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/src/generated/**"],
    globalSetup: ["tests/integration/support/global-setup.ts"],
    // Real transactions against a real server; the unit suite's implicit
    // 5s is too tight once a test deliberately parks a transaction.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One file at a time (Vitest 4 spelling of the old singleThread).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
