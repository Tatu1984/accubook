import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The paid engine's own error handling: retrying a transient failure, giving
 * up on one that will never succeed, and reading the model's response into
 * either a document or the right error message. `messages.create` is the only
 * thing mocked — everything downstream of the response is real.
 */

const createMock = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: createMock } };
  }),
}));

// claude.ts imports pricing.ts, which logs through the shared logger; that
// logger validates process.env at import time, which a unit test has no
// reason to populate.
vi.mock("@/backend/utils/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { claudeProvider } = await import("../providers/claude");

const INPUT = {
  buffer: Buffer.from("fake-pdf-bytes"),
  mimeType: "application/pdf",
  fileName: "bill.pdf",
};

function textResponse(payload: unknown, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(payload) }],
    usage: { input_tokens: 100, output_tokens: 50 },
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
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("claudeProvider.extract", () => {
  it("parses a well-formed response into a document", async () => {
    createMock.mockResolvedValue(textResponse(VALID_DOCUMENT));

    const result = await claudeProvider.extract(INPUT);

    expect(result.document.partyName).toBe("Vendor");
    expect(result.provider).toBe("claude");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited call and succeeds on the second attempt", async () => {
    createMock
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(textResponse(VALID_DOCUMENT));

    const result = await claudeProvider.extract(INPUT);

    expect(result.document.partyName).toBe("Vendor");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a request that will never succeed", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(claudeProvider.extract(INPUT)).rejects.toThrow(/Extraction failed/);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on a persistent 5xx", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("overloaded"), { status: 529 }));

    await expect(claudeProvider.extract(INPUT)).rejects.toThrow(/Extraction failed/);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it("reports refusal as its own error, not a parse failure", async () => {
    createMock.mockResolvedValue({
      stop_reason: "refusal",
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    await expect(claudeProvider.extract(INPUT)).rejects.toThrow(/declined to read/);
  });

  it("blames the document length, not the parser, when max_tokens truncates valid-looking JSON", async () => {
    const truncated = JSON.stringify(VALID_DOCUMENT).slice(0, -5); // cut mid-object
    createMock.mockResolvedValue(
      textResponse(VALID_DOCUMENT, { stop_reason: "max_tokens", content: [{ type: "text", text: truncated }] })
    );

    await expect(claudeProvider.extract(INPUT)).rejects.toThrow(/too long to read in one pass/);
  });

  it("reports a generic parse failure when the JSON is simply broken", async () => {
    createMock.mockResolvedValue(
      textResponse(VALID_DOCUMENT, { content: [{ type: "text", text: "{not json" }] })
    );

    await expect(claudeProvider.extract(INPUT)).rejects.toThrow(/could not be parsed/);
  });

  it("rejects a reading that does not match the document schema", async () => {
    createMock.mockResolvedValue(textResponse({ docType: "NOT_A_REAL_TYPE", lines: [] }));

    await expect(claudeProvider.extract(INPUT)).rejects.toThrow(/did not match the document shape/);
  });

  it("does not overstate confidence when the model asserts none at all", async () => {
    createMock.mockResolvedValue(textResponse(VALID_DOCUMENT));

    const result = await claudeProvider.extract(INPUT);

    expect(result.confidence.overall).toBeLessThanOrEqual(0.5);
  });

  it("averages only the fields the model actually asserted confidence on", async () => {
    createMock.mockResolvedValue(
      textResponse({ ...VALID_DOCUMENT, fieldConfidence: { partyName: 0.9, documentNumber: 0.7 } })
    );

    const result = await claudeProvider.extract(INPUT);

    expect(result.confidence.overall).toBeCloseTo(0.8, 5);
  });
});
