import { describe, it, expect } from "vitest";
import { buildForm16AQuarterly, quarterFromDate, quarterDateRange, type DeductionRow } from "../form-16a";

const row = (overrides: Partial<DeductionRow> = {}): DeductionRow => ({
  partyId: "p1",
  partyName: "Acme Pvt Ltd",
  partyPan: "ABCDE1234F",
  section: "194C",
  baseAmount: 100000,
  taxAmount: 2000,
  ratePercent: 2,
  deductedAt: new Date("2025-04-15"),
  ...overrides,
});

describe("quarterFromDate", () => {
  it("maps April → Q1", () => {
    expect(quarterFromDate(new Date("2025-04-15"))).toBe(1);
  });
  it("maps June 30 → Q1", () => {
    expect(quarterFromDate(new Date("2025-06-30"))).toBe(1);
  });
  it("maps July 1 → Q2", () => {
    expect(quarterFromDate(new Date("2025-07-01"))).toBe(2);
  });
  it("maps October → Q3", () => {
    expect(quarterFromDate(new Date("2025-10-12"))).toBe(3);
  });
  it("maps January-March → Q4", () => {
    expect(quarterFromDate(new Date("2026-01-15"))).toBe(4);
    expect(quarterFromDate(new Date("2026-03-31"))).toBe(4);
  });
});

describe("quarterDateRange", () => {
  it("Q1 of 2025-26 starts on Apr 1, 2025", () => {
    const r = quarterDateRange("2025-26", 1);
    expect(r.startDate.toISOString().slice(0, 10)).toBe("2025-04-01");
    expect(r.endDate.toISOString().slice(0, 10)).toBe("2025-06-30");
  });
  it("Q4 of 2025-26 spans Jan-Mar 2026", () => {
    const r = quarterDateRange("2025-26", 4);
    expect(r.startDate.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(r.endDate.toISOString().slice(0, 10)).toBe("2026-03-31");
  });
  it("rejects malformed FY labels", () => {
    expect(() => quarterDateRange("2025/2026", 1)).toThrow();
    expect(() => quarterDateRange("FY26", 1)).toThrow();
  });
});

describe("buildForm16AQuarterly", () => {
  const meta = { fiscalYear: "2025-26", quarter: 1 as const };

  it("groups by party and section", () => {
    const result = buildForm16AQuarterly(
      [
        row({ partyId: "p1", partyName: "Acme", section: "194C", taxAmount: 200, baseAmount: 10000 }),
        row({ partyId: "p1", partyName: "Acme", section: "194C", taxAmount: 200, baseAmount: 10000 }),
        row({ partyId: "p1", partyName: "Acme", section: "194J", taxAmount: 1000, baseAmount: 10000 }),
        row({ partyId: "p2", partyName: "Beta", section: "194J", taxAmount: 500, baseAmount: 5000 }),
      ],
      meta
    );

    expect(result.parties).toHaveLength(2);
    const acme = result.parties.find((p) => p.partyId === "p1")!;
    expect(acme.sections).toHaveLength(2);
    const sec194c = acme.sections.find((s) => s.section === "194C")!;
    expect(sec194c.count).toBe(2);
    expect(sec194c.tax.toString()).toBe("400");
    expect(sec194c.base.toString()).toBe("20000");
  });

  it("computes effective rate from base/tax (not from input ratePercent)", () => {
    const result = buildForm16AQuarterly(
      [row({ baseAmount: 100000, taxAmount: 1500 })],
      meta
    );
    const sec = result.parties[0].sections[0];
    // 1500 / 100000 * 100 = 1.5
    expect(sec.effectiveRate?.toString()).toBe("1.5");
  });

  it("handles zero-base rows without dividing by zero", () => {
    const result = buildForm16AQuarterly(
      [row({ baseAmount: 0, taxAmount: 0 })],
      meta
    );
    expect(result.parties[0].sections[0].effectiveRate).toBeNull();
  });

  it("sorts parties by name asc, sections alphabetical", () => {
    const result = buildForm16AQuarterly(
      [
        row({ partyId: "p3", partyName: "Charlie", section: "194Q" }),
        row({ partyId: "p1", partyName: "Alpha", section: "194J" }),
        row({ partyId: "p1", partyName: "Alpha", section: "194C" }),
        row({ partyId: "p2", partyName: "Beta", section: "194I_LAND" }),
      ],
      meta
    );
    expect(result.parties.map((p) => p.partyName)).toEqual(["Alpha", "Beta", "Charlie"]);
    expect(result.parties[0].sections.map((s) => s.section)).toEqual(["194C", "194J"]);
  });

  it("totals across all parties match section sums", () => {
    const result = buildForm16AQuarterly(
      [
        row({ partyId: "p1", partyName: "A", taxAmount: 100, baseAmount: 5000 }),
        row({ partyId: "p2", partyName: "B", taxAmount: 200, baseAmount: 10000 }),
      ],
      meta
    );
    expect(result.totals.parties).toBe(2);
    expect(result.totals.deductions).toBe(2);
    expect(result.totals.tax.toString()).toBe("300");
    expect(result.totals.base.toString()).toBe("15000");
  });

  it("preserves PAN per party", () => {
    const result = buildForm16AQuarterly(
      [
        row({ partyId: "p1", partyName: "A", partyPan: "ABCDE1234F" }),
        row({ partyId: "p2", partyName: "B", partyPan: null }),
      ],
      meta
    );
    expect(result.parties[0].partyPan).toBe("ABCDE1234F");
    expect(result.parties[1].partyPan).toBeNull();
  });

  it("returns empty parties + zero totals for an empty batch", () => {
    const result = buildForm16AQuarterly([], meta);
    expect(result.parties).toHaveLength(0);
    expect(result.totals.tax.toString()).toBe("0");
    expect(result.totals.deductions).toBe(0);
  });

  it("carries the fiscal year + quarter through to the output", () => {
    const result = buildForm16AQuarterly([row()], { fiscalYear: "2024-25", quarter: 3 });
    expect(result.fiscalYear).toBe("2024-25");
    expect(result.quarter).toBe(3);
  });
});
