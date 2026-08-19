/**
 * Vitest globalSetup for the integration suite.
 *
 * Runs once, before any test module is imported, and refuses to start
 * unless `DATABASE_URL` is provably the dedicated test database.
 *
 * The timing is the whole point. `src/backend/database/client.ts` builds
 * its connection pool at module scope from `env.DATABASE_URL`, so the
 * database is chosen the moment application code is first imported — a
 * check inside a test file would run after the connection was already
 * open against whatever `.env` happened to name.
 *
 * The suite reads the same `DATABASE_URL` the application does, so the
 * developer switches databases by editing that one line in `.env`. That
 * is convenient but unforgiving: leaving it pointed at the development
 * database and running the suite would truncate real books. The guard is
 * what makes the arrangement safe, so nothing here may proceed past it.
 */
import { assertSafeTestDatabase } from "./guard";

export async function setup(): Promise<void> {
  // Throws unless DATABASE_URL names a local PostgreSQL database called
  // exactly `accubook_test`. No repointing happens afterwards: the
  // variable already is the target, which is the simplification this
  // arrangement buys.
  assertSafeTestDatabase();

  // The app's env schema requires these; integration runs are headless and
  // have no real secrets, so supply inert values rather than obliging every
  // developer to keep auth config in their shell.
  process.env.AUTH_SECRET ??= "integration_test_secret_at_least_32_chars_x";

  // `.env` carries `NEXTAUTH_SECRET="${AUTH_SECRET}"`. Next expands that
  // reference when it loads the file; dotenv does not, so the variable
  // arrives here as the literal 14-character string "${AUTH_SECRET}" and
  // fails the app's `min(32)` check before a single test runs. Resolve the
  // reference rather than editing .env, where the interpolation is correct
  // for the application itself.
  if (process.env.NEXTAUTH_SECRET === "${AUTH_SECRET}") {
    process.env.NEXTAUTH_SECRET = process.env.AUTH_SECRET;
  }
  // NODE_ENV is typed readonly, so assign through the index signature.
  if (!process.env.NODE_ENV) {
    (process.env as Record<string, string>).NODE_ENV = "test";
  }
}

export async function teardown(): Promise<void> {
  // Connections are closed per-file by `closeTestDb()`; nothing global to
  // release. Kept explicit so the contract is visible.
}
