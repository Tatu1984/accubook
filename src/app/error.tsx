"use client";

import { useEffect } from "react";
import { Button } from "@/frontend/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Forward to Sentry when initialized; the SDK noop is automatic when
    // NEXT_PUBLIC_SENTRY_DSN is unset.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">
          We hit an unexpected error. Try again, or contact support if the problem persists.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
