import { describe, expect, it } from "vitest";
import { gstr3bToPortalJson } from "../gstr3b-portal";
import type { Gstr3bResult } from "../gstr3b";

const opts = {
  gstin: "27AAAAA0000A1Z5",
  periodStart: new Date("2026-04-01T00:00:00.000Z"),
};

const blank = (): Gstr3bResult["s3_1"]["outwardTaxable"] => ({
  taxableValue: "0",
  igst: "0",
  cgst: "0",
  sgst: "0",
  cess: "0",
});

const emptyResult = (): Gstr3bResult => ({
  period: { from: "2026-04-01", to: "2026-04-30" },
  s3_1: {
    outwardTaxable: blank(),
    outwardZeroRated: blank(),
    outwardNilRated: blank(),
    inwardReverseCharge: blank(),
    outwardNonGst: blank(),
  },
  s4: {
    available: { reverseCharge: blank(), other: blank() },
    reversed: blank(),
    net: blank(),
  },
  s5: {
    intraStateExempt: "0",
    intraStateNonGst: "0",
    interStateExempt: "0",
    interStateNonGst: "0",
  },
});

describe("gstr3bToPortalJson — top level", () => {
  it("formats ret_period as MMYYYY and uppercases gstin", () => {
    const out = gstr3bToPortalJson(emptyResult(), opts);
    expect(out.ret_period).toBe("042026");
    expect(out.gstin).toBe("27AAAAA0000A1Z5");
  });
});

describe("gstr3bToPortalJson — Section 3.1 sup_details", () => {
  it("maps outward taxable to osup_det", () => {
    const r = emptyResult();
    r.s3_1.outwardTaxable = {
      taxableValue: "10000", igst: "0", cgst: "900", sgst: "900", cess: "0",
    };
    const out = gstr3bToPortalJson(r, opts);
    expect(out.sup_details.osup_det.txval).toBe(10000);
    expect(out.sup_details.osup_det.camt).toBe(900);
    expect(out.sup_details.osup_det.samt).toBe(900);
    expect(out.sup_details.osup_det.iamt).toBe(0);
  });

  it("maps zero-rated outward to osup_zero with iamt only", () => {
    const r = emptyResult();
    r.s3_1.outwardZeroRated = {
      taxableValue: "100000", igst: "18000", cgst: "0", sgst: "0", cess: "0",
    };
    const out = gstr3bToPortalJson(r, opts);
    expect(out.sup_details.osup_zero.txval).toBe(100000);
    expect(out.sup_details.osup_zero.iamt).toBe(18000);
    expect(out.sup_details.osup_zero.csamt).toBe(0);
  });

  it("maps nil-rated outward as txval-only", () => {
    const r = emptyResult();
    r.s3_1.outwardNilRated.taxableValue = "5000";
    const out = gstr3bToPortalJson(r, opts);
    expect(out.sup_details.osup_nil_exmp.txval).toBe(5000);
  });

  it("maps RCM inward to isup_rev (full breakdown)", () => {
    const r = emptyResult();
    r.s3_1.inwardReverseCharge = {
      taxableValue: "1000", igst: "0", cgst: "90", sgst: "90", cess: "0",
    };
    const out = gstr3bToPortalJson(r, opts);
    expect(out.sup_details.isup_rev.txval).toBe(1000);
    expect(out.sup_details.isup_rev.camt).toBe(90);
    expect(out.sup_details.isup_rev.samt).toBe(90);
  });
});

describe("gstr3bToPortalJson — Section 4 itc_elg", () => {
  it("emits all 5 itc_avl rows, mapping ISRC + OTH from our compute", () => {
    const r = emptyResult();
    r.s4.available.reverseCharge = {
      taxableValue: "1000", igst: "0", cgst: "90", sgst: "90", cess: "0",
    };
    r.s4.available.other = {
      taxableValue: "5000", igst: "0", cgst: "450", sgst: "450", cess: "0",
    };
    const out = gstr3bToPortalJson(r, opts);
    expect(out.itc_elg.itc_avl).toHaveLength(5);
    const types = out.itc_elg.itc_avl.map((r) => r.ty).sort();
    expect(types).toEqual(["IMPG", "IMPS", "ISD", "ISRC", "OTH"]);
    const isrc = out.itc_elg.itc_avl.find((r) => r.ty === "ISRC")!;
    expect(isrc.camt).toBe(90);
    const oth = out.itc_elg.itc_avl.find((r) => r.ty === "OTH")!;
    expect(oth.camt).toBe(450);
  });

  it("imports/ISD rows are zero (not yet modeled)", () => {
    const out = gstr3bToPortalJson(emptyResult(), opts);
    const impg = out.itc_elg.itc_avl.find((r) => r.ty === "IMPG")!;
    expect(impg.iamt).toBe(0);
    expect(impg.camt).toBe(0);
    expect(impg.samt).toBe(0);
  });

  it("itc_net mirrors s4.net (= available − reversed)", () => {
    const r = emptyResult();
    r.s4.net = {
      taxableValue: "5000", igst: "0", cgst: "450", sgst: "450", cess: "0",
    };
    const out = gstr3bToPortalJson(r, opts);
    expect(out.itc_elg.itc_net.camt).toBe(450);
    expect(out.itc_elg.itc_net.samt).toBe(450);
  });
});

describe("gstr3bToPortalJson — Section 5 inward_sup", () => {
  it("emits two rows: GST (exempt+nil) and NONGST", () => {
    const r = emptyResult();
    r.s5.intraStateExempt = "2000";
    r.s5.interStateExempt = "3000";
    r.s5.intraStateNonGst = "100";
    r.s5.interStateNonGst = "200";
    const out = gstr3bToPortalJson(r, opts);
    expect(out.inward_sup.isup_details).toHaveLength(2);
    const gst = out.inward_sup.isup_details.find((r) => r.ty === "GST")!;
    expect(gst.intra).toBe(2000);
    expect(gst.inter).toBe(3000);
    const nongst = out.inward_sup.isup_details.find((r) => r.ty === "NONGST")!;
    expect(nongst.intra).toBe(100);
    expect(nongst.inter).toBe(200);
  });
});

describe("gstr3bToPortalJson — Section 3.2 placeholders", () => {
  it("ships empty arrays for inter-state UIN/composition/unregistered", () => {
    const out = gstr3bToPortalJson(emptyResult(), opts);
    expect(out.inter_sup.unreg_details).toEqual([]);
    expect(out.inter_sup.comp_details).toEqual([]);
    expect(out.inter_sup.uin_details).toEqual([]);
  });
});
