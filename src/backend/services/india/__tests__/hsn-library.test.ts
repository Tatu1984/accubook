import { describe, expect, it } from "vitest";
import { lookupHsn, searchHsn, HSN_LIBRARY } from "../hsn-library";

describe("lookupHsn", () => {
  it("finds an exact HSN code (8471 = computers)", () => {
    const r = lookupHsn("8471");
    expect(r?.description).toContain("computer");
    expect(r?.defaultGstRate).toBe(18);
    expect(r?.type).toBe("HSN");
  });

  it("finds an exact SAC code (9982 = legal/accounting)", () => {
    const r = lookupHsn("9982");
    expect(r?.description).toContain("Legal");
    expect(r?.type).toBe("SAC");
  });

  it("trims whitespace", () => {
    expect(lookupHsn("  8471  ")?.code).toBe("8471");
  });

  it("returns null for unknown codes", () => {
    expect(lookupHsn("9999")).toBeNull();
    expect(lookupHsn("")).toBeNull();
  });
});

describe("searchHsn — by code prefix", () => {
  it("returns codes starting with '85'", () => {
    const r = searchHsn("85");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.code.startsWith("85"))).toBe(true);
  });

  it("respects type filter (SAC only)", () => {
    const r = searchHsn("99", { type: "SAC" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.type === "SAC")).toBe(true);
  });

  it("respects limit", () => {
    const r = searchHsn("9", { limit: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
  });
});

describe("searchHsn — by description substring", () => {
  it("finds 'transport'", () => {
    const r = searchHsn("transport");
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.some((e) => /transport/i.test(e.description))).toBe(true);
  });

  it("matches case-insensitively", () => {
    const r = searchHsn("LEGAL");
    expect(r.some((e) => e.description.toLowerCase().includes("legal"))).toBe(true);
  });

  it("code-prefix matches sort before description matches", () => {
    // "85" — 8528, 8517, 8504 etc are code-prefix matches; description
    // matches with "8" inside are pushed lower.
    const r = searchHsn("85");
    if (r.length >= 2) {
      expect(r[0].code.startsWith("85")).toBe(true);
    }
  });
});

describe("HSN_LIBRARY integrity", () => {
  it("every entry has a non-empty code, description, and rate", () => {
    for (const e of HSN_LIBRARY) {
      expect(e.code.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.defaultGstRate).toBeGreaterThanOrEqual(0);
      expect(e.defaultGstRate).toBeLessThanOrEqual(28);
      expect(["HSN", "SAC"]).toContain(e.type);
    }
  });

  it("no duplicate codes", () => {
    const codes = HSN_LIBRARY.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
