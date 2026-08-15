/**
 * Run database migrations during a Vercel build — but only for the
 * deployment that is allowed to.
 *
 * The build command used to be `prisma migrate deploy && …` unconditionally,
 * and preview deployments share the production `DATABASE_URL`. So pushing
 * any branch migrated the production database: that is how migrations 12
 * and 13 reached production before the pull request that introduced them
 * had been merged or reviewed. Those two happened to be additive columns,
 * so nothing broke. A migration that drops or rewrites a column would have
 * rewritten live customer books from an unmerged branch.
 *
 * Two builds racing for the same database is the other half of the problem:
 * a preview and a production build ran `migrate deploy` at the same moment,
 * contended for the Prisma advisory lock and both failed with P1002.
 *
 * Rules:
 *   - `VERCEL_ENV=production` migrates. That is the only deployment whose
 *     code is about to serve the production database.
 *   - Anything else skips, and says so, unless `ALLOW_PREVIEW_MIGRATE=true`
 *     is set — which is for once previews have a database of their own.
 *   - Outside Vercel (no VERCEL_ENV) nothing runs, so a local `next build`
 *     never touches a remote database.
 *
 * Skipping is not failing: the build continues and the preview is served.
 * A preview whose code needs a column the shared database does not have
 * will error at runtime, which is the correct trade — a broken preview is
 * recoverable, a rewritten production table is not.
 */
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
const allowPreview = process.env.ALLOW_PREVIEW_MIGRATE === "true";
const isProduction = env === "production";

if (!env) {
  console.log("[migrate-on-deploy] Not a Vercel build — skipping migrations.");
  process.exit(0);
}

if (!isProduction && !allowPreview) {
  console.log(
    `[migrate-on-deploy] VERCEL_ENV=${env}: skipping migrations.\n` +
      "  Preview deployments share DATABASE_URL with production, so migrating\n" +
      "  here would alter live data from an unmerged branch.\n" +
      "  Give previews their own database, then set ALLOW_PREVIEW_MIGRATE=true\n" +
      "  on the Preview environment to migrate it."
  );
  process.exit(0);
}

if (!isProduction && allowPreview) {
  console.log(
    `[migrate-on-deploy] VERCEL_ENV=${env} with ALLOW_PREVIEW_MIGRATE=true — ` +
      "migrating the preview database."
  );
}

console.log(`[migrate-on-deploy] VERCEL_ENV=${env}: applying migrations.`);
try {
  // Via npx so it resolves whether or not node_modules/.bin is on PATH.
  execSync("npx --no-install prisma migrate deploy", { stdio: "inherit" });
} catch {
  // Deliberately fatal. A deployment whose migrations did not apply would
  // serve code against a schema it does not match, so failing the build and
  // leaving the previous deployment in place is the safe outcome.
  console.error("[migrate-on-deploy] Migrations failed — failing the build.");
  process.exit(1);
}
