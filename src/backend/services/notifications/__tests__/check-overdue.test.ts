import { describe, it, expect } from "vitest";
import { daysBetween } from "@/shared/utils/dates.util";

describe("daysBetween", () => {
  it("returns the floor of full 24h gaps", () => {
    const from = new Date("2025-04-01T00:00:00Z");
    const to = new Date("2025-04-04T00:00:00Z");
    expect(daysBetween(from, to)).toBe(3);
  });

  it("rounds down partial days (16h gap → 0 days)", () => {
    const from = new Date("2025-04-01T00:00:00Z");
    const to = new Date("2025-04-01T16:00:00Z");
    expect(daysBetween(from, to)).toBe(0);
  });

  it("rounds down partial days (36h gap → 1 day)", () => {
    const from = new Date("2025-04-01T00:00:00Z");
    const to = new Date("2025-04-02T12:00:00Z");
    expect(daysBetween(from, to)).toBe(1);
  });

  it("returns 0 when from > to (defensive)", () => {
    const from = new Date("2025-04-10T00:00:00Z");
    const to = new Date("2025-04-01T00:00:00Z");
    expect(daysBetween(from, to)).toBe(0);
  });

  it("returns 0 for same instant", () => {
    const d = new Date("2025-04-01T00:00:00Z");
    expect(daysBetween(d, d)).toBe(0);
  });

  it("crosses month boundaries correctly", () => {
    const from = new Date("2025-04-29T00:00:00Z");
    const to = new Date("2025-05-03T00:00:00Z");
    expect(daysBetween(from, to)).toBe(4);
  });

  it("crosses year boundaries correctly", () => {
    const from = new Date("2025-12-30T00:00:00Z");
    const to = new Date("2026-01-03T00:00:00Z");
    expect(daysBetween(from, to)).toBe(4);
  });
});
