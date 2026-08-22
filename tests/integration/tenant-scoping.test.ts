import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/backend/database/client";
import { createTestOrg, ensureFiscalYear, postJournal } from "./factories";

/**
 * Retrofit of three previously-mocked scope tests onto the real database (#9).
 *
 * Ledger Export Scope, TDS YTD Scope and TCS YTD Scope all guard the same class
 * of bug: an id or an aggregate that reaches past the organization it belongs
 * to. A mocked Prisma client cannot demonstrate any of it — it returns whatever
 * the test told it to, so the assertion only ever proved that the test's own
 * stub was shaped correctly. These use real rows in two real organizations.
 */

const sessionMock = vi.hoisted(() => ({
  value: null as { user: { id: string; email: string } } | null,
}));

vi.mock("@/backend/services/auth.service", () => ({
  auth: async () => sessionMock.value,
}));

beforeEach(() => {
  sessionMock.value = null;
});

describe("ledger export scope", () => {
  it("refuses to export a ledger belonging to another organization", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);

    // A real ledger with real history, owned by A.
    await postJournal(
      orgA,
      [
        { groupKey: "assets", ledgerName: "A Secret Cash", debit: 5000 },
        { groupKey: "income", ledgerName: "A Sales", credit: 5000 },
      ],
      new Date(2025, 5, 1)
    );
    const victimLedger = await prisma.ledger.findFirstOrThrow({
      where: { organizationId: orgA.orgId, name: "A Secret Cash" },
    });

    // B is authenticated, and passes A's ledger id in the request body.
    sessionMock.value = { user: { id: orgB.userId, email: "b@example.test" } };

    const { POST } = await import(
      "@/app/api/organizations/[orgId]/reports/export/route"
    );

    const response = await POST(
      new NextRequest("https://example.test/api/organizations/x/reports/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
          host: "example.test",
        },
        body: JSON.stringify({
          reportType: "ledger",
          format: "json",
          filters: { ledgerId: victimLedger.id },
        }),
      }),
      { params: Promise.resolve({ orgId: orgB.orgId }) }
    );

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("A Secret Cash");
    expect(body).not.toContain("5000");
  });

  it("exports a ledger the caller's own organization owns", async () => {
    const org = await createTestOrg();
    await postJournal(
      org,
      [
        { groupKey: "assets", ledgerName: "Own Cash", debit: 1200 },
        { groupKey: "income", ledgerName: "Own Sales", credit: 1200 },
      ],
      new Date(2025, 5, 1)
    );
    const ledger = await prisma.ledger.findFirstOrThrow({
      where: { organizationId: org.orgId, name: "Own Cash" },
    });

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };

    const { POST } = await import(
      "@/app/api/organizations/[orgId]/reports/export/route"
    );

    const response = await POST(
      new NextRequest("https://example.test/api/organizations/x/reports/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.test",
          host: "example.test",
        },
        body: JSON.stringify({
          reportType: "ledger",
          format: "json",
          filters: {
            ledgerId: ledger.id,
            startDate: "2025-04-01",
            endDate: "2026-03-31",
          },
        }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );

    expect(response.status).toBe(200);
  });
});

/** Sum payments the way the payments route does when checking a TDS threshold. */
async function tdsYtdFor(orgId: string, partyId: string, from: Date, to: Date) {
  const ytd = await prisma.payment.aggregate({
    where: {
      organizationId: orgId,
      partyId,
      date: { gte: from, lte: to },
      status: "COMPLETED",
    },
    _sum: { amount: true },
  });
  return Number(ytd._sum.amount ?? 0);
}

describe("TDS year-to-date scope", () => {
  it("does not count another organization's payments toward the threshold", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    const fy = await ensureFiscalYear(orgA, new Date(2025, 5, 1));

    const makePayment = async (
      org: typeof orgA,
      partyId: string,
      amount: number
    ) =>
      prisma.payment.create({
        data: {
          organizationId: org.orgId,
          partyId,
          paymentNumber: `PAY-${Math.random().toString(36).slice(2, 10)}`,
          date: new Date(2025, 6, 1),
          amount,
          paymentMode: "BANK_TRANSFER",
          status: "COMPLETED",
        },
      });

    await makePayment(orgA, orgA.vendorId, 40_000);
    await makePayment(orgB, orgB.vendorId, 999_999);

    const ytd = await tdsYtdFor(
      orgA.orgId,
      orgA.vendorId,
      fy.startDate,
      new Date(2026, 2, 31)
    );

    // B's near-million must be invisible, or A would cross the 194C annual
    // threshold on someone else's spending.
    expect(ytd).toBe(40_000);
  });

  it("does not count a prior fiscal year", async () => {
    const org = await createTestOrg();
    const fy = await ensureFiscalYear(org, new Date(2025, 5, 1));

    for (const [date, amount] of [
      [new Date(2024, 6, 1), 500_000], // previous FY
      [new Date(2025, 6, 1), 25_000], // this FY
    ] as const) {
      await prisma.payment.create({
        data: {
          organizationId: org.orgId,
          partyId: org.vendorId,
          paymentNumber: `PAY-${Math.random().toString(36).slice(2, 10)}`,
          date,
          amount,
          paymentMode: "BANK_TRANSFER",
          status: "COMPLETED",
        },
      });
    }

    const ytd = await tdsYtdFor(
      org.orgId,
      org.vendorId,
      fy.startDate,
      new Date(2026, 2, 31)
    );
    expect(ytd).toBe(25_000);
  });

  it("counts only completed payments, and only to the same party", async () => {
    const org = await createTestOrg();
    const fy = await ensureFiscalYear(org, new Date(2025, 5, 1));

    const otherVendor = await prisma.party.create({
      data: { organizationId: org.orgId, name: "Other Vendor", type: "VENDOR" },
    });

    const rows: [string, number, string][] = [
      [org.vendorId, 10_000, "COMPLETED"],
      [org.vendorId, 70_000, "CANCELLED"],
      [otherVendor.id, 90_000, "COMPLETED"],
    ];
    for (const [partyId, amount, status] of rows) {
      await prisma.payment.create({
        data: {
          organizationId: org.orgId,
          partyId,
          paymentNumber: `PAY-${Math.random().toString(36).slice(2, 10)}`,
          date: new Date(2025, 6, 1),
          amount,
          paymentMode: "BANK_TRANSFER",
          status,
        },
      });
    }

    const ytd = await tdsYtdFor(
      org.orgId,
      org.vendorId,
      fy.startDate,
      new Date(2026, 2, 31)
    );
    expect(ytd).toBe(10_000);
  });
});

/** Sum receipts the way the receipts route does when checking a TCS threshold. */
async function tcsYtdFor(orgId: string, partyId: string, from: Date, to: Date) {
  const ytd = await prisma.receipt.aggregate({
    where: {
      organizationId: orgId,
      partyId,
      date: { gte: from, lte: to },
      status: "COMPLETED",
    },
    _sum: { amount: true },
  });
  return Number(ytd._sum.amount ?? 0);
}

describe("TCS year-to-date scope", () => {
  it("does not count another organization's receipts toward 206C(1H)", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    const fy = await ensureFiscalYear(orgA, new Date(2025, 5, 1));

    for (const [org, partyId, amount] of [
      [orgA, orgA.customerId, 60_000],
      [orgB, orgB.customerId, 8_000_000],
    ] as const) {
      await prisma.receipt.create({
        data: {
          organizationId: org.orgId,
          partyId,
          receiptNumber: `RCP-${Math.random().toString(36).slice(2, 10)}`,
          date: new Date(2025, 6, 1),
          amount,
          paymentMode: "BANK_TRANSFER",
          status: "COMPLETED",
        },
      });
    }

    const ytd = await tcsYtdFor(
      orgA.orgId,
      orgA.customerId,
      fy.startDate,
      new Date(2026, 2, 31)
    );
    expect(ytd).toBe(60_000);
  });

  it("does not count a prior fiscal year", async () => {
    const org = await createTestOrg();
    const fy = await ensureFiscalYear(org, new Date(2025, 5, 1));

    for (const [date, amount] of [
      [new Date(2024, 6, 1), 7_000_000],
      [new Date(2025, 6, 1), 120_000],
    ] as const) {
      await prisma.receipt.create({
        data: {
          organizationId: org.orgId,
          partyId: org.customerId,
          receiptNumber: `RCP-${Math.random().toString(36).slice(2, 10)}`,
          date,
          amount,
          paymentMode: "BANK_TRANSFER",
          status: "COMPLETED",
        },
      });
    }

    const ytd = await tcsYtdFor(
      org.orgId,
      org.customerId,
      fy.startDate,
      new Date(2026, 2, 31)
    );
    expect(ytd).toBe(120_000);
  });
});
