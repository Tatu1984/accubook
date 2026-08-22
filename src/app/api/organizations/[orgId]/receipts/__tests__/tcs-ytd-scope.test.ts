import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeTds } from "@/backend/services/tax/tds";

/**
 * Regression test for TCS over-collection at receipt time.
 *
 * The mirror of the payment-side defect. 206C(1H) is ₹50,00,000 of
 * receipts from a buyer across a year; 206C(1F) is a ₹10,00,000 single
 * sale. The route built its YTD aggregate from `receipt.aggregate(...)`
 * over every COMPLETED receipt from the party with no section filter, so
 * ordinary trade receipts and a vehicle sale pooled into one number.
 *
 * TCS is added ON TOP of the amount, so an inflated aggregate over-charges
 * the buyer rather than under-paying them. The aggregate is now summed
 * from `TcsCollection`, which carries the section.
 *
 * Same coverage boundary as the payments test: query shape plus the tax
 * consequence, not a database round-trip.
 */

const tcsAggregate = vi.fn();
const receiptAggregate = vi.fn();

vi.mock("@/backend/database/client", () => {
  const tx = {
    tcsCollection: {
      aggregate: (...a: unknown[]) => tcsAggregate(...a),
      create: vi.fn().mockResolvedValue({}),
    },
    receipt: {
      aggregate: (...a: unknown[]) => receiptAggregate(...a),
      create: vi.fn().mockResolvedValue({ id: "rct-1" }),
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
      party: { findFirst: vi.fn().mockResolvedValue({ id: "party-1", name: "Buyer Ltd", type: "CUSTOMER" }) },
      bankAccount: { findFirst: vi.fn().mockResolvedValue({ id: "bank-1", name: "HDFC" }) },
      invoice: { findFirst: vi.fn() },
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
    getTcsPayableLedger: vi.fn().mockResolvedValue({ id: "led-tcs" }),
    getVoucherTypeByCode: vi.fn().mockResolvedValue({ id: "vt-1", nature: "RECEIPT" }),
    getFiscalYearForDate: vi.fn().mockResolvedValue({
      id: "fy-1",
      startDate: new Date("2025-04-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    }),
    generateVoucherNumber: vi.fn().mockResolvedValue("RCV-000001"),
    nextNumber: vi.fn().mockResolvedValue(1),
    applyLedgerEntries: vi.fn().mockResolvedValue(undefined),
    recomputeInvoiceStatus: vi.fn().mockResolvedValue(undefined),
  };
});

function receiptRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/organizations/org-1/receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ orgId: "org-1" }) };

describe("receipts — TCS YTD aggregate is scoped to the section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tcsAggregate.mockResolvedValue({ _sum: { baseAmount: null } });
    receiptAggregate.mockResolvedValue({ _sum: { amount: null } });
  });

  it("filters the YTD aggregate by the section being collected", async () => {
    const { POST } = await import("../route");
    await POST(
      receiptRequest({
        partyId: "party-1",
        date: "2025-06-10",
        amount: 100000,
        paymentMode: "BANK_TRANSFER",
        bankAccountId: "bank-1",
        tcsSection: "206C_1H",
      }) as never,
      ctx as never
    );

    expect(tcsAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          partyId: "party-1",
          section: "206C_1H",
        }),
        _sum: { baseAmount: true },
      })
    );
  });

  it("no longer pools every receipt from the party regardless of section", async () => {
    const { POST } = await import("../route");
    await POST(
      receiptRequest({
        partyId: "party-1",
        date: "2025-06-10",
        amount: 100000,
        paymentMode: "CASH",
        tcsSection: "206C_1H",
      }) as never,
      ctx as never
    );

    expect(receiptAggregate).not.toHaveBeenCalled();
  });

  /**
   * 206C(1H) charges only the excess over ₹50L, so an inflated aggregate
   * turns a nil collection into a real one — money taken from the buyer.
   */
  it("a pooled aggregate collects 206C(1H) that is not yet due", () => {
    // ₹10,00,000 of 206C(1F) vehicle sales plus ₹49,00,000 of ordinary
    // 206C(1H) receipts. A further ₹50,000 receipt keeps 1H turnover at
    // ₹49,50,000 — still under ₹50,00,000, so nothing is collectible.
    const scoped = computeTds({
      section: "206C_1H",
      deducteeType: "COMPANY_OTHER",
      amount: "50000",
      ytdAggregate: "4900000",
    });
    expect(scoped.amount.toString()).toBe("0");
    expect(scoped.appliedReason).toBe("BELOW_ANNUAL_THRESHOLD");

    // Pooling the 1F sales in puts the aggregate at ₹59,00,000, so the
    // full ₹50,000 reads as excess and 0.1% is collected from the buyer.
    const pooled = computeTds({
      section: "206C_1H",
      deducteeType: "COMPANY_OTHER",
      amount: "50000",
      ytdAggregate: "5900000",
    });
    expect(pooled.amount.toString()).toBe("50");
    expect(pooled.appliedReason).toBe("DEDUCTED");
    // TCS is added on top — the buyer is invoiced ₹50 more than they owe.
    expect(pooled.netAfter.toString()).toBe("50050");
  });
});
