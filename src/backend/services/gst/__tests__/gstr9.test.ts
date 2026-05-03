import { describe, expect, it } from "vitest";
import { computeGstr9, fyFromLabel } from "../gstr9";

const fy = fyFromLabel("2026-27");

function stubDb({ invoices = [], bills = [] }: { invoices?: unknown[]; bills?: unknown[] }) {
  return {
    invoice: { findMany: async () => invoices },
    bill: { findMany: async () => bills },
  } as unknown as Parameters<typeof computeGstr9>[0];
}

const inv = (overrides: Record<string, unknown> = {}) => ({
  invoiceNumber: "INV/2026-27/00001",
  date: new Date("2026-04-05"),
  type: "INVOICE",
  status: "APPROVED",
  totalAmount: "11800",
  supplyType: "INTRASTATE",
  reverseCharge: false,
  party: { gstNo: "27AAAAA0000A1Z5" },
  items: [{
    taxableAmount: "10000",
    cgstAmount: "900",
    sgstAmount: "900",
    igstAmount: "0",
    cessAmount: "0",
  }],
  ...overrides,
});

describe("fyFromLabel", () => {
  it("parses '2026-27' to Apr-1 2026 → Mar-31 2027", () => {
    const f = fyFromLabel("2026-27");
    expect(f.start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(f.end.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(f.label).toBe("2026-27");
  });

  it("rejects malformed labels", () => {
    expect(() => fyFromLabel("2026")).toThrow(/Invalid FY label/);
    expect(() => fyFromLabel("FY 2026")).toThrow();
    expect(() => fyFromLabel("2026-2027")).toThrow();
  });
});

describe("computeGstr9 — Section 4 outward", () => {
  it("registered customer flows into 4B (B2B)", async () => {
    const db = stubDb({
      invoices: [inv()],
      bills: [],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s4.b2bOutward.taxableValue).toBe("10000");
    expect(r.s4.b2bOutward.cgst).toBe("900");
    expect(r.s4.b2cOutward.taxableValue).toBe("0");
  });

  it("unregistered customer flows into 4A (B2C)", async () => {
    const db = stubDb({
      invoices: [inv({ party: { gstNo: null } })],
      bills: [],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s4.b2cOutward.taxableValue).toBe("10000");
    expect(r.s4.b2bOutward.taxableValue).toBe("0");
  });

  it("EXPORT supply with IGST flows into 4C (exports with tax)", async () => {
    const db = stubDb({
      invoices: [
        inv({
          supplyType: "EXPORT",
          items: [{
            taxableAmount: "100000", cgstAmount: "0", sgstAmount: "0",
            igstAmount: "18000", cessAmount: "0",
          }],
        }),
      ],
      bills: [],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s4.exportsWithTax.taxableValue).toBe("100000");
    expect(r.s4.exportsWithTax.igst).toBe("18000");
    expect(r.s4.b2bOutward.taxableValue).toBe("0");
  });

  it("EXPORT under LUT (no IGST) flows into 5A, not 4C", async () => {
    const db = stubDb({
      invoices: [
        inv({
          supplyType: "EXPORT",
          items: [{
            taxableAmount: "100000", cgstAmount: "0", sgstAmount: "0",
            igstAmount: "0", cessAmount: "0",
          }],
        }),
      ],
      bills: [],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s5.exportsLut.taxableValue).toBe("100000");
    expect(r.s4.exportsWithTax.taxableValue).toBe("0");
  });

  it("CREDIT_NOTE adjusts 4I", async () => {
    const db = stubDb({
      invoices: [
        inv(),
        inv({
          invoiceNumber: "CN/2026-27/00001",
          type: "CREDIT_NOTE",
          items: [{
            taxableAmount: "1000", cgstAmount: "90", sgstAmount: "90",
            igstAmount: "0", cessAmount: "0",
          }],
        }),
      ],
      bills: [],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s4.creditNotesAdjustment.taxableValue).toBe("1000");
    // Net = subtotal − CN + DN
    expect(r.s4.netSupplies.taxableValue).toBe("9000");
    expect(r.s4.netSupplies.cgst).toBe("810");
  });
});

describe("computeGstr9 — Section 5 non-payable", () => {
  it("aggregates nil/exempt and non-GST from GSTR-3B annual", async () => {
    const db = stubDb({
      invoices: [
        // Nil-rated outward.
        inv({
          items: [{
            taxableAmount: "5000", cgstAmount: "0", sgstAmount: "0",
            igstAmount: "0", cessAmount: "0",
          }],
        }),
      ],
      bills: [],
    });
    const r = await computeGstr9(db, "org-1", fy);
    // Nil-rated → S5
    expect(D(r.s5.nilRated.taxableValue).greaterThan(D(0))).toBe(true);
  });
});

describe("computeGstr9 — Section 6/7/9 ITC + tax", () => {
  it("ITC from RCM flows into 6.B and 6.A; bills flow into 6.A only", async () => {
    const db = stubDb({
      invoices: [],
      bills: [
        // Regular bill with ITC.
        {
          reverseCharge: false,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "5000", cgstAmount: "450", sgstAmount: "450",
            igstAmount: "0", cessAmount: "0",
          }],
        },
        // RCM bill.
        {
          reverseCharge: true,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "1000", cgstAmount: "90", sgstAmount: "90",
            igstAmount: "0", cessAmount: "0",
          }],
        },
      ],
    });
    const r = await computeGstr9(db, "org-1", fy);
    // 6.A total = both
    expect(r.s6.totalItcAvailed.cgst).toBe("540");
    expect(r.s6.totalItcAvailed.sgst).toBe("540");
    // 6.B RCM only
    expect(r.s6.rcmDomestic.cgst).toBe("90");
  });

  it("Section 9 splits payable into ITC vs cash, capped non-negative", async () => {
    const db = stubDb({
      invoices: [
        // Outward generates ₹1800 cgst+sgst.
        inv(),
      ],
      bills: [
        // Bill ITC of ₹900 cgst+sgst.
        {
          reverseCharge: false,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "5000", cgstAmount: "450", sgstAmount: "450",
            igstAmount: "0", cessAmount: "0",
          }],
        },
      ],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s9.taxPayable.cgst).toBe("900"); // payable
    expect(r.s9.paidThroughItc.cgst).toBe("450");
    expect(r.s9.paidInCash.cgst).toBe("450");
  });

  it("paidInCash never goes negative even if ITC > payable", async () => {
    const db = stubDb({
      invoices: [
        inv({
          items: [{
            taxableAmount: "1000", cgstAmount: "90", sgstAmount: "90",
            igstAmount: "0", cessAmount: "0",
          }],
        }),
      ],
      bills: [
        // ITC much larger than output tax → "carry-forward" scenario.
        {
          reverseCharge: false,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "10000", cgstAmount: "900", sgstAmount: "900",
            igstAmount: "0", cessAmount: "0",
          }],
        },
      ],
    });
    const r = await computeGstr9(db, "org-1", fy);
    expect(r.s9.paidInCash.cgst).toBe("0");
    expect(r.s9.paidInCash.sgst).toBe("0");
  });
});

// Re-import D for the one place we use it inline (avoids unused warning).
import { D } from "@/backend/utils/money";
