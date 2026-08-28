import { claudeIsConfigured, claudeProvider } from "./providers/claude";
import { groqIsConfigured, groqModel, groqProvider } from "./providers/groq";
import { pdfTextProvider, readingIsThin } from "./providers/pdf-text";
import { tesseractProvider } from "./providers/tesseract";
import { emptyDocument } from "./schema";
import {
  ExtractionError,
  type ExtractionInput,
  type ExtractionOutput,
} from "./provider";

/**
 * Choosing how to read a document, and paying as little as possible for it.
 *
 * The rule is simply: try free first, escalate only when free fails. A digital
 * PDF is read for nothing; a photo or a scan goes to Groq's free-but-rate-limited
 * vision model before it ever reaches the paid engine; only a reading that is
 * still thin after every free option — including a PDF whose text layer came
 * back empty, which Groq cannot read at all — goes to Claude. That ordering
 * matters commercially — the share of documents that never reach the paid
 * engine is the margin on a pack of extraction credits.
 *
 * `OCR_ENGINE` overrides the choice for a deployment: `auto` (default),
 * `claude` to always pay for the better reading, `free` to never spend, and
 * `manual` to switch extraction off entirely and use the review screen as a
 * side-by-side data-entry form.
 */

export type EngineMode = "auto" | "claude" | "free" | "manual";

export function engineMode(): EngineMode {
  const configured = (process.env.OCR_ENGINE || "auto").toLowerCase();
  if (configured === "claude" || configured === "free" || configured === "manual") {
    return configured;
  }
  return "auto";
}

/** What the UI needs to tell the operator what will happen when they upload. */
export function engineStatus() {
  const mode = engineMode();
  const paidAvailable = claudeIsConfigured();
  const freeAiAvailable = groqIsConfigured();
  return {
    mode,
    paidAvailable,
    freeAiAvailable,
    /** True when a file will actually be read rather than left blank for typing. */
    automatic: mode !== "manual",
    model: paidAvailable ? process.env.OCR_MODEL || "claude-opus-5" : null,
    freeAiModel: freeAiAvailable ? groqModel() : null,
  };
}

function manualReading(): ExtractionOutput {
  return {
    provider: "manual",
    document: emptyDocument(),
    confidence: { overall: 0 },
    costMicroUsd: 0,
  };
}

export async function extractDocument(input: ExtractionInput): Promise<ExtractionOutput> {
  const mode = engineMode();
  if (mode === "manual") return manualReading();

  if (mode === "claude") {
    if (!claudeProvider.supports(input)) {
      throw new ExtractionError(
        claudeIsConfigured()
          ? `${input.mimeType} cannot be read — upload a PDF or a photo`
          : "Automatic extraction is not configured — set ANTHROPIC_API_KEY"
      );
    }
    return claudeProvider.extract(input);
  }

  // Free first: a PDF's own text layer, then — for a photo, a scan, or a PDF
  // whose text layer came back thin — a local OCR pass. Neither costs
  // anything; only what is still thin after both goes on to the paid engine.
  let free: ExtractionOutput | null = null;
  if (pdfTextProvider.supports(input)) {
    try {
      free = await pdfTextProvider.extract(input);
      if (!readingIsThin(free)) return free;
    } catch {
      // A PDF that will not open for text is exactly the scan-in-a-wrapper
      // case the paid engine exists for; fall through rather than fail here.
      free = null;
    }
  }

  if (tesseractProvider.supports(input)) {
    try {
      const ocr = await tesseractProvider.extract(input);
      if (!readingIsThin(ocr)) return ocr;
      // Both readings are thin; keep whichever one is less unsure rather than
      // discarding one for the other outright.
      if (!free || (ocr.confidence.overall ?? 0) > (free.confidence.overall ?? 0)) {
        free = ocr;
      }
    } catch {
      // A bad photo Tesseract cannot even lay out is the same signal as a
      // thin reading: fall through with whatever `free` already holds.
    }
  }

  // Groq's free-tier vision model — a real AI reading, still at zero cost.
  // Worth trying before the paid engine because it reads a badly-lit photo or
  // handwriting far better than Tesseract's plain character recognition.
  if (groqProvider.supports(input)) {
    try {
      const ai = await groqProvider.extract(input);
      if (!readingIsThin(ai)) return ai;
      if (!free || (ai.confidence.overall ?? 0) > (free.confidence.overall ?? 0)) {
        free = ai;
      }
    } catch {
      // Free-tier rate limits or a transient failure: fall through with
      // whatever `free` already holds rather than losing it.
    }
  }

  if (mode === "free") {
    // Nothing to escalate to: hand back whatever was found, even if thin, so
    // the reviewer starts from a partly-filled form instead of a blank one.
    return free ?? manualReading();
  }

  if (claudeProvider.supports(input)) {
    try {
      return await claudeProvider.extract(input);
    } catch (error) {
      // A failed paid reading must not lose a usable free one.
      if (free) return free;
      throw error;
    }
  }

  if (free) return free;

  if (!claudeIsConfigured()) {
    // No engine can read a photo without the paid path; open the review screen
    // with a blank form rather than refusing the upload.
    return manualReading();
  }

  throw new ExtractionError(`${input.mimeType} cannot be read — upload a PDF or a photo`);
}
