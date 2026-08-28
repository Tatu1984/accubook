import Anthropic from "@anthropic-ai/sdk";
import { costMicroUsd } from "../pricing";
import {
  EXTRACTION_JSON_SCHEMA,
  extractedDocumentSchema,
  type FieldConfidence,
} from "../schema";
import {
  ExtractionError,
  type ExtractionInput,
  type ExtractionOutput,
  type ExtractionProvider,
} from "../provider";
import { SYSTEM_PROMPT, userPrompt } from "./prompts";

/**
 * The paid engine: read the document as a picture.
 *
 * This is the one that handles what the free path cannot — a photo taken at an
 * angle in a badly lit godown, a scan, a handwritten cash memo — and it is
 * priced per page, so every call records the tokens it burnt (see pricing.ts).
 *
 * The reading is constrained to this system's own document schema rather than
 * asked for as prose, so what comes back is either a valid document or an
 * error, never something that needs a parser of its own.
 */

const DEFAULT_MODEL = "claude-opus-5";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function claudeIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function claudeModel(): string {
  return process.env.OCR_MODEL || DEFAULT_MODEL;
}

/** Reading a page is a single request; nothing here should hang the upload forever. */
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function isRetryable(error: unknown): boolean {
  // The SDK throws APIError subclasses carrying the HTTP status; 429 (rate
  // limited) and 5xx (including 529 "overloaded") are worth a retry, a 4xx
  // like a bad request or an expired key never will be no matter how many
  // times it's asked again.
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  // A network-level failure (no status at all) is retryable too.
  return status === undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function documentBlock(input: ExtractionInput) {
  const data = input.buffer.toString("base64");
  if (input.mimeType === "application/pdf") {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data },
    };
  }
  if (!SUPPORTED_IMAGE_TYPES.has(input.mimeType)) {
    throw new ExtractionError(
      `${input.mimeType} cannot be read — upload a PDF, JPEG, PNG, GIF or WebP`
    );
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: input.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data,
    },
  };
}

export const claudeProvider: ExtractionProvider = {
  name: "claude",

  supports(input: ExtractionInput) {
    return (
      claudeIsConfigured() &&
      (input.mimeType === "application/pdf" || SUPPORTED_IMAGE_TYPES.has(input.mimeType))
    );
  },

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    if (!claudeIsConfigured()) {
      throw new ExtractionError(
        "Automatic extraction is not configured — set ANTHROPIC_API_KEY, or enter the document by hand"
      );
    }

    const client = new Anthropic();
    const model = claudeModel();

    let response: Anthropic.Message | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await client.messages.create(
          {
            model,
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            output_config: {
              // Reading a page is perception, not deliberation: extra reasoning
              // buys little here and is billed per document.
              effort: "low",
              format: {
                type: "json_schema",
                schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
              },
            },
            messages: [
              {
                role: "user",
                content: [documentBlock(input), { type: "text", text: userPrompt(input) }],
              },
            ],
          },
          { timeout: REQUEST_TIMEOUT_MS }
        );
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === MAX_ATTEMPTS || !isRetryable(error)) break;
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
    if (lastError) {
      throw new ExtractionError(
        lastError instanceof Error ? `Extraction failed: ${lastError.message}` : "Extraction failed"
      );
    }
    if (!response) {
      throw new ExtractionError("Extraction failed");
    }

    if (response.stop_reason === "refusal") {
      throw new ExtractionError(
        "The extractor declined to read this document. Enter it by hand, or check that the file is what you expect."
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!text.trim()) {
      throw new ExtractionError(
        response.stop_reason === "max_tokens"
          ? "The document was too long to read in one pass — split it and try again"
          : "The extractor returned nothing for this document"
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ExtractionError(
        response.stop_reason === "max_tokens"
          ? "The document was too long to read in one pass — split it and try again"
          : "The extractor's reading could not be parsed"
      );
    }

    const { fieldConfidence, ...rest } = (payload ?? {}) as Record<string, unknown>;
    const parsed = extractedDocumentSchema.safeParse(rest);
    if (!parsed.success) {
      throw new ExtractionError(
        `The extractor's reading did not match the document shape: ${parsed.error.issues[0]?.message ?? "unknown field"}`
      );
    }

    const confidence: FieldConfidence = {};
    if (fieldConfidence && typeof fieldConfidence === "object") {
      for (const [key, value] of Object.entries(fieldConfidence as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          confidence[key as keyof FieldConfidence] = Math.max(0, Math.min(1, value));
        }
      }
    }
    if (confidence.overall === undefined) {
      const asserted = Object.values(confidence).filter(
        (v): v is number => typeof v === "number"
      );
      // The model asserted nothing at all about how sure it was — that is not
      // the same as a confident reading, and defaulting high here would hide
      // exactly the documents a reviewer most needs to double-check.
      confidence.overall = asserted.length
        ? asserted.reduce((a, b) => a + b, 0) / asserted.length
        : 0.5;
    }

    const inputTokens = response.usage.input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens ?? 0;

    return {
      provider: "claude",
      model,
      document: parsed.data,
      confidence,
      inputTokens,
      outputTokens,
      costMicroUsd: costMicroUsd(model, inputTokens, outputTokens),
      rawText: undefined,
    };
  },
};
