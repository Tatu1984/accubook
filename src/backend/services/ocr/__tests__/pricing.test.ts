import { describe, expect, it, vi } from "vitest";

// pricing.ts logs a warning through the shared logger when a model has no
// rate on file; that logger validates process.env at import time, which a
// unit test has no reason to populate.
vi.mock("@/backend/utils/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { costMicroUsd, microUsdToInr, summariseSpend } = await import("../pricing");

/**
 * Extraction is sold on: a pack of N documents is priced from what N documents
 * actually cost. So the arithmetic has to hold at the scale of a single page,
 * where the figure is a fraction of a cent, and still add up over thousands.
 */

describe("what one extraction costs", () => {
  it("prices a page from its own token counts", () => {
    // A typical single-page bill: ~2,000 input tokens with the image,
    // ~1,200 output tokens of structured fields.
    const opus = costMicroUsd("claude-opus-5", 2000, 1200);
    expect(opus).toBe(Math.round((2000 / 1e6) * 5 * 1e6 + (1200 / 1e6) * 25 * 1e6));
    expect(opus).toBe(40_000); // $0.04

    const haiku = costMicroUsd("claude-haiku-4-5", 2000, 1200);
    expect(haiku).toBe(8_000); // $0.008 — a fifth of the price
  });

  it("costs nothing for an engine that is free", () => {
    expect(costMicroUsd(null, 0, 0)).toBe(0);
    expect(costMicroUsd("pdf-text", 5000, 0)).toBe(0);
  });

  it("keeps whole-cent accuracy across a thousand documents", () => {
    const one = costMicroUsd("claude-opus-5", 2000, 1200);
    const thousand = summariseSpend(
      Array.from({ length: 1000 }, () => ({
        costMicroUsd: one,
        inputTokens: 2000,
        outputTokens: 1200,
      }))
    );
    expect(thousand.costUsd).toBe(40);
    expect(thousand.documents).toBe(1000);
    expect(thousand.inputTokens).toBe(2_000_000);
  });

  it("gives the per-document average a price has to clear", () => {
    const spend = summariseSpend([
      { costMicroUsd: 40_000, inputTokens: 2000, outputTokens: 1200 },
      { costMicroUsd: 0, inputTokens: null, outputTokens: null },
    ]);
    // Half the documents were read free, so the average is half the paid price.
    expect(spend.avgCostInrPerDocument).toBeCloseTo(microUsdToInr(20_000), 6);
  });

  it("treats an unknown model as unpriced rather than guessing", () => {
    expect(costMicroUsd("some-future-model", 2000, 1200)).toBe(0);
  });
});
