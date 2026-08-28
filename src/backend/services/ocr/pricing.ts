/**
 * What one extraction costs.
 *
 * Extraction is the first thing in this system with a real marginal cost per
 * use, so it is the first thing that has to be metered rather than estimated:
 * every document records the tokens it actually consumed and the cost those
 * tokens carried at the time. A price per extraction — "100 extractions for
 * ₹X" — is then arithmetic over recorded facts rather than a guess.
 *
 * Rates are per million tokens, in USD, as published by Anthropic. They are
 * held here rather than fetched because a cost already charged to a customer
 * must not change retroactively when a price list does; when rates move, add
 * the new model rather than editing the old one, and historical rows keep
 * costing what they cost.
 */

import { logger } from "@/backend/utils/logger";

export interface ModelRate {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Free engines still get a row, so every document has a cost — zero is a cost. */
export const FREE_PROVIDERS = new Set(["pdf-text", "tesseract", "groq", "manual"]);

/**
 * USD → INR for display. An indicative rate, overridable per deployment; the
 * stored cost stays in USD micros so a rate change never rewrites history.
 */
export function usdToInrRate(): number {
  const configured = Number(process.env.USD_INR_RATE);
  return Number.isFinite(configured) && configured > 0 ? configured : 88;
}

/**
 * Cost of one extraction in millionths of a USD.
 *
 * Micros rather than dollars because a single page costs fractions of a cent
 * and float dollars would round it to nothing; integers keep a thousand
 * documents summing exactly.
 */
export function costMicroUsd(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  if (!model) return 0;
  const rate = MODEL_RATES[model];
  if (!rate) {
    // A model outside the rate table is either a free engine (fine) or a paid
    // one whose rate was never added (a silent billing gap) — only the latter
    // is worth a log, so free-provider names never end up warning.
    if (!FREE_PROVIDERS.has(model)) {
      logger.warn({ model }, "No rate on file for this model — extraction recorded as free");
    }
    return 0;
  }
  const usd = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * 1_000_000);
}

export function formatMicroUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function microUsdToInr(micros: number): number {
  return (micros / 1_000_000) * usdToInrRate();
}

/**
 * What a batch of extractions came to, for the usage panel and for pricing a
 * pack of credits.
 */
export function summariseSpend(
  rows: { costMicroUsd: number | null; inputTokens: number | null; outputTokens: number | null }[]
) {
  const totalMicros = rows.reduce((sum, r) => sum + (r.costMicroUsd ?? 0), 0);
  return {
    documents: rows.length,
    inputTokens: rows.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
    outputTokens: rows.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
    costMicroUsd: totalMicros,
    costUsd: totalMicros / 1_000_000,
    costInr: microUsdToInr(totalMicros),
    /** The number a per-extraction price has to clear. */
    avgCostInrPerDocument: rows.length ? microUsdToInr(totalMicros) / rows.length : 0,
  };
}
