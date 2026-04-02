"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: "2rem", fontFamily: "ui-monospace, monospace" }}>
        <h1 style={{ fontSize: "16px" }}>penny dashboard error</h1>
        <p style={{ fontSize: "13px", opacity: 0.8 }}>{error.message}</p>
        <button type="button" onClick={() => reset()} style={{ marginTop: "1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
