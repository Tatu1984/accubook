/**
 * Hard safety gate for the DB-backed integration suite.
 *
 * Integration tests truncate every table between cases. Pointing them at
 * the development or production database would therefore destroy real
 * books, so this refuses to let the suite start unless `DATABASE_URL` can
 * be positively identified as the dedicated test database.
 *
 * There is deliberately only one database variable. The suite reads the
 * same `DATABASE_URL` the application does, so the developer switches
 * databases by editing that one line in `.env` — and the checks below are
 * what make that safe. A second variable would let the two drift, and the
 * interesting failure is not "the test URL is wrong" but "the suite ran
 * against whatever the app was pointed at".
 *
 * The check is deliberately allow-list shaped: a URL has to prove it is
 * the test database, rather than merely failing to look like production.
 * A deny-list ("not neon", "not the prod host") silently admits anything
 * nobody thought to ban — including the other local databases on this
 * machine, several of which belong to unrelated projects.
 *
 * This runs from Vitest's `globalSetup`, before any test module loads.
 * That timing is not incidental: `src/backend/database/client.ts` builds
 * its pool from `env.DATABASE_URL` at module scope, so by the time a test
 * file imports anything from the application the connection is already
 * decided. Checking inside a test would be too late to prevent the
 * connection being opened against the wrong database.
 */

/** The only database name the integration suite is permitted to touch. */
export const REQUIRED_TEST_DB = "accubook_test";

export class UnsafeTestDatabaseError extends Error {
  constructor(reason: string) {
    super(
      `Refusing to run integration tests: ${reason}\n\n` +
        `These tests TRUNCATE every table. They may only run against a ` +
        `dedicated local database named "${REQUIRED_TEST_DB}".\n\n` +
        `Point DATABASE_URL at it in .env, e.g.\n` +
        `  DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/${REQUIRED_TEST_DB}?schema=public"\n\n` +
        `Remember to switch it back to the development database afterwards.\n`
    );
    this.name = "UnsafeTestDatabaseError";
  }
}

/** Parse a Postgres URL, or fail with a readable reason. */
function parse(url: string, label: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new UnsafeTestDatabaseError(`${label} is not a valid URL.`);
  }
}

/** The database name is the URL path minus its leading slash. */
function databaseName(u: URL): string {
  return decodeURIComponent(u.pathname.replace(/^\//, ""));
}


/**
 * Validate the configured test database, returning the URL to use.
 *
 * Every branch throws rather than warning: a test run that silently falls
 * back to another database is precisely the failure this guards against.
 */
export type EnvLike = Record<string, string | undefined>;

export function assertSafeTestDatabase(env: EnvLike = process.env): string {
  const url = env.DATABASE_URL;
  if (!url || url.trim() === "") {
    throw new UnsafeTestDatabaseError("DATABASE_URL is not set.");
  }

  const target = parse(url, "DATABASE_URL");

  if (target.protocol !== "postgresql:" && target.protocol !== "postgres:") {
    throw new UnsafeTestDatabaseError(
      `DATABASE_URL must be a postgresql:// URL (got "${target.protocol}").`
    );
  }

  // 1. Positive identification: the database must carry the reserved name.
  //    This is an allow-list, not a deny-list — a URL has to prove it is
  //    the test database rather than merely failing to look like
  //    production. Naming specific databases to exclude would silently
  //    admit anything nobody thought to ban.
  const dbName = databaseName(target);
  if (dbName !== REQUIRED_TEST_DB) {
    throw new UnsafeTestDatabaseError(
      `DATABASE_URL points at database "${dbName || "(none)"}", not "${REQUIRED_TEST_DB}". ` +
        `This is what stops the suite running against the development database ` +
        `when .env is still pointed at it.`
    );
  }

  // 2. Local only. A remote host is either production or somebody else's
  //    data; neither is an acceptable target for a suite that truncates.
  //    Independent of the name check on purpose — a remote database that
  //    happened to be called "accubook_test" is still refused.
  const host = target.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal) {
    throw new UnsafeTestDatabaseError(
      `DATABASE_URL host "${target.hostname}" is not local. ` +
        `Integration tests may only run against a local PostgreSQL server.`
    );
  }

  return url;
}
