import { D, sum, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * Monthly TDS challan summary.
 *
 * Section 192-206C of the Income Tax Act requires the deductor to
 * deposit every month's TDS withheld by the 7th of the following
 * month (30th April for March deductions). The TIN-NSDL portal
 * accepts a single ITNS-281 challan per (TAN, section, month, FY)
 * tuple — so the deductor needs the section-wise total for a given
 * month before they can pay.
 *
 * This aggregator produces that summary from the persisted
 * TdsDeduction table. Caller filters to (orgId, FY, month) at the
 * query layer; this service rolls them up per section.
 *
 * Out of scope:
 *   - Generating the actual challan ITNS-281 file (requires the
 *     deductor's TAN, address, and a few other fields not yet on
 *     Organization). The summary's `tax` column is what the user
 *     enters into the challan.
 *   - Form 24Q/26Q quarterly returns (separate, larger format —
 *     requires the FVU-validated text format from TIN-NSDL's RPU).
 */

export type ChallanRow = {
  partyId: string;
  partyName: string;
  partyPan: string | null;
  section: string;
  baseAmount: DecimalLike;
  taxAmount: DecimalLike;
  deductedAt: Date;
};

export type MonthlyChallanSection = {
  section: string;
  count: number;
  base: Prisma.Decimal;
  tax: Prisma.Decimal;
  /** Distinct deductee count for this section. */
  deductees: number;
};

export type MonthlyChallanResult = {
  fiscalYear: string;
  /** Calendar month, 1..12. */
  month: number;
  /**
   * Due date for depositing this challan: the 7th of the next
   * calendar month for Apr–Feb, or 30 Apr for March.
   * Returned as YYYY-MM-DD.
   */
  dueDate: string;
  sections: MonthlyChallanSection[];
  totals: {
    deductions: number;
    deductees: number;
    base: Prisma.Decimal;
    tax: Prisma.Decimal;
  };
};

export function challanDueDate(year: number, monthIndex: number): string {
  // monthIndex is 1..12. March deposits are due Apr 30 (year-end deadline);
  // every other month is due the 7th of the next calendar month.
  if (monthIndex === 3) {
    return `${year}-04-30`;
  }
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;
  const nextYear = monthIndex === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-07`;
}

export function buildMonthlyChallan(
  rows: ChallanRow[],
  meta: { fiscalYear: string; month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; calendarYear: number }
): MonthlyChallanResult {
  // Group by section. Within each section, track unique party ids.
  const bySection = new Map<string, { rows: ChallanRow[]; partyIds: Set<string> }>();
  for (const r of rows) {
    let bucket = bySection.get(r.section);
    if (!bucket) {
      bucket = { rows: [], partyIds: new Set<string>() };
      bySection.set(r.section, bucket);
    }
    bucket.rows.push(r);
    bucket.partyIds.add(r.partyId);
  }

  const sections: MonthlyChallanSection[] = [];
  for (const [section, bucket] of bySection) {
    sections.push({
      section,
      count: bucket.rows.length,
      base: sum(bucket.rows.map((r) => D(r.baseAmount))),
      tax: sum(bucket.rows.map((r) => D(r.taxAmount))),
      deductees: bucket.partyIds.size,
    });
  }
  // Stable section ordering.
  sections.sort((a, b) => a.section.localeCompare(b.section));

  const allParties = new Set<string>();
  for (const r of rows) allParties.add(r.partyId);

  return {
    fiscalYear: meta.fiscalYear,
    month: meta.month,
    dueDate: challanDueDate(meta.calendarYear, meta.month),
    sections,
    totals: {
      deductions: rows.length,
      deductees: allParties.size,
      base: sum(rows.map((r) => D(r.baseAmount))),
      tax: sum(rows.map((r) => D(r.taxAmount))),
    },
  };
}
