import { D, sum, type DecimalLike } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";
import type { Prisma } from "@/generated/prisma";

/**
 * CMP-08 — quarterly statement filed by suppliers under the GST
 * Composition Scheme (Section 10 of CGST Act). Replaces GSTR-1 + 3B
 * for composition taxpayers; due 18th of the month following each
 * quarter end. The annual GSTR-4 is the matching annual return.
 *
 * What CMP-08 reports:
 *   3.1 — Outward supplies (taxable turnover for the quarter)
 *   3.2 — Inward supplies attracting reverse charge (we model this
 *         based on Bill.reverseCharge=true, similar to GSTR-3B 3.1(d))
 *   3.3 — Tax on outward + inward RCM, payable as a single composite
 *         lump-sum at the org's compositionRate.
 *   3.4 — Interest payable (placeholder — needs delayed-filing date
 *         which we don't track).
 *
 * Composition rates (FY 2025-26):
 *   - Trader / mfg: 1% (0.5% CGST + 0.5% SGST)
 *   - Restaurant: 5% (2.5% + 2.5%)
 *   - Service provider (Sec 10(2A)): 6% (3% + 3%)
 *
 * Supplier holds a separate ledger of "GST under composition" and
 * remits via the GSTN portal each quarter; this service produces the
 * cells, not the cash settlement.
 */

export type Cmp08Result = {
  fiscalYear: string;
  quarter: 1 | 2 | 3 | 4;
  period: { from: string; to: string };
  rate: string; // composition rate as percent ("1", "5", "6")
  /** 3.1 — outward (taxable + non-taxable, since composition pays on full turnover). */
  outwardTurnover: string;
  /** 3.2 — RCM-inward subject to regular GST (composition supplier still pays normal GST on this). */
  inwardReverseCharge: { taxableValue: string; igst: string; cgst: string; sgst: string };
  /** 3.3 — composition tax payable: outwardTurnover × rate. CGST/SGST split half-half. */
  compositionTax: { cgst: string; sgst: string; total: string };
  /** Composite total tax (composition + RCM). */
  totalTaxPayable: string;
};

export type Cmp08Period = {
  fyLabel: string;     // "2025-26"
  quarter: 1 | 2 | 3 | 4;
  rate: DecimalLike;   // org's composition rate
};

function quarterRange(fyLabel: string, quarter: 1 | 2 | 3 | 4) {
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel);
  if (!m) throw new Error(`Invalid FY label "${fyLabel}"`);
  const startYear = parseInt(m[1], 10);
  // Indian FY quarters in (start month, end month, year offset).
  const ranges: Array<[number, number, number, number, number, number]> = [
    [3, 1, 5, 30, 0, 0],   // Apr 1 – Jun 30
    [6, 1, 8, 30, 0, 0],   // Jul 1 – Sep 30
    [9, 1, 11, 31, 0, 0],  // Oct 1 – Dec 31
    [0, 1, 2, 31, 1, 1],   // Jan 1 – Mar 31 (next calendar year)
  ];
  const [sm, sd, em, ed, sOff, eOff] = ranges[quarter - 1];
  return {
    from: new Date(Date.UTC(startYear + sOff, sm, sd)),
    to: new Date(Date.UTC(startYear + eOff, em, ed, 23, 59, 59, 999)),
  };
}

export async function computeCmp08(
  client: Tx,
  organizationId: string,
  period: Cmp08Period
): Promise<Cmp08Result> {
  const { from, to } = quarterRange(period.fyLabel, period.quarter);
  const rate = D(period.rate);

  // Outward turnover for the quarter — sum all non-cancelled, non-draft
  // invoices' totalAmount. Composition pays on FULL turnover incl. exempt
  // (the regulator-determined composition rate already accounts for the
  // mix, which is why composition is restricted by turnover bracket).
  const invoices = await client.invoice.findMany({
    where: {
      organizationId,
      date: { gte: from, lte: to },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    select: { totalAmount: true },
  });
  const outwardTurnover = sum(invoices.map((i) => D(i.totalAmount)));

  // RCM-inward — bills flagged reverseCharge=true. The composition
  // supplier owes regular GST on these (NOT the composition rate).
  const rcmBills = await client.bill.findMany({
    where: {
      organizationId,
      date: { gte: from, lte: to },
      status: { notIn: ["DRAFT", "CANCELLED"] },
      reverseCharge: true,
    },
    include: {
      items: {
        select: {
          taxableAmount: true,
          igstAmount: true,
          cgstAmount: true,
          sgstAmount: true,
        },
      },
    },
  });
  const inwardRcm = rcmBills.reduce(
    (acc, b) => {
      const tx = sum(b.items.map((i) => D(i.taxableAmount)));
      const ig = sum(b.items.map((i) => D(i.igstAmount ?? 0)));
      const cg = sum(b.items.map((i) => D(i.cgstAmount ?? 0)));
      const sg = sum(b.items.map((i) => D(i.sgstAmount ?? 0)));
      return {
        taxableValue: acc.taxableValue.plus(tx),
        igst: acc.igst.plus(ig),
        cgst: acc.cgst.plus(cg),
        sgst: acc.sgst.plus(sg),
      };
    },
    {
      taxableValue: D(0),
      igst: D(0),
      cgst: D(0),
      sgst: D(0),
    }
  );

  const compositionTaxTotal = outwardTurnover.times(rate).dividedBy(D(100));
  const compositionCgst = compositionTaxTotal.dividedBy(D(2));
  const compositionSgst = compositionTaxTotal.dividedBy(D(2));

  const rcmTotal = inwardRcm.igst.plus(inwardRcm.cgst).plus(inwardRcm.sgst);
  const totalTaxPayable = compositionTaxTotal.plus(rcmTotal);

  return {
    fiscalYear: period.fyLabel,
    quarter: period.quarter,
    period: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    rate: rate.toString(),
    outwardTurnover: outwardTurnover.toString(),
    inwardReverseCharge: {
      taxableValue: inwardRcm.taxableValue.toString(),
      igst: inwardRcm.igst.toString(),
      cgst: inwardRcm.cgst.toString(),
      sgst: inwardRcm.sgst.toString(),
    },
    compositionTax: {
      cgst: compositionCgst.toString(),
      sgst: compositionSgst.toString(),
      total: compositionTaxTotal.toString(),
    },
    totalTaxPayable: totalTaxPayable.toString(),
  };
}

/**
 * Build a summary line that's safe to display in a list view, for
 * dashboards that don't need the full per-cell breakdown.
 */
export function summarizeCmp08(r: Cmp08Result): string {
  return (
    `Q${r.quarter} ${r.fiscalYear}: ` +
    `Turnover ₹${Number(r.outwardTurnover).toFixed(0)} × ${r.rate}% = ` +
    `₹${Number(r.compositionTax.total).toFixed(0)} composition tax` +
    (Number(r.inwardReverseCharge.taxableValue) > 0
      ? ` + ₹${Math.floor(Number(r.totalTaxPayable) - Number(r.compositionTax.total))} RCM`
      : "")
  );
}

/**
 * Helper for tests: derive a Decimal-typed rate without a real org row.
 */
export function defaultCompositionRate(category: "trader" | "restaurant" | "service"): Prisma.Decimal {
  switch (category) {
    case "trader":
      return D("1");
    case "restaurant":
      return D("5");
    case "service":
      return D("6");
  }
}
