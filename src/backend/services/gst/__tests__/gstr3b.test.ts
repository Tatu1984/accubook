import { describe, expect, it } from "vitest";
import { computeGstr3b, summarizeGstr3b } from "../gstr3b";

function stubDb(invoices: unknown[], bills: unknown[]) {
  return {
    invoice: { findMany: async () => invoices },
    bill: { findMany: async () => bills },
  } as unknown as Parameters<typeof computeGstr3b>[0];
}

const period = {
  from: new Date("2026-04-01T00:00:00.000Z"),
  to: new Date("2026-04-30T23:59:59.999Z"),
};

describe("computeGstr3b — Section 3.1 outward classifications", () => {
  it("regular taxable invoice flows into 3.1(a)", async () => {
    const db = stubDb(
      [
        {
          type: "INVOICE",
          supplyType: "INTRASTATE",
          reverseCharge: false,
          items: [{
            taxableAmount: "1000",
            cgstAmount: "90", sgstAmount: "90", igstAmount: "0", cessAmount: "0",
          }],
        },
      ],
      []
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s3_1.outwardTaxable.taxableValue).toBe("1000");
    expect(r.s3_1.outwardTaxable.cgst).toBe("90");
    expect(r.s3_1.outwardTaxable.sgst).toBe("90");
    expect(r.s3_1.outwardZeroRated.taxableValue).toBe("0");
    expect(r.s3_1.outwardNilRated.taxableValue).toBe("0");
  });

  it("export invoice flows into 3.1(b) zero-rated", async () => {
    const db = stubDb(
      [
        {
          type: "INVOICE",
          supplyType: "EXPORT",
          reverseCharge: false,
          items: [{
            taxableAmount: "100000",
            cgstAmount: "0", sgstAmount: "0", igstAmount: "18000", cessAmount: "0",
          }],
        },
      ],
      []
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s3_1.outwardZeroRated.taxableValue).toBe("100000");
    expect(r.s3_1.outwardZeroRated.igst).toBe("18000");
    expect(r.s3_1.outwardTaxable.taxableValue).toBe("0");
  });

  it("zero-tax non-export invoice flows into 3.1(c) nil-rated", async () => {
    const db = stubDb(
      [
        {
          type: "INVOICE",
          supplyType: "INTRASTATE",
          reverseCharge: false,
          items: [{
            taxableAmount: "5000",
            cgstAmount: "0", sgstAmount: "0", igstAmount: "0", cessAmount: "0",
          }],
        },
      ],
      []
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s3_1.outwardNilRated.taxableValue).toBe("5000");
    expect(r.s3_1.outwardTaxable.taxableValue).toBe("0");
  });

  it("CREDIT_NOTE reduces outward (signed accumulation)", async () => {
    const db = stubDb(
      [
        {
          type: "INVOICE",
          supplyType: "INTRASTATE",
          reverseCharge: false,
          items: [{
            taxableAmount: "1000",
            cgstAmount: "90", sgstAmount: "90", igstAmount: "0", cessAmount: "0",
          }],
        },
        {
          type: "CREDIT_NOTE",
          supplyType: "INTRASTATE",
          reverseCharge: false,
          items: [{
            taxableAmount: "200",
            cgstAmount: "18", sgstAmount: "18", igstAmount: "0", cessAmount: "0",
          }],
        },
      ],
      []
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s3_1.outwardTaxable.taxableValue).toBe("800");
    expect(r.s3_1.outwardTaxable.cgst).toBe("72");
    expect(r.s3_1.outwardTaxable.sgst).toBe("72");
  });
});

describe("computeGstr3b — Section 3.1(d) RCM inward + Section 4 ITC", () => {
  it("RCM bill posts to both inwardReverseCharge AND itc.reverseCharge", async () => {
    const db = stubDb(
      [],
      [
        {
          reverseCharge: true,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "1000",
            cgstAmount: "90", sgstAmount: "90", igstAmount: "0", cessAmount: "0",
          }],
        },
      ]
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s3_1.inwardReverseCharge.taxableValue).toBe("1000");
    expect(r.s3_1.inwardReverseCharge.cgst).toBe("90");
    expect(r.s4.available.reverseCharge.taxableValue).toBe("1000");
    expect(r.s4.available.reverseCharge.cgst).toBe("90");
    expect(r.s4.available.other.taxableValue).toBe("0");
  });

  it("regular non-RCM bill flows into 4.A.(5) other ITC only", async () => {
    const db = stubDb(
      [],
      [
        {
          reverseCharge: false,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "5000",
            cgstAmount: "450", sgstAmount: "450", igstAmount: "0", cessAmount: "0",
          }],
        },
      ]
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s3_1.inwardReverseCharge.taxableValue).toBe("0");
    expect(r.s4.available.other.taxableValue).toBe("5000");
    expect(r.s4.available.other.cgst).toBe("450");
  });

  it("Section 4.C net ITC = available − reversed", async () => {
    const db = stubDb(
      [],
      [
        {
          reverseCharge: false,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "5000",
            cgstAmount: "450", sgstAmount: "450", igstAmount: "0", cessAmount: "0",
          }],
        },
      ]
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s4.net.cgst).toBe("450");
    expect(r.s4.net.sgst).toBe("450");
  });
});

describe("computeGstr3b — Section 5 exempt inward", () => {
  it("intra-state zero-tax bill rolls into intraStateExempt", async () => {
    const db = stubDb(
      [],
      [
        {
          reverseCharge: false,
          supplyType: "INTRASTATE",
          items: [{
            taxableAmount: "2000",
            cgstAmount: "0", sgstAmount: "0", igstAmount: "0", cessAmount: "0",
          }],
        },
      ]
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s5.intraStateExempt).toBe("2000");
    expect(r.s5.interStateExempt).toBe("0");
  });

  it("inter-state zero-tax bill rolls into interStateExempt", async () => {
    const db = stubDb(
      [],
      [
        {
          reverseCharge: false,
          supplyType: "INTERSTATE",
          items: [{
            taxableAmount: "3000",
            cgstAmount: "0", sgstAmount: "0", igstAmount: "0", cessAmount: "0",
          }],
        },
      ]
    );
    const r = await computeGstr3b(db, "org-1", period);
    expect(r.s5.interStateExempt).toBe("3000");
    expect(r.s5.intraStateExempt).toBe("0");
  });
});

describe("summarizeGstr3b", () => {
  it("net payable = output tax + RCM − net ITC", async () => {
    const db = stubDb(
      [
        {
          type: "INVOICE", supplyType: "INTRASTATE", reverseCharge: false,
          items: [{ taxableAmount: "10000", cgstAmount: "900", sgstAmount: "900", igstAmount: "0", cessAmount: "0" }],
        },
      ],
      [
        {
          reverseCharge: false, supplyType: "INTRASTATE",
          items: [{ taxableAmount: "5000", cgstAmount: "450", sgstAmount: "450", igstAmount: "0", cessAmount: "0" }],
        },
      ]
    );
    const r = await computeGstr3b(db, "org-1", period);
    const s = summarizeGstr3b(r);
    expect(s.outwardTax.cgst).toBe("900");
    expect(s.itcNet.cgst).toBe("450");
    expect(s.netPayable.cgst).toBe("450");
    expect(s.netPayable.sgst).toBe("450");
  });
});
