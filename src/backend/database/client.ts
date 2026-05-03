import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/config/env";

/**
 * Prisma client + pg pool. Singleton across hot reloads in dev; one instance
 * per lambda in production.
 *
 * Pool sizing: in Vercel's serverless model each lambda is short-lived, so
 * holding many connections per instance is wasteful. We cap at 3 — small
 * enough that 100 concurrent lambdas only use ~300 connections, well within
 * Neon's pooler limits, and large enough for the small bursts of parallel
 * queries inside a single request (Promise.all-style).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.isProduction ? 3 : 10,
    idleTimeoutMillis: env.isProduction ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.isDevelopment ? ["query", "error", "warn"] : ["error"],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export default prisma;
