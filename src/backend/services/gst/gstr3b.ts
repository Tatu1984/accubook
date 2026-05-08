import { Prisma } from "@/generated/prisma";
import { D } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";

/**
 * GSTR-3B computation — monthly summary return.
 *
 * Unlike GSTR-1 (invoice-wise outward), GSTR-3B is purely aggregate. It's
 * how a business actually pays GST every month. The portal accepts:
 *
 *   3.1  Tax on outward and reverse-charge inward supplies
 *     (a) Outward taxable supplies (other than zero-rated, nil-rated, exempted)
 *     (b) Outward taxable supplies — zero-rated (exports + SEZ)
 *     (c) Other outward supplies — nil-rated, exempted
 *     (d) Inward supplies liable to reverse charge
 *     (e) Non-GST outward supplies
 *   3.2  Supplies to unregistered persons / UIN / composition (subset of 3.1.a)
 *   4    Eligible ITC
 *     (A) ITC available
 *       (1) Import of goods
 *       (2) Import of services
 *       (3) Inward supplies liable to reverse charge
 *       (4) Inward supplies from ISD
 *       (5) All other ITC
 *     (B) ITC reversed (rules 38/42/43, others)
 *     (C) Net ITC available  = (A) − (B)
 *     (D) Other Details (reclaimed, ineligible)
 *   5    Values of exempt, nil-rated, non-GST inward supplies
 *   6.1  Payment of tax (calculated by portal — we just provide the data)
 *
 * Implemented sections in this first pass: 3.1.(a)(b)(c)(d), 4.A.(3)(5),
 * 4.C, 5. Sections we skip for now (no domain model yet): 3.2 (composition/UIN
 * subdivision), 4.A.(1)(2)(4) (imports + ISD), 4.B reversals, 4.D reclaimed.
 */

export type Gstr3bPeriod = {
  from: Date;
  to: Date;
};

export type Gstr3bSection31 = {
  /** 3.1(a) outward taxable other than zero/nil/exempted */
  outwardTaxable: TaxAmounts;
  /** 3.1(b) outward zero-rated (exports + SEZ) */
  outwardZeroRated: TaxAmounts;
  /** 3.1(c) outward nil-rated and exempted */
  outwardNilRated: TaxAmounts;
  /** 3.1(d) inward liable to reverse charge */
  inwardReverseCharge: TaxAmounts;
  /** 3.1(e) non-GST outward */
  outwardNonGst: TaxAmounts;
};

export type Gstr3bSection4 = {
  available: {
    /** 4.A.(3) inward supplies liable to RCM */
    reverseCharge: TaxAmounts;
    /** 4.A.(5) all other ITC (regular purchases) */
    other: TaxAmounts;
  };
  /** 4.B (rules 38/42/43 + others) — not modeled yet, zeroed */
  reversed: TaxAmounts;
  /** 4.C net = available − reversed */
  net: TaxAmounts;
};

export type Gstr3bSection5 = {
  /** Inward supplies that are nil-rated / exempt / non-GST. Aggregated. */
  intraStateExempt: string;
  intraStateNonGst: string;
  interStateExempt: string;
  interStateNonGst: string;
};

export type TaxAmounts = {
  taxableValue: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
};

export type Gstr3bResult = {
  period: { from: string; to: string };
  s3_1: Gstr3bSection31;
  s4: Gstr3bSection4;
  s5: Gstr3bSection5;
};

const ZERO_TAX: () => TaxAmounts = () => ({
  taxableValue: "0",
  igst: "0",
  cgst: "0",
  sgst: "0",
  cess: "0",
});

type Acc = {
  taxable: Prisma.Decimal;
  igst: Prisma.Decimal;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  cess: Prisma.Decimal;
};

const mkAcc = (): Acc => ({
  taxable: D(0), igst: D(0), cgst: D(0), sgst: D(0), cess: D(0),
});

const accAdd = (
  acc: Acc,
  taxable: Prisma.Decimal,
  cgst: Prisma.Decimal,
  sgst: Prisma.Decimal,
  igst: Prisma.Decimal,
  cess: Prisma.Decimal
) => {
  acc.taxable = acc.taxable.plus(taxable);
  acc.cgst = acc.cgst.plus(cgst);
  acc.sgst = acc.sgst.plus(sgst);
  acc.igst = acc.igst.plus(igst);
  acc.cess = acc.cess.plus(cess);
};

const accSerialize = (acc: Acc): TaxAmounts => ({
  taxableValue: acc.taxable.toString(),
  igst: acc.igst.toString(),
  cgst: acc.cgst.toString(),
  sgst: acc.sgst.toString(),
  cess: acc.cess.toString(),
});

const taxAmountsSubtract = (a: TaxAmounts, b: TaxAmounts): TaxAmounts => ({
  taxableValue: D(a.taxableValue).minus(D(b.taxableValue)).toString(),
  igst: D(a.igst).minus(D(b.igst)).toString(),
  cgst: D(a.cgst).minus(D(b.cgst)).toString(),
  sgst: D(a.sgst).minus(D(b.sgst)).toString(),
  cess: D(a.cess).minus(D(b.cess)).toString(),
});

export async function computeGstr3b(
  client: Tx,
  organizationId: string,
  period: Gstr3bPeriod
): Promise<Gstr3bResult> {
  const db = client;

  // OUTWARD (sales): invoices in the period, excluding DRAFT/CANCELLED.
  const invoices = await db.invoice.findMany({
    where: {
      organizationId,
      date: { gte: period.from, lte: period.to },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    select: {
      type: true,
      supplyType: true,
      reverseCharge: true,
      items: {
        select: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          cessAmount: true,
        },
      },
    },
  });

  const out_taxable = mkAcc();
  const out_zeroRated = mkAcc();
  const out_nilRated = mkAcc();
  const out_nonGst = mkAcc();

  for (const inv of invoices) {
    // Credit/debit notes against earlier invoices reduce the outward liability.
    // For first pass we add them with sign matching their direction:
    //   CREDIT_NOTE → reduces outward (subtract)
    //   DEBIT_NOTE  → increases outward (add as normal)
    // The portal accepts net values per cell, so signed accumulation is correct.
    const sign = inv.type === "CREDIT_NOTE" ? -1 : 1;

    const isZeroRated = inv.supplyType === "EXPORT";
    const isNonGst = false;          // not yet modeled
    let isNilOrExempt = false;
    let totalTaxOnInvoice = D(0);

    for (const li of inv.items) {
      const taxable = D(li.taxableAmount).times(sign);
      const cgst = D(li.cgstAmount ?? 0).times(sign);
      const sgst = D(li.sgstAmount ?? 0).times(sign);
      const igst = D(li.igstAmount ?? 0).times(sign);
      const cess = D(li.cessAmount ?? 0).times(sign);
      totalTaxOnInvoice = totalTaxOnInvoice.plus(cgst.abs()).plus(sgst.abs()).plus(igst.abs()).plus(cess.abs());

      // Stash the line into the right bucket. We bucket per *invoice-level*
      // classification for simplicity — mixed-classification invoices are
      // unusual for v1 (you don't typically combine zero-rated and taxable
      // lines on the same invoice).
      if (isZeroRated) {
        accAdd(out_zeroRated, taxable, cgst, sgst, igst, cess);
      } else if (isNonGst) {
        accAdd(out_nonGst, taxable, cgst, sgst, igst, cess);
      } else if (D(li.cgstAmount ?? 0).plus(D(li.sgstAmount ?? 0)).plus(D(li.igstAmount ?? 0)).isZero()) {
        // Zero-tax line on a non-export invoice → nil-rated/exempted
        isNilOrExempt = true;
        accAdd(out_nilRated, taxable, cgst, sgst, igst, cess);
      } else {
        accAdd(out_taxable, taxable, cgst, sgst, igst, cess);
      }
    }

    // Suppress unused-var warnings for placeholders we'll wire up later.
    void isNilOrExempt;
    void totalTaxOnInvoice;
  }

  // INWARD (purchases): bills in the period, similarly filtered.
  // ITC is only available on APPROVED/PAID/etc — DRAFT/PENDING_APPROVAL bills
  // don't post yet so they don't contribute to ITC.
  const bills = await db.bill.findMany({
    where: {
      organizationId,
      date: { gte: period.from, lte: period.to },
      status: { notIn: ["DRAFT", "PENDING_APPROVAL", "CANCELLED"] },
    },
    select: {
      reverseCharge: true,
      supplyType: true,
      items: {
        select: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          cessAmount: true,
        },
      },
    },
  });

  const itc_rcm = mkAcc();          // 4.A.(3) inward liable to RCM
  const itc_other = mkAcc();        // 4.A.(5) all other ITC
  const inwardRcm = mkAcc();        // 3.1(d) for outward-side liability
  const inward_intraExempt = D(0);
  const inward_intraNonGst = D(0);
  const inward_interExempt = D(0);
  const inward_interNonGst = D(0);
  let _inwardIntraExempt = inward_intraExempt;
  const _inwardIntraNonGst = inward_intraNonGst;
  let _inwardInterExempt = inward_interExempt;
  const _inwardInterNonGst = inward_interNonGst;

  for (const bill of bills) {
    const isInter = bill.supplyType === "INTERSTATE" || bill.supplyType === "IMPORT";
    for (const li of bill.items) {
      const taxable = D(li.taxableAmount);
      const cgst = D(li.cgstAmount ?? 0);
      const sgst = D(li.sgstAmount ?? 0);
      const igst = D(li.igstAmount ?? 0);
      const cess = D(li.cessAmount ?? 0);
      const totalTax = cgst.plus(sgst).plus(igst);

      if (totalTax.isZero()) {
        // Exempt / nil-rated / non-GST inward — section 5.
        // We don't yet distinguish exempt vs non-GST here; default to exempt
        // for both. A future field on Bill ("nature of inward: exempt|non-gst")
        // will let us split this properly.
        if (isInter) {
          _inwardInterExempt = _inwardInterExempt.plus(taxable);
        } else {
          _inwardIntraExempt = _inwardIntraExempt.plus(taxable);
        }
        continue;
      }

      if (bill.reverseCharge) {
        // RCM — both adds outward liability (3.1.d) AND eligible ITC (4.A.3).
        accAdd(inwardRcm, taxable, cgst, sgst, igst, cess);
        accAdd(itc_rcm, taxable, cgst, sgst, igst, cess);
      } else {
        accAdd(itc_other, taxable, cgst, sgst, igst, cess);
      }
    }
  }

  const itc_available_rcm = accSerialize(itc_rcm);
  const itc_available_other = accSerialize(itc_other);
  const itc_reversed = ZERO_TAX();
  const itc_total_available: TaxAmounts = {
    taxableValue: D(itc_available_rcm.taxableValue).plus(D(itc_available_other.taxableValue)).toString(),
    igst: D(itc_available_rcm.igst).plus(D(itc_available_other.igst)).toString(),
    cgst: D(itc_available_rcm.cgst).plus(D(itc_available_other.cgst)).toString(),
    sgst: D(itc_available_rcm.sgst).plus(D(itc_available_other.sgst)).toString(),
    cess: D(itc_available_rcm.cess).plus(D(itc_available_other.cess)).toString(),
  };
  const itc_net = taxAmountsSubtract(itc_total_available, itc_reversed);

  return {
    period: {
      from: period.from.toISOString().slice(0, 10),
      to: period.to.toISOString().slice(0, 10),
    },
    s3_1: {
      outwardTaxable: accSerialize(out_taxable),
      outwardZeroRated: accSerialize(out_zeroRated),
      outwardNilRated: accSerialize(out_nilRated),
      inwardReverseCharge: accSerialize(inwardRcm),
      outwardNonGst: accSerialize(out_nonGst),
    },
    s4: {
      available: {
        reverseCharge: itc_available_rcm,
        other: itc_available_other,
      },
      reversed: itc_reversed,
      net: itc_net,
    },
    s5: {
      intraStateExempt: _inwardIntraExempt.toString(),
      intraStateNonGst: _inwardIntraNonGst.toString(),
      interStateExempt: _inwardInterExempt.toString(),
      interStateNonGst: _inwardInterNonGst.toString(),
    },
  };
}

/**
 * Net tax payable per cell — convenience for the UI summary widget.
 * Tax payable = output tax (3.1.a) + RCM (3.1.d) − net ITC (4.C).
 */
export function summarizeGstr3b(result: Gstr3bResult): {
  outwardTax: TaxAmounts;
  itcNet: TaxAmounts;
  netPayable: TaxAmounts;
} {
  const outwardTax: TaxAmounts = {
    taxableValue: D(result.s3_1.outwardTaxable.taxableValue)
      .plus(D(result.s3_1.inwardReverseCharge.taxableValue))
      .toString(),
    cgst: D(result.s3_1.outwardTaxable.cgst).plus(D(result.s3_1.inwardReverseCharge.cgst)).toString(),
    sgst: D(result.s3_1.outwardTaxable.sgst).plus(D(result.s3_1.inwardReverseCharge.sgst)).toString(),
    igst: D(result.s3_1.outwardTaxable.igst).plus(D(result.s3_1.inwardReverseCharge.igst)).toString(),
    cess: D(result.s3_1.outwardTaxable.cess).plus(D(result.s3_1.inwardReverseCharge.cess)).toString(),
  };
  const itcNet = result.s4.net;
  const netPayable: TaxAmounts = {
    taxableValue: outwardTax.taxableValue,
    cgst: D(outwardTax.cgst).minus(D(itcNet.cgst)).toString(),
    sgst: D(outwardTax.sgst).minus(D(itcNet.sgst)).toString(),
    igst: D(outwardTax.igst).minus(D(itcNet.igst)).toString(),
    cess: D(outwardTax.cess).minus(D(itcNet.cess)).toString(),
  };
  return { outwardTax, itcNet, netPayable };
}

