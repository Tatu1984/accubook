import { D, sum, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * Form 16A — quarterly TDS certificate aggregator.
 *
 * The Income Tax Act requires the deductor to issue a Form 16A to
 * every deductee for each quarter, listing every TDS deduction made
 * during the quarter. Real Form 16A also requires a TRACES challan
 * acknowledgement number — that comes from the TDS challan filing,
 * which lives outside this service.
 *
 * What this builder produces:
 *   - Per-(party, section, quarter) totals: count, base, taxAmount.
 *   - Per-party rollup: total tax across all sections.
 *   - Quarter-wide totals.
 *
 * The shape is JSON-friendly so the UI can render it as a table
 * without further processing. Tests cover the aggregation invariants
 * (totals match, splits sum, etc.); the actual PDF rendering is
 * separate.
 *
 * Same shape works for Form 27D (TCS quarterly) — pass the
 * TcsCollection rows in the equivalent shape.
 */

export type DeductionRow = {
  partyId: string;
  partyName: string;
  partyPan?: string | null;
  section: string;
  baseAmount: DecimalLike;
  taxAmount: DecimalLike;
  ratePercent: DecimalLike;
  deductedAt: Date;
};

export type Form16AParty = {
  partyId: string;
  partyName: string;
  partyPan: string | null;
  sections: Array<{
    section: string;
    count: number;
    base: Prisma.Decimal;
    tax: Prisma.Decimal;
    /** Effective rate = tax / base * 100, rounded to 2dp; null when base is 0. */
    effectiveRate: Prisma.Decimal | null;
  }>;
  totals: {
    count: number;
    base: Prisma.Decimal;
    tax: Prisma.Decimal;
  };
};

export type Form16AQuarterly = {
  fiscalYear: string;       // "2025-26"
  quarter: 1 | 2 | 3 | 4;
  parties: Form16AParty[];
  totals: {
    parties: number;
    deductions: number;
    base: Prisma.Decimal;
    tax: Prisma.Decimal;
  };
};

/**
 * Map a deduction date to its FY quarter.
 * Indian FY runs April → March:
 *   Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar.
 */
export function quarterFromDate(d: Date): 1 | 2 | 3 | 4 {
  const m = d.getUTCMonth(); // 0-based
  if (m >= 3 && m <= 5) return 1;   // Apr-Jun
  if (m >= 6 && m <= 8) return 2;   // Jul-Sep
  if (m >= 9 && m <= 11) return 3;  // Oct-Dec
  return 4;                         // Jan-Mar
}

/**
 * Group deductions by party + section, computing totals.
 * Caller has already filtered to a single fiscal year + quarter.
 */
export function buildForm16AQuarterly(
  rows: DeductionRow[],
  meta: { fiscalYear: string; quarter: 1 | 2 | 3 | 4 }
): Form16AQuarterly {
  const byParty = new Map<string, {
    partyName: string;
    partyPan: string | null;
    bySection: Map<string, DeductionRow[]>;
  }>();

  for (const r of rows) {
    let p = byParty.get(r.partyId);
    if (!p) {
      p = {
        partyName: r.partyName,
        partyPan: r.partyPan ?? null,
        bySection: new Map(),
      };
      byParty.set(r.partyId, p);
    }
    const list = p.bySection.get(r.section) ?? [];
    list.push(r);
    p.bySection.set(r.section, list);
  }

  const parties: Form16AParty[] = [];
  for (const [partyId, group] of byParty) {
    const sections: Form16AParty["sections"] = [];
    let partyBase = D(0);
    let partyTax = D(0);
    let partyCount = 0;
    for (const [section, list] of group.bySection) {
      const base = sum(list.map((r) => D(r.baseAmount)));
      const tax = sum(list.map((r) => D(r.taxAmount)));
      const effectiveRate = base.isZero()
        ? null
        : tax.dividedBy(base).times(D(100));
      sections.push({
        section,
        count: list.length,
        base,
        tax,
        effectiveRate,
      });
      partyBase = partyBase.plus(base);
      partyTax = partyTax.plus(tax);
      partyCount += list.length;
    }
    // Sort sections alphabetically for stable output.
    sections.sort((a, b) => a.section.localeCompare(b.section));
    parties.push({
      partyId,
      partyName: group.partyName,
      partyPan: group.partyPan,
      sections,
      totals: { count: partyCount, base: partyBase, tax: partyTax },
    });
  }

  // Stable party ordering: by name asc.
  parties.sort((a, b) => a.partyName.localeCompare(b.partyName));

  const totals = {
    parties: parties.length,
    deductions: parties.reduce((s, p) => s + p.totals.count, 0),
    base: sum(parties.map((p) => p.totals.base)),
    tax: sum(parties.map((p) => p.totals.tax)),
  };

  return {
    fiscalYear: meta.fiscalYear,
    quarter: meta.quarter,
    parties,
    totals,
  };
}

/**
 * For a given fiscal year, compute the start and end dates of a quarter.
 * Indian FY: 2025-26 means Apr 2025 → Mar 2026.
 */
export function quarterDateRange(
  fyLabel: string,
  quarter: 1 | 2 | 3 | 4
): { startDate: Date; endDate: Date } {
  // Parse "2025-26" → start year 2025.
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel);
  if (!m) {
    throw new Error(`Invalid fiscal year label "${fyLabel}" (expected "YYYY-YY")`);
  }
  const startYear = parseInt(m[1], 10);
  // Quarter offsets, in (month, day) pairs.
  const ranges: Array<[Date, Date]> = [
    [new Date(Date.UTC(startYear, 3, 1)), new Date(Date.UTC(startYear, 5, 30))],
    [new Date(Date.UTC(startYear, 6, 1)), new Date(Date.UTC(startYear, 8, 30))],
    [new Date(Date.UTC(startYear, 9, 1)), new Date(Date.UTC(startYear, 11, 31))],
    [new Date(Date.UTC(startYear + 1, 0, 1)), new Date(Date.UTC(startYear + 1, 2, 31))],
  ];
  const [startDate, endDate] = ranges[quarter - 1];
  return { startDate, endDate };
}
