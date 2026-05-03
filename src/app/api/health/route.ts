import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { env } from "@/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + DB readiness probe. Returns 200 only when the DB responds.
 * Use this for Vercel monitoring, uptime checks, and load-balancer health.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbOk = true;
  } catch (error) {
     
    console.error("Health check DB ping failed:", error);
  }

  const status = dbOk ? 200 : 503;
  return NextResponse.json(
    {
      ok: dbOk,
      env: env.NODE_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      version: process.env.npm_package_version ?? null,
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      uptimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
