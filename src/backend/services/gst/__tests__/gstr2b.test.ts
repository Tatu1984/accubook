import { describe, expect, it } from "vitest";
import {
  parseGstr2bJson,
  matchGstr2bToBills,
  type Gstr2bData,
  type BillForReconciliation,
} from "../gstr2b";

const SAMPLE_2B = {
  data: {
    rtnprd: "042025",
    gstin: "27BBBBB1111B1Z9",
    docdata: {
      b2b: [
        {
          ctin: "27AAAAA0000A1Z5",
          trdnm: "Acme Suppliers Pvt Ltd",
          supprd: "042025",
          inv: [
            {
              inum: "ACME/INV/0042",
              idt: "15-04-2025",
              val: 11800,
              rev: "N",
              itcavl: "Y",
              items: [
                { rt: 18, txval: 10000, iamt: 0, camt: 900, samt: 900, csamt: 0, num: 1 },
              ],
            },
            {
              inum: "ACME/INV/0043",
              idt: "20-04-2025",
              val: 23600,
              rev: "N",
              itcavl: "Y",
              items: [
                { rt: 18, txval: 20000, iamt: 0, camt: 1800, samt: 1800, csamt: 0, num: 1 },
              ],
            },
          ],
        },
        {
          ctin: "29CCCCC2222C1Z6",
          trdnm: "Beta Vendors LLP",
          inv: [
            {
              inum: "BV/2025/004",
              idt: "10-04-2025",
              val: 5900,
              items: [
                { rt: 18, txval: 5000, iamt: 900, camt: 0, samt: 0, csamt: 0 },
              ],
            },
          ],
        },
      ],
    },
  },
};

const bill = (overrides: Partial<BillForReconciliation> = {}): BillForReconciliation => ({
  id: "bill-1",
  billNumber: "BILL-000001",
  vendorBillNo: "ACME/INV/0042",
  date: new Date("2025-04-15"),
  party: { gstNo: "27AAAAA0000A1Z5", name: "Acme Suppliers Pvt Ltd" },
  totalAmount: "11800",
  igstTotal: "0",
  cgstTotal: "900",
  sgstTotal: "900",
  cessTotal: "0",
  ...overrides,
});

describe("parseGstr2bJson", () => {
  it("extracts the filing period and supplier list", () => {
    const parsed = parseGstr2bJson(JSON.stringify(SAMPLE_2B));
    expect(parsed.rtnprd).toBe("042025");
    expect(parsed.suppliers).toHaveLength(2);
    expect(parsed.suppliers[0].ctin).toBe("27AAAAA0000A1Z5");
    expect(parsed.suppliers[0].inv).toHaveLength(2);
  });

  it("extracts line items with all 5 tax cells", () => {
    const parsed = parseGstr2bJson(JSON.stringify(SAMPLE_2B));
    const acmeFirst = parsed.suppliers[0].inv[0];
    expect(acmeFirst.items[0]).toMatchObject({
      rt: 18,
      txval: 10000,
      camt: 900,
      samt: 900,
      iamt: 0,
      csamt: 0,
    });
  });

  it("works without the outer `data` wrapper", () => {
    const inner = JSON.stringify(SAMPLE_2B.data);
    const parsed = parseGstr2bJson(inner);
    expect(parsed.rtnprd).toBe("042025");
  });

  it("normalizes single-element b2b/inv to an array", () => {
    const single = {
      data: {
        rtnprd: "042025",
        docdata: {
          b2b: {
            ctin: "27AAAAA0000A1Z5",
            inv: { inum: "ONE", idt: "01-04-2025", val: 100, items: [] },
          },
        },
      },
    };
    const parsed = parseGstr2bJson(JSON.stringify(single));
    expect(parsed.suppliers).toHaveLength(1);
    expect(parsed.suppliers[0].inv).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseGstr2bJson("not json")).toThrow(/not valid JSON/);
  });

  it("rejects missing rtnprd", () => {
    expect(() => parseGstr2bJson(JSON.stringify({ data: { docdata: { b2b: [] } } }))).toThrow(/rtnprd/);
  });

  it("rejects missing docdata", () => {
    expect(() => parseGstr2bJson(JSON.stringify({ data: { rtnprd: "042025" } }))).toThrow(/docdata/);
  });
});

describe("matchGstr2bToBills", () => {
  const parsed: Gstr2bData = {
    rtnprd: "042025",
    suppliers: [
      {
        ctin: "27AAAAA0000A1Z5",
        trdnm: "Acme",
        inv: [
          {
            inum: "ACME/INV/0042",
            idt: "15-04-2025",
            val: 11800,
            items: [{ rt: 18, txval: 10000, iamt: 0, camt: 900, samt: 900, csamt: 0 }],
          },
        ],
      },
    ],
  };

  it("classifies a perfect match as MATCHED", () => {
    const result = matchGstr2bToBills(parsed, [bill()]);
    expect(result.totals).toEqual({ matched: 1, mismatched: 0, missingInBooks: 0, missingIn2b: 0 });
    expect(result.rows[0].status).toBe("MATCHED");
  });

  it("flags amount diff as MISMATCHED with reasons", () => {
    const result = matchGstr2bToBills(parsed, [bill({ totalAmount: "11500", cgstTotal: "750" })]);
    expect(result.totals.mismatched).toBe(1);
    const row = result.rows[0];
    expect(row.status).toBe("MISMATCHED");
    if (row.status === "MISMATCHED") {
      expect(row.reasons.some((r) => r.includes("Invoice value differs"))).toBe(true);
      expect(row.reasons.some((r) => r.includes("CGST differs"))).toBe(true);
    }
  });

  it("absorbs ₹1 rounding noise per cell", () => {
    // Books has 11800.50, 2B has 11800. Within tolerance — MATCHED.
    const result = matchGstr2bToBills(parsed, [bill({ totalAmount: "11800.50" })]);
    expect(result.rows[0].status).toBe("MATCHED");
  });

  it("classifies 2B-only invoice as MISSING_IN_BOOKS", () => {
    const result = matchGstr2bToBills(parsed, []);
    expect(result.totals.missingInBooks).toBe(1);
    const row = result.rows[0];
    expect(row.status).toBe("MISSING_IN_BOOKS");
    if (row.status === "MISSING_IN_BOOKS") {
      expect(row.invoiceNumber).toBe("ACME/INV/0042");
      expect(row.itcAvailable).toBe(true);
    }
  });

  it("classifies books-only bill as MISSING_IN_2B", () => {
    const otherBill = bill({
      id: "bill-2",
      billNumber: "BILL-000002",
      vendorBillNo: "OTHER/INV/99",
    });
    const result = matchGstr2bToBills(parsed, [bill(), otherBill]);
    expect(result.totals.matched).toBe(1);
    expect(result.totals.missingIn2b).toBe(1);
    const missing = result.rows.find((r) => r.status === "MISSING_IN_2B");
    expect(missing).toBeDefined();
    if (missing && missing.status === "MISSING_IN_2B") {
      expect(missing.bill.vendorBillNo).toBe("OTHER/INV/99");
    }
  });

  it("does NOT flag bills without GSTIN or vendorBillNo as MISSING_IN_2B", () => {
    const ungstedBill = bill({
      id: "bill-cash",
      billNumber: "BILL-CASH-1",
      party: { gstNo: null, name: "Cash Vendor" },
    });
    const result = matchGstr2bToBills({ ...parsed, suppliers: [] }, [ungstedBill]);
    expect(result.totals.missingIn2b).toBe(0);
  });

  it("matches GSTIN case-insensitively and vendor bill number case-insensitively", () => {
    const result = matchGstr2bToBills(
      {
        ...parsed,
        suppliers: [{
          ctin: "27aaaaa0000a1z5",
          inv: [{
            inum: "acme/inv/0042",
            idt: "15-04-2025",
            val: 11800,
            items: [{ rt: 18, txval: 10000, iamt: 0, camt: 900, samt: 900, csamt: 0 }],
          }],
        }],
      },
      [bill()]
    );
    expect(result.rows[0].status).toBe("MATCHED");
  });

  it("itcAvailable=false when supplier flagged itcavl=N", () => {
    const result = matchGstr2bToBills(
      {
        ...parsed,
        suppliers: [{
          ctin: "27AAAAA0000A1Z5",
          inv: [{
            inum: "BLOCKED/01",
            idt: "01-04-2025",
            val: 1000,
            itcavl: "N",
            items: [{ rt: 18, txval: 847, iamt: 0, camt: 76, samt: 77, csamt: 0 }],
          }],
        }],
      },
      []
    );
    const row = result.rows[0];
    expect(row.status).toBe("MISSING_IN_BOOKS");
    if (row.status === "MISSING_IN_BOOKS") {
      expect(row.itcAvailable).toBe(false);
    }
  });

  it("totals add up to row count", () => {
    const result = matchGstr2bToBills(
      {
        rtnprd: "042025",
        suppliers: [
          {
            ctin: "27AAAAA0000A1Z5",
            inv: [
              { inum: "INV1", idt: "01-04-2025", val: 100, items: [] },
              { inum: "INV2", idt: "02-04-2025", val: 200, items: [] },
            ],
          },
        ],
      },
      [bill({ vendorBillNo: "INV3" })]
    );
    const t = result.totals;
    const total = t.matched + t.mismatched + t.missingInBooks + t.missingIn2b;
    expect(total).toBe(result.rows.length);
  });
});
