import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Groq's own error handling and response parsing, mirroring
 * claude-provider.test.ts: retrying a transient failure, giving up on one
 * that will never succeed, and reading the model's response into either a
 * document or the right error message. `chat.completions.create` is the only
 * thing mocked — everything downstream of the response is real.
 */

const createMock = vi.hoisted(() => vi.fn());

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(function GroqMock() {
    return { chat: { completions: { create: createMock } } };
  }),
}));

const { groqProvider } = await import("../groq");

const INPUT = {
  buffer: Buffer.from("fake-image-bytes"),
  mimeType: "image/jpeg",
  fileName: "bill.jpg",
};

function chatResponse(payload: unknown, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    choices: [
      {
        finish_reason: "stop",
        message: { content: JSON.stringify(payload) },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    ...overrides,
  };
}

const VALID_DOCUMENT = {
  docType: "PURCHASE_BILL",
  direction: "INCOMING",
  partyName: "Vendor",
  documentNumber: "INV-1",
  documentDate: "2026-01-01",
  totalAmount: 100,
  lines: [],
};

beforeEach(() => {
  createMock.mockReset();
  vi.stubEnv("GROQ_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("groqProvider.supports", () => {
  it("claims images but not PDFs", () => {
    expect(groqProvider.supports(INPUT)).toBe(true);
    expect(groqProvider.supports({ ...INPUT, mimeType: "application/pdf" })).toBe(false);
  });
});

describe("groqProvider.extract", () => {
  it("parses a well-formed response into a document", async () => {
    createMock.mockResolvedValue(chatResponse(VALID_DOCUMENT));

    const result = await groqProvider.extract(INPUT);

    expect(result.document.partyName).toBe("Vendor");
    expect(result.provider).toBe("groq");
    expect(result.costMicroUsd).toBe(0);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited call and succeeds on the second attempt", async () => {
    createMock
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(chatResponse(VALID_DOCUMENT));

    const result = await groqProvider.extract(INPUT);

    expect(result.document.partyName).toBe("Vendor");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a request that will never succeed", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(groqProvider.extract(INPUT)).rejects.toThrow(/Extraction failed/);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting its (short) retry budget on a persistent 5xx", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("overloaded"), { status: 503 }));

    await expect(groqProvider.extract(INPUT)).rejects.toThrow(/Extraction failed/);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("blames the document length, not the parser, when the model runs out of tokens mid-object", async () => {
    const truncated = JSON.stringify(VALID_DOCUMENT).slice(0, -5);
    createMock.mockResolvedValue(
      chatResponse(VALID_DOCUMENT, {
        choices: [{ finish_reason: "length", message: { content: truncated } }],
      })
    );

    await expect(groqProvider.extract(INPUT)).rejects.toThrow(/too long to read in one pass/);
  });

  it("reports a generic parse failure when the JSON is simply broken", async () => {
    createMock.mockResolvedValue(
      chatResponse(VALID_DOCUMENT, {
        choices: [{ finish_reason: "stop", message: { content: "{not json" } }],
      })
    );

    await expect(groqProvider.extract(INPUT)).rejects.toThrow(/could not be parsed/);
  });

  it("rejects a reading that does not match the document schema", async () => {
    createMock.mockResolvedValue(chatResponse({ docType: "NOT_A_REAL_TYPE", lines: [] }));

    await expect(groqProvider.extract(INPUT)).rejects.toThrow(/did not match the document shape/);
  });

  it("averages only the fields the model actually asserted confidence on", async () => {
    createMock.mockResolvedValue(
      chatResponse({ ...VALID_DOCUMENT, fieldConfidence: { partyName: 0.9, documentNumber: 0.7 } })
    );

    const result = await groqProvider.extract(INPUT);

    expect(result.confidence.overall).toBeCloseTo(0.8, 5);
  });

  it("refuses a PDF outright rather than sending it to a vision endpoint that can't read it", async () => {
    await expect(groqProvider.extract({ ...INPUT, mimeType: "application/pdf" })).rejects.toThrow(
      /cannot be read by Groq/
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
