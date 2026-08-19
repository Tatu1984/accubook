import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeTds } from "@/backend/services/tax/tds";

/**
 * Regression test for TDS over-deduction at payment time.
 *
 * Every TDS threshold is per-section: 194C is ₹1,00,000 across a year,
 * 194J ₹30,000 on a single bill, 194Q ₹50,00,000 across a year.
 * `computeTds` compares the caller's `ytdAggregate` against the threshold
 * of the section being deducted.
 *
 * The route used to build that aggregate from `payment.aggregate(...)`
 * summing every COMPLETED payment to the party with NO section filter, so
 * unrelated sections pooled into one number, thresholds tripped early, and
 * tax was withheld from a vendor before it was legally due. The aggregate
 * is now summed from `TdsDeduction`, which carries the section.
 *
 * Coverage boundary: these assert the *shape of the query the route
 * issues* and the *tax consequence of a pooled aggregate*. There is no
 * DB-backed harness in this suite, so they do not prove Postgres returns
 * the expected rows — only that the section filter is applied and that
 * omitting it over-deducts.
 */

const tdsAggregate = vi.fn();
const paymentAggregate = vi.fn();

vi.mock("@/backend/database/client", () => {
  const tx = {
    tdsDeduction: {
      aggregate: (...a: unknown[]) => tdsAggregate(...a),
      create: vi.fn().mockResolvedValue({}),
    },
    payment: {
      aggregate: (...a: unknown[]) => paymentAggregate(...a),
      create: vi.fn().mockResolvedValue({ id: "pay-1" }),
    },
    voucher: { create: vi.fn().mockResolvedValue({ id: "v-1" }) },
    voucherEntry: { createMany: vi.fn().mockResolvedValue({}) },
    bankAccount: { update: vi.fn().mockResolvedValue({}) },
    invoicePayment: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ledger: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    prisma: {
      party: { findFirst: vi.fn().mockResolvedValue({ id: "party-1", name: "Acme", type: "VENDOR" }) },
      bankAccount: { findFirst: vi.fn().mockResolvedValue({ id: "bank-1", name: "HDFC" }) },
      bill: { findFirst: vi.fn() },
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    },
  };
});

vi.mock("@/backend/utils/with-org-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    withOrgAuth: (h: (r: unknown, c: unknown) => unknown) => (r: unknown) =>
      h(r, { orgId: "org-1", userId: "user-1" }),
    badRequest: (m: string, d?: unknown) => NextResponse.json({ error: m, details: d }, { status: 400 }),
    notFound: (m = "Not found") => NextResponse.json({ error: m }, { status: 404 }),
  };
});

vi.mock("@/backend/utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/backend/utils/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/backend/utils/posting", async () => {
  const actual = await vi.importActual<typeof import("@/backend/utils/posting")>(
    "@/backend/utils/posting"
  );
  return {
    ...actual,
    getOrCreatePartyLedger: vi.fn().mockResolvedValue({ id: "led-party" }),
    getOrCreateBankLedger: vi.fn().mockResolvedValue({ id: "led-bank" }),
    getCashLedger: vi.fn().mockResolvedValue({ id: "led-cash" }),
    getTdsPayableLedger: vi.fn().mockResolvedValue({ id: "led-tds" }),
    getVoucherTypeByCode: vi.fn().mockResolvedValue({ id: "vt-1", nature: "PAYMENT" }),
    getFiscalYearForDate: vi.fn().mockResolvedValue({
      id: "fy-1",
      startDate: new Date("2025-04-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    }),
    generateVoucherNumber: vi.fn().mockResolvedValue("PAY-000001"),
    nextNumber: vi.fn().mockResolvedValue(1),
    applyLedgerEntries: vi.fn().mockResolvedValue(undefined),
    recomputeBillStatus: vi.fn().mockResolvedValue(undefined),
  };
});

function paymentRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/organizations/org-1/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ orgId: "org-1" }) };

describe("payments — TDS YTD aggregate is scoped to the section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tdsAggregate.mockResolvedValue({ _sum: { baseAmount: null } });
    paymentAggregate.mockResolvedValue({ _sum: { amount: null } });
  });

  it("filters the YTD aggregate by the section being deducted", async () => {
    const { POST } = await import("../route");
    await POST(
      paymentRequest({
        partyId: "party-1",
        date: "2025-06-10",
        amount: 50000,
        paymentMode: "BANK_TRANSFER",
        bankAccountId: "bank-1",
        tdsSection: "194C",
      }) as never,
      ctx as never
    );

    expect(tdsAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          partyId: "party-1",
          section: "194C",
        }),
        _sum: { baseAmount: true },
      })
    );
  });

  it("no longer pools every payment to the party regardless of section", async () => {
    const { POST } = await import("../route");
    await POST(
      paymentRequest({
        partyId: "party-1",
        date: "2025-06-10",
        amount: 50000,
        paymentMode: "CASH",
        tdsSection: "194C",
      }) as never,
      ctx as never
    );

    // The unscoped `payment.aggregate({_sum:{amount}})` was the defect.
    expect(paymentAggregate).not.toHaveBeenCalled();
  });

  /**
   * The tax consequence, computed directly through `computeTds` — this is
   * what the query shape above protects against, expressed in rupees.
   */
  it("a pooled cross-section aggregate over-deducts 194C; a scoped one does not", () => {
    // ₹95,000 of unrelated 194J professional fees already paid this year,
    // plus ₹40,000 of 194C contractor work. A ₹20,000 contractor payment
    // is below 194C's ₹30,000 single threshold, and 194C-to-date is
    // ₹60,000 — under the ₹1,00,000 annual ceiling. Nothing is due.
    const scoped = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "20000",
      ytdAggregate: "40000",
    });
    expect(scoped.amount.toString()).toBe("0");
    expect(scoped.appliedReason).toBe("BELOW_SINGLE_THRESHOLD");

    // Pooling the 194J fees in pushes the aggregate to ₹1,35,000, past the
    // 194C annual ceiling, and 2% is withheld on the full amount.
    const pooled = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "20000",
      ytdAggregate: "135000",
    });
    expect(pooled.amount.toString()).toBe("400");
    expect(pooled.appliedReason).toBe("DEDUCTED");
  });
});
