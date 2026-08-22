import { execSync } from "node:child_process";

/**
 * Brings the test database up to the current migration state once per run.
 *
 * `migrate deploy` rather than `db push`, so the suite exercises the same
 * migration chain production does — a migration that is missing, misordered or
 * broken fails here rather than on deploy day.
 */
export default function globalSetup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:55432/accubook_test";

  if (/neon\.tech|amazonaws|\.rds\./i.test(url)) {
    throw new Error(
      `Refusing to run integration tests against what looks like a hosted database: ${url.replace(/:[^:@]*@/, ":***@")}`
    );
  }

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: Buffer }).stderr)
        : String(error);
    throw new Error(
      `Could not migrate the test database.\n` +
        `Expected Postgres at ${url.replace(/:[^:@]*@/, ":***@")}\n` +
        `Start one with:\n` +
        `  docker run -d --name accubook-test-db -e POSTGRES_PASSWORD=postgres \\\n` +
        `    -e POSTGRES_DB=accubook_test -p 55432:5432 postgres:16-alpine\n\n` +
        detail
    );
  }
}
