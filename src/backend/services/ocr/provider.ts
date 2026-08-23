import type { ExtractedDocument, FieldConfidence } from "./schema";

/**
 * The contract every extraction engine meets.
 *
 * There is more than one engine because there is more than one kind of
 * document: a PDF a vendor's accounting package emailed already contains its
 * own text and can be read for free, while a photograph of a handwritten
 * challan can only be read by a model that costs money per page. Selecting
 * between them is the orchestrator's job (`extract.ts`); an engine only has to
 * answer "can I read this" and "what did it cost".
 */

export interface ExtractionInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  /** Nudges the reading when the operator already knows what they uploaded. */
  expectedDocType?: string;
  /** The organization's own GSTIN, so the extractor can tell which side we are on. */
  ownGstin?: string | null;
  ownName?: string | null;
}

export interface ExtractionOutput {
  provider: string;
  model?: string;
  document: ExtractedDocument;
  confidence: FieldConfidence;
  inputTokens?: number;
  outputTokens?: number;
  /** Millionths of a USD. Zero for the free engines — see pricing.ts. */
  costMicroUsd: number;
  pageCount?: number;
  /** Raw text the engine saw, when it has one; useful when a reading looks wrong. */
  rawText?: string;
}

export interface ExtractionProvider {
  name: string;
  /** Whether this engine can do anything at all with the given file. */
  supports(input: ExtractionInput): boolean;
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}
