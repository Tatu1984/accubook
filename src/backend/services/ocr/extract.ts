import { groqIsConfigured, groqModel, groqProvider } from "./providers/groq";
import { pdfTextProvider, readingIsThin } from "./providers/pdf-text";
import { emptyDocument } from "./schema";
import { type ExtractionInput, type ExtractionOutput } from "./provider";

/**
 * Choosing how to read a document.
 *
 * Everything runs free: a digital PDF is read from its own text layer at no
 * cost; a photo or a scan goes to Groq's free vision model. There is no paid
 * escalation — whatever comes back, thin or not, is what the reviewer starts
 * from, which is still less retyping than a blank form.
 *
 * `OCR_ENGINE` overrides the choice for a deployment: `auto` (default) or
 * `manual` to switch extraction off entirely and use the review screen as a
 * side-by-side data-entry form.
 */

export type EngineMode = "auto" | "manual";

export function engineMode(): EngineMode {
  const configured = (process.env.OCR_ENGINE || "auto").toLowerCase();
  return configured === "manual" ? "manual" : "auto";
}

/** What the UI needs to tell the operator what will happen when they upload. */
export function engineStatus() {
  const mode = engineMode();
  const freeAiAvailable = groqIsConfigured();
  return {
    mode,
    freeAiAvailable,
    /** True when a file will actually be read rather than left blank for typing. */
    automatic: mode !== "manual",
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

  // A PDF's own text layer first — it costs nothing and needs no network
  // call. Useless on a photo or a scan-to-PDF, which is exactly where Groq
  // picks up.
  let free: ExtractionOutput | null = null;
  if (pdfTextProvider.supports(input)) {
    try {
      free = await pdfTextProvider.extract(input);
      if (!readingIsThin(free)) return free;
    } catch {
      // A PDF that will not open for text is exactly the scan-in-a-wrapper
      // case Groq cannot help with either (it takes images, not PDFs); fall
      // through with whatever `free` already holds.
      free = null;
    }
  }

  if (groqProvider.supports(input)) {
    try {
      const ai = await groqProvider.extract(input);
      if (!readingIsThin(ai)) return ai;
      // Both readings are thin; keep whichever one is less unsure rather than
      // discarding one for the other outright.
      if (!free || (ai.confidence.overall ?? 0) > (free.confidence.overall ?? 0)) {
        free = ai;
      }
    } catch {
      // Free-tier rate limits or a transient failure: fall through with
      // whatever `free` already holds rather than losing it.
    }
  }

  // Nothing left to escalate to: hand back whatever was found, even if thin,
  // so the reviewer starts from a partly-filled form instead of a blank one.
  return free ?? manualReading();
}
