import { describe, expect, it } from "vitest";
import { defaultCompositionRate, summarizeCmp08 } from "../cmp08";
import type { Cmp08Result } from "../cmp08";

describe("defaultCompositionRate", () => {
  it("returns 1% for traders / manufacturers", () => {
    expect(defaultCompositionRate("trader").toString()).toBe("1");
  });
  it("returns 5% for restaurants", () => {
    expect(defaultCompositionRate("restaurant").toString()).toBe("5");
  });
  it("returns 6% for service providers under Section 10(2A)", () => {
    expect(defaultCompositionRate("service").toString()).toBe("6");
  });
});

describe("summarizeCmp08", () => {
  const base: Cmp08Result = {
    fiscalYear: "2025-26",
    quarter: 1,
    period: { from: "2025-04-01", to: "2025-06-30" },
    rate: "1",
    outwardTurnover: "500000",
    inwardReverseCharge: {
      taxableValue: "0",
      igst: "0",
      cgst: "0",
      sgst: "0",
    },
    compositionTax: {
      cgst: "2500",
      sgst: "2500",
      total: "5000",
    },
    totalTaxPayable: "5000",
  };

  it("renders a one-liner with quarter, FY, turnover, rate, tax", () => {
    const s = summarizeCmp08(base);
    expect(s).toContain("Q1 2025-26");
    expect(s).toContain("₹500000");
    expect(s).toContain("1%");
    expect(s).toContain("5000");
  });

  it("notes RCM addition when inward RCM is non-zero", () => {
    const r: Cmp08Result = {
      ...base,
      inwardReverseCharge: {
        taxableValue: "10000",
        igst: "1800",
        cgst: "0",
        sgst: "0",
      },
      totalTaxPayable: "6800",
    };
    const s = summarizeCmp08(r);
    expect(s.toLowerCase()).toContain("rcm");
  });
});
