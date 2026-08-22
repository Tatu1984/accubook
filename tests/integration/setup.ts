import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/backend/database/client";

/**
 * A clean database in front of every test.
 *
 * TRUNCATE ... CASCADE over every table rather than deleting per-model in
 * dependency order: it is one statement, it does not care about foreign-key
 * ordering, and it cannot silently leave rows behind when a new model is added
 * to the schema and nobody remembers to add it to a cleanup list.
 *
 * `_prisma_migrations` is excluded — wiping it would make the migration state
 * unknown and force a re-deploy before every test.
 */

let cachedTables: string[] | null = null;

async function tableNames(): Promise<string[]> {
  if (cachedTables) return cachedTables;
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  cachedTables = rows.map((r) => `"public"."${r.tablename}"`);
  return cachedTables;
}

export async function resetDatabase(): Promise<void> {
  const tables = await tableNames();
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`
  );
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
