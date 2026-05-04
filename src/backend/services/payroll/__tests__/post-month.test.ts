import { describe, it, expect } from "vitest";
import { buildPayrollJournal, type PayslipLineForJv } from "../post-month";

const makePayslip = (overrides: Partial<PayslipLineForJv> = {}): PayslipLineForJv => ({
  basicSalary: 30000,
  grossSalary: 60000,
  netSalary: 53400, // 60000 - 1800 PF - 4500 TDS - 200 PT - 100 ESI
  deductions: [
    { component: "PF (Employee)", amount: 1800 },
    { component: "ESI (Employee)", amount: 100 },
    { component: "TDS", amount: 4500 },
    { component: "Professional Tax", amount: 200 },
  ],
  employerPf: 1800,
  employerEsi: 433,
  ...overrides,
});

describe("buildPayrollJournal", () => {
  it("balances Dr = Cr for a single payslip with all components", () => {
    const jv = buildPayrollJournal([makePayslip()]);
    expect(jv.totalDebit.toString()).toBe(jv.totalCredit.toString());
  });

  it("sums correctly across multiple payslips", () => {
    const jv = buildPayrollJournal([makePayslip(), makePayslip()]);
    expect(jv.totals.gross.toString()).toBe("120000");
    expect(jv.totals.netSalary.toString()).toBe("106800");
    expect(jv.totals.pfEmployee.toString()).toBe("3600");
    expect(jv.totals.tds.toString()).toBe("9000");
  });

  it("treats LOP as a reduction to wages expense (Dr Salaries < gross)", () => {
    const jv = buildPayrollJournal([
      makePayslip({
        deductions: [
          { component: "PF (Employee)", amount: 1800 },
          { component: "Loss of Pay", amount: 5000 },
        ],
        netSalary: 53200, // 60000 - 1800 - 5000
      }),
    ]);
    const wages = jv.lines.find((l) => l.ledgerName === "Salaries & Wages")!;
    expect(wages.debit.toString()).toBe("55000"); // 60000 - 5000
    expect(jv.totalDebit.toString()).toBe(jv.totalCredit.toString());
  });

  it("PF Payable = employee PF + employer PF (combined credit)", () => {
    const jv = buildPayrollJournal([
      makePayslip({ employerPf: 1800 }),
      makePayslip({ employerPf: 1800 }),
    ]);
    const pfPayable = jv.lines.find((l) => l.ledgerName === "PF Payable")!;
    expect(pfPayable.credit.toString()).toBe("7200"); // 2*1800 emp + 2*1800 er
  });

  it("ESI Payable = employee ESI + employer ESI", () => {
    const jv = buildPayrollJournal([makePayslip()]);
    const esiPayable = jv.lines.find((l) => l.ledgerName === "ESI Payable")!;
    expect(esiPayable.credit.toString()).toBe("533"); // 100 + 433
  });

  it("drops zero-amount lines (e.g. ESI not applicable for high earners)", () => {
    const jv = buildPayrollJournal([
      makePayslip({
        deductions: [
          { component: "PF (Employee)", amount: 1800 },
          { component: "TDS", amount: 4500 },
          { component: "Professional Tax", amount: 200 },
          // no ESI
        ],
        netSalary: 53500,
        employerEsi: 0,
      }),
    ]);
    const esiPayable = jv.lines.find((l) => l.ledgerName === "ESI Payable");
    const employerEsi = jv.lines.find((l) => l.ledgerName === "Employer ESI Contribution");
    expect(esiPayable).toBeUndefined();
    expect(employerEsi).toBeUndefined();
  });

  it("skips employer contributions when not provided", () => {
    const jv = buildPayrollJournal([
      makePayslip({ employerPf: undefined, employerEsi: undefined }),
    ]);
    const employerPf = jv.lines.find((l) => l.ledgerName === "Employer PF Contribution");
    expect(employerPf).toBeUndefined();
    expect(jv.totals.pfEmployer.toString()).toBe("0");
    // Dr/Cr should still balance.
    expect(jv.totalDebit.toString()).toBe(jv.totalCredit.toString());
  });

  it("returns empty totals + empty lines for an empty batch", () => {
    const jv = buildPayrollJournal([]);
    expect(jv.lines).toHaveLength(0);
    expect(jv.totalDebit.toString()).toBe("0");
    expect(jv.totalCredit.toString()).toBe("0");
    expect(jv.totals.gross.toString()).toBe("0");
  });

  it("each payslip's components are preserved (no double-counting)", () => {
    // Three payslips — one with TDS, two without; PT for two, none for one.
    const jv = buildPayrollJournal([
      makePayslip({
        deductions: [
          { component: "PF (Employee)", amount: 1800 },
          { component: "TDS", amount: 4500 },
          { component: "Professional Tax", amount: 200 },
        ],
        netSalary: 53500,
      }),
      makePayslip({
        deductions: [
          { component: "PF (Employee)", amount: 1800 },
          { component: "Professional Tax", amount: 175 },
        ],
        netSalary: 58025,
      }),
      makePayslip({
        deductions: [{ component: "PF (Employee)", amount: 1800 }],
        netSalary: 58200,
      }),
    ]);
    expect(jv.totals.tds.toString()).toBe("4500");
    expect(jv.totals.professionalTax.toString()).toBe("375");
    expect(jv.totals.pfEmployee.toString()).toBe("5400");
  });
});
