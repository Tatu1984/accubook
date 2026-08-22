import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests — real Postgres, real Prisma, no mocks.
 *
 * Separate from `vitest.config.ts` so the fast unit suite stays runnable with
 * no infrastructure, while these exercise the behaviour that only a database
 * can prove: transaction boundaries, unique-constraint races, cascading
 * writes, and cross-tenant scoping that a mocked client will happily fake.
 *
 * `DATABASE_URL` is pinned to `TEST_DATABASE_URL` before any app module loads,
 * because `src/config/env.ts` validates and freezes it at import time and
 * `src/backend/database/client.ts` opens its pool from it. Without this the
 * suite would connect to whatever `.env` points at — which is production.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:55432/accubook_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/src/generated/**"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Each file owns the whole database — they truncate between tests, so
    // running two files at once would have them clearing each other's rows.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      NODE_ENV: "test",
      AUTH_SECRET: "integration_test_secret_at_least_32_chars_long",
      NEXTAUTH_URL: "http://localhost:3000",
      // Cron routes authorise on this alone; the suite needs it set to be able
      // to exercise the authorised path at all.
      CRON_SECRET: "integration_cron_secret_at_least_32_chars_x",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
