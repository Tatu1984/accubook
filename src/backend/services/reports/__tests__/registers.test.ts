import { describe, expect, it } from "vitest";
import {
  computeSalesRegister,
  computePurchaseRegister,
  computePartyStatement,
} from "../registers";

const period = {
  from: new Date("2026-04-01T00:00:00.000Z"),
  to: new Date("2026-04-30T23:59:59.999Z"),
};

function stubDb({
  invoices = [],
  bills = [],
  receipts = [],
  payments = [],
  parties = [],
}: {
  invoices?: unknown[];
  bills?: unknown[];
  receipts?: unknown[];
  payments?: unknown[];
  parties?: unknown[];
}) {
  return {
    invoice: { findMany: async () => invoices },
    bill: { findMany: async () => bills },
    receipt: { findMany: async () => receipts },
    payment: { findMany: async () => payments },
    party: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        parties.find((p) => (p as { id: string }).id === where.id) ?? null,
    },
  } as unknown as Parameters<typeof computeSalesRegister>[0];
}

const inv = (overrides: Record<string, unknown> = {}) => ({
  invoiceNumber: "INV/2026-27/00001",
  date: new Date("2026-04-05"),
  type: "INVOICE",
  totalAmount: "11800",
  amountPaid: "0",
  amountDue: "11800",
  status: "APPROVED",
  placeOfSupply: "MH",
  supplyType: "INTRASTATE",
  party: { id: "p1", name: "Acme", gstNo: "27AAAAA0000A1Z5" },
  items: [{
    taxableAmount: "10000",
    cgstAmount: "900",
    sgstAmount: "900",
    igstAmount: "0",
    cessAmount: "0",
    taxAmount: "1800",
  }],
  ...overrides,
});

const bill = (overrides: Record<string, unknown> = {}) => ({
  billNumber: "BILL-000001",
  vendorBillNo: "VND-001",
  date: new Date("2026-04-05"),
  type: "BILL",
  totalAmount: "5900",
  amountPaid: "0",
  amountDue: "5900",
  status: "APPROVED",
  placeOfSupply: "MH",
  supplyType: "INTRASTATE",
  reverseCharge: false,
  party: { id: "v1", name: "VendorCo", gstNo: "27AAAAA1111B1Z5" },
  items: [{
    taxableAmount: "5000",
    cgstAmount: "450",
    sgstAmount: "450",
    igstAmount: "0",
    cessAmount: "0",
    taxAmount: "900",
  }],
  ...overrides,
});

describe("computeSalesRegister", () => {
  it("rolls up totals across invoices in period", async () => {
    const db = stubDb({ invoices: [inv(), inv({ invoiceNumber: "INV/2026-27/00002" })] });
    const r = await computeSalesRegister(db, "org-1", period);
    expect(r.rows).toHaveLength(2);
    expect(r.totals.invoiceCount).toBe(2);
    expect(r.totals.taxable).toBe("20000");
    expect(r.totals.cgst).toBe("1800");
    expect(r.totals.sgst).toBe("1800");
    expect(r.totals.totalTax).toBe("3600");
    expect(r.totals.totalValue).toBe("23600");
  });

  it("preserves invoice metadata in rows", async () => {
    const db = stubDb({ invoices: [inv()] });
    const r = await computeSalesRegister(db, "org-1", period);
    expect(r.rows[0].partyName).toBe("Acme");
    expect(r.rows[0].partyGstin).toBe("27AAAAA0000A1Z5");
    expect(r.rows[0].placeOfSupply).toBe("MH");
    expect(r.rows[0].supplyType).toBe("INTRASTATE");
    expect(r.rows[0].status).toBe("APPROVED");
  });

  it("empty period yields zero totals", async () => {
    const db = stubDb({ invoices: [] });
    const r = await computeSalesRegister(db, "org-1", period);
    expect(r.totals.invoiceCount).toBe(0);
    expect(r.totals.taxable).toBe("0");
  });
});

describe("computePurchaseRegister", () => {
  it("rolls up totals across bills, including reverseCharge flag", async () => {
    const db = stubDb({
      bills: [
        bill(),
        bill({ billNumber: "BILL-000002", reverseCharge: true }),
      ],
    });
    const r = await computePurchaseRegister(db, "org-1", period);
    expect(r.rows).toHaveLength(2);
    expect(r.totals.billCount).toBe(2);
    expect(r.totals.taxable).toBe("10000");
    expect(r.totals.totalValue).toBe("11800");
    expect(r.rows[1].reverseCharge).toBe(true);
  });
});

describe("computePartyStatement", () => {
  it("customer with invoice + receipt: balance ↑ on invoice, ↓ on receipt", async () => {
    const db = stubDb({
      parties: [{ id: "p1", name: "Acme", gstNo: null, type: "CUSTOMER" }],
      invoices: [
        {
          invoiceNumber: "INV/2026-27/00001",
          type: "INVOICE",
          date: new Date("2026-04-05"),
          totalAmount: "10000",
          status: "APPROVED",
        },
      ],
      receipts: [
        {
          receiptNumber: "RCT-000001",
          date: new Date("2026-04-15"),
          amount: "4000",
          status: "COMPLETED",
        },
      ],
    });
    const r = await computePartyStatement(db, "org-1", "p1", period);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].docType).toBe("INVOICE");
    expect(r.entries[0].debit).toBe("10000");
    expect(r.entries[0].balance).toBe("10000");
    expect(r.entries[1].docType).toBe("RECEIPT");
    expect(r.entries[1].credit).toBe("4000");
    expect(r.entries[1].balance).toBe("6000");
    expect(r.openingBalance).toBe("0");
    expect(r.closingBalance).toBe("6000");
    expect(r.totals.totalDebit).toBe("10000");
    expect(r.totals.totalCredit).toBe("4000");
  });

  it("vendor with bill + payment: balance ↑ on bill, ↓ on payment", async () => {
    const db = stubDb({
      parties: [{ id: "v1", name: "VendorCo", gstNo: null, type: "VENDOR" }],
      bills: [
        {
          billNumber: "BILL-000001",
          type: "BILL",
          date: new Date("2026-04-05"),
          totalAmount: "20000",
          status: "APPROVED",
        },
      ],
      payments: [
        {
          paymentNumber: "PAY-000001",
          date: new Date("2026-04-20"),
          amount: "5000",
          status: "COMPLETED",
        },
      ],
    });
    const r = await computePartyStatement(db, "org-1", "v1", period);
    expect(r.entries[0].debit).toBe("20000");
    expect(r.entries[1].credit).toBe("5000");
    expect(r.closingBalance).toBe("15000");
  });

  it("opening balance computed from pre-period docs", async () => {
    const db = stubDb({
      parties: [{ id: "p1", name: "Acme", gstNo: null, type: "CUSTOMER" }],
      invoices: [
        // March invoice (before period.from = April 1)
        {
          invoiceNumber: "INV/2025-26/99999",
          type: "INVOICE",
          date: new Date("2026-03-15"),
          totalAmount: "8000",
          status: "APPROVED",
        },
        // April invoice (in period)
        {
          invoiceNumber: "INV/2026-27/00001",
          type: "INVOICE",
          date: new Date("2026-04-05"),
          totalAmount: "10000",
          status: "APPROVED",
        },
      ],
      receipts: [],
    });
    const r = await computePartyStatement(db, "org-1", "p1", period);
    expect(r.openingBalance).toBe("8000");
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].balance).toBe("18000"); // 8000 + 10000
    expect(r.closingBalance).toBe("18000");
  });

  it("CREDIT_NOTE on customer reduces what they owe", async () => {
    const db = stubDb({
      parties: [{ id: "p1", name: "Acme", gstNo: null, type: "CUSTOMER" }],
      invoices: [
        {
          invoiceNumber: "INV/2026-27/00001",
          type: "INVOICE",
          date: new Date("2026-04-05"),
          totalAmount: "10000",
          status: "APPROVED",
        },
        {
          invoiceNumber: "CN/2026-27/00001",
          type: "CREDIT_NOTE",
          date: new Date("2026-04-10"),
          totalAmount: "1500",
          status: "APPROVED",
        },
      ],
      receipts: [],
    });
    const r = await computePartyStatement(db, "org-1", "p1", period);
    expect(r.entries).toHaveLength(2);
    const cn = r.entries.find((e) => e.docType === "CN")!;
    expect(cn.credit).toBe("1500");
    expect(cn.debit).toBe("0");
    expect(r.closingBalance).toBe("8500");
  });

  it("BOTH-typed party combines customer and vendor activity", async () => {
    const db = stubDb({
      parties: [{ id: "x1", name: "Reciprocal Co", gstNo: null, type: "BOTH" }],
      invoices: [
        {
          invoiceNumber: "INV-1",
          type: "INVOICE",
          date: new Date("2026-04-05"),
          totalAmount: "10000",
          status: "APPROVED",
        },
      ],
      receipts: [],
      bills: [
        {
          billNumber: "BILL-1",
          type: "BILL",
          date: new Date("2026-04-08"),
          totalAmount: "3000",
          status: "APPROVED",
        },
      ],
      payments: [],
    });
    const r = await computePartyStatement(db, "org-1", "x1", period);
    expect(r.entries).toHaveLength(2);
    const types = r.entries.map((e) => e.docType).sort();
    expect(types).toEqual(["BILL", "INVOICE"]);
  });

  it("entries sorted by date then number for stable order", async () => {
    const db = stubDb({
      parties: [{ id: "p1", name: "Acme", gstNo: null, type: "CUSTOMER" }],
      invoices: [
        {
          invoiceNumber: "INV/2026-27/00002",
          type: "INVOICE",
          date: new Date("2026-04-05"),
          totalAmount: "1000",
          status: "APPROVED",
        },
        {
          invoiceNumber: "INV/2026-27/00001",
          type: "INVOICE",
          date: new Date("2026-04-05"),
          totalAmount: "2000",
          status: "APPROVED",
        },
      ],
      receipts: [],
    });
    const r = await computePartyStatement(db, "org-1", "p1", period);
    expect(r.entries[0].docNumber).toBe("INV/2026-27/00001");
    expect(r.entries[1].docNumber).toBe("INV/2026-27/00002");
  });

  it("throws on non-existent party", async () => {
    const db = stubDb({ parties: [] });
    await expect(computePartyStatement(db, "org-1", "ghost", period)).rejects.toThrow(/Party not found/);
  });
});
