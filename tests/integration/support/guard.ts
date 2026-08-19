/**
 * Hard safety gate for the DB-backed integration suite.
 *
 * Integration tests truncate every table between cases. Pointing them at
 * the development or production database would therefore destroy real
 * books, so this refuses to let the suite start unless the configured
 * database can be positively identified as the dedicated test database.
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
        `Set TEST_DATABASE_URL, e.g.\n` +
        `  TEST_DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/${REQUIRED_TEST_DB}?schema=public"\n`
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

/** Host:port identity, used to compare two URLs for "same server". */
function serverIdentity(u: URL): string {
  const port = u.port || "5432";
  return `${u.hostname.toLowerCase()}:${port}`;
}

/**
 * Validate the configured test database, returning the URL to use.
 *
 * Every branch throws rather than warning: a test run that silently falls
 * back to another database is precisely the failure this guards against.
 */
export type EnvLike = Record<string, string | undefined>;

export function assertSafeTestDatabase(env: EnvLike = process.env): string {
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl || testUrl.trim() === "") {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL is not set.");
  }

  const test = parse(testUrl, "TEST_DATABASE_URL");

  if (test.protocol !== "postgresql:" && test.protocol !== "postgres:") {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL must be a postgresql:// URL (got "${test.protocol}").`
    );
  }

  // 1. Positive identification: the database must carry the reserved name.
  const dbName = databaseName(test);
  if (dbName !== REQUIRED_TEST_DB) {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL points at database "${dbName || "(none)"}", not "${REQUIRED_TEST_DB}".`
    );
  }

  // 2. Local only. A remote host is either production or somebody else's
  //    data; neither is an acceptable target for a suite that truncates.
  const host = test.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal) {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL host "${test.hostname}" is not local. ` +
        `Integration tests may only run against a local PostgreSQL server.`
    );
  }

  // 3. Never the application's own database, even if it somehow satisfied
  //    the checks above. Compared on (server, database) rather than on the
  //    raw string, so differing credentials or query parameters cannot
  //    disguise the same physical target.
  //
  //    Global setup repoints DATABASE_URL at the validated test database so
  //    application modules connect there, which means that by the time a
  //    worker re-validates, DATABASE_URL legitimately *is* the test URL.
  //    Treat that specific case as already-checked rather than a collision;
  //    anything else still has to differ.
  const appUrl = env.ORIGINAL_DATABASE_URL ?? env.DATABASE_URL;
  const appIsTheValidatedTestDb =
    !env.ORIGINAL_DATABASE_URL && appUrl?.trim() === testUrl.trim();
  if (appUrl && appUrl.trim() !== "" && !appIsTheValidatedTestDb) {
    let app: URL | null = null;
    try {
      app = new URL(appUrl);
    } catch {
      // A malformed application URL cannot collide with anything; the app's
      // own env validation is responsible for reporting it.
    }
    if (
      app &&
      serverIdentity(app) === serverIdentity(test) &&
      databaseName(app) === dbName
    ) {
      throw new UnsafeTestDatabaseError(
        `TEST_DATABASE_URL resolves to the same database as DATABASE_URL ` +
          `(${serverIdentity(test)}/${dbName}).`
      );
    }
  }

  return testUrl;
}
