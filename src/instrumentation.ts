/**
 * Next.js instrumentation hook — runs once at process boot for both the
 * Node.js runtime and the edge runtime. We use it to initialize Sentry
 * conditionally: when SENTRY_DSN is unset, Sentry is not loaded at all,
 * keeping cold-start latency and bundle size unchanged.
 *
 * To activate Sentry in production: set SENTRY_DSN in Vercel env vars
 * (and NEXT_PUBLIC_SENTRY_DSN for the browser SDK). Redeploy.
 */
export async function register() {
  // Read directly from process.env here — env.ts is fine but importing it
  // pulls Zod + the full schema into the edge runtime, which we want to
  // keep minimal for the edge entry path.
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      // Adjust per environment: more aggressive in prod, lighter in dev.
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      // Captures uncaught errors as well as logged events.
      enabled: true,
      // Don't ship local stack frames as PII.
      sendDefaultPii: false,
      environment: process.env.NODE_ENV ?? "development",
    });
    return;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      enabled: true,
      sendDefaultPii: false,
      environment: process.env.NODE_ENV ?? "development",
    });
  }
}

/**
 * Forwards request errors (caught by Next's React render path or the
 * App Router error boundaries) to Sentry. Re-exported per the Next.js
 * docs so Next can pick it up automatically.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: "Pages Router" | "App Router"; routePath: string; routeType: "render" | "route" | "action" | "middleware" }
) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
}
