import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Cron authentication (#6).
 *
 * Scheduled endpoints run with no session — they are authorised entirely by a
 * shared secret, which makes them the one place where getting the check wrong
 * exposes an unauthenticated write path across every organization. These assert
 * the three ways that can go wrong: the secret being unset, the header being
 * absent or malformed, and the token simply being wrong.
 */

const envMock = vi.hoisted(() => ({ CRON_SECRET: undefined as string | undefined }));

vi.mock("@/config/env", () => ({
  env: {
    get CRON_SECRET() {
      return envMock.CRON_SECRET;
    },
  },
}));

const { requireCronSecret } = await import("../cron-auth");

const requestWith = (authorization?: string) =>
  new NextRequest("https://example.test/api/cron/check-overdue", {
    headers: authorization ? { authorization } : {},
  });

const SECRET = "a-cron-secret-that-is-at-least-32-chars";

beforeEach(() => {
  envMock.CRON_SECRET = SECRET;
});

describe("requireCronSecret", () => {
  it("admits a request carrying the right bearer token", () => {
    expect(requireCronSecret(requestWith(`Bearer ${SECRET}`))).toBeNull();
  });

  it("fails closed with 503 when no secret is configured", async () => {
    envMock.CRON_SECRET = undefined;

    const denied = requireCronSecret(requestWith(`Bearer ${SECRET}`));
    expect(denied?.status).toBe(503);
    // An unconfigured deployment must not silently accept every caller.
    await expect(denied?.json()).resolves.toMatchObject({
      error: expect.stringContaining("CRON_SECRET"),
    });
  });

  it("rejects a request with no Authorization header", () => {
    expect(requireCronSecret(requestWith())?.status).toBe(401);
  });

  it.each([
    ["not a bearer scheme", SECRET],
    ["Basic", `Basic ${SECRET}`],
    ["bare token", SECRET],
    ["empty bearer", "Bearer "],
  ])("rejects a malformed header (%s)", (_label, header) => {
    expect(requireCronSecret(requestWith(header))?.status).toBe(401);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "b".repeat(SECRET.length);
    expect(wrong).toHaveLength(SECRET.length);
    expect(requireCronSecret(requestWith(`Bearer ${wrong}`))?.status).toBe(401);
  });

  it("rejects a token that merely starts with the secret", () => {
    expect(
      requireCronSecret(requestWith(`Bearer ${SECRET}extra`))?.status
    ).toBe(401);
  });

  it("rejects a prefix of the secret", () => {
    expect(
      requireCronSecret(requestWith(`Bearer ${SECRET.slice(0, -1)}`))?.status
    ).toBe(401);
  });

  it("tolerates surrounding whitespace in the token", () => {
    expect(requireCronSecret(requestWith(`Bearer   ${SECRET}  `))).toBeNull();
  });
});
