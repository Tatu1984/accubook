import { describe, expect, it } from "vitest";
import {
  calculatePF,
  calculateESI,
  calculateProfessionalTax,
  calculateTDS,
  calculateLOP,
  PF_CONFIG,
  ESI_CONFIG,
} from "../payroll-calculations.util";

describe("calculatePF — Provident Fund", () => {
  it("12% of basic up to ₹15k cap", () => {
    // Basic ₹10k → PF wage = 10k → 12% = 1200
    const r = calculatePF(10000);
    expect(r.employee).toBe(1200);
    expect(r.employer).toBe(1200);
  });

  it("caps at ₹15k wage limit when basic exceeds it", () => {
    const r = calculatePF(50000);
    expect(r.employee).toBe(1800); // 15000 * 12%
    expect(r.employer).toBe(1800);
  });

  it("includes DA in PF wage", () => {
    const r = calculatePF(8000, 4000);
    // 8000 + 4000 = 12000 (under cap) → 12% = 1440
    expect(r.employee).toBe(1440);
    expect(r.employer).toBe(1440);
  });

  it("DA pushing past ₹15k still caps", () => {
    const r = calculatePF(10000, 8000);
    expect(r.employee).toBe(1800); // capped at 15000 * 12%
    expect(r.employer).toBe(1800);
  });

  it("uses configured constants (sanity)", () => {
    expect(PF_CONFIG.wageLimit).toBe(15000);
    expect(PF_CONFIG.employeeContribution).toBe(12);
    expect(PF_CONFIG.employerEPSContribution).toBe(8.33);
  });
});

describe("calculateESI — Employee State Insurance", () => {
  it("not applicable when gross > ₹21k", () => {
    const r = calculateESI(30000);
    expect(r.applicable).toBe(false);
    expect(r.employee).toBe(0);
    expect(r.employer).toBe(0);
  });

  it("0.75% employee + 3.25% employer on gross ≤ ₹21k", () => {
    const r = calculateESI(20000);
    expect(r.applicable).toBe(true);
    expect(r.employee).toBe(150); // 20000 * 0.75%
    expect(r.employer).toBe(650); // 20000 * 3.25%
  });

  it("applicable at exactly ₹21k boundary", () => {
    const r = calculateESI(21000);
    expect(r.applicable).toBe(true);
    expect(r.employee).toBe(158); // 21000 * 0.75% = 157.5 → 158 (rounded)
  });

  it("uses configured constants", () => {
    expect(ESI_CONFIG.wageLimit).toBe(21000);
    expect(ESI_CONFIG.employeeContribution).toBe(0.75);
    expect(ESI_CONFIG.employerContribution).toBe(3.25);
  });
});

describe("calculateProfessionalTax (Maharashtra slabs)", () => {
  it("zero PT for salary up to ₹7,500", () => {
    expect(calculateProfessionalTax(5000, 4)).toBe(0);
    expect(calculateProfessionalTax(7499, 4)).toBe(0);
  });

  it("₹175 for ₹7,500 to ₹10,000", () => {
    expect(calculateProfessionalTax(8000, 4)).toBe(175);
  });

  it("₹200 for above ₹10,000 (Apr-Jan)", () => {
    expect(calculateProfessionalTax(50000, 4)).toBe(200);
  });

  it("₹300 in February for above ₹10,000 (annual top-up)", () => {
    expect(calculateProfessionalTax(50000, 2)).toBe(300);
  });

  it("February's lower-slab earner doesn't get the top-up", () => {
    expect(calculateProfessionalTax(8000, 2)).toBe(175);
  });
});

describe("calculateTDS — annual income tax", () => {
  it("new regime: zero tax for income ≤ ₹7L (87A rebate)", () => {
    const r = calculateTDS(700000, "new");
    expect(r.annualTax).toBe(0);
    expect(r.monthlyTds).toBe(0);
  });

  it("new regime: tax kicks in above ₹7.5L (after standard deduction ₹75k)", () => {
    // 800000 - 75000 = 725000 taxable. 87A applies under 7L only, not here.
    // 0% to 3L, 5% on 3L-7L (= 20000), 10% on 7L-7.25L (= 2500). Tax = 22500.
    // + 4% cess = 23400.
    const r = calculateTDS(800000, "new");
    expect(r.annualTax).toBeGreaterThan(20000);
    expect(r.monthlyTds).toBeGreaterThan(1500);
  });

  it("old regime: 80C deduction reduces taxable income", () => {
    // 1000000 - 50000 std - 150000 (80C) = 800000 taxable.
    // 0% to 2.5L, 5% on 2.5L-5L (= 12500), 20% on 5L-8L (= 60000). Tax = 72500.
    // + 4% cess.
    const r = calculateTDS(1000000, "old", { section80C: 150000 });
    expect(r.annualTax).toBeGreaterThan(70000);
    expect(r.annualTax).toBeLessThan(80000);
  });

  it("old regime: 87A rebate for income ≤ ₹5L taxable", () => {
    // 500000 - 50000 = 450000 taxable. Under 5L → rebate.
    const r = calculateTDS(500000, "old");
    expect(r.annualTax).toBe(0);
  });

  it("monthly TDS = annual / 12", () => {
    const r = calculateTDS(1500000, "new");
    expect(r.monthlyTds).toBe(Math.round(r.annualTax / 12));
  });

  it("80C cap respected — ₹2L declared but only ₹1.5L deducted", () => {
    const withinCap = calculateTDS(1000000, "old", { section80C: 150000 });
    const overCap = calculateTDS(1000000, "old", { section80C: 200000 });
    expect(withinCap.annualTax).toBe(overCap.annualTax);
  });
});

describe("calculateLOP — loss-of-pay deduction", () => {
  it("0 days LOP → 0 deduction", () => {
    expect(calculateLOP(30000, 26, 0)).toBe(0);
  });

  it("3 LOP days out of 26 working days at ₹30k gross", () => {
    // perDay = 30000 / 26 = 1153.85; * 3 = 3461.54 → 3462 rounded
    expect(calculateLOP(30000, 26, 3)).toBe(3462);
  });

  it("LOP with zero working days returns 0 (no division by zero)", () => {
    expect(calculateLOP(30000, 0, 5)).toBe(0);
  });

  it("negative LOP days is treated as zero", () => {
    expect(calculateLOP(30000, 26, -1)).toBe(0);
  });
});
