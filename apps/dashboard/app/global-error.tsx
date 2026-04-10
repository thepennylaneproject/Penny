"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: "2rem", fontFamily: "ui-monospace, monospace" }}>
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <h1 style={{ fontSize: "15px", fontWeight: 500, marginBottom: "0.75rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "12px",
              opacity: 0.75,
              marginBottom: "1.25rem",
              maxWidth: "360px",
              textAlign: "center",
            }}
          >
            {process.env.NODE_ENV === "production"
              ? "An unexpected error occurred. Please try again or return to the portfolio."
              : error.message || "An unexpected error occurred."}
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ fontSize: "12px", padding: "6px 14px" }}
            >
              Try again
            </button>
            <Link href="/" style={{ fontSize: "12px", padding: "6px 14px", alignSelf: "center" }}>
              Portfolio
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
