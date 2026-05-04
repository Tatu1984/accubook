import type { Gstr9Result, Gstr9TaxBlock } from "./gstr9";

/**
 * GSTN portal JSON converter for GSTR-9 (annual return).
 *
 * The GSTR-9 upload schema is the most verbose of the three (vs
 * GSTR-1 / GSTR-3B): every cell of Sections 4–18 is keyed by a short
 * code (tx_4a, tx_4b, ...). Cells we don't yet compute are emitted
 * as zeros — the portal accepts them and the user can edit on the
 * site before filing.
 *
 * We DO populate (from `computeGstr9`):
 *   - 4A B2C, 4B B2B, 4C exports w/ tax, 4G inward RCM, 4I CN, 4J DN, 4N net
 *   - 5A exports under LUT, 5D exempt, 5E nil, 5F non-GST, 5N total
 *   - 6A total ITC, 6B RCM domestic, 6M-O subtotal
 *   - 7H ITC reversed (placeholder), 7J net ITC
 *   - 9 tax payable / paid via ITC / paid in cash
 *
 * Empty / placeholder cells:
 *   - 4D SEZ-with-tax, 4E deemed exports, 4F advances, amendments
 *   - 5B SEZ-LUT, 5C outward-RCM
 *   - 6.A-L sub-categorization (split by source)
 *   - 7.A-G specific reversal reasons
 *   - 8 ITC reconciliation against 2A/2B
 *   - 10–14 amendments
 *   - 15 demands & refunds
 *   - 16 special supplies
 *   - 17 HSN summary outward (we have computeGstr1 → hsnSummary; not
 *        wired in until the API call signature is settled).
 *   - 18 HSN summary inward.
 *
 * Reference: GSTN developer portal — GSTR-9 JSON file format spec.
 */

export type Gstr9PortalCell = {
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

export type Gstr9PortalCellNoTaxable = {
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

export type Gstr9PortalPayload = {
  gstin: string;
  /** GSTN expects "2025-26" for FY 2025-26. */
  fp: string;
  /**
   * Aggregate turnover of the preceding financial year (declared by the
   * taxpayer at filing time — comes from org settings). 0 when the
   * caller does not supply.
   */
  gt: number;
  /**
   * Aggregate turnover of the *current* FY (= 4N + 5N taxable values).
   * Auto-computed.
   */
  cur_gt: number;

  sec_4: {
    tx_4a: Gstr9PortalCell;  // B2C
    tx_4b: Gstr9PortalCell;  // B2B
    tx_4c: Gstr9PortalCell;  // Exports with payment of tax
    tx_4d: Gstr9PortalCell;  // SEZ with tax (placeholder)
    tx_4e: Gstr9PortalCell;  // Deemed exports (placeholder)
    tx_4f: Gstr9PortalCell;  // Advances (placeholder)
    tx_4g: Gstr9PortalCell;  // Inward RCM
    tx_4h: Gstr9PortalCell;  // Subtotal A-G
    tx_4i: Gstr9PortalCell;  // Credit notes
    tx_4j: Gstr9PortalCell;  // Debit notes
    tx_4k: Gstr9PortalCell;  // Amendments (positive) — placeholder
    tx_4l: Gstr9PortalCell;  // Amendments (negative) — placeholder
    tx_4n: Gstr9PortalCell;  // Net taxable supplies
  };

  sec_5: {
    tx_5a: Gstr9PortalCell;  // Exports under LUT
    tx_5b: Gstr9PortalCell;  // SEZ under LUT (placeholder)
    tx_5c: Gstr9PortalCell;  // Outward RCM (placeholder)
    tx_5d: Gstr9PortalCell;  // Exempt
    tx_5e: Gstr9PortalCell;  // Nil-rated
    tx_5f: Gstr9PortalCell;  // Non-GST
    tx_5h: Gstr9PortalCell;  // Subtotal A-G (we map to 5N)
    tx_5n: Gstr9PortalCell;  // Total non-payable
  };

  sec_6: {
    tx_6a: Gstr9PortalCellNoTaxable;  // Total ITC availed in 3B
    tx_6b: Gstr9PortalCellNoTaxable;  // RCM domestic — inputs (no break-out)
    tx_6c: Gstr9PortalCellNoTaxable;  // RCM unregistered (placeholder)
    tx_6d: Gstr9PortalCellNoTaxable;  // RCM registered (placeholder)
    tx_6e: Gstr9PortalCellNoTaxable;  // Imports of goods (placeholder)
    tx_6f: Gstr9PortalCellNoTaxable;  // Imports of services (placeholder)
    tx_6g: Gstr9PortalCellNoTaxable;  // ISD (placeholder)
    tx_6h: Gstr9PortalCellNoTaxable;  // Reclaimed (placeholder)
    tx_6m: Gstr9PortalCellNoTaxable;  // Subtotal
    tx_6n: Gstr9PortalCellNoTaxable;  // Transition credit (placeholder)
    tx_6o: Gstr9PortalCellNoTaxable;  // Total ITC availed (= 6M + 6N)
  };

  sec_7: {
    tx_7a: Gstr9PortalCellNoTaxable;  // ITC reversed: Rule 37 (placeholder)
    tx_7b: Gstr9PortalCellNoTaxable;  // Rule 39 (placeholder)
    tx_7c: Gstr9PortalCellNoTaxable;  // Rule 42 (placeholder)
    tx_7d: Gstr9PortalCellNoTaxable;  // Rule 43 (placeholder)
    tx_7e: Gstr9PortalCellNoTaxable;  // 17(5) blocked (placeholder)
    tx_7f: Gstr9PortalCellNoTaxable;  // Reversal of TRAN-I (placeholder)
    tx_7g: Gstr9PortalCellNoTaxable;  // TRAN-II (placeholder)
    tx_7h: Gstr9PortalCellNoTaxable;  // Other reversals (we map total to here)
    tx_7i: Gstr9PortalCellNoTaxable;  // Total reversed
    tx_7j: Gstr9PortalCellNoTaxable;  // Net ITC available (6O − 7I)
  };

  sec_9: {
    /** Tax payable, paid via ITC, paid in cash, interest, late fee. */
    tx_payable: Gstr9PortalCellNoTaxable;
    tx_paid_itc: Gstr9PortalCellNoTaxable;
    tx_paid_cash: Gstr9PortalCellNoTaxable;
    tx_int: Gstr9PortalCellNoTaxable;  // placeholder
    tx_late_fee: Gstr9PortalCellNoTaxable;  // placeholder
  };
};

function n(value: string | number, places = 2): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(places));
}

function cell(b: Gstr9TaxBlock): Gstr9PortalCell {
  return {
    txval: n(b.taxableValue),
    iamt: n(b.igst),
    camt: n(b.cgst),
    samt: n(b.sgst),
    csamt: n(b.cess),
  };
}

function noTax(b: Gstr9TaxBlock): Gstr9PortalCellNoTaxable {
  return {
    iamt: n(b.igst),
    camt: n(b.cgst),
    samt: n(b.sgst),
    csamt: n(b.cess),
  };
}

const ZERO_CELL: Gstr9PortalCell = {
  txval: 0,
  iamt: 0,
  camt: 0,
  samt: 0,
  csamt: 0,
};

const ZERO_NOTAX: Gstr9PortalCellNoTaxable = {
  iamt: 0,
  camt: 0,
  samt: 0,
  csamt: 0,
};

export type Gstr9PortalOptions = {
  gstin: string;
  /**
   * Preceding FY's aggregate turnover. Required by the portal at
   * filing time but unknown to our books (lives in org settings or
   * is an annual user-supplied value). Defaults to 0; user can edit
   * on portal.
   */
  precedingFyTurnover?: number;
};

export function gstr9ToPortalJson(
  result: Gstr9Result,
  opts: Gstr9PortalOptions
): Gstr9PortalPayload {
  const s4 = result.s4;
  const s5 = result.s5;
  const s6 = result.s6;
  const s7 = result.s7;
  const s9 = result.s9;

  const cur_gt = n(
    Number(result.s4.netSupplies.taxableValue) +
      Number(result.s5.total.taxableValue)
  );

  return {
    gstin: opts.gstin.toUpperCase(),
    fp: result.fiscalYear.label,
    gt: opts.precedingFyTurnover ?? 0,
    cur_gt,

    sec_4: {
      tx_4a: cell(s4.b2cOutward),
      tx_4b: cell(s4.b2bOutward),
      tx_4c: cell(s4.exportsWithTax),
      tx_4d: cell(s4.sezWithTax),
      tx_4e: cell(s4.deemedExports),
      tx_4f: cell(s4.advances),
      tx_4g: cell(s4.inwardReverseCharge),
      tx_4h: cell(s4.subtotal),
      tx_4i: cell(s4.creditNotesAdjustment),
      tx_4j: cell(s4.debitNotesAdjustment),
      tx_4k: ZERO_CELL,
      tx_4l: ZERO_CELL,
      tx_4n: cell(s4.netSupplies),
    },

    sec_5: {
      tx_5a: cell(s5.exportsLut),
      tx_5b: cell(s5.sezLut),
      tx_5c: cell(s5.outwardRcm),
      tx_5d: cell(s5.exempt),
      tx_5e: cell(s5.nilRated),
      tx_5f: cell(s5.nonGst),
      tx_5h: cell(s5.total),
      tx_5n: cell(s5.total),
    },

    sec_6: {
      tx_6a: noTax(s6.totalItcAvailed),
      tx_6b: noTax(s6.rcmDomestic),
      tx_6c: ZERO_NOTAX,
      tx_6d: ZERO_NOTAX,
      tx_6e: ZERO_NOTAX,
      tx_6f: ZERO_NOTAX,
      tx_6g: ZERO_NOTAX,
      tx_6h: ZERO_NOTAX,
      tx_6m: noTax(s6.totalItcSubtotal),
      tx_6n: ZERO_NOTAX,
      tx_6o: noTax(s6.totalItcSubtotal),
    },

    sec_7: {
      tx_7a: ZERO_NOTAX,
      tx_7b: ZERO_NOTAX,
      tx_7c: ZERO_NOTAX,
      tx_7d: ZERO_NOTAX,
      tx_7e: ZERO_NOTAX,
      tx_7f: ZERO_NOTAX,
      tx_7g: ZERO_NOTAX,
      tx_7h: noTax(s7.reversed),
      tx_7i: noTax(s7.reversed),
      tx_7j: noTax(s7.netItc),
    },

    sec_9: {
      tx_payable: noTax(s9.taxPayable),
      tx_paid_itc: noTax(s9.paidThroughItc),
      tx_paid_cash: noTax(s9.paidInCash),
      tx_int: ZERO_NOTAX,
      tx_late_fee: ZERO_NOTAX,
    },
  };
}

/**
 * `GSTR9_<gstin>_<FY>.json` — matches the file naming used for
 * GSTR-1 / GSTR-3B portal downloads.
 */
export function gstr9PortalFilename(gstin: string, fyLabel: string): string {
  return `GSTR9_${gstin.toUpperCase()}_${fyLabel}.json`;
}
