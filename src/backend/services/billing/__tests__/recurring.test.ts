import { describe, expect, it } from "vitest";
import {
  addFrequency,
  isDue,
  missedRunDates,
  isFrequency,
  type RecurringRow,
} from "../recurring";

describe("addFrequency", () => {
  it("adds one day for DAILY", () => {
    const out = addFrequency(new Date("2025-04-15T00:00:00Z"), "DAILY");
    expect(out.toISOString().slice(0, 10)).toBe("2025-04-16");
  });

  it("adds 7 days for WEEKLY", () => {
    const out = addFrequency(new Date("2025-04-15T00:00:00Z"), "WEEKLY");
    expect(out.toISOString().slice(0, 10)).toBe("2025-04-22");
  });

  it("preserves day-of-month for MONTHLY when target has it", () => {
    const out = addFrequency(new Date("2025-04-15T00:00:00Z"), "MONTHLY");
    expect(out.toISOString().slice(0, 10)).toBe("2025-05-15");
  });

  it("clamps Jan 31 + 1 month → Feb 28 in non-leap year", () => {
    const out = addFrequency(new Date("2025-01-31T00:00:00Z"), "MONTHLY");
    expect(out.toISOString().slice(0, 10)).toBe("2025-02-28");
  });

  it("clamps Jan 31 + 1 month → Feb 29 in leap year", () => {
    const out = addFrequency(new Date("2024-01-31T00:00:00Z"), "MONTHLY");
    expect(out.toISOString().slice(0, 10)).toBe("2024-02-29");
  });

  it("adds 3 months for QUARTERLY", () => {
    const out = addFrequency(new Date("2025-04-15T00:00:00Z"), "QUARTERLY");
    expect(out.toISOString().slice(0, 10)).toBe("2025-07-15");
  });

  it("rolls year on QUARTERLY at year boundary", () => {
    const out = addFrequency(new Date("2025-11-15T00:00:00Z"), "QUARTERLY");
    expect(out.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("adds 1 year for YEARLY (preserving day-of-month)", () => {
    const out = addFrequency(new Date("2025-04-15T00:00:00Z"), "YEARLY");
    expect(out.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("clamps Feb 29 (leap year) + 1 year → Feb 28 (next non-leap)", () => {
    const out = addFrequency(new Date("2024-02-29T00:00:00Z"), "YEARLY");
    expect(out.toISOString().slice(0, 10)).toBe("2025-02-28");
  });

  it("preserves time-of-day across the increment", () => {
    const out = addFrequency(new Date("2025-04-15T09:30:45Z"), "DAILY");
    expect(out.toISOString()).toBe("2025-04-16T09:30:45.000Z");
  });
});

describe("isDue", () => {
  const base: RecurringRow = {
    id: "r1",
    isActive: true,
    nextRunDate: new Date("2025-04-15"),
    endDate: null,
    frequency: "MONTHLY",
  };

  it("returns true when nextRunDate is in the past", () => {
    expect(isDue(base, new Date("2025-04-16"))).toBe(true);
  });

  it("returns true on the boundary (nextRunDate == asOf)", () => {
    expect(isDue(base, new Date("2025-04-15"))).toBe(true);
  });

  it("returns false when nextRunDate is in the future", () => {
    expect(isDue(base, new Date("2025-04-14"))).toBe(false);
  });

  it("returns false when isActive is false", () => {
    expect(isDue({ ...base, isActive: false }, new Date("2025-04-16"))).toBe(false);
  });

  it("returns false when endDate has passed", () => {
    expect(
      isDue({ ...base, endDate: new Date("2025-04-10") }, new Date("2025-04-16"))
    ).toBe(false);
  });
});

describe("missedRunDates", () => {
  it("returns one date when exactly one cycle is due", () => {
    const row: RecurringRow = {
      id: "r1",
      isActive: true,
      nextRunDate: new Date("2025-04-15"),
      endDate: null,
      frequency: "MONTHLY",
    };
    const out = missedRunDates(row, new Date("2025-04-16"));
    expect(out).toHaveLength(1);
    expect(out[0].toISOString().slice(0, 10)).toBe("2025-04-15");
  });

  it("returns multiple dates when several cycles are missed", () => {
    const row: RecurringRow = {
      id: "r1",
      isActive: true,
      nextRunDate: new Date("2025-04-15"),
      endDate: null,
      frequency: "MONTHLY",
    };
    const out = missedRunDates(row, new Date("2025-08-20"));
    // Apr 15, May 15, Jun 15, Jul 15, Aug 15 → 5 missed runs.
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2025-04-15",
      "2025-05-15",
      "2025-06-15",
      "2025-07-15",
      "2025-08-15",
    ]);
  });

  it("respects endDate cap", () => {
    const row: RecurringRow = {
      id: "r1",
      isActive: true,
      nextRunDate: new Date("2025-04-15"),
      endDate: new Date("2025-06-30"),
      frequency: "MONTHLY",
    };
    const out = missedRunDates(row, new Date("2025-12-31"));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2025-04-15",
      "2025-05-15",
      "2025-06-15",
    ]);
  });

  it("respects the cap argument (defaults to 12)", () => {
    const row: RecurringRow = {
      id: "r1",
      isActive: true,
      nextRunDate: new Date("2024-01-01"),
      endDate: null,
      frequency: "DAILY",
    };
    const out = missedRunDates(row, new Date("2025-01-01"), 5);
    expect(out).toHaveLength(5);
  });

  it("returns empty for inactive row", () => {
    const row: RecurringRow = {
      id: "r1",
      isActive: false,
      nextRunDate: new Date("2025-04-15"),
      endDate: null,
      frequency: "MONTHLY",
    };
    expect(missedRunDates(row, new Date("2025-08-20"))).toEqual([]);
  });

  it("returns empty for invalid frequency string (defensive)", () => {
    const row = {
      id: "r1",
      isActive: true,
      nextRunDate: new Date("2025-04-15"),
      endDate: null,
      frequency: "MONTHLY_OTHER",
    };
    expect(missedRunDates(row, new Date("2025-08-20"))).toEqual([]);
  });
});

describe("isFrequency", () => {
  it("accepts the 5 supported frequencies", () => {
    expect(isFrequency("DAILY")).toBe(true);
    expect(isFrequency("WEEKLY")).toBe(true);
    expect(isFrequency("MONTHLY")).toBe(true);
    expect(isFrequency("QUARTERLY")).toBe(true);
    expect(isFrequency("YEARLY")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isFrequency("BIWEEKLY")).toBe(false);
    expect(isFrequency("monthly")).toBe(false);
    expect(isFrequency("")).toBe(false);
  });
});
