import { describe, expect, it } from "vitest";
import { gstr9ToPortalJson, gstr9PortalFilename } from "../gstr9-portal";
import type { Gstr9Result, Gstr9TaxBlock } from "../gstr9";

const opts = {
  gstin: "27AAAAA0000A1Z5",
  precedingFyTurnover: 12500000,
};

const taxBlock = (
  taxableValue = "0",
  igst = "0",
  cgst = "0",
  sgst = "0",
  cess = "0"
): Gstr9TaxBlock => ({ taxableValue, igst, cgst, sgst, cess });

const baseResult = (overrides: Partial<Gstr9Result> = {}): Gstr9Result => ({
  fiscalYear: { start: "2025-04-01", end: "2026-03-31", label: "2025-26" },
  s4: {
    b2cOutward: taxBlock(),
    b2bOutward: taxBlock(),
    exportsWithTax: taxBlock(),
    sezWithTax: taxBlock(),
    deemedExports: taxBlock(),
    advances: taxBlock(),
    inwardReverseCharge: taxBlock(),
    subtotal: taxBlock(),
    creditNotesAdjustment: taxBlock(),
    debitNotesAdjustment: taxBlock(),
    amendments: taxBlock(),
    netSupplies: taxBlock(),
  },
  s5: {
    exportsLut: taxBlock(),
    sezLut: taxBlock(),
    outwardRcm: taxBlock(),
    exempt: taxBlock(),
    nilRated: taxBlock(),
    nonGst: taxBlock(),
    total: taxBlock(),
  },
  s6: {
    totalItcAvailed: taxBlock(),
    rcmDomestic: taxBlock(),
    totalItcSubtotal: taxBlock(),
  },
  s7: {
    reversed: taxBlock(),
    netItc: taxBlock(),
  },
  s9: {
    taxPayable: taxBlock(),
    paidThroughItc: taxBlock(),
    paidInCash: taxBlock(),
  },
  ...overrides,
});

describe("gstr9ToPortalJson — header", () => {
  it("uppercases GSTIN and surfaces FY label as `fp`", () => {
    const r = baseResult();
    const out = gstr9ToPortalJson(r, { gstin: "27aaaaa0000a1z5" });
    expect(out.gstin).toBe("27AAAAA0000A1Z5");
    expect(out.fp).toBe("2025-26");
  });

  it("passes preceding FY turnover through to `gt`", () => {
    const out = gstr9ToPortalJson(baseResult(), opts);
    expect(out.gt).toBe(12500000);
  });

  it("defaults `gt` to 0 when not supplied", () => {
    const out = gstr9ToPortalJson(baseResult(), { gstin: opts.gstin });
    expect(out.gt).toBe(0);
  });

  it("computes `cur_gt` from 4N + 5N taxable values", () => {
    const r = baseResult({
      s4: {
        ...baseResult().s4,
        netSupplies: taxBlock("8000000", "0", "0", "0", "0"),
      },
      s5: {
        ...baseResult().s5,
        total: taxBlock("500000", "0", "0", "0", "0"),
      },
    });
    const out = gstr9ToPortalJson(r, opts);
    expect(out.cur_gt).toBe(8500000);
  });
});

describe("gstr9ToPortalJson — Section 4", () => {
  it("maps every cell A through N", () => {
    const r = baseResult({
      s4: {
        b2cOutward: taxBlock("100000", "0", "9000", "9000", "0"),
        b2bOutward: taxBlock("500000", "20000", "20000", "20000", "0"),
        exportsWithTax: taxBlock("300000", "54000", "0", "0", "0"),
        sezWithTax: taxBlock(),
        deemedExports: taxBlock(),
        advances: taxBlock(),
        inwardReverseCharge: taxBlock("50000", "0", "4500", "4500", "0"),
        subtotal: taxBlock("950000", "74000", "33500", "33500", "0"),
        creditNotesAdjustment: taxBlock("10000", "0", "900", "900", "0"),
        debitNotesAdjustment: taxBlock("5000", "0", "450", "450", "0"),
        amendments: taxBlock(),
        netSupplies: taxBlock("945000", "74000", "33050", "33050", "0"),
      },
    });
    const out = gstr9ToPortalJson(r, opts);
    expect(out.sec_4.tx_4a.txval).toBe(100000);
    expect(out.sec_4.tx_4b.txval).toBe(500000);
    expect(out.sec_4.tx_4c.iamt).toBe(54000);
    expect(out.sec_4.tx_4g.txval).toBe(50000);
    expect(out.sec_4.tx_4i.camt).toBe(900);
    expect(out.sec_4.tx_4n.txval).toBe(945000);
  });

  it("emits zero rows for unmodeled 4D/4E/4F/4K/4L", () => {
    const out = gstr9ToPortalJson(baseResult(), opts);
    expect(out.sec_4.tx_4d.txval).toBe(0);
    expect(out.sec_4.tx_4e.txval).toBe(0);
    expect(out.sec_4.tx_4f.txval).toBe(0);
    expect(out.sec_4.tx_4k.txval).toBe(0);
    expect(out.sec_4.tx_4l.txval).toBe(0);
  });
});

describe("gstr9ToPortalJson — Section 5", () => {
  it("populates 5A LUT exports and 5N total from compute", () => {
    const r = baseResult({
      s5: {
        ...baseResult().s5,
        exportsLut: taxBlock("200000", "0", "0", "0", "0"),
        exempt: taxBlock("30000", "0", "0", "0", "0"),
        total: taxBlock("230000", "0", "0", "0", "0"),
      },
    });
    const out = gstr9ToPortalJson(r, opts);
    expect(out.sec_5.tx_5a.txval).toBe(200000);
    expect(out.sec_5.tx_5d.txval).toBe(30000);
    expect(out.sec_5.tx_5n.txval).toBe(230000);
    // 5H placeholder mirrors 5N until subtotal is broken out.
    expect(out.sec_5.tx_5h.txval).toBe(230000);
  });
});

describe("gstr9ToPortalJson — Section 6 ITC", () => {
  it("populates 6A total ITC + 6B RCM domestic + 6M/6O subtotal", () => {
    const r = baseResult({
      s6: {
        totalItcAvailed: taxBlock("0", "10000", "5000", "5000", "0"),
        rcmDomestic: taxBlock("0", "1000", "500", "500", "0"),
        totalItcSubtotal: taxBlock("0", "10000", "5000", "5000", "0"),
      },
    });
    const out = gstr9ToPortalJson(r, opts);
    expect(out.sec_6.tx_6a).toEqual({ iamt: 10000, camt: 5000, samt: 5000, csamt: 0 });
    expect(out.sec_6.tx_6b).toEqual({ iamt: 1000, camt: 500, samt: 500, csamt: 0 });
    expect(out.sec_6.tx_6m).toEqual({ iamt: 10000, camt: 5000, samt: 5000, csamt: 0 });
    expect(out.sec_6.tx_6o).toEqual({ iamt: 10000, camt: 5000, samt: 5000, csamt: 0 });
  });

  it("emits zero rows for unmodeled 6C-H + 6N", () => {
    const out = gstr9ToPortalJson(baseResult(), opts);
    expect(out.sec_6.tx_6c.iamt).toBe(0);
    expect(out.sec_6.tx_6e.iamt).toBe(0);
    expect(out.sec_6.tx_6n.iamt).toBe(0);
  });
});

describe("gstr9ToPortalJson — Section 7 reversal", () => {
  it("collapses our compute into 7H + 7I; rule-by-rule 7A-G are zero", () => {
    const r = baseResult({
      s7: {
        reversed: taxBlock("0", "200", "100", "100", "0"),
        netItc: taxBlock("0", "9800", "4900", "4900", "0"),
      },
    });
    const out = gstr9ToPortalJson(r, opts);
    expect(out.sec_7.tx_7a.iamt).toBe(0); // Rule 37 placeholder
    expect(out.sec_7.tx_7d.iamt).toBe(0); // Rule 43 placeholder
    expect(out.sec_7.tx_7h.iamt).toBe(200); // bulk
    expect(out.sec_7.tx_7i.iamt).toBe(200);
    expect(out.sec_7.tx_7j.iamt).toBe(9800);
  });
});

describe("gstr9ToPortalJson — Section 9 tax paid", () => {
  it("maps payable / paidThroughItc / paidInCash", () => {
    const r = baseResult({
      s9: {
        taxPayable: taxBlock("0", "30000", "20000", "20000", "0"),
        paidThroughItc: taxBlock("0", "10000", "5000", "5000", "0"),
        paidInCash: taxBlock("0", "20000", "15000", "15000", "0"),
      },
    });
    const out = gstr9ToPortalJson(r, opts);
    expect(out.sec_9.tx_payable.iamt).toBe(30000);
    expect(out.sec_9.tx_paid_itc.iamt).toBe(10000);
    expect(out.sec_9.tx_paid_cash.iamt).toBe(20000);
    expect(out.sec_9.tx_int.iamt).toBe(0);
  });
});

describe("gstr9PortalFilename", () => {
  it("formats as GSTR9_<gstin>_<fy>.json with uppercase GSTIN", () => {
    expect(gstr9PortalFilename("27aaaaa0000a1z5", "2025-26")).toBe(
      "GSTR9_27AAAAA0000A1Z5_2025-26.json"
    );
  });
});
