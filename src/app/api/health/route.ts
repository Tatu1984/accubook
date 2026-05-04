import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/backend/database/client";
import { env } from "@/config/env";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + DB readiness + migration-drift probe. Returns 200 only
 * when (a) DB responds AND (b) every migration in `prisma/migrations/`
 * is recorded as applied in `_prisma_migrations`. The latter catches
 * the "deploy ran but `prisma migrate deploy` was skipped" failure
 * mode where the app boots but downstream queries hit ColumnNotFound.
 *
 * Use this for Vercel monitoring, uptime checks, and load-balancer
 * health. Hosting providers should treat 503 as "do not route traffic".
 */
type MigrationRow = { migration_name: string; finished_at: Date | null };

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let migrationStatus: {
    applied: number;
    onDisk: number;
    drift: string[];
    pending: string[];
    ok: boolean;
  } | null = null;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbOk = true;

    // Compare on-disk migration directories against the
    // `_prisma_migrations` table. Drift = on disk but not applied;
    // pending = applied row exists but `finished_at IS NULL` (rolled
    // back / interrupted).
    try {
      const migrationsDir = path.join(process.cwd(), "prisma/migrations");
      const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
      const onDisk = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      const rows = (await prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        ORDER BY started_at
      `) as MigrationRow[];
      const appliedNames = new Set(
        rows.filter((r) => r.finished_at !== null).map((r) => r.migration_name)
      );
      const pendingNames = rows
        .filter((r) => r.finished_at === null)
        .map((r) => r.migration_name);

      const drift = onDisk.filter((n) => !appliedNames.has(n));

      migrationStatus = {
        applied: appliedNames.size,
        onDisk: onDisk.length,
        drift,
        pending: pendingNames,
        ok: drift.length === 0 && pendingNames.length === 0,
      };
    } catch (e) {
      logger.error({ err: e }, "Health migration-status check failed");
      migrationStatus = {
        applied: 0,
        onDisk: 0,
        drift: [],
        pending: [],
        ok: false,
      };
    }
  } catch (error) {
    logger.error({ err: error }, "Health check DB ping failed");
  }

  const overallOk = dbOk && (migrationStatus?.ok ?? false);
  const status = overallOk ? 200 : 503;
  return NextResponse.json(
    {
      ok: overallOk,
      env: env.NODE_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      version: process.env.npm_package_version ?? null,
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      migrations: migrationStatus,
      uptimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
