import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { logger } from "@/backend/utils/logger";
import { readInvoiceText } from "../heuristics";
import type { ExtractionInput, ExtractionOutput, ExtractionProvider } from "../provider";

/**
 * Where the recognizer's language data is cached between calls.
 *
 * Left to its default, Tesseract.js caches to the process's current working
 * directory — on a server that is the repo root, which both litters it with
 * a multi-megabyte `eng.traineddata` and risks that file landing in a commit.
 * The OS temp dir is writable everywhere this runs and is the right place for
 * something that is a cache, not an artifact.
 *
 * The directory has to exist before Tesseract.js's plain `fs.writeFile`
 * cache write will succeed — it does not create one, and a failed write is
 * only logged internally, not thrown, so a missing directory means every
 * single extraction silently redownloads the language file from a third-party
 * CDN instead of ever getting to reuse it.
 */
const CACHE_PATH = path.join(os.tmpdir(), "accubook-tesseract-cache");
try {
  fs.mkdirSync(CACHE_PATH, { recursive: true });
} catch (err) {
  logger.warn(
    { err, path: CACHE_PATH },
    "Could not create the Tesseract cache directory — language data will be re-downloaded on every read"
  );
}

/**
 * The second free engine: read a photo or scan locally, without paying for it.
 *
 * `pdf-text` only helps when the vendor's software already embedded text in
 * the PDF; a phone photo of a bill or a scan-to-PDF has none. Before those go
 * to the paid Claude reading, they get a pass through Tesseract — a local OCR
 * engine that costs nothing per page. It is a plain character reader, not a
 * document reader: it has no notion of "invoice number" or "GSTIN", so the
 * same regex-based heuristics that read a PDF's text layer are reused on
 * whatever text it recognises.
 *
 * A clean, well-lit scan is often read well enough here that escalation never
 * fires; a bad photo comes back thin (see `readingIsThin`) and falls through
 * to the paid engine, same as a PDF with no text layer does.
 */

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const tesseractProvider: ExtractionProvider = {
  name: "tesseract",

  supports(input: ExtractionInput) {
    return SUPPORTED_IMAGE_TYPES.has(input.mimeType);
  },

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const worker = await createWorker("eng", undefined, { cachePath: CACHE_PATH });
    let text: string;
    let meanConfidence: number;
    try {
      const result = await worker.recognize(input.buffer);
      text = result.data.text ?? "";
      // Tesseract reports 0-100; the heuristics reader wants 0-1.
      meanConfidence = (result.data.confidence ?? 0) / 100;
    } finally {
      await worker.terminate();
    }

    const { document, confidence } = readInvoiceText(text, {
      ownGstin: input.ownGstin,
      ownName: input.ownName,
    });

    // The character-recognition confidence caps what the field-level reading
    // can claim: a low-quality scan should not report a high overall score
    // just because "Invoice No." happened to be legible.
    if (typeof confidence.overall === "number") {
      confidence.overall = Math.min(confidence.overall, meanConfidence || confidence.overall);
    }

    return {
      provider: "tesseract",
      document,
      confidence,
      costMicroUsd: 0,
      pageCount: 1,
      rawText: text,
    };
  },
};
