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

/**
 * Quarter-end boundary — the window Form 16A and Form 27D actually cover.
 *
 * `quarterDateRange` returned each quarter's `endDate` at UTC midnight,
 * and both consumers apply it as an INCLUSIVE upper bound on a timestamp:
 *
 *   tds-deductions/route.ts : deductedAt  = { gte: startDate, lte: endDate }
 *   tcs-collections/route.ts: collectedAt = { gte: startDate, lte: endDate }
 *
 * So anything stamped after 00:00:00 on the final day of a quarter fell
 * outside the certificate. Q4 is the damaging case: 31 March is the
 * heaviest TDS day of the Indian fiscal year, and on an IST deployment
 * (UTC+5:30) local business hours all land after the old cut-off, so an
 * entire day of deductions went unreported on the certificate while
 * remaining in the ledger.
 *
 * The tests below assert the range itself, then replay each consumer's
 * `gte`/`lte` predicate against representative timestamps — the closest
 * this suite can get to the routes' behaviour without a database.
 */
describe("quarterDateRange — inclusive end-of-day boundary", () => {
  /** The exact predicate both certificate routes build. */
  const withinRange = (ts: Date, range: { startDate: Date; endDate: Date }) =>
    ts >= range.startDate && ts <= range.endDate;

  it("closes each quarter at the last instant of its final day", () => {
    expect(quarterDateRange("2025-26", 1).endDate.toISOString()).toBe(
      "2025-06-30T23:59:59.999Z"
    );
    expect(quarterDateRange("2025-26", 2).endDate.toISOString()).toBe(
      "2025-09-30T23:59:59.999Z"
    );
    expect(quarterDateRange("2025-26", 3).endDate.toISOString()).toBe(
      "2025-12-31T23:59:59.999Z"
    );
    expect(quarterDateRange("2025-26", 4).endDate.toISOString()).toBe(
      "2026-03-31T23:59:59.999Z"
    );
  });

  it("still opens each quarter at midnight on its first day", () => {
    // The start bound was never wrong; guard it so the fix cannot drift.
    expect(quarterDateRange("2025-26", 1).startDate.toISOString()).toBe(
      "2025-04-01T00:00:00.000Z"
    );
    expect(quarterDateRange("2025-26", 4).startDate.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("includes a deduction made late on 31 March (the original defect)", () => {
    const q4 = quarterDateRange("2025-26", 4);
    // 18:30Z == midnight IST on 1 Apr; the end of the Indian working day.
    expect(withinRange(new Date("2026-03-31T18:30:00.000Z"), q4)).toBe(true);
    // And the very last instant of the quarter.
    expect(withinRange(new Date("2026-03-31T23:59:59.999Z"), q4)).toBe(true);
  });

  it("includes a timestamp comfortably inside the quarter", () => {
    const q4 = quarterDateRange("2025-26", 4);
    expect(withinRange(new Date("2026-02-14T09:15:00.000Z"), q4)).toBe(true);
  });

  it("includes the exact opening instant of the quarter", () => {
    const q4 = quarterDateRange("2025-26", 4);
    expect(withinRange(new Date("2026-01-01T00:00:00.000Z"), q4)).toBe(true);
  });

  it("excludes the first instant of the following quarter", () => {
    const q4 = quarterDateRange("2025-26", 4);
    expect(withinRange(new Date("2026-04-01T00:00:00.000Z"), q4)).toBe(false);
    // Q1 of the next FY must be the one that claims it.
    expect(withinRange(new Date("2026-04-01T00:00:00.000Z"), quarterDateRange("2026-27", 1))).toBe(true);
  });

  it("excludes a timestamp just before the quarter opens", () => {
    const q4 = quarterDateRange("2025-26", 4);
    expect(withinRange(new Date("2025-12-31T23:59:59.999Z"), q4)).toBe(false);
    // ...and Q3 must claim it, so no deduction falls between quarters.
    expect(withinRange(new Date("2025-12-31T23:59:59.999Z"), quarterDateRange("2025-26", 3))).toBe(true);
  });

  it("leaves no gap or overlap between consecutive quarters", () => {
    // Every quarter boundary must hand off cleanly: the instant after one
    // quarter ends is the instant the next begins. A gap would drop
    // deductions from both certificates; an overlap would report them twice.
    for (const q of [1, 2, 3] as const) {
      const cur = quarterDateRange("2025-26", q);
      const next = quarterDateRange("2025-26", (q + 1) as 2 | 3 | 4);
      expect(cur.endDate.getTime() + 1).toBe(next.startDate.getTime());
    }
  });

  it("covers both certificate consumers — Form 16A (TDS) and Form 27D (TCS)", () => {
    // The two routes differ only in which column they filter
    // (`deductedAt` vs `collectedAt`); both pass this same range through
    // the same gte/lte predicate, so a fix to the range fixes both.
    const q4 = quarterDateRange("2025-26", 4);
    const lateMarch = new Date("2026-03-31T18:30:00.000Z");

    const form16aIncludes = withinRange(lateMarch, q4); // deductedAt
    const form27dIncludes = withinRange(lateMarch, q4); // collectedAt

    expect(form16aIncludes).toBe(true);
    expect(form27dIncludes).toBe(true);
    expect(form16aIncludes).toBe(form27dIncludes);
  });
});
