/**
 * Create (or recreate) the local integration-test database and apply the
 * migrations to it.
 *
 *   npm run test:integration:setup
 *
 * Split out from the test run itself so the suite stays fast: migrations
 * only need reapplying when the schema changes, not on every run. The
 * tests truncate between cases, so a migrated database stays reusable.
 *
 * Safety: the database name is fixed at `accubook_test` and the server
 * must be local. This script drops and recreates that database, so it
 * deliberately offers no way to aim it somewhere else — a `--db` flag
 * here would be the exact footgun the harness guard exists to prevent.
 * `DATABASE_URL` is never read.
 */
import { execFileSync } from "node:child_process";

const DB = "accubook_test";
const HOST = process.env.TEST_PGHOST || "localhost";
const PORT = process.env.TEST_PGPORT || "5432";
const USER = process.env.TEST_PGUSER || "postgres";
const PASSWORD = process.env.TEST_PGPASSWORD || "password";

const url = (db) =>
  `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${HOST}:${PORT}/${db}?schema=public`;

const psql = (db, sql) =>
  execFileSync("psql", ["-h", HOST, "-p", PORT, "-U", USER, "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: { ...process.env, PGPASSWORD: PASSWORD }, stdio: "pipe" }).toString().trim();

if (HOST !== "localhost" && HOST !== "127.0.0.1") {
  console.error(`Refusing to run: TEST_PGHOST "${HOST}" is not local.`);
  process.exit(1);
}

console.log(`Recreating ${DB} on ${HOST}:${PORT} …`);
try {
  // Terminate stragglers so DROP cannot fail on an open connection.
  psql("postgres", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();`);
  psql("postgres", `DROP DATABASE IF EXISTS ${DB};`);
  psql("postgres", `CREATE DATABASE ${DB};`);
} catch (err) {
  console.error("Could not prepare the database. Is PostgreSQL running?");
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}

console.log("Applying migrations …");
try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url(DB) },
    stdio: "inherit",
  });
} catch {
  console.error("prisma migrate deploy failed.");
  process.exit(1);
}

console.log(`\nReady. Run the suite with:\n  TEST_DATABASE_URL="${url(DB)}" npm run test:integration\n`);
