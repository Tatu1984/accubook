import { D, sum, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * Pure aggregator for a payroll month-end JV.
 *
 * Collapses N payslips into a single journal voucher with one line per
 * affected ledger. Caller is responsible for:
 *   - resolving each ledger name to a real ledgerId (via getOrCreateNamedLedger),
 *   - creating the Voucher + VoucherEntry rows,
 *   - applying ledger balances,
 *   - linking the resulting voucherId back onto the included payslips.
 *
 * Accounting shape (when all components are non-zero):
 *   Dr Salaries & Wages              (gross − LOP)
 *   Dr Employer PF Contribution      (employer PF)
 *   Dr Employer ESI Contribution     (employer ESI)
 *     Cr Salaries Payable            (net salary owed to employees)
 *     Cr PF Payable                  (employee PF + employer PF)
 *     Cr ESI Payable                 (employee ESI + employer ESI)
 *     Cr Professional Tax Payable    (PT)
 *     Cr TDS Payable                 (TDS withheld)
 *
 * LOP is treated as a reduction to wage expense — the company doesn't
 * owe the LOP'd amount to anyone, so it's netted against gross before
 * booking. Total Dr always equals total Cr by construction.
 */

export type PayslipLineForJv = {
  basicSalary: DecimalLike;
  /** Gross salary BEFORE LOP. */
  grossSalary: DecimalLike;
  netSalary: DecimalLike;
  /**
   * The Payslip.deductions JSON column — array of `{component, amount}`.
   * Components we look for: "PF (Employee)", "ESI (Employee)", "TDS",
   * "Professional Tax", "Loss of Pay". Anything else is ignored for
   * posting (treated as informational).
   */
  deductions: Array<{ component: string; amount: number | string }>;
  /**
   * Optional employer-side amounts. If absent we treat them as zero —
   * the calling endpoint passes them in based on calculatePayroll's
   * employerContributions, which the existing payslip JSON does not
   * persist on its own.
   */
  employerPf?: DecimalLike;
  employerEsi?: DecimalLike;
};

export type PayrollJournalLine = {
  ledgerName: string;
  groupName: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

export type PayrollJournal = {
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  lines: PayrollJournalLine[];
  totals: {
    gross: Prisma.Decimal;
    lop: Prisma.Decimal;
    pfEmployee: Prisma.Decimal;
    pfEmployer: Prisma.Decimal;
    esiEmployee: Prisma.Decimal;
    esiEmployer: Prisma.Decimal;
    professionalTax: Prisma.Decimal;
    tds: Prisma.Decimal;
    netSalary: Prisma.Decimal;
  };
};

const SALARIES_EXPENSE = "Salaries & Wages";
const EMPLOYER_PF_EXPENSE = "Employer PF Contribution";
const EMPLOYER_ESI_EXPENSE = "Employer ESI Contribution";
const SALARIES_PAYABLE = "Salaries Payable";
const PF_PAYABLE = "PF Payable";
const ESI_PAYABLE = "ESI Payable";
const PT_PAYABLE = "Professional Tax Payable";
const TDS_PAYABLE = "TDS Payable";

const GROUP_INDIRECT = "Indirect Expenses";
const GROUP_CURRENT_LIAB = "Current Liabilities";
const GROUP_DUTIES = "Duties & Taxes";

function deductionAmount(
  deds: PayslipLineForJv["deductions"],
  component: string
): Prisma.Decimal {
  const found = deds.find((d) => d.component === component);
  return found ? D(found.amount) : D(0);
}

export function buildPayrollJournal(payslips: PayslipLineForJv[]): PayrollJournal {
  const gross = sum(payslips.map((p) => D(p.grossSalary)));
  const net = sum(payslips.map((p) => D(p.netSalary)));
  const pfEmployee = sum(payslips.map((p) => deductionAmount(p.deductions, "PF (Employee)")));
  const esiEmployee = sum(payslips.map((p) => deductionAmount(p.deductions, "ESI (Employee)")));
  const tds = sum(payslips.map((p) => deductionAmount(p.deductions, "TDS")));
  const professionalTax = sum(payslips.map((p) => deductionAmount(p.deductions, "Professional Tax")));
  const lop = sum(payslips.map((p) => deductionAmount(p.deductions, "Loss of Pay")));
  const pfEmployer = sum(payslips.map((p) => D(p.employerPf ?? 0)));
  const esiEmployer = sum(payslips.map((p) => D(p.employerEsi ?? 0)));

  const wagesExpense = gross.minus(lop);

  const linesWithZeroes: PayrollJournalLine[] = [
    { ledgerName: SALARIES_EXPENSE, groupName: GROUP_INDIRECT, debit: wagesExpense, credit: D(0) },
    { ledgerName: EMPLOYER_PF_EXPENSE, groupName: GROUP_INDIRECT, debit: pfEmployer, credit: D(0) },
    { ledgerName: EMPLOYER_ESI_EXPENSE, groupName: GROUP_INDIRECT, debit: esiEmployer, credit: D(0) },
    { ledgerName: SALARIES_PAYABLE, groupName: GROUP_CURRENT_LIAB, debit: D(0), credit: net },
    { ledgerName: PF_PAYABLE, groupName: GROUP_DUTIES, debit: D(0), credit: pfEmployee.plus(pfEmployer) },
    { ledgerName: ESI_PAYABLE, groupName: GROUP_DUTIES, debit: D(0), credit: esiEmployee.plus(esiEmployer) },
    { ledgerName: PT_PAYABLE, groupName: GROUP_DUTIES, debit: D(0), credit: professionalTax },
    { ledgerName: TDS_PAYABLE, groupName: GROUP_DUTIES, debit: D(0), credit: tds },
  ];

  // Drop zero-amount lines — no point posting "Cr ESI Payable 0" when no
  // employee in the batch is ESI-applicable.
  const lines = linesWithZeroes.filter(
    (l) => !l.debit.isZero() || !l.credit.isZero()
  );

  const totalDebit = sum(lines.map((l) => l.debit));
  const totalCredit = sum(lines.map((l) => l.credit));

  return {
    totalDebit,
    totalCredit,
    lines,
    totals: {
      gross,
      lop,
      pfEmployee,
      pfEmployer,
      esiEmployee,
      esiEmployer,
      professionalTax,
      tds,
      netSalary: net,
    },
  };
}
