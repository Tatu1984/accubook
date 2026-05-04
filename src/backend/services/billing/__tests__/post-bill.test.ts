import { describe, expect, it } from "vitest";
import { decideBillEntries } from "../post-bill";

const balances = (plan: ReturnType<typeof decideBillEntries>) => ({
  dr: plan.drExpense.plus(plan.drGstInput),
  cr: plan.crVendor.plus(plan.crGstOutputRcm).plus(plan.crTds),
});

describe("decideBillEntries — invariants", () => {
  it("Dr equals Cr in every variant", () => {
    const cases = [
      { taxable: 10000, gst: 1800, tdsAmount: 0, reverseCharge: false, composition: false },
      { taxable: 10000, gst: 1800, tdsAmount: 0, reverseCharge: true, composition: false },
      { taxable: 10000, gst: 1800, tdsAmount: 0, reverseCharge: false, composition: true },
      { taxable: 10000, gst: 1800, tdsAmount: 0, reverseCharge: true, composition: true },
      { taxable: 100000, gst: 18000, tdsAmount: 10000, reverseCharge: false, composition: false },
      { taxable: 100000, gst: 18000, tdsAmount: 10000, reverseCharge: true, composition: false },
      { taxable: 100000, gst: 18000, tdsAmount: 10000, reverseCharge: false, composition: true },
      { taxable: 100000, gst: 18000, tdsAmount: 10000, reverseCharge: true, composition: true },
    ];
    for (const c of cases) {
      const plan = decideBillEntries(c);
      const { dr, cr } = balances(plan);
      expect(dr.toString()).toBe(cr.toString());
    }
  });
});

describe("decideBillEntries — regular bill (ITC eligible, no RCM, no TDS)", () => {
  it("books expense at taxable + GST as input + vendor at total", () => {
    const plan = decideBillEntries({
      taxable: 10000,
      gst: 1800,
      tdsAmount: 0,
      reverseCharge: false,
      composition: false,
    });
    expect(plan.drExpense.toString()).toBe("10000");
    expect(plan.drGstInput.toString()).toBe("1800");
    expect(plan.crVendor.toString()).toBe("11800");
    expect(plan.crGstOutputRcm.toString()).toBe("0");
    expect(plan.crTds.toString()).toBe("0");
  });
});

describe("decideBillEntries — RCM (reverse charge)", () => {
  it("vendor only paid taxable; GST flows to GST Output RCM", () => {
    const plan = decideBillEntries({
      taxable: 10000,
      gst: 1800,
      tdsAmount: 0,
      reverseCharge: true,
      composition: false,
    });
    expect(plan.drExpense.toString()).toBe("10000");
    expect(plan.drGstInput.toString()).toBe("1800"); // RCM ITC still claimable
    expect(plan.crVendor.toString()).toBe("10000");
    expect(plan.crGstOutputRcm.toString()).toBe("1800");
    expect(plan.crTds.toString()).toBe("0");
  });
});

describe("decideBillEntries — composition recipient", () => {
  it("collapses GST into expense (no ITC); books vendor at total", () => {
    const plan = decideBillEntries({
      taxable: 10000,
      gst: 1800,
      tdsAmount: 0,
      reverseCharge: false,
      composition: true,
    });
    expect(plan.drExpense.toString()).toBe("11800");
    expect(plan.drGstInput.toString()).toBe("0");
    expect(plan.crVendor.toString()).toBe("11800");
    expect(plan.crGstOutputRcm.toString()).toBe("0");
  });
});

describe("decideBillEntries — composition + RCM", () => {
  it("expense includes GST (no ITC); vendor pays only taxable; GST owed to govt", () => {
    const plan = decideBillEntries({
      taxable: 10000,
      gst: 1800,
      tdsAmount: 0,
      reverseCharge: true,
      composition: true,
    });
    expect(plan.drExpense.toString()).toBe("11800");
    expect(plan.drGstInput.toString()).toBe("0");
    expect(plan.crVendor.toString()).toBe("10000");
    expect(plan.crGstOutputRcm.toString()).toBe("1800");
  });
});

describe("decideBillEntries — TDS at bill time", () => {
  it("regular bill with 10% TDS: vendor receives total minus tds", () => {
    const plan = decideBillEntries({
      taxable: 100000,
      gst: 18000,
      tdsAmount: 10000,
      reverseCharge: false,
      composition: false,
    });
    expect(plan.drExpense.toString()).toBe("100000");
    expect(plan.drGstInput.toString()).toBe("18000");
    expect(plan.crVendor.toString()).toBe("108000"); // 118000 - 10000
    expect(plan.crTds.toString()).toBe("10000");
  });

  it("RCM bill with TDS: vendor gets taxable - tds; GST goes to RCM payable", () => {
    const plan = decideBillEntries({
      taxable: 100000,
      gst: 18000,
      tdsAmount: 10000,
      reverseCharge: true,
      composition: false,
    });
    expect(plan.drExpense.toString()).toBe("100000");
    expect(plan.drGstInput.toString()).toBe("18000");
    expect(plan.crVendor.toString()).toBe("90000"); // 100000 - 10000
    expect(plan.crGstOutputRcm.toString()).toBe("18000");
    expect(plan.crTds.toString()).toBe("10000");
  });
});

describe("decideBillEntries — zero / odd inputs", () => {
  it("nil-rated bill (zero GST) still balances", () => {
    const plan = decideBillEntries({
      taxable: 10000,
      gst: 0,
      tdsAmount: 0,
      reverseCharge: false,
      composition: false,
    });
    expect(plan.drExpense.toString()).toBe("10000");
    expect(plan.drGstInput.toString()).toBe("0");
    expect(plan.crVendor.toString()).toBe("10000");
  });

  it("rounding-friendly Decimal arithmetic — no float drift", () => {
    const plan = decideBillEntries({
      taxable: "1234.56",
      gst: "222.22",
      tdsAmount: "123.45",
      reverseCharge: false,
      composition: false,
    });
    const total = plan.drExpense.plus(plan.drGstInput);
    const back = plan.crVendor.plus(plan.crTds);
    expect(total.toString()).toBe(back.toString());
  });
});
