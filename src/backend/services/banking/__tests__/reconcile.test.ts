import { describe, expect, it } from "vitest";
import { __testing } from "../reconcile";

const { scoreDateProximity, scoreReferenceMatch, scorePartyTokenOverlap, tokenize, amountClose } = __testing;

describe("scoreDateProximity", () => {
  it("same day → +5", () => {
    expect(scoreDateProximity(new Date("2026-04-05"), new Date("2026-04-05"))).toBe(5);
  });
  it("±1 day → +3", () => {
    expect(scoreDateProximity(new Date("2026-04-05"), new Date("2026-04-06"))).toBe(3);
    expect(scoreDateProximity(new Date("2026-04-06"), new Date("2026-04-05"))).toBe(3);
  });
  it("±3 days → +1", () => {
    expect(scoreDateProximity(new Date("2026-04-05"), new Date("2026-04-02"))).toBe(1);
    expect(scoreDateProximity(new Date("2026-04-05"), new Date("2026-04-08"))).toBe(1);
  });
  it(">3 days → reject (-1)", () => {
    expect(scoreDateProximity(new Date("2026-04-05"), new Date("2026-04-10"))).toBe(-1);
  });
});

describe("scoreReferenceMatch", () => {
  it("exact match → +3", () => {
    expect(scoreReferenceMatch("NEFT/REF/789", "NEFT/REF/789")).toBe(3);
  });
  it("substring (one inside the other) → +3", () => {
    expect(scoreReferenceMatch("NEFT/REF/789/EXTRA", "REF789")).toBe(3);
  });
  it("normalizes whitespace and case", () => {
    expect(scoreReferenceMatch("Neft Ref 789", "neftref789")).toBe(3);
  });
  it("no match → 0", () => {
    expect(scoreReferenceMatch("NEFT/REF/789", "RTGS/REF/123")).toBe(0);
  });
  it("nulls / empties → 0", () => {
    expect(scoreReferenceMatch(null, "NEFT")).toBe(0);
    expect(scoreReferenceMatch("NEFT", "")).toBe(0);
  });
});

describe("scorePartyTokenOverlap", () => {
  it("counts overlapping tokens up to +3", () => {
    const r = scorePartyTokenOverlap(
      "NEFT/CR/ACME/INDIA/PRIVATE/LIMITED",
      "Acme India Private Limited"
    );
    // Stop tokens "private", "limited" are filtered. Remaining: acme, india.
    // Both appear in description → score = min(2, 3) = 2.
    expect(r.score).toBe(2);
    expect(r.matched.sort()).toEqual(["acme", "india"]);
  });

  it("filters tokens shorter than 4 chars", () => {
    const r = scorePartyTokenOverlap("CR/ACME/CO", "Acme Co");
    // "co" is too short → only "acme" matches.
    expect(r.score).toBe(1);
    expect(r.matched).toEqual(["acme"]);
  });

  it("caps at +3 even with many overlapping tokens", () => {
    const r = scorePartyTokenOverlap(
      "alpha beta gamma delta epsilon zeta",
      "Alpha Beta Gamma Delta Epsilon Zeta"
    );
    expect(r.score).toBe(3);
    expect(r.matched.length).toBeGreaterThanOrEqual(3);
  });

  it("zero when no overlap", () => {
    const r = scorePartyTokenOverlap("NEFT/CR/SOMEONE", "Different Party Name");
    expect(r.score).toBe(0);
  });
});

describe("tokenize", () => {
  it("strips punctuation and lowercases", () => {
    expect(tokenize("ACME, India Pvt. Ltd!")).toEqual(["acme", "india"]);
  });
  it("filters stop tokens (corporate suffixes, payment-rail prefixes)", () => {
    expect(tokenize("NEFT REF acme")).toEqual(["acme"]);
    expect(tokenize("the and of in on for")).toEqual([]);
  });
});

describe("amountClose", () => {
  it("equal amounts → close", () => {
    expect(amountClose("1000.00", "1000.00")).toBe(true);
  });
  it("within 5 paise → close (clearing-house rounding tolerance)", () => {
    expect(amountClose("1000.00", "1000.05")).toBe(true);
    expect(amountClose("1000.05", "1000.00")).toBe(true);
  });
  it("more than 5 paise apart → not close", () => {
    expect(amountClose("1000.00", "1000.10")).toBe(false);
  });
});
