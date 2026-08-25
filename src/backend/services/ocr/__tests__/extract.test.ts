import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument } from "../schema";
import type { ExtractionOutput } from "../provider";

/**
 * The engine-selection logic in extract.ts, not any one engine's reading.
 * Each provider is mocked to a single fact — "thin", "solid", or "throws" —
 * so what is under test is purely the order extract.ts tries them in and
 * what it does when one fails.
 */

const claudeMock = vi.hoisted(() => ({
  isConfigured: true,
  extract: vi.fn(),
}));
const pdfTextMock = vi.hoisted(() => ({ extract: vi.fn() }));
const tesseractMock = vi.hoisted(() => ({ extract: vi.fn() }));

vi.mock("../providers/claude", () => ({
  claudeIsConfigured: () => claudeMock.isConfigured,
  claudeProvider: {
    name: "claude",
    supports: (input: { mimeType: string }) =>
      claudeMock.isConfigured &&
      (input.mimeType === "application/pdf" || input.mimeType.startsWith("image/")),
    extract: claudeMock.extract,
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

vi.mock("../providers/tesseract", () => ({
  tesseractProvider: {
    name: "tesseract",
    supports: (input: { mimeType: string }) => input.mimeType.startsWith("image/"),
    extract: tesseractMock.extract,
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
  claudeMock.isConfigured = true;
  claudeMock.extract.mockReset();
  pdfTextMock.extract.mockReset();
  tesseractMock.extract.mockReset();
  vi.stubEnv("OCR_ENGINE", "auto");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("engine selection order", () => {
  it("never escalates when the PDF's own text is solid", async () => {
    pdfTextMock.extract.mockResolvedValue(solidReading("pdf-text"));

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("pdf-text");
    expect(claudeMock.extract).not.toHaveBeenCalled();
    expect(tesseractMock.extract).not.toHaveBeenCalled();
  });

  it("escalates a thin PDF text layer straight to Claude — Tesseract does not read PDFs", async () => {
    pdfTextMock.extract.mockResolvedValue(reading({ provider: "pdf-text", rawText: "" }));
    claudeMock.extract.mockResolvedValue(solidReading("claude"));

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("claude");
    expect(tesseractMock.extract).not.toHaveBeenCalled();
  });

  it("escalates to Claude once a thin Tesseract reading is the best a photo has", async () => {
    tesseractMock.extract.mockResolvedValue(reading({ provider: "tesseract", rawText: "" }));
    claudeMock.extract.mockResolvedValue(solidReading("claude"));

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("claude");
  });

  it("goes straight to Tesseract for a photo — pdf-text does not apply", async () => {
    tesseractMock.extract.mockResolvedValue(solidReading("tesseract"));

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("tesseract");
    expect(pdfTextMock.extract).not.toHaveBeenCalled();
    expect(claudeMock.extract).not.toHaveBeenCalled();
  });

  it("keeps a thin free reading when the paid escalation fails", async () => {
    tesseractMock.extract.mockResolvedValue(
      reading({ provider: "tesseract", rawText: "", confidence: { overall: 0.3 } })
    );
    claudeMock.extract.mockRejectedValue(new Error("boom"));

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("tesseract");
  });

  it("throws when nothing free was found and the paid call also fails", async () => {
    tesseractMock.extract.mockRejectedValue(new Error("bad photo"));
    claudeMock.extract.mockRejectedValue(new Error("boom"));

    await expect(extractDocument(IMAGE_INPUT)).rejects.toThrow("boom");
  });

  it("opens the review screen blank rather than failing when nothing is configured", async () => {
    claudeMock.isConfigured = false;
    tesseractMock.extract.mockRejectedValue(new Error("bad photo"));

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("manual");
  });

  it("mode=free never calls the paid engine, even on a thin reading", async () => {
    vi.stubEnv("OCR_ENGINE", "free");
    tesseractMock.extract.mockResolvedValue(
      reading({ provider: "tesseract", rawText: "", confidence: { overall: 0.2 } })
    );

    const result = await extractDocument(IMAGE_INPUT);

    expect(result.provider).toBe("tesseract");
    expect(claudeMock.extract).not.toHaveBeenCalled();
  });

  it("mode=claude skips the free engines entirely", async () => {
    vi.stubEnv("OCR_ENGINE", "claude");
    claudeMock.extract.mockResolvedValue(solidReading("claude"));

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("claude");
    expect(pdfTextMock.extract).not.toHaveBeenCalled();
    expect(tesseractMock.extract).not.toHaveBeenCalled();
  });

  it("mode=manual reads nothing at all", async () => {
    vi.stubEnv("OCR_ENGINE", "manual");

    const result = await extractDocument(PDF_INPUT);

    expect(result.provider).toBe("manual");
    expect(pdfTextMock.extract).not.toHaveBeenCalled();
    expect(claudeMock.extract).not.toHaveBeenCalled();
  });

  it("reads OCR_ENGINE case-insensitively and falls back to auto on garbage", () => {
    vi.stubEnv("OCR_ENGINE", "CLAUDE");
    expect(engineMode()).toBe("claude");
    vi.stubEnv("OCR_ENGINE", "yolo");
    expect(engineMode()).toBe("auto");
  });
});
