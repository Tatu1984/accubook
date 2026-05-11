/**
 * Browser-side Sentry initialization. Runs in the client bundle for every
 * page. No-op when NEXT_PUBLIC_SENTRY_DSN is unset so dev / preview deploys
 * don't ship Sentry's payload to users without a DSN to send to.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  // Dynamic import keeps the SDK out of the bundle entirely when DSN is
  // unset. The cost when set is a single chunk loaded on first paint.
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
      environment: process.env.NODE_ENV ?? "development",
    });
  });
}

// Required export so Next picks this file up as the client instrumentation
// entry. The router transition hook captures navigation timing for traces
// when Sentry is initialized; otherwise it's a cheap no-op.
export const onRouterTransitionStart = async (
  ...args: Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>
) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRouterTransitionStart(...args);
};
