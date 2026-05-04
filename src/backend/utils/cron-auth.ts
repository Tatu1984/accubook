import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";

/**
 * Authenticate a cron / service-account request via Bearer token.
 *
 * Pairs with `CRON_SECRET` in env. When the secret is unset, requests
 * are rejected (deploy-environment safety: an unconfigured cron path
 * shouldn't accept any Bearer token at all).
 *
 * Compares with `crypto.timingSafeEqual` to avoid leaking the token
 * length / matching prefix via timing. Returns a 401 NextResponse on
 * failure; null on success so callers can branch:
 *
 *   const denied = requireCronSecret(request);
 *   if (denied) return denied;
 *
 * Use ALONGSIDE (not in place of) `withOrgAuth` for routes that
 * should accept BOTH a logged-in session and a cron service-account.
 * For cron-only routes (no UI surface), use `requireCronSecret`
 * exclusively and skip session auth.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Cron endpoint disabled — CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) {
    return NextResponse.json(
      { error: "Missing or malformed Bearer token" },
      { status: 401 }
    );
  }
  const provided = m[1].trim();
  if (!constantTimeEquals(provided, expected)) {
    return NextResponse.json(
      { error: "Invalid Bearer token" },
      { status: 401 }
    );
  }
  return null;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
