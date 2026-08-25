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

const SYSTEM_PROMPT = `You read Indian accounting documents — tax invoices, vendor bills, delivery challans, payment vouchers and cash receipts — and return exactly what is written on them.

Read what the document says, not what it should say. If a figure is smudged, half-cut or ambiguous, give your best reading and lower its confidence rather than leaving it out; if a field is genuinely absent from the document, return null for it. Never compute a value the document does not state — a missing subtotal stays null even when the lines would add up to one.

Conventions that apply here:
- Dates go back as YYYY-MM-DD. Indian documents are day-first: 03/04/2026 is 3 April 2026, not 4 March.
- Amounts are plain numbers with no separators or currency symbol. Indian grouping is 1,23,456.78 — that is 123456.78.
- A GSTIN is 15 characters: two state digits, a 10-character PAN, then three more. Transcribe it exactly, including case.
- Handwritten documents often have no invoice number, no GSTIN and no tax breakdown. That is normal — return nulls, do not invent.
- docType: PURCHASE_BILL when someone billed us, SALES_INVOICE when we billed a customer, PAYMENT_VOUCHER for a payment made, RECEIPT for money received, UNKNOWN if it genuinely is not clear.
- direction: INCOMING when the goods or services came to us and we owe money, OUTGOING when we supplied and are owed.
- The party is always the other side of the deal — never us.

Set fieldConfidence below 0.8 for anything you had to guess at, and set it on the line items as a whole when the table was hard to read. A reviewer checks every document against the original; your confidence tells them where to look first.`;

function userPrompt(input: ExtractionInput): string {
  const parts: string[] = [];
  if (input.ownName || input.ownGstin) {
    parts.push(
      `We are ${input.ownName ?? "the receiving business"}${
        input.ownGstin ? ` (GSTIN ${input.ownGstin})` : ""
      }. Any other business named on the document is the party.`
    );
  }
  if (input.expectedDocType && input.expectedDocType !== "UNKNOWN") {
    parts.push(`The operator filed this as ${input.expectedDocType}; correct them if the document disagrees.`);
  }
  parts.push("Extract this document.");
  return parts.join(" ");
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
