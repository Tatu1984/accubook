import Groq from "groq-sdk";
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
 * The free engine for photos and scans: read the document as a picture on
 * Groq's no-cost, rate-limited tier instead of paying Claude per page.
 *
 * Groq's chat API takes images, not a raw PDF the way Claude's `document`
 * content block does — so this only ever claims image files. A scanned PDF
 * with no text layer still escalates straight from Tesseract to Claude, same
 * as before this engine existed.
 *
 * The free tier is rate-limited rather than metered, so a rejection here is
 * not worth retrying hard: fail fast and let `extract.ts` fall through to
 * whatever free reading Tesseract already produced, or on to Claude.
 */

// Groq's vision-capable lineup turns over fast — llama-4-scout, the model
// this pointed to originally, was deprecated by the time this was tested
// end-to-end. Verify against console.groq.com/docs/vision (or GROQ_API_KEY's
// own `models.list()`) before assuming this is still current.
const DEFAULT_MODEL = "qwen/qwen3.6-27b";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Groq's strict `json_schema` mode enforces the stricter (OpenAI-style) rule
 * that every key in `properties` must also appear in `required` at every
 * nesting level — an optional field is expressed by being nullable, not by
 * being absent from `required`. Claude's structured output does not enforce
 * this, so `EXTRACTION_JSON_SCHEMA` in schema.ts — shared with Claude — omits
 * it. Rather than fork the schema, derive Groq's stricter copy from it here.
 */
function withEveryPropertyRequired(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withEveryPropertyRequired);
  if (node === null || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    next[key] = withEveryPropertyRequired(value);
  }
  if (next.type === "object" && next.properties && typeof next.properties === "object") {
    next.required = Object.keys(next.properties as Record<string, unknown>);
  }
  return next;
}

const GROQ_JSON_SCHEMA = withEveryPropertyRequired(EXTRACTION_JSON_SCHEMA) as Record<string, unknown>;

export function groqIsConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function groqModel(): string {
  return process.env.OCR_GROQ_MODEL || DEFAULT_MODEL;
}

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 500;

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return status === undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const groqProvider: ExtractionProvider = {
  name: "groq",

  supports(input: ExtractionInput) {
    return groqIsConfigured() && SUPPORTED_IMAGE_TYPES.has(input.mimeType);
  },

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    if (!groqIsConfigured()) {
      throw new ExtractionError("Groq extraction is not configured — set GROQ_API_KEY");
    }
    if (!SUPPORTED_IMAGE_TYPES.has(input.mimeType)) {
      throw new ExtractionError(`${input.mimeType} cannot be read by Groq — upload a JPEG, PNG, GIF or WebP`);
    }

    const client = new Groq();
    const model = groqModel();
    const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;

    let response: Groq.Chat.Completions.ChatCompletion | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: dataUrl } },
                  { type: "text", text: userPrompt(input) },
                ],
              },
            ],
            // Reading a page is perception, not deliberation: qwen3's default
            // thinking mode burns a thousand-plus reasoning tokens per page
            // for no gain here, against a free tier that is rate-limited by
            // request rather than token volume.
            reasoning_effort: "none",
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "extracted_document",
                schema: GROQ_JSON_SCHEMA,
                strict: true,
              },
            },
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

    const choice = response.choices[0];
    const text = choice?.message?.content ?? "";

    if (!text.trim()) {
      throw new ExtractionError(
        choice?.finish_reason === "length"
          ? "The document was too long to read in one pass — split it and try again"
          : "The extractor returned nothing for this document"
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ExtractionError(
        choice?.finish_reason === "length"
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
      confidence.overall = asserted.length
        ? asserted.reduce((a, b) => a + b, 0) / asserted.length
        : 0.5;
    }

    return {
      provider: "groq",
      model,
      document: parsed.data,
      confidence,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
      costMicroUsd: 0,
      rawText: undefined,
    };
  },
};
