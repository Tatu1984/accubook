"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>Application error</h2>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
              A fatal error occurred. Please refresh the page or contact support if the problem persists.
            </p>
            {error.digest && (
              <p style={{ color: "#9ca3af", fontSize: "0.75rem", marginBottom: "1rem" }}>Reference: {error.digest}</p>
            )}
            <button
              onClick={reset}
              style={{ padding: "0.5rem 1rem", background: "#0a0a0a", color: "#fff", border: 0, borderRadius: "0.375rem", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
