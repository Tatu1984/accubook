import { extractText, getDocumentProxy } from "unpdf";
import { readInvoiceText } from "../heuristics";
import type { ExtractionInput, ExtractionOutput, ExtractionProvider } from "../provider";

/**
 * The free engine: read the text a PDF already carries.
 *
 * A large share of vendor bills arrive as PDFs printed by the vendor's own
 * accounting package, and those carry a perfectly good text layer — no OCR is
 * involved, nothing leaves this server, and it costs nothing per page. It is
 * useless on a photograph and on a scan-to-PDF (both are just images in a PDF
 * wrapper), which is exactly the boundary at which the paid engine earns its
 * fee.
 *
 * A reading with no recognisable text is returned as an empty document rather
 * than as an error: the orchestrator uses "found almost nothing" as the signal
 * to escalate.
 */
export const pdfTextProvider: ExtractionProvider = {
  name: "pdf-text",

  supports(input: ExtractionInput) {
    return input.mimeType === "application/pdf";
  },

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const data = new Uint8Array(input.buffer);
    const pdf = await getDocumentProxy(data);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;

    const { document, confidence } = readInvoiceText(merged, {
      ownGstin: input.ownGstin,
      ownName: input.ownName,
    });

    return {
      provider: "pdf-text",
      document,
      confidence,
      costMicroUsd: 0,
      pageCount: totalPages,
      rawText: merged,
    };
  },
};

/** How much of a document this engine managed to read — the escalation signal. */
export function readingIsThin(output: ExtractionOutput): boolean {
  const doc = output.document;
  const filled = [doc.partyName, doc.documentNumber, doc.documentDate, doc.totalAmount].filter(
    (value) => value !== null && value !== undefined && value !== ""
  ).length;
  const textLength = output.rawText?.replace(/\s/g, "").length ?? 0;
  return filled < 3 || textLength < 200;
}
