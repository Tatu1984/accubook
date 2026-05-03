import { STATE_CODE_BY_GSTIN_PREFIX } from "@/backend/utils/india-tax";
import type { Gstr1Result } from "./gstr1";

/**
 * GSTN portal JSON format converter for GSTR-1.
 *
 * The portal expects:
 *   - Period as MMYYYY (e.g. "042026" for April 2026).
 *   - Dates as DD-MM-YYYY.
 *   - Place of supply as the 2-digit numeric state code (e.g. "27" for MH).
 *   - Reverse charge as "Y"/"N".
 *   - Invoice type as "R" (regular), "SEWP", "SEWOP", "DE".
 *   - Numbers as numbers (not strings).
 *   - HSN section wrapped as `{ "data": [...] }`.
 *   - DOCS section as `{ "doc_det": [...] }`.
 *
 * This converter takes the human-readable `Gstr1Result` (produced by
 * computeGstr1) and emits the GSTN-compatible payload. Caller wraps it
 * with the supplier's GSTIN and turnover figures.
 */

/** Numeric-to-letter state code map, derived from the GSTIN prefix table. */
const NUMERIC_BY_LETTER: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [num, letter] of Object.entries(STATE_CODE_BY_GSTIN_PREFIX)) {
    out[letter] = num;
  }
  return out;
})();

function toNumericStateCode(letterCode: string | null | undefined): string {
  if (!letterCode) return "";
  return NUMERIC_BY_LETTER[letterCode.trim().toUpperCase()] ?? "";
}

/** YYYY-MM-DD → DD-MM-YYYY. Returns input if not parseable. */
function toPortalDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Date → MMYYYY. Used for the `fp` (filing period) field. */
function toFilingPeriod(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = String(date.getUTCFullYear());
  return `${m}${y}`;
}

function n(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

export type Gstr1PortalPayload = {
  gstin: string;
  fp: string;       // MMYYYY
  gt: number;       // turnover of preceding FY (caller fills in)
  cur_gt: number;   // turnover of current FY through this period (caller fills in)
  b2b: Array<{
    ctin: string;
    inv: Array<{
      inum: string;
      idt: string;
      val: number;
      pos: string;
      rchrg: "Y" | "N";
      inv_typ: "R" | "SEWP" | "SEWOP" | "DE";
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          camt: number;
          samt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  b2cl: Array<{
    pos: string;
    inv: Array<{
      inum: string;
      idt: string;
      val: number;
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  b2cs: Array<{
    sply_ty: "INTER" | "INTRA";
    pos: string;
    typ: "OE";
    rt: number;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  }>;
  cdnr: Array<{
    ctin: string;
    nt: Array<{
      ntty: "C" | "D";
      nt_num: string;
      nt_dt: string;
      val: number;
      pos: string;
      rchrg: "Y" | "N";
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          camt: number;
          samt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  cdnur: Array<{
    typ: "B2CL" | "EXPWP" | "EXPWOP";
    ntty: "C" | "D";
    nt_num: string;
    nt_dt: string;
    val: number;
    pos: string;
    itms: Array<{
      num: number;
      itm_det: {
        rt: number;
        txval: number;
        iamt: number;
        csamt: number;
      };
    }>;
  }>;
  exp: Array<{
    exp_typ: "WPAY" | "WOPAY";
    inv: Array<{
      inum: string;
      idt: string;
      val: number;
      itms: Array<{
        rt: number;
        txval: number;
        iamt: number;
        csamt: number;
      }>;
    }>;
  }>;
  nil: {
    inv: Array<{
      sply_ty: "INTRB2B" | "INTRB2C" | "INTERB2B" | "INTERB2C";
      expt_amt: number;
      nil_amt: number;
      ngsup_amt: number;
    }>;
  };
  hsn: {
    data: Array<{
      num: number;
      hsn_sc: string;
      desc: string;
      uqc: string;
      qty: number;
      txval: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
      rt: number;
    }>;
  };
  doc_issue: {
    doc_det: Array<{
      doc_num: number;
      doc_typ: string;
      docs: Array<{
        num: number;
        from: string;
        to: string;
        totnum: number;
        cancel: number;
        net_issue: number;
      }>;
    }>;
  };
};

const NIL_BUCKET_TO_PORTAL: Record<string, "INTRB2B" | "INTRB2C" | "INTERB2B" | "INTERB2C"> = {
  INTRA_REG: "INTRB2B",
  INTRA_UNREG: "INTRB2C",
  INTER_REG: "INTERB2B",
  INTER_UNREG: "INTERB2C",
};

export type ToPortalOptions = {
  /** Supplier's GSTIN. */
  gstin: string;
  /** Filing period start date — used for `fp` (MMYYYY). */
  periodStart: Date;
  /** Turnover of the preceding financial year. */
  grossTurnoverPreviousFy?: number;
  /** Turnover of the current FY through the filing period. */
  grossTurnoverCurrentFy?: number;
};

export function gstr1ToPortalJson(
  result: Gstr1Result,
  opts: ToPortalOptions
): Gstr1PortalPayload {
  return {
    gstin: opts.gstin.toUpperCase(),
    fp: toFilingPeriod(opts.periodStart),
    gt: opts.grossTurnoverPreviousFy ?? 0,
    cur_gt: opts.grossTurnoverCurrentFy ?? 0,

    b2b: result.b2b.map((g) => ({
      ctin: g.ctin,
      inv: g.invoices.map((inv) => ({
        inum: inv.invoiceNumber,
        idt: toPortalDate(inv.date),
        val: n(inv.totalValue),
        pos: toNumericStateCode(inv.placeOfSupply),
        rchrg: inv.reverseCharge ? "Y" : "N",
        inv_typ: "R",
        itms: inv.items.map((it, i) => ({
          num: i + 1,
          itm_det: {
            rt: n(it.rate),
            txval: n(it.taxableValue),
            iamt: n(it.igst),
            camt: n(it.cgst),
            samt: n(it.sgst),
            csamt: n(it.cess),
          },
        })),
      })),
    })),

    b2cl: groupByPos(
      result.b2cl.map((inv) => ({
        pos: toNumericStateCode(inv.placeOfSupply),
        inv: {
          inum: inv.invoiceNumber,
          idt: toPortalDate(inv.date),
          val: n(inv.totalValue),
          itms: inv.items.map((it, i) => ({
            num: i + 1,
            itm_det: {
              rt: n(it.rate),
              txval: n(it.taxableValue),
              iamt: n(it.igst),
              csamt: n(it.cess),
            },
          })),
        },
      })),
    ),

    b2cs: result.b2cs.map((row) => ({
      sply_ty: n(row.igst) > 0 ? "INTER" : "INTRA",
      pos: toNumericStateCode(row.placeOfSupply),
      typ: "OE",
      rt: n(row.rate),
      txval: n(row.taxableValue),
      iamt: n(row.igst),
      camt: n(row.cgst),
      samt: n(row.sgst),
      csamt: n(row.cess),
    })),

    cdnr: groupCdnByCtin(result.cdnr),

    cdnur: result.cdnur.map((note) => ({
      typ: "B2CL", // unregistered credit/debit notes default to B2CL classification
      ntty: note.noteType,
      nt_num: note.noteNumber,
      nt_dt: toPortalDate(note.noteDate),
      val: n(note.totalValue),
      pos: toNumericStateCode(note.placeOfSupply),
      itms: note.items.map((it, i) => ({
        num: i + 1,
        itm_det: {
          rt: n(it.rate),
          txval: n(it.taxableValue),
          iamt: n(it.igst),
          csamt: n(it.cess),
        },
      })),
    })),

    exp: groupExp(result.exp),

    nil: {
      inv: result.nil.map((row) => ({
        sply_ty: NIL_BUCKET_TO_PORTAL[row.bucket],
        expt_amt: 0,
        nil_amt: n(row.amount),
        ngsup_amt: 0,
      })),
    },

    hsn: {
      data: result.hsn.map((row, i) => ({
        num: i + 1,
        hsn_sc: row.hsnCode,
        desc: row.description ?? "",
        uqc: row.uqc,
        qty: n(row.quantity),
        txval: n(row.taxableValue),
        iamt: n(row.igst),
        camt: n(row.cgst),
        samt: n(row.sgst),
        csamt: n(row.cess),
        rt: n(row.rate),
      })),
    },

    doc_issue: {
      doc_det: result.docs.map((row, i) => ({
        doc_num: i + 1,
        doc_typ: row.docType,
        docs: [
          {
            num: 1,
            from: row.fromNum ?? "",
            to: row.toNum ?? "",
            totnum: row.total,
            cancel: row.cancelled,
            net_issue: row.netIssued,
          },
        ],
      })),
    },
  };
}

function groupByPos(
  rows: Array<{ pos: string; inv: Gstr1PortalPayload["b2cl"][number]["inv"][number] }>
): Gstr1PortalPayload["b2cl"] {
  const out = new Map<string, Gstr1PortalPayload["b2cl"][number]>();
  for (const r of rows) {
    const existing = out.get(r.pos);
    if (existing) existing.inv.push(r.inv);
    else out.set(r.pos, { pos: r.pos, inv: [r.inv] });
  }
  return [...out.values()];
}

function groupCdnByCtin(
  notes: Gstr1Result["cdnr"]
): Gstr1PortalPayload["cdnr"] {
  const out = new Map<string, Gstr1PortalPayload["cdnr"][number]>();
  for (const note of notes) {
    const portalNote = {
      ntty: note.noteType,
      nt_num: note.noteNumber,
      nt_dt: toPortalDate(note.noteDate),
      val: n(note.totalValue),
      pos: toNumericStateCode(note.placeOfSupply),
      rchrg: note.reverseCharge ? ("Y" as const) : ("N" as const),
      itms: note.items.map((it, i) => ({
        num: i + 1,
        itm_det: {
          rt: n(it.rate),
          txval: n(it.taxableValue),
          iamt: n(it.igst),
          camt: n(it.cgst),
          samt: n(it.sgst),
          csamt: n(it.cess),
        },
      })),
    };
    const existing = out.get(note.ctin);
    if (existing) existing.nt.push(portalNote);
    else out.set(note.ctin, { ctin: note.ctin, nt: [portalNote] });
  }
  return [...out.values()];
}

function groupExp(
  invoices: Gstr1Result["exp"]
): Gstr1PortalPayload["exp"] {
  const wpay: Gstr1PortalPayload["exp"][number]["inv"] = [];
  const wopay: Gstr1PortalPayload["exp"][number]["inv"] = [];
  for (const inv of invoices) {
    const portalInv = {
      inum: inv.invoiceNumber,
      idt: toPortalDate(inv.date),
      val: n(inv.totalValue),
      itms: inv.items.map((it) => ({
        rt: n(it.rate),
        txval: n(it.taxableValue),
        iamt: n(it.igst),
        csamt: n(it.cess),
      })),
    };
    if (inv.exportType === "WPAY") wpay.push(portalInv);
    else wopay.push(portalInv);
  }
  const out: Gstr1PortalPayload["exp"] = [];
  if (wpay.length) out.push({ exp_typ: "WPAY", inv: wpay });
  if (wopay.length) out.push({ exp_typ: "WOPAY", inv: wopay });
  return out;
}
