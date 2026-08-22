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
 * booking.
 *
 * Total Dr must equal total Cr, and that is now asserted rather than
 * assumed: the comment here used to claim balance held "by construction",
 * which was not true — the debit side comes from gross plus employer
 * contributions while the credit side comes from the stored netSalary, and
 * nothing reconciles the two. See `PayrollJournalImbalanceError`.
 */

export type PayslipLineForJv = {
  basicSalary: DecimalLike;
  /** Gross salary BEFORE LOP. */
  grossSalary: DecimalLike;
  netSalary: DecimalLike;
  /**
   * The Payslip.deductions JSON column. Canonically `{component, amount}`,
   * but rows written by `POST /payroll` before it was corrected carry
   * `{name, amount}`, so both are accepted here.
   * Components we look for: "PF (Employee)", "ESI (Employee)", "TDS",
   * "Professional Tax", "Loss of Pay". Anything else is ignored for
   * posting (treated as informational).
   */
  deductions: Array<{ component?: string; name?: string; amount: number | string }>;
  /**
   * Optional employer-side amounts. If absent we treat them as zero —
   * the calling endpoint passes them in based on calculatePayroll's
   * employerContributions, which the existing payslip JSON does not
   * persist on its own.
   */
  employerPf?: DecimalLike;
  employerEsi?: DecimalLike;
};

/**
 * Raised when an assembled payroll journal does not balance.
 *
 * Every other posting path in this codebase refuses to write an unbalanced
 * voucher — `postInvoiceToGl` and `postBillToGl` both compare their totals
 * and throw rather than persist. Payroll computed `totalDebit` and
 * `totalCredit` and returned them without ever comparing the two, so an
 * imbalance reached `tx.voucher.create` unchallenged.
 *
 * The debit side is driven by `grossSalary` and the employer contributions,
 * while the credit side is driven by the stored `netSalary` plus the
 * individual deductions. Those are independent inputs: nothing forces
 * `net == gross - deductions`, and `POST /payroll` derives its own
 * `netSalary` at write time. When they disagree the journal is short by
 * exactly the difference, and the books absorb it silently.
 *
 * Carrying both totals on the error keeps the imbalance visible in logs and
 * in the API response instead of forcing a re-derivation to diagnose it.
 */
export class PayrollJournalImbalanceError extends Error {
  constructor(
    public readonly totalDebit: Prisma.Decimal,
    public readonly totalCredit: Prisma.Decimal
  ) {
    super(
      `Payroll journal does not balance: Dr ${totalDebit.toString()} \u2260 Cr ${totalCredit.toString()} ` +
        `(difference ${totalDebit.minus(totalCredit).toString()}). Refusing to post. ` +
        `This usually means a payslip's netSalary disagrees with its gross minus deductions.`
    );
    this.name = "PayrollJournalImbalanceError";
  }
}

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
const OTHER_DEDUCTIONS_PAYABLE = "Employee Deductions Payable";

const GROUP_INDIRECT = "Indirect Expenses";
const GROUP_CURRENT_LIAB = "Current Liabilities";
const GROUP_DUTIES = "Duties & Taxes";

/**
 * Components this journal knows how to route, and the spellings seen in
 * the wild for each.
 *
 * The calculator writes the canonical name, but a payslip can also be
 * created by hand through `POST /payroll`, where the operator types the
 * component themselves.
 */
const KNOWN_DEDUCTIONS: Record<string, string[]> = {
  "PF (Employee)": ["pf (employee)", "pf", "epf", "provident fund", "pf employee"],
  "ESI (Employee)": ["esi (employee)", "esi", "esi employee"],
  TDS: ["tds", "income tax", "tds deducted"],
  "Professional Tax": ["professional tax", "pt", "p tax", "ptax"],
  "Loss of Pay": ["loss of pay", "lop"],
};

/**
 * Read a line's component name.
 *
 * `POST /payroll` stored these as `{ name, amount }` while the calculator
 * writes `{ component, amount }`, and rows in both shapes are already on
 * disk. Reading either keeps historical payslips postable; the route now
 * normalises to `component` on the way in, so new rows are consistent.
 */
const componentOf = (d: { component?: string; name?: string }) =>
  d.component ?? d.name ?? "";

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Which canonical component this deduction belongs to, if any. */
function classify(rawComponent: string): string | null {
  if (!rawComponent) return null;
  const n = normalise(rawComponent);
  for (const [canonical, aliases] of Object.entries(KNOWN_DEDUCTIONS)) {
    if (aliases.includes(n)) return canonical;
  }
  return null;
}

function deductionAmount(
  deds: PayslipLineForJv["deductions"],
  component: string
): Prisma.Decimal {
  return sum(
    deds.filter((d) => classify(componentOf(d)) === component).map((d) => D(d.amount))
  );
}

/**
 * Everything deducted that this journal has no specific payable for.
 *
 * The credit side used to be assembled purely from named lookups, so any
 * deduction the journal did not recognise was simply left out — the debit
 * still carried the full gross, and the voucher went to the books short by
 * the unmatched amount. Sweeping the remainder into one payable makes the
 * entry balance by construction, whatever an operator calls a deduction,
 * and leaves the amount visible in a real ledger rather than lost.
 */
function unclassifiedDeductions(deds: PayslipLineForJv["deductions"]): Prisma.Decimal {
  return sum(deds.filter((d) => classify(componentOf(d)) === null).map((d) => D(d.amount)));
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
  const otherDeductions = sum(payslips.map((p) => unclassifiedDeductions(p.deductions)));

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
    { ledgerName: OTHER_DEDUCTIONS_PAYABLE, groupName: GROUP_CURRENT_LIAB, debit: D(0), credit: otherDeductions },
  ];

  // Drop zero-amount lines — no point posting "Cr ESI Payable 0" when no
  // employee in the batch is ESI-applicable.
  const lines = linesWithZeroes.filter(
    (l) => !l.debit.isZero() || !l.credit.isZero()
  );

  const totalDebit = sum(lines.map((l) => l.debit));
  const totalCredit = sum(lines.map((l) => l.credit));

  // The accounting invariant, asserted before the caller can persist any of
  // this. `buildPayrollJournal` is pure, so throwing here happens before the
  // route opens its transaction — no voucher, no entries, no ledger movement
  // and no payslip status change can be left behind by a rejected batch.
  //
  // Compared with Decimal.equals, never `===` or a float subtraction: these
  // are Prisma.Decimal values and an exact comparison is what "balanced"
  // means. No epsilon, and deliberately no rounding of either side to force
  // agreement — a journal that does not balance is a bug to surface, not a
  // number to nudge.
  if (!totalDebit.equals(totalCredit)) {
    throw new PayrollJournalImbalanceError(totalDebit, totalCredit);
  }

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
