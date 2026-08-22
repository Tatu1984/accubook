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

/**
 * Is this server address unreachable from the public internet?
 *
 * The question the test is really asking is "are we pointed at the remote
 * application database", and the answer for anything on a private network is
 * no. Loopback alone is too narrow: a containerised Postgres — a Docker
 * container locally, or a `services:` container in CI, which is the only
 * practical way to run this suite there — reports the container's address on a
 * private bridge network rather than 127.0.0.1, and the assertion failed on a
 * database that was never remote.
 *
 * The real gate is `guard.ts`, which will not let the suite start unless
 * DATABASE_URL provably names a local database called `accubook_test`. This is
 * the runtime confirmation of that, so it needs to be exactly as strict as the
 * question it asks: reject anything publicly routable, accept the private
 * ranges (RFC 1918), loopback, and the null a unix socket reports.
 */
function isPrivateAddress(addr: string | null): boolean {
  // A unix-socket connection has no address at all.
  if (addr === null) return true;
  if (addr === "::1" || addr.startsWith("127.")) return true;
  // RFC 1918: 10/8, 172.16/12, 192.168/16.
  if (addr.startsWith("10.") || addr.startsWith("192.168.")) return true;
  const match = /^172\.(\d{1,2})\./.exec(addr);
  if (match) {
    const secondOctet = Number(match[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  // IPv6 unique-local (fc00::/7), which Docker can hand out too.
  if (/^f[cd]/i.test(addr)) return true;
  return false;
}

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
    expect(isPrivateAddress(addr)).toBe(true);
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
