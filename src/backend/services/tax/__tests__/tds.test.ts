import { describe, expect, it } from "vitest";
import { computeTds, TDS_RULES } from "../tds";

describe("TDS — Section 194C (contractor payments)", () => {
  it("single contractor invoice ₹50k to a company → 2% TDS = ₹1000", () => {
    const r = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "50000",
    });
    expect(r.amount.toString()).toBe("1000");
    expect(r.rate.toString()).toBe("2");
    expect(r.netAfter.toString()).toBe("49000");
    expect(r.appliedReason).toBe("DEDUCTED");
  });

  it("single contractor invoice ₹50k to an individual → 1% TDS = ₹500", () => {
    const r = computeTds({
      section: "194C",
      deducteeType: "INDIVIDUAL_HUF",
      amount: "50000",
    });
    expect(r.amount.toString()).toBe("500");
    expect(r.rate.toString()).toBe("1");
  });

  it("single contractor invoice ₹25k → below ₹30k single threshold, no deduction", () => {
    const r = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "25000",
    });
    expect(r.amount.isZero()).toBe(true);
    expect(r.appliedReason).toBe("BELOW_SINGLE_THRESHOLD");
    expect(r.netAfter.toString()).toBe("25000");
  });

  it("contractor invoice ₹40k with ytd ₹70k → crosses ₹100k annual threshold, full TDS", () => {
    const r = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "40000",
      ytdAggregate: "70000",
    });
    // Once annual crossed, full transaction is taxed at the section rate.
    expect(r.amount.toString()).toBe("800"); // 40000 * 2% = 800
    expect(r.appliedReason).toBe("DEDUCTED");
  });

  it("transport contractor with PAN (194C_TRANSPORT) → 0% rate", () => {
    const r = computeTds({
      section: "194C_TRANSPORT",
      deducteeType: "INDIVIDUAL_HUF",
      amount: "100000",
    });
    expect(r.amount.isZero()).toBe(true);
    expect(r.appliedReason).toBe("ZERO_RATE");
    expect(r.netAfter.toString()).toBe("100000");
  });
});

describe("TDS — Section 194J (professional services)", () => {
  it("invoice ₹50k → 10% TDS = ₹5000", () => {
    const r = computeTds({
      section: "194J",
      deducteeType: "COMPANY_OTHER",
      amount: "50000",
    });
    expect(r.amount.toString()).toBe("5000");
    expect(r.netAfter.toString()).toBe("45000");
  });

  it("invoice ₹25k → below ₹30k single threshold, no deduction", () => {
    const r = computeTds({
      section: "194J",
      deducteeType: "COMPANY_OTHER",
      amount: "25000",
    });
    expect(r.amount.isZero()).toBe(true);
    expect(r.appliedReason).toBe("BELOW_SINGLE_THRESHOLD");
  });
});

describe("TDS — Section 194Q (purchase of goods, threshold-excess only)", () => {
  it("vendor purchase ₹2L with ytd ₹40L → cumulative ₹42L still below ₹50L, no TDS", () => {
    const r = computeTds({
      section: "194Q",
      deducteeType: "COMPANY_OTHER",
      amount: "200000",
      ytdAggregate: "4000000",
    });
    expect(r.amount.isZero()).toBe(true);
    expect(r.appliedReason).toBe("BELOW_ANNUAL_THRESHOLD");
  });

  it("vendor purchase ₹15L with ytd ₹40L → only the ₹5L over threshold is taxed", () => {
    // ytd 4000000 + amount 1500000 = 5500000; threshold 5000000.
    // Excess = 5500000 - 5000000 = 500000. TDS @ 0.1% = 500.
    const r = computeTds({
      section: "194Q",
      deducteeType: "COMPANY_OTHER",
      amount: "1500000",
      ytdAggregate: "4000000",
    });
    expect(r.amount.toString()).toBe("500");
    expect(r.netAfter.toString()).toBe("1499500");
    expect(r.appliedReason).toBe("DEDUCTED");
  });

  it("vendor purchase ₹10L with ytd ₹60L → already over threshold, full amount taxed", () => {
    // ytd >= threshold → entire current amount is taxable.
    const r = computeTds({
      section: "194Q",
      deducteeType: "COMPANY_OTHER",
      amount: "1000000",
      ytdAggregate: "6000000",
    });
    expect(r.amount.toString()).toBe("1000"); // 1000000 * 0.1% = 1000
    expect(r.appliedReason).toBe("DEDUCTED");
  });
});

describe("TCS — Section 206C(1H) (sale of goods over ₹50L per buyer per year)", () => {
  it("sale ₹15L with buyer ytd ₹40L → ₹5L over threshold gets TCS @ 0.1% = ₹500", () => {
    const r = computeTds({
      section: "206C_1H",
      deducteeType: "COMPANY_OTHER",
      amount: "1500000",
      ytdAggregate: "4000000",
    });
    expect(r.type).toBe("TCS");
    expect(r.amount.toString()).toBe("500");
    // TCS is COLLECTED on top of sale price, not deducted.
    expect(r.netAfter.toString()).toBe("1500500");
  });
});

describe("TDS — Section 194I (rent)", () => {
  it("monthly rent ₹50k with ytd ₹250k → annual threshold crossed, full ₹50k taxed", () => {
    // 240000 + 50000 = 290000 > 240000 threshold. Full amount taxed at 10%.
    const r = computeTds({
      section: "194I_LAND",
      deducteeType: "COMPANY_OTHER",
      amount: "50000",
      ytdAggregate: "240000",
    });
    expect(r.amount.toString()).toBe("5000");
    expect(r.netAfter.toString()).toBe("45000");
  });

  it("monthly rent ₹15k with ytd ₹150k → cumulative ₹165k below ₹240k, no TDS", () => {
    const r = computeTds({
      section: "194I_LAND",
      deducteeType: "COMPANY_OTHER",
      amount: "15000",
      ytdAggregate: "150000",
    });
    expect(r.amount.isZero()).toBe(true);
    expect(r.appliedReason).toBe("BELOW_ANNUAL_THRESHOLD");
  });

  it("plant & machinery rent uses 2% rate (194I_PM)", () => {
    const r = computeTds({
      section: "194I_PM",
      deducteeType: "COMPANY_OTHER",
      amount: "30000",
      ytdAggregate: "240000",
    });
    expect(r.amount.toString()).toBe("600"); // 30000 * 2% = 600
  });
});

describe("TDS — penal rate when no PAN furnished", () => {
  it("194C invoice ₹50k without PAN → 20% penal rate, not section rate", () => {
    const r = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "50000",
      noPan: true,
    });
    expect(r.rate.toString()).toBe("20");
    expect(r.amount.toString()).toBe("10000");
    expect(r.netAfter.toString()).toBe("40000");
  });

  it("noPan still respects single-transaction threshold", () => {
    const r = computeTds({
      section: "194C",
      deducteeType: "COMPANY_OTHER",
      amount: "20000",
      noPan: true,
    });
    expect(r.amount.isZero()).toBe(true);
    expect(r.appliedReason).toBe("BELOW_SINGLE_THRESHOLD");
  });
});

describe("TDS_RULES table integrity", () => {
  it("every section has a non-empty description and a type", () => {
    for (const code of Object.keys(TDS_RULES)) {
      const rule = TDS_RULES[code as keyof typeof TDS_RULES];
      expect(rule.description.length).toBeGreaterThan(0);
      expect(["TDS", "TCS"]).toContain(rule.type);
    }
  });

  it("204Q and 206C(1H) thresholds set to ₹50 lakh", () => {
    expect(TDS_RULES["194Q"].thresholdAnnual).toBe("5000000");
    expect(TDS_RULES["206C_1H"].thresholdAnnual).toBe("5000000");
  });
});
