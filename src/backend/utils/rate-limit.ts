import { env } from "@/config/env";
import { logger } from "@/backend/utils/logger";

/**
 * Tiny IP/key-based rate limiter using Upstash Redis REST.
 *
 * Fixed-window counter (bucket = floor(now / windowMs)). One round trip per
 * check via Upstash's pipeline endpoint: INCR + EXPIRE. Cheap enough that
 * /api/auth/* can call it on every request.
 *
 * No-op fallback when UPSTASH_REDIS_REST_URL/TOKEN are unset — returns
 * `allowed: true` and logs a one-time warning. Lets local dev and preview
 * deploys run without Upstash; production should always have it configured.
 *
 * Why fixed-window vs sliding-window: fixed-window is one INCR; sliding
 * needs a sorted-set + ZRANGEBYSCORE per check. For coarse abuse
 * mitigation (5/min, 100/hour) the small burst-at-boundary that fixed-
 * window allows is acceptable. If we ever need precise quotas we can swap
 * the implementation — the call site is stable.
 *
 * Failure mode: if Upstash returns non-2xx or throws, we ALLOW the request
 * and log. Better to occasionally let a brute-forcer through than to lock
 * every user out when Upstash hiccups.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

const NO_OP: Omit<RateLimitResult, "limit"> = {
  allowed: true,
  remaining: Number.POSITIVE_INFINITY,
  resetAt: 0,
};

let warned = false;

export async function checkRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warned) {
      logger.warn(
        "Rate limiting disabled — UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. All requests pass."
      );
      warned = true;
    }
    return { ...NO_OP, limit: opts.limit };
  }

  const now = Date.now();
  const bucket = Math.floor(now / opts.windowMs);
  const resetAt = (bucket + 1) * opts.windowMs;
  const redisKey = `rl:${opts.key}:${bucket}`;
  const ttlSeconds = Math.ceil(opts.windowMs / 1000) + 1;

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, ttlSeconds],
      ]),
      // Short timeout — a slow Upstash call should not block auth.
      signal: AbortSignal.timeout(2_000),
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "Upstash rate-limit returned non-2xx; allowing request"
      );
      return { ...NO_OP, limit: opts.limit };
    }

    const data = (await res.json()) as Array<{ result?: number | string }>;
    const count = Number(data[0]?.result ?? 0);
    return {
      allowed: count <= opts.limit,
      remaining: Math.max(0, opts.limit - count),
      resetAt,
      limit: opts.limit,
    };
  } catch (e) {
    logger.error(
      { err: e },
      "Upstash rate-limit check failed; allowing request"
    );
    return { ...NO_OP, limit: opts.limit };
  }
}

/**
 * Build a 429 response with standard rate-limit headers. Use the result
 * from `checkRateLimit` directly.
 */
export function rateLimited(r: RateLimitResult, message = "Too many requests"): Response {
  const retryAfter = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(r.limit),
      "X-RateLimit-Remaining": String(r.remaining),
      "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
    },
  });
}

/**
 * Extract the client IP from forwarded headers. Vercel sets `x-forwarded-for`
 * with the original IP first (then any intermediary proxies). Falls back to
 * `x-real-ip` and finally `"unknown"` — anonymized requests share one bucket,
 * which is the conservative default for a brute-force defense.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
