import { D } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";
import { computeGstr3b } from "./gstr3b";

/**
 * GSTR-9 annual return computation.
 *
 * GSTR-9 is the consolidated annual return that GST-registered taxpayers
 * file once per FY. It covers:
 *
 *   Part I    Basic details (GSTIN, name, FY)
 *   Part II   Outward + Inward supplies (Section 4 + 5)
 *   Part III  Details of ITC (Section 6 + 7 + 8)
 *   Part IV   Details of tax paid (Section 9)
 *   Part V    Particulars of previous-FY transactions in this FY (Section 10–14)
 *   Part VI   Other information (Section 15–18) — demands, refunds, HSN summary
 *
 * For the first pass we compute the parts that fall directly out of
 * GSTR-3B's twelve months: Section 4 (outward), Section 5 (zero/nil/
 * exempt), Section 6.M-O (ITC availed), Section 7 (ITC reversed —
 * placeholder), Section 9 (tax payable / paid — projection from output
 * tax minus net ITC).
 *
 * Out of scope for this pass (need additional domain models or manual
 * input):
 *   - Section 6.A-L sub-categorization of ITC by source (RCM domestic,
 *     RCM other, IGST on imports, ITC reclaimed, etc.).
 *   - Section 8 ITC reconciliation against GSTR-2A/2B.
 *   - Section 10–14 amendments, late-filed, etc.
 *   - Section 15 demands and refunds.
 *   - Section 16 supplies received from composition / deemed-export.
 *   - Section 17–18 HSN summary at year level (we have this from
 *     gstr1.ts; can be wired in next pass).
 */

export type FiscalYear = {
  /** Period start (e.g. 2026-04-01 for FY 2026-27). */
  start: Date;
  /** Period end (e.g. 2027-03-31). */
  end: Date;
  /** Display label, e.g. "2026-27". */
  label: string;
};

export type Gstr9TaxBlock = {
  taxableValue: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
};

export type Gstr9Section4 = {
  /** 4A: outward supplies to unregistered (B2C). Subset of taxable. */
  b2cOutward: Gstr9TaxBlock;
  /** 4B: outward supplies to registered (B2B). Subset of taxable. */
  b2bOutward: Gstr9TaxBlock;
  /** 4C: zero-rated supplies (export with payment of tax). */
  exportsWithTax: Gstr9TaxBlock;
  /** 4D: supplies to SEZ with payment of tax. (Not modeled — placeholder.) */
  sezWithTax: Gstr9TaxBlock;
  /** 4E: deemed exports. (Not modeled — placeholder.) */
  deemedExports: Gstr9TaxBlock;
  /** 4F: advances received for which tax has been paid. (Not modeled.) */
  advances: Gstr9TaxBlock;
  /** 4G: inward supplies on which tax is to be paid on reverse charge. */
  inwardReverseCharge: Gstr9TaxBlock;
  /** 4H: subtotal. */
  subtotal: Gstr9TaxBlock;
  /** 4I: credit notes against (4A..4H). (Net adjustment — negative.) */
  creditNotesAdjustment: Gstr9TaxBlock;
  /** 4J: debit notes. */
  debitNotesAdjustment: Gstr9TaxBlock;
  /** 4K-L: amendments (placeholder). */
  amendments: Gstr9TaxBlock;
  /** 4N: net taxable supplies (4H + 4J − 4I + amendments). */
  netSupplies: Gstr9TaxBlock;
};

export type Gstr9Section5 = {
  /** 5A: zero-rated without payment (export under LUT). */
  exportsLut: Gstr9TaxBlock;
  /** 5B: SEZ without payment (LUT). (Placeholder.) */
  sezLut: Gstr9TaxBlock;
  /** 5C: outward where reverse charge applies (recipient pays). (Placeholder.) */
  outwardRcm: Gstr9TaxBlock;
  /** 5D: exempt. */
  exempt: Gstr9TaxBlock;
  /** 5E: nil-rated. */
  nilRated: Gstr9TaxBlock;
  /** 5F: non-GST. */
  nonGst: Gstr9TaxBlock;
  /** 5N: total non-payable supplies. */
  total: Gstr9TaxBlock;
};

export type Gstr9Section6 = {
  /** 6A: ITC availed as per GSTR-3B (sum of monthly returns). */
  totalItcAvailed: Gstr9TaxBlock;
  /** 6B: ITC from RCM domestic. */
  rcmDomestic: Gstr9TaxBlock;
  /** 6M-O: total ITC by year. (Subset until 6.A-L is broken out.) */
  totalItcSubtotal: Gstr9TaxBlock;
};

export type Gstr9Section7 = {
  /** 7A-H: ITC reversed (rules / blocked / etc.). Placeholder. */
  reversed: Gstr9TaxBlock;
  /** 7J: net ITC available (6 − 7). */
  netItc: Gstr9TaxBlock;
};

export type Gstr9Section9 = {
  /** Tax payable (= 4N tax + 4G tax). */
  taxPayable: Gstr9TaxBlock;
  /** Tax paid through ITC (= net ITC, capped at payable). */
  paidThroughItc: Gstr9TaxBlock;
  /** Tax payable in cash (payable − ITC). */
  paidInCash: Gstr9TaxBlock;
};

export type Gstr9Result = {
  fiscalYear: { start: string; end: string; label: string };
  s4: Gstr9Section4;
  s5: Gstr9Section5;
  s6: Gstr9Section6;
  s7: Gstr9Section7;
  s9: Gstr9Section9;
};

const ZERO_TAX_BLOCK: Gstr9TaxBlock = {
  taxableValue: "0",
  igst: "0",
  cgst: "0",
  sgst: "0",
  cess: "0",
};

function blockSum(...blocks: Gstr9TaxBlock[]): Gstr9TaxBlock {
  return blocks.reduce<Gstr9TaxBlock>(
    (acc, b) => ({
      taxableValue: D(acc.taxableValue).plus(D(b.taxableValue)).toString(),
      igst: D(acc.igst).plus(D(b.igst)).toString(),
      cgst: D(acc.cgst).plus(D(b.cgst)).toString(),
      sgst: D(acc.sgst).plus(D(b.sgst)).toString(),
      cess: D(acc.cess).plus(D(b.cess)).toString(),
    }),
    ZERO_TAX_BLOCK
  );
}

function blockSubtract(a: Gstr9TaxBlock, b: Gstr9TaxBlock): Gstr9TaxBlock {
  return {
    taxableValue: D(a.taxableValue).minus(D(b.taxableValue)).toString(),
    igst: D(a.igst).minus(D(b.igst)).toString(),
    cgst: D(a.cgst).minus(D(b.cgst)).toString(),
    sgst: D(a.sgst).minus(D(b.sgst)).toString(),
    cess: D(a.cess).minus(D(b.cess)).toString(),
  };
}

/** Cap each cell at 0 (used for "payable in cash" = max(payable − ITC, 0)). */
function clampNonNegative(b: Gstr9TaxBlock): Gstr9TaxBlock {
  const at = (s: string) => (D(s).lessThan(D(0)) ? "0" : s);
  return {
    taxableValue: at(b.taxableValue),
    igst: at(b.igst),
    cgst: at(b.cgst),
    sgst: at(b.sgst),
    cess: at(b.cess),
  };
}

export async function computeGstr9(
  client: Tx,
  organizationId: string,
  fy: FiscalYear
): Promise<Gstr9Result> {
  // GSTR-9 is essentially GSTR-3B aggregated across the FY. We delegate
  // to computeGstr3b for the full year and then re-shape into GSTR-9 cells.
  const annual = await computeGstr3b(client, organizationId, {
    from: fy.start,
    to: fy.end,
  });

  // We also need B2B vs B2C split for Section 4. The cleanest read is
  // off invoices in the period, separated by party.gstNo presence.
  const invoices = await client.invoice.findMany({
    where: {
      organizationId,
      date: { gte: fy.start, lte: fy.end },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    include: {
      party: { select: { gstNo: true } },
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

  const b2bAcc = { ...ZERO_TAX_BLOCK };
  const b2cAcc = { ...ZERO_TAX_BLOCK };
  const cnAcc = { ...ZERO_TAX_BLOCK };
  const dnAcc = { ...ZERO_TAX_BLOCK };

  for (const inv of invoices) {
    if (inv.supplyType === "EXPORT") continue; // Exports go to 4C / 5A — handled below.
    const lineTaxable = inv.items.reduce(
      (a, i) => a.plus(D(i.taxableAmount)),
      D(0)
    );
    const lineIgst = inv.items.reduce(
      (a, i) => a.plus(D(i.igstAmount ?? 0)),
      D(0)
    );
    const lineCgst = inv.items.reduce(
      (a, i) => a.plus(D(i.cgstAmount ?? 0)),
      D(0)
    );
    const lineSgst = inv.items.reduce(
      (a, i) => a.plus(D(i.sgstAmount ?? 0)),
      D(0)
    );
    const lineCess = inv.items.reduce(
      (a, i) => a.plus(D(i.cessAmount ?? 0)),
      D(0)
    );

    // Skip nil-rated / zero-tax invoices for these B2B/B2C buckets — those
    // belong in Section 5 (handled via the GSTR-3B annual aggregate).
    const totalTax = lineCgst.plus(lineSgst).plus(lineIgst);
    if (totalTax.isZero()) continue;

    if (inv.type === "CREDIT_NOTE") {
      cnAcc.taxableValue = D(cnAcc.taxableValue).plus(lineTaxable).toString();
      cnAcc.igst = D(cnAcc.igst).plus(lineIgst).toString();
      cnAcc.cgst = D(cnAcc.cgst).plus(lineCgst).toString();
      cnAcc.sgst = D(cnAcc.sgst).plus(lineSgst).toString();
      cnAcc.cess = D(cnAcc.cess).plus(lineCess).toString();
      continue;
    }
    if (inv.type === "DEBIT_NOTE") {
      dnAcc.taxableValue = D(dnAcc.taxableValue).plus(lineTaxable).toString();
      dnAcc.igst = D(dnAcc.igst).plus(lineIgst).toString();
      dnAcc.cgst = D(dnAcc.cgst).plus(lineCgst).toString();
      dnAcc.sgst = D(dnAcc.sgst).plus(lineSgst).toString();
      dnAcc.cess = D(dnAcc.cess).plus(lineCess).toString();
      continue;
    }

    const target = inv.party?.gstNo ? b2bAcc : b2cAcc;
    target.taxableValue = D(target.taxableValue).plus(lineTaxable).toString();
    target.igst = D(target.igst).plus(lineIgst).toString();
    target.cgst = D(target.cgst).plus(lineCgst).toString();
    target.sgst = D(target.sgst).plus(lineSgst).toString();
    target.cess = D(target.cess).plus(lineCess).toString();
  }

  // 4C: exports with payment of tax (zero-rated, IGST charged) =
  //     GSTR-3B Section 3.1.b but only the WPAY portion. Our 3.1.b
  //     bucket has both; we read directly off invoices with
  //     supplyType=EXPORT and IGST > 0 for accuracy.
  // 5A: exports under LUT (zero-rated, IGST = 0).
  const exportsWithTaxAcc = { ...ZERO_TAX_BLOCK };
  const exportsLutAcc = { ...ZERO_TAX_BLOCK };
  for (const inv of invoices) {
    if (inv.supplyType !== "EXPORT") continue;
    const lineTaxable = inv.items.reduce(
      (a, i) => a.plus(D(i.taxableAmount)),
      D(0)
    );
    const lineIgst = inv.items.reduce(
      (a, i) => a.plus(D(i.igstAmount ?? 0)),
      D(0)
    );
    const target = lineIgst.greaterThan(D(0)) ? exportsWithTaxAcc : exportsLutAcc;
    target.taxableValue = D(target.taxableValue).plus(lineTaxable).toString();
    target.igst = D(target.igst).plus(lineIgst).toString();
  }

  const inwardRcm: Gstr9TaxBlock = {
    taxableValue: annual.s3_1.inwardReverseCharge.taxableValue,
    igst: annual.s3_1.inwardReverseCharge.igst,
    cgst: annual.s3_1.inwardReverseCharge.cgst,
    sgst: annual.s3_1.inwardReverseCharge.sgst,
    cess: annual.s3_1.inwardReverseCharge.cess,
  };

  const subtotal = blockSum(
    b2bAcc,
    b2cAcc,
    exportsWithTaxAcc,
    ZERO_TAX_BLOCK, // SEZ + deemed exports + advances unmodeled
    ZERO_TAX_BLOCK,
    ZERO_TAX_BLOCK,
    inwardRcm
  );

  const netSupplies = blockSubtract(blockSum(subtotal, dnAcc), cnAcc);

  // Section 5 — non-payable (LUT exports, nil, exempt, non-GST).
  // The 3.1.c (nil-rated outward) doesn't carry a separate "exempt"
  // breakdown in our compute; we treat it as a single nil/exempt cell.
  const nilExempt: Gstr9TaxBlock = {
    taxableValue: annual.s3_1.outwardNilRated.taxableValue,
    igst: "0",
    cgst: "0",
    sgst: "0",
    cess: "0",
  };
  const nonGst: Gstr9TaxBlock = {
    taxableValue: annual.s3_1.outwardNonGst.taxableValue,
    igst: "0",
    cgst: "0",
    sgst: "0",
    cess: "0",
  };

  const s5_total = blockSum(exportsLutAcc, ZERO_TAX_BLOCK, ZERO_TAX_BLOCK, nilExempt, ZERO_TAX_BLOCK, nonGst);

  // Section 6 — ITC availed (annualized GSTR-3B 4.A subtotal).
  const itcAvailed: Gstr9TaxBlock = {
    taxableValue: "0", // ITC tables don't carry a taxable value at the cell level
    igst: D(annual.s4.available.reverseCharge.igst).plus(D(annual.s4.available.other.igst)).toString(),
    cgst: D(annual.s4.available.reverseCharge.cgst).plus(D(annual.s4.available.other.cgst)).toString(),
    sgst: D(annual.s4.available.reverseCharge.sgst).plus(D(annual.s4.available.other.sgst)).toString(),
    cess: D(annual.s4.available.reverseCharge.cess).plus(D(annual.s4.available.other.cess)).toString(),
  };

  const itcRcm: Gstr9TaxBlock = {
    taxableValue: "0",
    igst: annual.s4.available.reverseCharge.igst,
    cgst: annual.s4.available.reverseCharge.cgst,
    sgst: annual.s4.available.reverseCharge.sgst,
    cess: annual.s4.available.reverseCharge.cess,
  };

  // Section 7 — ITC reversed. Not yet modeled; ships zeroed.
  const itcReversed: Gstr9TaxBlock = ZERO_TAX_BLOCK;
  const netItc: Gstr9TaxBlock = blockSubtract(itcAvailed, itcReversed);

  // Section 9 — tax payable / paid.
  // Payable = output tax on (4A..4G) + RCM, which is the tax columns of subtotal.
  const taxPayable: Gstr9TaxBlock = {
    taxableValue: subtotal.taxableValue,
    igst: subtotal.igst,
    cgst: subtotal.cgst,
    sgst: subtotal.sgst,
    cess: subtotal.cess,
  };
  const paidThroughItc = clampNonNegative({
    taxableValue: "0",
    igst: D(taxPayable.igst).lessThan(D(netItc.igst)) ? taxPayable.igst : netItc.igst,
    cgst: D(taxPayable.cgst).lessThan(D(netItc.cgst)) ? taxPayable.cgst : netItc.cgst,
    sgst: D(taxPayable.sgst).lessThan(D(netItc.sgst)) ? taxPayable.sgst : netItc.sgst,
    cess: D(taxPayable.cess).lessThan(D(netItc.cess)) ? taxPayable.cess : netItc.cess,
  });
  const paidInCash = clampNonNegative(blockSubtract(taxPayable, paidThroughItc));

  return {
    fiscalYear: {
      start: fy.start.toISOString().slice(0, 10),
      end: fy.end.toISOString().slice(0, 10),
      label: fy.label,
    },
    s4: {
      b2cOutward: b2cAcc,
      b2bOutward: b2bAcc,
      exportsWithTax: exportsWithTaxAcc,
      sezWithTax: ZERO_TAX_BLOCK,
      deemedExports: ZERO_TAX_BLOCK,
      advances: ZERO_TAX_BLOCK,
      inwardReverseCharge: inwardRcm,
      subtotal,
      creditNotesAdjustment: cnAcc,
      debitNotesAdjustment: dnAcc,
      amendments: ZERO_TAX_BLOCK,
      netSupplies,
    },
    s5: {
      exportsLut: exportsLutAcc,
      sezLut: ZERO_TAX_BLOCK,
      outwardRcm: ZERO_TAX_BLOCK,
      exempt: ZERO_TAX_BLOCK, // see comment above on nil/exempt split
      nilRated: nilExempt,
      nonGst,
      total: s5_total,
    },
    s6: {
      totalItcAvailed: itcAvailed,
      rcmDomestic: itcRcm,
      totalItcSubtotal: itcAvailed,
    },
    s7: {
      reversed: itcReversed,
      netItc,
    },
    s9: {
      taxPayable,
      paidThroughItc,
      paidInCash,
    },
  };
}

/** Build a FiscalYear from an Indian FY label like "2026-27". */
export function fyFromLabel(label: string): FiscalYear {
  const m = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (!m) throw new Error(`Invalid FY label: ${label} (expected "YYYY-YY")`);
  const startYear = parseInt(m[1], 10);
  return {
    label,
    start: new Date(`${startYear}-04-01T00:00:00.000Z`),
    end: new Date(`${startYear + 1}-03-31T23:59:59.999Z`),
  };
}
