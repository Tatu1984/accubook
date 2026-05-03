import type { Gstr3bResult } from "./gstr3b";

/**
 * GSTN portal JSON converter for GSTR-3B.
 *
 * The portal upload JSON for GSTR-3B has different field naming than our
 * internal compute shape:
 *
 *   - sup_details: outward + RCM-inward (Section 3.1)
 *   - inter_sup: inter-state supplies to UIN/composition/unregistered
 *     (Section 3.2 — not modeled yet, ships as empty arrays)
 *   - itc_elg: eligible ITC (Section 4) with `ty` discriminator per row
 *     (IMPG / IMPS / ISRC / ISD / OTH for available; RUL / OTH for
 *     reversed)
 *   - inward_sup: exempt/nil/non-GST inward summary (Section 5)
 *
 * Reference: GSTR-3B JSON format spec on the GSTN developer portal.
 */

export type Gstr3bTaxBlock = {
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

export type Gstr3bPortalPayload = {
  gstin: string;
  ret_period: string; // MMYYYY
  sup_details: {
    osup_det: Gstr3bTaxBlock;     // 3.1(a) outward taxable
    osup_zero: { txval: number; iamt: number; csamt: number }; // 3.1(b) zero-rated
    osup_nil_exmp: { txval: number }; // 3.1(c) nil-rated/exempted
    isup_rev: Gstr3bTaxBlock;     // 3.1(d) inward RCM
    osup_nongst: { txval: number }; // 3.1(e) non-GST outward
  };
  inter_sup: {
    /** 3.2: inter-state supplies to unregistered persons (subset of 3.1.a). */
    unreg_details: Array<{ pos: string; txval: number; iamt: number }>;
    /** 3.2: inter-state supplies to composition taxpayers. */
    comp_details: Array<{ pos: string; txval: number; iamt: number }>;
    /** 3.2: inter-state supplies to UIN holders. */
    uin_details: Array<{ pos: string; txval: number; iamt: number }>;
  };
  itc_elg: {
    /** 4.A — ITC available, by source type. */
    itc_avl: Array<{
      ty: "IMPG" | "IMPS" | "ISRC" | "ISD" | "OTH";
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }>;
    /** 4.B — ITC reversed, by reason. */
    itc_rev: Array<{
      ty: "RUL" | "OTH";
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }>;
    /** 4.C — net ITC available (= 4.A − 4.B). */
    itc_net: {
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    };
    /** 4.D — ineligible ITC (placeholder; not yet computed). */
    itc_inelg: Array<{
      ty: "RUL" | "OTH";
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }>;
  };
  inward_sup: {
    /** 5: nil-rated / exempt / non-GST inward, intra vs inter. */
    isup_details: Array<{
      ty: "GST" | "NONGST";
      inter: number;
      intra: number;
    }>;
  };
};

function n(value: string | number, places = 2): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(places));
}

function toFilingPeriod(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = String(date.getUTCFullYear());
  return `${m}${y}`;
}

export type GstrPortalOptions = {
  /** Supplier's GSTIN. */
  gstin: string;
  /** Filing period start date — used for `ret_period` (MMYYYY). */
  periodStart: Date;
};

export function gstr3bToPortalJson(
  result: Gstr3bResult,
  opts: GstrPortalOptions
): Gstr3bPortalPayload {
  const s31 = result.s3_1;
  const s4 = result.s4;
  const s5 = result.s5;

  // 5: split nil/exempt vs non-GST. Our internal Section 5 has 4
  // intra/inter × exempt/non-GST cells. Portal wants two rows: GST
  // (= nil-rated + exempt) and NONGST.
  const s5_gst = {
    inter: n(s5.interStateExempt),
    intra: n(s5.intraStateExempt),
  };
  const s5_nongst = {
    inter: n(s5.interStateNonGst),
    intra: n(s5.intraStateNonGst),
  };

  return {
    gstin: opts.gstin.toUpperCase(),
    ret_period: toFilingPeriod(opts.periodStart),

    sup_details: {
      osup_det: {
        txval: n(s31.outwardTaxable.taxableValue),
        iamt: n(s31.outwardTaxable.igst),
        camt: n(s31.outwardTaxable.cgst),
        samt: n(s31.outwardTaxable.sgst),
        csamt: n(s31.outwardTaxable.cess),
      },
      osup_zero: {
        txval: n(s31.outwardZeroRated.taxableValue),
        iamt: n(s31.outwardZeroRated.igst),
        csamt: n(s31.outwardZeroRated.cess),
      },
      osup_nil_exmp: {
        txval: n(s31.outwardNilRated.taxableValue),
      },
      isup_rev: {
        txval: n(s31.inwardReverseCharge.taxableValue),
        iamt: n(s31.inwardReverseCharge.igst),
        camt: n(s31.inwardReverseCharge.cgst),
        samt: n(s31.inwardReverseCharge.sgst),
        csamt: n(s31.inwardReverseCharge.cess),
      },
      osup_nongst: {
        txval: n(s31.outwardNonGst.taxableValue),
      },
    },

    // 3.2: not yet modeled — empty until we split outward by counterparty
    // type (UIN vs composition vs unregistered). Portal accepts empty arrays.
    inter_sup: {
      unreg_details: [],
      comp_details: [],
      uin_details: [],
    },

    itc_elg: {
      itc_avl: [
        // 4.A.(1) IMPG (import of goods) — not yet modeled.
        { ty: "IMPG", iamt: 0, camt: 0, samt: 0, csamt: 0 },
        // 4.A.(2) IMPS (import of services) — not yet modeled.
        { ty: "IMPS", iamt: 0, camt: 0, samt: 0, csamt: 0 },
        // 4.A.(3) ISRC (inward supplies liable to RCM) — we model this.
        {
          ty: "ISRC",
          iamt: n(s4.available.reverseCharge.igst),
          camt: n(s4.available.reverseCharge.cgst),
          samt: n(s4.available.reverseCharge.sgst),
          csamt: n(s4.available.reverseCharge.cess),
        },
        // 4.A.(4) ISD (input service distributor) — not yet modeled.
        { ty: "ISD", iamt: 0, camt: 0, samt: 0, csamt: 0 },
        // 4.A.(5) OTH (all other ITC) — bulk of the bills.
        {
          ty: "OTH",
          iamt: n(s4.available.other.igst),
          camt: n(s4.available.other.cgst),
          samt: n(s4.available.other.sgst),
          csamt: n(s4.available.other.cess),
        },
      ],
      itc_rev: [
        { ty: "RUL", iamt: 0, camt: 0, samt: 0, csamt: 0 },
        // 4.B (others) — not yet modeled.
        {
          ty: "OTH",
          iamt: n(s4.reversed.igst),
          camt: n(s4.reversed.cgst),
          samt: n(s4.reversed.sgst),
          csamt: n(s4.reversed.cess),
        },
      ],
      itc_net: {
        iamt: n(s4.net.igst),
        camt: n(s4.net.cgst),
        samt: n(s4.net.sgst),
        csamt: n(s4.net.cess),
      },
      itc_inelg: [
        { ty: "RUL", iamt: 0, camt: 0, samt: 0, csamt: 0 },
        { ty: "OTH", iamt: 0, camt: 0, samt: 0, csamt: 0 },
      ],
    },

    inward_sup: {
      isup_details: [
        { ty: "GST", ...s5_gst },
        { ty: "NONGST", ...s5_nongst },
      ],
    },
  };
}
