import { describe, expect, it } from "vitest";
import { computeGstr1, summarizeGstr1 } from "../gstr1";

/**
 * Stubs the Prisma transaction client's `.invoice.findMany` so we can
 * test the GSTR-1 aggregation logic against fixture invoices without a DB.
 */
function stubDb(invoices: unknown[]) {
  return {
    invoice: {
      findMany: async () => invoices,
    },
  } as unknown as Parameters<typeof computeGstr1>[0];
}

const period = {
  from: new Date("2026-04-01T00:00:00.000Z"),
  to: new Date("2026-04-30T23:59:59.999Z"),
};

const itemSold = (overrides: Record<string, unknown> = {}) => ({
  hsnCode: "8523",
  quantity: "1",
  totalAmount: "1180",
  taxableAmount: "1000",
  taxAmount: "180",
  cgstRate: "9",
  cgstAmount: "90",
  sgstRate: "9",
  sgstAmount: "90",
  igstRate: "0",
  igstAmount: "0",
  cessRate: null,
  cessAmount: null,
  item: { primaryUnit: { symbol: "NOS", name: "Nos" } },
  ...overrides,
});

describe("computeGstr1", () => {
  it("groups B2B invoices by counterparty GSTIN", async () => {
    const db = stubDb([
      {
        id: "inv-1",
        invoiceNumber: "INV/2026-27/00001",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p1", name: "Acme Ltd", gstNo: "27AAAAA0000A1Z5", billingState: "MH" },
        items: [itemSold()],
      },
      {
        id: "inv-2",
        invoiceNumber: "INV/2026-27/00002",
        date: new Date("2026-04-08"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "590",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p1", name: "Acme Ltd", gstNo: "27AAAAA0000A1Z5", billingState: "MH" },
        items: [itemSold({ totalAmount: "590", taxableAmount: "500", cgstAmount: "45", sgstAmount: "45", taxAmount: "90" })],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2b).toHaveLength(1);
    expect(r.b2b[0].ctin).toBe("27AAAAA0000A1Z5");
    expect(r.b2b[0].invoices).toHaveLength(2);
    expect(r.b2cs).toHaveLength(0);
  });

  it("buckets unregistered customers into B2CS by (place, rate)", async () => {
    const db = stubDb([
      {
        id: "inv-3",
        invoiceNumber: "INV/2026-27/00003",
        date: new Date("2026-04-10"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p2", name: "Walk-in customer", gstNo: null, billingState: "MH" },
        items: [itemSold()],
      },
      {
        id: "inv-4",
        invoiceNumber: "INV/2026-27/00004",
        date: new Date("2026-04-12"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "590",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p3", name: "Another walk-in", gstNo: null, billingState: "MH" },
        items: [itemSold({ totalAmount: "590", taxableAmount: "500", cgstAmount: "45", sgstAmount: "45", taxAmount: "90" })],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2b).toHaveLength(0);
    expect(r.b2cs).toHaveLength(1);
    const row = r.b2cs[0];
    expect(row.placeOfSupply).toBe("MH");
    expect(row.rate).toBe("18.00");
    expect(row.taxableValue).toBe("1500");
    expect(row.cgst).toBe("135");
    expect(row.sgst).toBe("135");
    expect(row.igst).toBe("0");
  });

  it("aggregates HSN summary across invoices in the period", async () => {
    const db = stubDb([
      {
        id: "i1",
        invoiceNumber: "X1",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p1", name: "X", gstNo: "27AAAAA0000A1Z5", billingState: "MH" },
        items: [itemSold({ hsnCode: "8523", quantity: "2" })],
      },
      {
        id: "i2",
        invoiceNumber: "X2",
        date: new Date("2026-04-06"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p1", name: "X", gstNo: "27AAAAA0000A1Z5", billingState: "MH" },
        items: [itemSold({ hsnCode: "8523", quantity: "3" })],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.hsn).toHaveLength(1);
    expect(r.hsn[0].hsnCode).toBe("8523");
    expect(r.hsn[0].quantity).toBe("5");
    expect(r.hsn[0].rate).toBe("18.00");
    expect(r.hsn[0].taxableValue).toBe("2000");
    expect(r.hsn[0].cgst).toBe("180");
    expect(r.hsn[0].sgst).toBe("180");
    expect(r.hsn[0].uqc).toBe("NOS");
  });

  it("separates HSN aggregation by rate", async () => {
    const db = stubDb([
      {
        id: "i1",
        invoiceNumber: "X1",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p", name: "X", gstNo: "27AAAAA0000A1Z5", billingState: "MH" },
        items: [
          itemSold({ hsnCode: "8523", cgstRate: "9", sgstRate: "9" }),
          itemSold({
            hsnCode: "8523",
            cgstRate: "6",
            sgstRate: "6",
            cgstAmount: "60",
            sgstAmount: "60",
            taxAmount: "120",
            totalAmount: "1120",
            taxableAmount: "1000",
          }),
        ],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.hsn).toHaveLength(2);
    const rates = r.hsn.map((h) => h.rate).sort();
    expect(rates).toEqual(["12.00", "18.00"]);
  });

  it("interstate invoice: places amount on IGST", async () => {
    const db = stubDb([
      {
        id: "i1",
        invoiceNumber: "X1",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "KA",
        reverseCharge: false,
        party: { id: "p", name: "X", gstNo: "29AAAAA0000A1Z5", billingState: "KA" },
        items: [itemSold({
          cgstRate: "0", cgstAmount: "0",
          sgstRate: "0", sgstAmount: "0",
          igstRate: "18", igstAmount: "180",
        })],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2b[0].invoices[0].items[0].igst).toBe("180");
    expect(r.b2b[0].invoices[0].items[0].cgst).toBe("0");
    expect(r.b2b[0].invoices[0].items[0].rate).toBe("18.00");
  });

  it("excludes DRAFT and CANCELLED — but the test stub doesn't filter, so we test docs counter directly", async () => {
    // Caller (the real prisma findMany) excludes DRAFT/CANCELLED via the
    // `status: { notIn: [...] }` clause. The stub returns whatever we give
    // it, so this test confirms only the docs counters and that the
    // query semantics are encoded in the service: a CANCELLED invoice
    // increments the cancelled counter but stays included in totals here.
    const db = stubDb([
      {
        id: "inv-cancelled",
        invoiceNumber: "INV/2026-27/00009",
        date: new Date("2026-04-15"),
        type: "INVOICE",
        status: "CANCELLED",
        totalAmount: "0",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p", name: "X", gstNo: null, billingState: "MH" },
        items: [],
      },
      {
        id: "inv-ok",
        invoiceNumber: "INV/2026-27/00010",
        date: new Date("2026-04-16"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p", name: "X", gstNo: null, billingState: "MH" },
        items: [itemSold()],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    const invDoc = r.docs.find((d) => d.docType === "Invoice")!;
    expect(invDoc.total).toBe(2);
    expect(invDoc.cancelled).toBe(1);
    expect(invDoc.netIssued).toBe(1);
  });
});

describe("computeGstr1 — B2CL (B2C Large interstate ≥ ₹2.5L)", () => {
  it("buckets a ₹3L unregistered interstate invoice into B2CL, not B2CS", async () => {
    const db = stubDb([
      {
        id: "i1",
        invoiceNumber: "INV/2026-27/00001",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "354000",
        placeOfSupply: "KA",
        supplyType: "INTERSTATE",
        reverseCharge: false,
        party: { id: "p", name: "Big walk-in", gstNo: null, billingState: "KA", billingCountry: "IN" },
        items: [{
          hsnCode: "8523", quantity: "1", totalAmount: "354000",
          taxableAmount: "300000", taxAmount: "54000",
          cgstRate: "0", cgstAmount: "0",
          sgstRate: "0", sgstAmount: "0",
          igstRate: "18", igstAmount: "54000",
          cessRate: null, cessAmount: null,
          item: { primaryUnit: { symbol: "NOS", name: "Nos" } },
        }],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2cl).toHaveLength(1);
    expect(r.b2cs).toHaveLength(0);
    expect(r.b2cl[0].placeOfSupply).toBe("KA");
    expect(r.b2cl[0].items[0].igst).toBe("54000");
  });

  it("keeps a ₹2.4L unregistered interstate invoice in B2CS (under threshold)", async () => {
    const db = stubDb([
      {
        id: "i1",
        invoiceNumber: "INV/2026-27/00002",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "240000",
        placeOfSupply: "KA",
        supplyType: "INTERSTATE",
        reverseCharge: false,
        party: { id: "p", name: "Smaller walk-in", gstNo: null, billingState: "KA", billingCountry: "IN" },
        items: [{
          hsnCode: "8523", quantity: "1", totalAmount: "240000",
          taxableAmount: "203389.83", taxAmount: "36610.17",
          cgstRate: "0", cgstAmount: "0",
          sgstRate: "0", sgstAmount: "0",
          igstRate: "18", igstAmount: "36610.17",
          cessRate: null, cessAmount: null,
          item: { primaryUnit: { symbol: "NOS", name: "Nos" } },
        }],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2cl).toHaveLength(0);
    expect(r.b2cs).toHaveLength(1);
  });
});

describe("computeGstr1 — CDNR / CDNUR (credit/debit notes)", () => {
  it("registered credit note goes to CDNR with noteType=C", async () => {
    const db = stubDb([
      {
        id: "cn-1",
        invoiceNumber: "CN/2026-27/00001",
        date: new Date("2026-04-10"),
        type: "CREDIT_NOTE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        supplyType: "INTRASTATE",
        reverseCharge: false,
        party: { id: "p", name: "Acme", gstNo: "27AAAAA0000A1Z5", billingState: "MH", billingCountry: "IN" },
        items: [itemSold()],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2b).toHaveLength(0);
    expect(r.cdnr).toHaveLength(1);
    expect(r.cdnr[0].noteType).toBe("C");
    expect(r.cdnr[0].ctin).toBe("27AAAAA0000A1Z5");
  });

  it("unregistered debit note goes to CDNUR with noteType=D", async () => {
    const db = stubDb([
      {
        id: "dn-1",
        invoiceNumber: "DN/2026-27/00001",
        date: new Date("2026-04-12"),
        type: "DEBIT_NOTE",
        status: "APPROVED",
        totalAmount: "590",
        placeOfSupply: "MH",
        supplyType: "INTRASTATE",
        reverseCharge: false,
        party: { id: "p", name: "Walk-in", gstNo: null, billingState: "MH", billingCountry: "IN" },
        items: [itemSold({ totalAmount: "590", taxableAmount: "500", cgstAmount: "45", sgstAmount: "45", taxAmount: "90" })],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.cdnur).toHaveLength(1);
    expect(r.cdnur[0].noteType).toBe("D");
  });
});

describe("computeGstr1 — EXP (exports)", () => {
  it("supplyType=EXPORT with IGST routes to EXP as WPAY", async () => {
    const db = stubDb([
      {
        id: "exp-1",
        invoiceNumber: "EXP/2026-27/00001",
        date: new Date("2026-04-20"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "118000",
        placeOfSupply: null,
        supplyType: "EXPORT",
        reverseCharge: false,
        party: { id: "p", name: "Foreign Co", gstNo: null, billingState: null, billingCountry: "US" },
        items: [{
          hsnCode: "8523", quantity: "1", totalAmount: "118000",
          taxableAmount: "100000", taxAmount: "18000",
          cgstRate: "0", cgstAmount: "0",
          sgstRate: "0", sgstAmount: "0",
          igstRate: "18", igstAmount: "18000",
          cessRate: null, cessAmount: null,
          item: { primaryUnit: { symbol: "NOS", name: "Nos" } },
        }],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.exp).toHaveLength(1);
    expect(r.exp[0].exportType).toBe("WPAY");
    expect(r.b2b).toHaveLength(0);
  });

  it("supplyType=EXPORT without IGST (LUT) routes to EXP as WOPAY", async () => {
    const db = stubDb([
      {
        id: "exp-2",
        invoiceNumber: "EXP/2026-27/00002",
        date: new Date("2026-04-21"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "100000",
        placeOfSupply: null,
        supplyType: "EXPORT",
        reverseCharge: false,
        party: { id: "p", name: "Foreign Co", gstNo: null, billingState: null, billingCountry: "US" },
        items: [{
          hsnCode: "8523", quantity: "1", totalAmount: "100000",
          taxableAmount: "100000", taxAmount: "0",
          cgstRate: "0", cgstAmount: "0",
          sgstRate: "0", sgstAmount: "0",
          igstRate: "0", igstAmount: "0",
          cessRate: null, cessAmount: null,
          item: { primaryUnit: { symbol: "NOS", name: "Nos" } },
        }],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.exp).toHaveLength(1);
    expect(r.exp[0].exportType).toBe("WOPAY");
  });
});

describe("computeGstr1 — NIL / EXEMPT", () => {
  it("zero-rated unregistered intrastate invoice rolls into NIL.INTRA_UNREG", async () => {
    const db = stubDb([
      {
        id: "nil-1",
        invoiceNumber: "INV/2026-27/00100",
        date: new Date("2026-04-25"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "5000",
        placeOfSupply: "MH",
        supplyType: "INTRASTATE",
        reverseCharge: false,
        party: { id: "p", name: "Walk-in", gstNo: null, billingState: "MH", billingCountry: "IN" },
        items: [{
          hsnCode: "8523", quantity: "5", totalAmount: "5000",
          taxableAmount: "5000", taxAmount: "0",
          cgstRate: "0", cgstAmount: "0",
          sgstRate: "0", sgstAmount: "0",
          igstRate: "0", igstAmount: "0",
          cessRate: null, cessAmount: null,
          item: { primaryUnit: { symbol: "NOS", name: "Nos" } },
        }],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    expect(r.b2cs).toHaveLength(0);
    expect(r.nil).toHaveLength(1);
    expect(r.nil[0].bucket).toBe("INTRA_UNREG");
    expect(r.nil[0].amount).toBe("5000");
  });
});

describe("summarizeGstr1", () => {
  it("rolls up totals across B2B and B2CS line rows", async () => {
    const db = stubDb([
      {
        id: "i1",
        invoiceNumber: "X",
        date: new Date("2026-04-05"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "1180",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p", name: "X", gstNo: "27AAAAA0000A1Z5", billingState: "MH" },
        items: [itemSold()],
      },
      {
        id: "i2",
        invoiceNumber: "Y",
        date: new Date("2026-04-06"),
        type: "INVOICE",
        status: "APPROVED",
        totalAmount: "590",
        placeOfSupply: "MH",
        reverseCharge: false,
        party: { id: "p2", name: "Walk-in", gstNo: null, billingState: "MH" },
        items: [itemSold({ totalAmount: "590", taxableAmount: "500", cgstAmount: "45", sgstAmount: "45", taxAmount: "90" })],
      },
    ]);

    const r = await computeGstr1(db, "org-1", period);
    const s = summarizeGstr1(r);
    expect(s.totalTaxable).toBe("1500");
    expect(s.totalCgst).toBe("135");
    expect(s.totalSgst).toBe("135");
    expect(s.totalIgst).toBe("0");
    expect(s.totalTax).toBe("270");
  });
});
