import { describe, it, expect } from "vitest";
import { buildMonthlyChallan, challanDueDate, type ChallanRow } from "../monthly-challan";

const row = (overrides: Partial<ChallanRow> = {}): ChallanRow => ({
  partyId: "p1",
  partyName: "Acme",
  partyPan: "ABCDE1234F",
  section: "194C",
  baseAmount: 50000,
  taxAmount: 1000,
  deductedAt: new Date("2025-04-15"),
  ...overrides,
});

const meta = { fiscalYear: "2025-26", month: 4 as const, calendarYear: 2025 };

describe("challanDueDate", () => {
  it("April deductions due May 7", () => {
    expect(challanDueDate(2025, 4)).toBe("2025-05-07");
  });
  it("March deductions due Apr 30 (year-end deadline)", () => {
    expect(challanDueDate(2025, 3)).toBe("2025-04-30");
  });
  it("December deductions due Jan 7 of next year", () => {
    expect(challanDueDate(2025, 12)).toBe("2026-01-07");
  });
  it("February deductions due March 7", () => {
    expect(challanDueDate(2026, 2)).toBe("2026-03-07");
  });
});

describe("buildMonthlyChallan", () => {
  it("groups by section with count + base + tax + distinct deductees", () => {
    const r = buildMonthlyChallan(
      [
        row({ partyId: "p1", section: "194C", taxAmount: 1000, baseAmount: 50000 }),
        row({ partyId: "p1", section: "194C", taxAmount: 1000, baseAmount: 50000 }),
        row({ partyId: "p2", section: "194C", taxAmount: 200, baseAmount: 10000 }),
        row({ partyId: "p1", section: "194J", taxAmount: 5000, baseAmount: 50000 }),
      ],
      meta
    );

    expect(r.sections).toHaveLength(2);
    const c = r.sections.find((s) => s.section === "194C")!;
    expect(c.count).toBe(3);
    expect(c.tax.toString()).toBe("2200");
    expect(c.base.toString()).toBe("110000");
    expect(c.deductees).toBe(2); // p1 + p2

    const j = r.sections.find((s) => s.section === "194J")!;
    expect(j.count).toBe(1);
    expect(j.deductees).toBe(1);
  });

  it("totals match the row count and per-section sums", () => {
    const r = buildMonthlyChallan(
      [
        row({ partyId: "p1", section: "194C", taxAmount: 100 }),
        row({ partyId: "p2", section: "194J", taxAmount: 200 }),
        row({ partyId: "p3", section: "194Q", taxAmount: 50 }),
      ],
      meta
    );
    expect(r.totals.deductions).toBe(3);
    expect(r.totals.deductees).toBe(3);
    expect(r.totals.tax.toString()).toBe("350");
  });

  it("sorts sections alphabetically", () => {
    const r = buildMonthlyChallan(
      [
        row({ section: "194Q" }),
        row({ section: "194C" }),
        row({ section: "194I_LAND" }),
        row({ section: "194J" }),
      ],
      meta
    );
    expect(r.sections.map((s) => s.section)).toEqual([
      "194C",
      "194I_LAND",
      "194J",
      "194Q",
    ]);
  });

  it("preserves the calendar-year-aware due date in output", () => {
    const r = buildMonthlyChallan([row()], { fiscalYear: "2025-26", month: 12, calendarYear: 2025 });
    expect(r.dueDate).toBe("2026-01-07");
  });

  it("handles empty input cleanly", () => {
    const r = buildMonthlyChallan([], meta);
    expect(r.sections).toEqual([]);
    expect(r.totals.deductions).toBe(0);
    expect(r.totals.deductees).toBe(0);
    expect(r.totals.tax.toString()).toBe("0");
    expect(r.dueDate).toBe("2025-05-07");
  });

  it("counts the same party across two sections as 1 deductee per section, 1 overall", () => {
    const r = buildMonthlyChallan(
      [
        row({ partyId: "p1", section: "194C" }),
        row({ partyId: "p1", section: "194J" }),
      ],
      meta
    );
    expect(r.totals.deductees).toBe(1);
    expect(r.sections.find((s) => s.section === "194C")!.deductees).toBe(1);
    expect(r.sections.find((s) => s.section === "194J")!.deductees).toBe(1);
  });
});
