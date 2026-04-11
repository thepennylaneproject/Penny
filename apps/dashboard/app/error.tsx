"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";

export default function Error({
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
    <DashboardRouteShell activeView="portfolio">
      <div style={{ maxWidth: "440px" }}>
        <div
          style={{
            fontSize: "9px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-text-4)",
            marginBottom: "0.5rem",
          }}
        >
          Error
        </div>
        <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 0.75rem" }}>
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: "12px",
            color: "var(--ink-text-3)",
            lineHeight: 1.55,
            marginBottom: "1rem",
          }}
        >
          {process.env.NODE_ENV === "production"
            ? "An unexpected error occurred. Please try again or use the sidebar to return to the portfolio."
            : error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            backgroundColor: "var(--ink-button-bg)",
            color: "var(--ink-button-text)",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </DashboardRouteShell>
  );
}
