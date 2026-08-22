import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, closeTestDb, resetDatabase } from "./support/db";
import {
  createPayrollFixture,
  createBankAccount,
  type PayrollFixture,
} from "./support/fixtures";
import { inParallel } from "./support/concurrency";

/**
 * Phase 2.9 — payroll double-payment race, against a real database.
 *
 * The sibling of the double-post race, one step later in the lifecycle.
 * `POST /payroll/pay-month` reads the period's payslips at route.ts:62 —
 * outside the transaction, which opens at line 112 — and keeps the ones
 * sitting at `PROCESSED`. The `updateMany` that moves them to `PAID`
 * (line 197) filters on `{ id: { in: [...] } }` with no status predicate.
 *
 * Two requests arriving together therefore both see the same PROCESSED
 * batch and both disburse it. What makes this worse than the posting race
 * is what gets written before the claim: the voucher, the
 * `applyLedgerEntries` call crediting bank/cash, and the
 * `BankAccount.currentBalance` decrement all happen FIRST. The money
 * moves, and only afterwards would anything notice the batch was already
 * claimed.
 *
 * So the assertion that matters is not that the payslip ends up PAID —
 * it is that cash left the business exactly once.
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

let fx: PayrollFixture;
let bank: { id: string; name: string };

/** Drive the real post-month route so the payslip reaches PROCESSED. */
async function postTheMonth() {
  const { POST } = await import(
    "@/app/api/organizations/[orgId]/payroll/post-month/route"
  );
  const res = (await POST(
    new Request(
      `http://localhost/api/organizations/${fx.organizationId}/payroll/post-month`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month: fx.month, year: fx.year }),
      }
    ) as never,
    { params: Promise.resolve({ orgId: fx.organizationId }) } as never
  )) as Response;
  if (res.status !== 201) {
    throw new Error(`fixture setup: post-month returned ${res.status}`);
  }
}

async function callPayMonth() {
  const { POST } = await import(
    "@/app/api/organizations/[orgId]/payroll/pay-month/route"
  );
  return (await POST(
    new Request(
      `http://localhost/api/organizations/${fx.organizationId}/payroll/pay-month`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          month: fx.month,
          year: fx.year,
          bankAccountId: bank.id,
          paidAt: `${fx.year}-0${fx.month}-28`,
        }),
      }
    ) as never,
    { params: Promise.resolve({ orgId: fx.organizationId }) } as never
  )) as Response;
}

/** Net pay for the single fixture employee. */
const NET = "41000";

beforeEach(async () => {
  await resetDatabase(db);
  fx = await createPayrollFixture(db);
  (globalThis as Record<string, unknown>).__TEST_USER_ID__ = fx.userId;
  bank = await createBankAccount(db, fx.organizationId);
  await postTheMonth();

  // Pre-create the bank ledger, which is the steady state for any
  // organization that has paid before.
  //
  // Without this the race hides: on the very first payment both requests
  // race to CREATE the bank ledger, and `Ledger(organizationId, name)`
  // is unique, so one transaction dies on the constraint and the month looks
  // protected. That protection is incidental — it comes from a ledger
  // that does not exist yet, not from any check on the payslips — and it
  // evaporates the moment the ledger is there. Every payment after the
  // first runs unguarded.
  const cashBank = await db.ledgerGroup.findFirstOrThrow({
    where: { organizationId: fx.organizationId, name: "Cash & Bank" },
    select: { id: true },
  });
  await db.ledger.create({
    data: {
      organizationId: fx.organizationId,
      groupId: cashBank.id,
      bankAccountId: bank.id,
      name: bank.name,
    },
  });
});

afterAll(async () => {
  await closeTestDb();
});

describe("payroll pay-month — sequential behaviour (baseline)", () => {
  it("pays the month once and refuses a second attempt", async () => {
    const first = await callPayMonth();
    expect(first.status).toBe(201);

    const second = await callPayMonth();
    expect(second.status).toBe(409);

    const payslip = await db.payslip.findUniqueOrThrow({
      where: { id: fx.payslipId },
      select: { status: true },
    });
    expect(payslip.status).toBe("PAID");
  });
});

describe("payroll pay-month — concurrent requests", () => {
  it("disburses the month exactly once when two requests race", async () => {
    const results = await inParallel(2, () => callPayMonth());
    const responses = results
      .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled")
      .map((r) => r.value);

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status !== 201)).toHaveLength(1);
  });

  it("credits the bank ledger exactly once", async () => {
    await inParallel(2, () => callPayMonth());

    // Cr Bank for the net pay. Bank sits under "Cash & Bank" (ASSETS), so
    // applyLedgerEntries records a credit as a negative movement.
    const bankLedger = await db.ledger.findFirst({
      where: { organizationId: fx.organizationId, bankAccountId: bank.id },
      select: { currentBalance: true },
    });
    expect(
      bankLedger?.currentBalance.toString(),
      "paying one month twice would double the credit to bank"
    ).toBe(`-${NET}`);
  });

  it("debits Salaries Payable exactly once", async () => {
    await inParallel(2, () => callPayMonth());

    // post-month credited Salaries Payable 41000; pay-month debits it back
    // to zero. A second disbursement would push it negative.
    const payable = await db.ledger.findFirst({
      where: { organizationId: fx.organizationId, name: "Salaries Payable" },
      select: { currentBalance: true },
    });
    expect(payable?.currentBalance.toString()).toBe("0");
  });

  it("decrements the bank account balance exactly once", async () => {
    const before = await db.bankAccount.findUniqueOrThrow({
      where: { id: bank.id },
      select: { currentBalance: true },
    });

    await inParallel(2, () => callPayMonth());

    const after = await db.bankAccount.findUniqueOrThrow({
      where: { id: bank.id },
      select: { currentBalance: true },
    });
    const moved = Number(before.currentBalance) - Number(after.currentBalance);
    expect(moved, "cash must leave the business exactly once").toBe(Number(NET));
  });

  it("produces exactly one payment voucher for the disbursement", async () => {
    await inParallel(2, () => callPayMonth());

    const payouts = await db.voucher.findMany({
      where: {
        organizationId: fx.organizationId,
        voucherNumber: { startsWith: "PAY-OUT" },
      },
      select: { id: true },
    });
    expect(payouts).toHaveLength(1);
  });
});
