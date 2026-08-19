import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testDb, closeTestDb, resetDatabase } from "./support/db";
import { Gate, interleave, inParallel } from "./support/concurrency";
import { assertSafeTestDatabase, UnsafeTestDatabaseError } from "./support/guard";

/**
 * Proves the harness itself, not any application behaviour.
 *
 * Phases 2.8–2.10 will use this to demonstrate three suspected races. A
 * race test is only meaningful if the harness can genuinely hold two
 * transactions open at once — if it silently serialised them, those tests
 * would pass while proving nothing. So that capability is established
 * here, once, against the real database.
 */

const db = testDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await closeTestDb();
});

describe("integration harness — database identity", () => {
  it("is connected to the dedicated test database", async () => {
    const [{ db: name }] = await db.$queryRaw<Array<{ db: string }>>`
      SELECT current_database() AS db
    `;
    expect(name).toBe("accubook_test");
  });

  it("is connected to a local server, never the remote application database", async () => {
    const [{ addr }] = await db.$queryRaw<Array<{ addr: string | null }>>`
      SELECT inet_server_addr()::text AS addr
    `;
    // A unix-socket or loopback connection reports null or 127.0.0.1.
    expect(addr === null || addr.startsWith("127.") || addr === "::1").toBe(true);
  });

  it("has the migrated schema", async () => {
    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    expect(Number(count)).toBeGreaterThan(50);
  });
});

describe("integration harness — safety guard", () => {
  it("refuses to run when DATABASE_URL is unset", () => {
    expect(() => assertSafeTestDatabase({})).toThrow(UnsafeTestDatabaseError);
  });

  it("refuses the development database", () => {
    // The realistic accident: .env is still pointed at Neon and someone
    // runs the integration suite, which truncates every table.
    expect(() =>
      assertSafeTestDatabase({
        DATABASE_URL:
          "postgresql://neondb_owner:pw@ep-crimson-glade-a4jvhp02-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
      })
    ).toThrow(/not "accubook_test"/);
  });

  it("refuses any other local database", () => {
    // Other projects share this PostgreSQL server; none of them may be
    // truncated either.
    expect(() =>
      assertSafeTestDatabase({
        DATABASE_URL: "postgresql://postgres:pw@localhost:5432/hrms?schema=public",
      })
    ).toThrow(/not "accubook_test"/);
  });

  it("refuses a remote host even when the database name matches", () => {
    // Name alone is not sufficient: a remote "accubook_test" is somebody
    // else's server. The host check is independent of the name check.
    expect(() =>
      assertSafeTestDatabase({
        DATABASE_URL:
          "postgresql://u:p@ep-crimson-glade-a4jvhp02-pooler.us-east-1.aws.neon.tech:5432/accubook_test",
      })
    ).toThrow(/is not local/);
  });

  it("refuses a non-postgres URL", () => {
    expect(() =>
      assertSafeTestDatabase({
        DATABASE_URL: "mysql://root:pw@localhost:3306/accubook_test",
      })
    ).toThrow(/must be a postgresql/);
  });

  it("accepts the local test database", () => {
    expect(
      assertSafeTestDatabase({
        DATABASE_URL: "postgresql://postgres:pw@localhost:5432/accubook_test?schema=public",
      })
    ).toContain("accubook_test");
  });
});

describe("integration harness — reset between tests", () => {
  it("starts empty and can write", async () => {
    expect(await db.currency.count()).toBe(0);
    await db.currency.create({
      data: { code: "INR", name: "Indian Rupee", symbol: "₹" },
    });
    expect(await db.currency.count()).toBe(1);
  });

  it("the previous test's row is gone", async () => {
    // Proves resetDatabase actually truncated, rather than the first test
    // happening to run in isolation.
    expect(await db.currency.count()).toBe(0);
  });
});

describe("integration harness — real concurrent transactions", () => {
  it("holds two transactions open simultaneously", async () => {
    // Each transaction reports its own backend PID and confirms the other
    // is still live. Two distinct, concurrently-active backends is the
    // capability every race test in 2.8-2.10 depends on.
    const aReady = new Gate("aReady");
    const bReady = new Gate("bReady");
    let pidA = 0;
    let pidB = 0;

    const txA = db.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS pid
      `;
      pidA = pid;
      aReady.open();
      await bReady.wait();          // still inside A's transaction
      return pid;
    });

    const txB = db.$transaction(async (tx) => {
      await aReady.wait();          // A is open and parked
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS pid
      `;
      pidB = pid;
      // Ask the server whether A's backend is genuinely still running.
      const [{ live }] = await tx.$queryRaw<Array<{ live: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE pid = ${pidA}
        ) AS live
      `;
      bReady.open();
      return live;
    });

    const [a, bOverlapped] = await Promise.all([txA, txB]);

    expect(a).toBe(pidA);
    expect(pidB).not.toBe(pidA);   // genuinely separate connections
    expect(bOverlapped).toBe(true); // A was still open while B ran
  });

  it("interleave() imposes read-A / run-B / commit-A ordering", async () => {
    // The exact shape of the suspected races: both sides read the same
    // pre-state, then both write.
    const observed: string[] = [];

    const result = await interleave(
      async ({ readsDone, mayCommit }) => {
        observed.push("A:read");
        readsDone.open();
        await mayCommit.wait();
        observed.push("A:write");
        return "A";
      },
      async () => {
        observed.push("B:ran");
        return "B";
      }
    );

    expect(observed).toEqual(["A:read", "B:ran", "A:write"]);
    expect(result.first.status).toBe("fulfilled");
    expect(result.second.status).toBe("fulfilled");
  });

  it("inParallel() runs concurrent writes and reports each outcome", async () => {
    // A unique constraint is the simplest way to prove the writes really
    // contended: exactly one insert of a duplicate code can succeed.
    const results = await inParallel(4, (i) =>
      db.currency.create({
        data: { code: "DUP", name: `Attempt ${i}`, symbol: "$" },
      })
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(3);
    expect(await db.currency.count()).toBe(1);
  });
});
