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
    // Neon suspends idle serverless compute; the first connection after an
    // idle period cold-starts it and the TCP/TLS handshake can be slow or
    // fail transiently (ETIMEDOUT). Give the initial connect generous
    // headroom so a wake-up doesn't fail the request. Pair with withDbRetry
    // (below) for the cases that still exceed this.
    connectionTimeoutMillis: 15_000,
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

/**
 * Retry a DB operation on transient connection errors.
 *
 * Neon's serverless compute auto-suspends when idle; the first query after
 * a suspend can fail the TCP/TLS handshake (ETIMEDOUT/ECONNRESET) or arrive
 * before the compute has fully woken. These are transient — a short retry
 * with backoff lets the wake-up complete instead of surfacing a hard 500 to
 * the caller. Non-connection errors (validation, constraint, etc.) are
 * rethrown immediately so real bugs are never masked or retried.
 *
 * Use for read-mostly / idempotent queries (the withOrgAuth membership
 * check, auth lookup, health probe). Do NOT wrap non-idempotent
 * multi-statement work that isn't already inside a $transaction — retrying a
 * partially-applied write is unsafe.
 */
const TRANSIENT_DB_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "P1001", // Prisma: can't reach database server
  "P1017", // Prisma: server closed the connection
]);

function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && TRANSIENT_DB_ERRORS.has(code);
}

export async function withDbRetry<T>(
  op: () => Promise<T>,
  { retries = 2, baseDelayMs = 300 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransientDbError(err)) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

export default prisma;
