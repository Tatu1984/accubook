/**
 * Test-scoped Prisma client and schema reset.
 *
 * Deliberately NOT the application singleton from
 * `src/backend/database/client.ts`. That client is built for serverless
 * request handling — `max: 3` connections in production — and a
 * concurrency test needs several transactions genuinely open at once. A
 * pool that small would serialise them and the test would "pass" by
 * never actually overlapping, which is worse than failing.
 *
 * It also carries `withDbRetry` semantics tuned for Neon cold starts.
 * Retrying is exactly wrong here: it can paper over the interleaving a
 * race test is trying to observe.
 */
import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { assertSafeTestDatabase } from "./guard";

let pool: Pool | null = null;
let client: PrismaClient | null = null;

/**
 * The integration client. Re-validates the guard on first use: global
 * setup already checked, but a test file could be run through a path that
 * skipped it, and the cost of checking twice is nil.
 */
export function testDb(): PrismaClient {
  if (client) return client;

  const url = assertSafeTestDatabase();

  pool = new Pool({
    connectionString: url,
    // Room for several concurrent transactions plus the coordinating
    // connection. Concurrency tests deadlock against a pool that is too
    // small, which looks like a product bug but is a harness artefact.
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ["error"],
    // Short by design. A race test that is going to hang should fail fast
    // rather than sit on the app's 20s production timeout.
    transactionOptions: { timeout: 10_000, maxWait: 5_000 },
  });

  return client;
}

/** Close pooled connections so Vitest can exit cleanly. */
export async function closeTestDb(): Promise<void> {
  if (client) await client.$disconnect();
  if (pool) await pool.end();
  client = null;
  pool = null;
}

/**
 * Empty every application table between tests.
 *
 * `TRUNCATE ... RESTART IDENTITY CASCADE` over one statement is both
 * faster than per-table deletes and immune to foreign-key ordering, which
 * matters here because the schema is deeply referential (a voucher cannot
 * be deleted before its entries, and so on).
 *
 * `_prisma_migrations` is excluded: dropping it would make the next run
 * believe the schema was never migrated.
 */
export async function resetDatabase(db: PrismaClient = testDb()): Promise<void> {
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;

  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
