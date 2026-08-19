import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, closeTestDb, resetDatabase } from "./support/db";
import { createPayrollFixture, type PayrollFixture } from "./support/fixtures";
import { inParallel } from "./support/concurrency";

/**
 * Phase 2.8 — payroll double-post race, reproduced against a real database.
 *
 * The finding, carried as LIKELY since Phase 1 because a pure-function
 * test cannot demonstrate it:
 *
 *   `POST /payroll/post-month` reads its eligible payslips with
 *   `prisma.payslip.findMany({ where: { voucherId: null, ... } })` at
 *   route.ts:62 — OUTSIDE the transaction, which does not open until
 *   line 130. The `updateMany` that stamps `voucherId` (line 217) filters
 *   on `{ id: { in: [...] } }` alone, with no `voucherId: null` re-check.
 *
 * So two requests arriving together both see the same unposted payslips,
 * both build the same journal, and both post it. `Payslip.voucherId` has
 * no unique constraint — it cannot have one, since many payslips share a
 * voucher — so nothing at the database level prevents the second write.
 * The month's salary expense lands in the ledger twice while only one
 * voucher remains reachable from the payslips.
 *
 * Auth is the only thing stubbed: `withOrgAuth` needs a session and a
 * role, neither of which is what this test is about. Everything below it
 * — Prisma, the transaction, the ledger writes — is real.
 */

vi.mock("@/backend/utils/with-org-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    withOrgAuth:
      (handler: (req: unknown, ctx: unknown) => unknown) =>
      (req: unknown, ctx: { params: Promise<{ orgId: string }> }) =>
        ctx.params.then((p) =>
          handler(req, {
            orgId: p.orgId,
            userId: (globalThis as Record<string, unknown>).__TEST_USER_ID__,
            orgUser: { role: { permissions: [{ module: "*", actions: ["*"] }] } },
          })
        ),
    hasPermission: () => true,
    badRequest: (m: string, d?: unknown) =>
      NextResponse.json({ error: m, details: d }, { status: 400 }),
    forbidden: (m = "Forbidden") => NextResponse.json({ error: m }, { status: 403 }),
    notFound: (m = "Not found") => NextResponse.json({ error: m }, { status: 404 }),
  };
});

const db = testDb();

function postMonthRequest(fx: PayrollFixture) {
  return new Request(
    `http://localhost/api/organizations/${fx.organizationId}/payroll/post-month`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month: fx.month, year: fx.year }),
    }
  );
}

async function callPostMonth(fx: PayrollFixture) {
  const { POST } = await import(
    "@/app/api/organizations/[orgId]/payroll/post-month/route"
  );
  return (await POST(
    postMonthRequest(fx) as never,
    { params: Promise.resolve({ orgId: fx.organizationId }) } as never
  )) as Response;
}

let fx: PayrollFixture;

beforeEach(async () => {
  await resetDatabase(db);
  fx = await createPayrollFixture(db);
  (globalThis as Record<string, unknown>).__TEST_USER_ID__ = fx.userId;
});

afterAll(async () => {
  await closeTestDb();
});

describe("payroll post-month — sequential behaviour (baseline)", () => {
  it("posts the month once and refuses a second attempt", async () => {
    const first = await callPostMonth(fx);
    expect(first.status).toBe(201);

    // The second call finds nothing eligible, because the first stamped
    // voucherId. This is the guard that works today — it only holds when
    // the calls do not overlap.
    const second = await callPostMonth(fx);
    expect(second.status).toBe(409);

    const vouchers = await db.voucher.count({
      where: { organizationId: fx.organizationId },
    });
    expect(vouchers).toBe(1);
  });
});

describe("payroll post-month — concurrent requests", () => {
  it("posts the month exactly once when two requests race", async () => {
    // Both requests are issued together, so both reach the eligibility
    // read before either commits.
    const results = await inParallel(2, () => callPostMonth(fx));

    const responses = results
      .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled")
      .map((r) => r.value);

    const created = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status !== 201);

    // Exactly one request may post the month. The other must be turned
    // away — whether as 409 or a transactional failure is an
    // implementation detail; posting twice is not.
    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const vouchers = await db.voucher.count({
      where: { organizationId: fx.organizationId },
    });
    expect(vouchers, "the payroll month must produce exactly one voucher").toBe(1);
  });

  it("books the month's salary expense exactly once in the ledger", async () => {
    await inParallel(2, () => callPostMonth(fx));

    // The ledger is where a double post actually hurts: the expense is
    // real money in the P&L, whatever the payslip rows end up pointing at.
    const wages = await db.ledger.findFirst({
      where: { organizationId: fx.organizationId, name: "Salaries & Wages" },
      select: { currentBalance: true },
    });

    // gross 50000, no LOP -> exactly one month of wage expense.
    expect(wages?.currentBalance.toString()).toBe("50000");
  });

  it("leaves every payslip pointing at the voucher that posted it", async () => {
    await inParallel(2, () => callPostMonth(fx));

    const payslip = await db.payslip.findUniqueOrThrow({
      where: { id: fx.payslipId },
      select: { voucherId: true, status: true },
    });
    expect(payslip.voucherId).not.toBeNull();
    expect(payslip.status).toBe("PROCESSED");

    // The voucher the payslip names must exist and be the only one.
    const vouchers = await db.voucher.findMany({
      where: { organizationId: fx.organizationId },
      select: { id: true },
    });
    expect(vouchers.map((v) => v.id)).toContain(payslip.voucherId);
    expect(vouchers).toHaveLength(1);
  });
});
