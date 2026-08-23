import { claudeIsConfigured, claudeProvider } from "./providers/claude";
import { pdfTextProvider, readingIsThin } from "./providers/pdf-text";
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
 * PDF is read for nothing; a photo, a scan, or a PDF whose text layer turned
 * out to be empty goes to the paid engine. That ordering matters commercially —
 * the share of documents that never reach the paid engine is the margin on a
 * pack of extraction credits.
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
  return {
    mode,
    paidAvailable,
    /** True when a file will actually be read rather than left blank for typing. */
    automatic: mode !== "manual" && (mode === "free" || paidAvailable || true),
    model: paidAvailable ? process.env.OCR_MODEL || "claude-opus-5" : null,
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

  // Free first.
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
