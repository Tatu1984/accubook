import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import { D, sum, mul, cmp, fmt, toNumber, closeEnough } from "../money";

describe("money helpers", () => {
  describe("D()", () => {
    it("casts numbers to Prisma.Decimal", () => {
      expect(D(1.5)).toBeInstanceOf(Prisma.Decimal);
      expect(D(1.5).toString()).toBe("1.5");
    });

    it("casts strings", () => {
      expect(D("100.0001").toString()).toBe("100.0001");
    });

    it("returns the same instance when given a Decimal", () => {
      const d = new Prisma.Decimal("42");
      expect(D(d)).toBe(d);
    });
  });

  describe("sum()", () => {
    it("sums an empty list to 0", () => {
      expect(sum([]).toString()).toBe("0");
    });

    it("sums numbers without precision loss", () => {
      // The classic 0.1 + 0.2 = 0.3 case that breaks with native floats.
      expect(sum([0.1, 0.2]).toString()).toBe("0.3");
    });

    it("sums Decimal-likes mixed", () => {
      expect(sum([D("1.5"), 2, "3.5"]).toString()).toBe("7");
    });

    it("sums many small fractions exactly", () => {
      const cents = Array(100).fill("0.01");
      expect(sum(cents).toString()).toBe("1");
    });
  });

  describe("mul()", () => {
    it("multiplies without losing precision", () => {
      expect(mul("0.1", "0.2").toString()).toBe("0.02");
    });

    it("multiplies large amounts", () => {
      expect(mul(100, "1.5").toString()).toBe("150");
    });
  });

  describe("cmp()", () => {
    it("returns 0 for equal", () => {
      expect(cmp("1.0", 1)).toBe(0);
    });

    it("returns -1 when a < b", () => {
      expect(cmp(1, 2)).toBe(-1);
    });

    it("returns 1 when a > b", () => {
      expect(cmp(2, 1)).toBe(1);
    });
  });

  describe("fmt()", () => {
    it("formats with two decimals by default", () => {
      expect(fmt("1.5")).toBe("1.50");
    });

    it("respects custom precision", () => {
      expect(fmt("1.23456", 4)).toBe("1.2346");
    });
  });

  describe("toNumber()", () => {
    it("converts to JS number for display", () => {
      expect(toNumber("3.14")).toBe(3.14);
    });
  });

  describe("closeEnough()", () => {
    it("treats values within 0.01 as equal", () => {
      expect(closeEnough("100.001", "100.005")).toBe(true);
    });

    it("rejects values further than 0.01 apart", () => {
      expect(closeEnough("100.00", "100.02")).toBe(false);
    });

    it("respects custom epsilon", () => {
      expect(closeEnough("100.0", "100.5", "1")).toBe(true);
    });

    it("the canonical 0.1 + 0.2 ≈ 0.3 case", () => {
      // Native: (0.1 + 0.2) === 0.3 is false, this is the whole point of Decimal.
      expect(closeEnough(D(0.1).plus(D(0.2)), 0.3)).toBe(true);
    });
  });
});
