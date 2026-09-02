import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument } from "../schema";
import type { ExtractionOutput } from "../provider";

/**
 * The engine-selection logic in extract.ts, not any one engine's reading.
 * Each provider is mocked to a single fact — "thin", "solid", or "throws" —
 * so what is under test is purely the order extract.ts tries them in and
 * what it does when one fails.
 */

const groqMock = vi.hoisted(() => ({
  isConfigured: true,
  extract: vi.fn(),
}));
const pdfTextMock = vi.hoisted(() => ({ extract: vi.fn() }));

vi.mock("../providers/groq", () => ({
  groqIsConfigured: () => groqMock.isConfigured,
  groqModel: () => "qwen/qwen3.6-27b",
  groqProvider: {
    name: "groq",
    supports: (input: { mimeType: string }) =>
      groqMock.isConfigured && input.mimeType.startsWith("image/"),
    extract: groqMock.extract,
  },
}));

vi.mock("../providers/pdf-text", () => ({
  pdfTextProvider: {
    name: "pdf-text",
    supports: (input: { mimeType: string }) => input.mimeType === "application/pdf",
    extract: pdfTextMock.extract,
  },
  readingIsThin: (output: ExtractionOutput) => {
    const doc = output.document;
    const filled = [doc.partyName, doc.documentNumber, doc.documentDate, doc.totalAmount].filter(
      (v) => v !== null && v !== undefined && v !== ""
    ).length;
    return filled < 3 || (output.rawText?.replace(/\s/g, "").length ?? 0) < 200;
  },
}));

const { extractDocument, engineMode } = await import("../extract");

function reading(overrides: Partial<ExtractionOutput> = {}): ExtractionOutput {
  return {
    provider: overrides.provider ?? "pdf-text",
    document: overrides.document ?? emptyDocument(),
    confidence: overrides.confidence ?? { overall: 0 },
    costMicroUsd: overrides.costMicroUsd ?? 0,
    rawText: overrides.rawText ?? "",
    ...overrides,
  };
}

const SOLID_TEXT = "x".repeat(250);
function solidReading(provider: string): ExtractionOutput {
  return reading({
    provider,
    document: {
      ...emptyDocument(),
      partyName: "Vendor",
      documentNumber: "INV-1",
      documentDate: "2026-01-01",
      totalAmount: 100,
    },
    confidence: { overall: 0.9 },
    rawText: SOLID_TEXT,
  });
}

const PDF_INPUT = { buffer: Buffer.from("pdf"), mimeType: "application/pdf", fileName: "a.pdf" };
const IMAGE_INPUT = { buffer: Buffer.from("img"), mimeType: "image/jpeg", fileName: "a.jpg" };

beforeEach(() => {
  groqMock.isConfigured = true;
  groqMock.extract.mockReset();
  pdfTextMock.extract.mockReset();
  vi.stubEnv("OCR_ENGINE", "auto");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("engine selection order", () => {
  it("never calls Groq when the PDF's own text is solid", async () => {
    pdfTextMock.extract.mockResolvedValue(solidReading("pdf-text"));

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("pdf-text");
    expect(groqMock.extract).not.toHaveBeenCalled();
  });

  it("keeps a thin PDF text reading when Groq cannot help — Groq's API takes images, not PDFs", async () => {
    pdfTextMock.extract.mockResolvedValue(reading({ provider: "pdf-text", rawText: "" }));

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("pdf-text");
    expect(groqMock.extract).not.toHaveBeenCalled();
  });

  it("goes straight to Groq for a photo — pdf-text does not apply", async () => {
    groqMock.extract.mockResolvedValue(solidReading("groq"));

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("groq");
    expect(pdfTextMock.extract).not.toHaveBeenCalled();
  });

  it("keeps a thin Groq reading when nothing else is free to try", async () => {
    groqMock.extract.mockResolvedValue(
      reading({ provider: "groq", rawText: "", confidence: { overall: 0.3 } })
    );

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("groq");
  });

  it("opens the review screen blank rather than failing when Groq's call throws", async () => {
    groqMock.extract.mockRejectedValue(new Error("rate limited"));

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("manual");
  });

  it("opens the review screen blank when nothing is configured", async () => {
    groqMock.isConfigured = false;

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("manual");
  });

  it("mode=manual reads nothing at all", async () => {
    vi.stubEnv("OCR_ENGINE", "manual");

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("manual");
    expect(pdfTextMock.extract).not.toHaveBeenCalled();
    expect(groqMock.extract).not.toHaveBeenCalled();
  });

  it("reads OCR_ENGINE case-insensitively and falls back to auto on garbage", () => {
    vi.stubEnv("OCR_ENGINE", "MANUAL");
    expect(engineMode()).toBe("manual");
    vi.stubEnv("OCR_ENGINE", "yolo");
    expect(engineMode()).toBe("auto");
  });

  it("keeps the better of two thin readings", async () => {
    pdfTextMock.extract.mockResolvedValue(
      reading({ provider: "pdf-text", rawText: "", confidence: { overall: 0.2 } })
    );

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("pdf-text");
  });
});
