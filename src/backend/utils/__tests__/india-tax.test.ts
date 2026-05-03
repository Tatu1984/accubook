import { describe, expect, it } from "vitest";
import {
  computeLineGst,
  determineSupplyType,
  isValidGstinFormat,
  splitGstRate,
  stateCodeFromGstin,
  verifyGstinChecksum,
} from "../india-tax";

describe("determineSupplyType", () => {
  it("intrastate when both states match", () => {
    expect(determineSupplyType("MH", "MH")).toBe("INTRASTATE");
    expect(determineSupplyType("ka", "KA")).toBe("INTRASTATE");
    expect(determineSupplyType(" DL ", "dl")).toBe("INTRASTATE");
  });

  it("interstate when states differ", () => {
    expect(determineSupplyType("MH", "KA")).toBe("INTERSTATE");
  });

  it("interstate when either state is missing — fail-safe to IGST", () => {
    expect(determineSupplyType(null, "MH")).toBe("INTERSTATE");
    expect(determineSupplyType("MH", null)).toBe("INTERSTATE");
    expect(determineSupplyType(undefined, undefined)).toBe("INTERSTATE");
  });
});

describe("splitGstRate", () => {
  it("splits 18% intrastate into 9% CGST + 9% SGST", () => {
    const r = splitGstRate("18", "INTRASTATE");
    expect(r.cgst.toString()).toBe("9");
    expect(r.sgst.toString()).toBe("9");
    expect(r.igst.toString()).toBe("0");
  });

  it("keeps 18% interstate as 18% IGST", () => {
    const r = splitGstRate(18, "INTERSTATE");
    expect(r.cgst.toString()).toBe("0");
    expect(r.sgst.toString()).toBe("0");
    expect(r.igst.toString()).toBe("18");
  });

  it("handles odd rates (5%) without precision loss", () => {
    const r = splitGstRate("5", "INTRASTATE");
    expect(r.cgst.toString()).toBe("2.5");
    expect(r.sgst.toString()).toBe("2.5");
  });

  it("handles 0% (NIL rated)", () => {
    const r = splitGstRate(0, "INTRASTATE");
    expect(r.cgst.isZero()).toBe(true);
    expect(r.sgst.isZero()).toBe(true);
    expect(r.igst.isZero()).toBe(true);
  });
});

describe("computeLineGst", () => {
  it("intrastate: ₹1000 @ 18% → 90 CGST + 90 SGST + 0 IGST = 180 total", () => {
    const r = computeLineGst("1000", "18", "INTRASTATE");
    expect(r.cgstAmount.toString()).toBe("90");
    expect(r.sgstAmount.toString()).toBe("90");
    expect(r.igstAmount.toString()).toBe("0");
    expect(r.totalTaxAmount.toString()).toBe("180");
  });

  it("interstate: ₹1000 @ 18% → 0 CGST + 0 SGST + 180 IGST = 180 total", () => {
    const r = computeLineGst(1000, 18, "INTERSTATE");
    expect(r.cgstAmount.toString()).toBe("0");
    expect(r.sgstAmount.toString()).toBe("0");
    expect(r.igstAmount.toString()).toBe("180");
    expect(r.totalTaxAmount.toString()).toBe("180");
  });

  it("handles fractional rate (5% intrastate) and amount", () => {
    // ₹1234.56 @ 5% = 61.728 split 30.864 + 30.864
    const r = computeLineGst("1234.56", "5", "INTRASTATE");
    expect(r.cgstAmount.toString()).toBe("30.864");
    expect(r.sgstAmount.toString()).toBe("30.864");
    expect(r.totalTaxAmount.toString()).toBe("61.728");
  });

  it("0% supply (exempt / nil rated) → no tax", () => {
    const r = computeLineGst("100", 0, "INTRASTATE");
    expect(r.totalTaxAmount.isZero()).toBe(true);
  });
});

describe("stateCodeFromGstin", () => {
  it("extracts MH from a Maharashtra GSTIN", () => {
    expect(stateCodeFromGstin("27AAAAA0000A1Z5")).toBe("MH");
  });

  it("extracts KA from a Karnataka GSTIN", () => {
    expect(stateCodeFromGstin("29AAAAA0000A1Z5")).toBe("KA");
  });

  it("extracts DL from a Delhi GSTIN", () => {
    expect(stateCodeFromGstin("07AAAAA0000A1Z5")).toBe("DL");
  });

  it("returns null for unknown prefixes", () => {
    expect(stateCodeFromGstin("XX12345")).toBeNull();
    expect(stateCodeFromGstin("00AAAAA0000A1Z5")).toBeNull();
  });

  it("handles null/empty inputs", () => {
    expect(stateCodeFromGstin(null)).toBeNull();
    expect(stateCodeFromGstin(undefined)).toBeNull();
    expect(stateCodeFromGstin("")).toBeNull();
    expect(stateCodeFromGstin("X")).toBeNull();
  });
});

describe("isValidGstinFormat", () => {
  it("accepts a properly-formatted GSTIN", () => {
    expect(isValidGstinFormat("27AAAAA0000A1Z5")).toBe(true);
    expect(isValidGstinFormat("29ABCDE1234F1Z2")).toBe(true);
  });

  it("normalizes case and trims whitespace", () => {
    expect(isValidGstinFormat(" 27aaaaa0000a1z5 ")).toBe(true);
  });

  it("rejects malformed GSTINs", () => {
    expect(isValidGstinFormat("27AAAAA0000A1X5")).toBe(false); // not "Z" at position 13
    expect(isValidGstinFormat("XX12345")).toBe(false);
    expect(isValidGstinFormat("27AAAAA0000A1Z")).toBe(false); // 14 chars
    expect(isValidGstinFormat("")).toBe(false);
    expect(isValidGstinFormat(null)).toBe(false);
  });
});

describe("verifyGstinChecksum (Mod-36)", () => {
  // Check digits computed by hand from the algorithm (base-36 weighted
  // sum, alternating factors 1/2, sum of digit-pairs of each product,
  // mod 36 inverted to a base-36 char). These are the values the NIC
  // portal would accept for these first-14-char prefixes.
  const fixtures: Array<{ gstin: string; valid: boolean; note: string }> = [
    { gstin: "27AAACR4849P1ZP", valid: true, note: "Maharashtra checksum 'P'" },
    { gstin: "07AABCS5443A1ZS", valid: true, note: "Delhi checksum 'S'" },

    // Same first 14 chars, wrong check digit.
    { gstin: "27AAACR4849P1Z9", valid: false, note: "Maharashtra wrong checksum '9'" },
    { gstin: "07AABCS5443A1Z0", valid: false, note: "Delhi wrong checksum '0'" },

    // Format-invalid → checksum can't pass.
    { gstin: "BADGSTIN0000000", valid: false, note: "garbage" },
    { gstin: "", valid: false, note: "empty" },
  ];

  for (const fx of fixtures) {
    it(`${fx.gstin} (${fx.note}) → ${fx.valid}`, () => {
      expect(verifyGstinChecksum(fx.gstin)).toBe(fx.valid);
    });
  }

  it("normalizes case and whitespace", () => {
    const valid = "27AAACR4849P1ZP";
    expect(verifyGstinChecksum(valid)).toBe(true);
    expect(verifyGstinChecksum(`  ${valid.toLowerCase()}  `)).toBe(true);
  });

  it("rejects null / undefined", () => {
    expect(verifyGstinChecksum(null)).toBe(false);
    expect(verifyGstinChecksum(undefined)).toBe(false);
  });
});
