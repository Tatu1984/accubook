/**
 * Vitest globalSetup for the integration suite.
 *
 * Runs once, before any test module is imported. Two jobs:
 *
 *   1. Refuse to start unless the target is provably the dedicated test
 *      database. This must happen here rather than in a test file:
 *      `src/backend/database/client.ts` builds its connection pool at
 *      module scope from `env.DATABASE_URL`, so the database is chosen
 *      the moment application code is first imported.
 *
 *   2. Repoint `DATABASE_URL` at the test database for the duration of
 *      the run. Application modules read that variable and cannot be
 *      told to use a different one, so the environment is the only
 *      seam — and overwriting it here, after the guard has passed, is
 *      what lets routes and services be exercised for real without the
 *      application's own configuration being modified.
 */
import { assertSafeTestDatabase } from "./guard";

export async function setup(): Promise<void> {
  const testUrl = assertSafeTestDatabase();

  // Preserve the real application URL before overwriting it. The guard's
  // "is this the app's own database?" check compares against DATABASE_URL,
  // and once that variable has been repointed at the test database the two
  // legitimately match — so a later re-validation would report a collision
  // that does not exist. Keeping the original under a separate name lets
  // the check keep working for the rest of the run.
  if (process.env.DATABASE_URL) {
    process.env.ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
  }

  // Point the application's config at the test database. The guard above
  // has already established this is not the dev/production database.
  process.env.DATABASE_URL = testUrl;

  // The app's env schema requires these; integration runs are headless and
  // have no real secrets, so supply inert values rather than obliging every
  // developer to keep auth config in their shell.
  process.env.AUTH_SECRET ??= "integration_test_secret_at_least_32_chars_x";
  // NODE_ENV is typed readonly, so assign through the index signature.
  if (!process.env.NODE_ENV) {
    (process.env as Record<string, string>).NODE_ENV = "test";
  }
}

export async function teardown(): Promise<void> {
  // Connections are closed per-file by `closeTestDb()`; nothing global to
  // release. Kept explicit so the contract is visible.
}
