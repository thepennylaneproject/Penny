"use client";

import React, { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

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

  const actionStyle: React.CSSProperties = {
    fontSize: "12px",
    padding: "6px 14px",
    cursor: "pointer",
    textDecoration: "none",
    color: "inherit",
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <h1 style={{ fontSize: "15px", fontWeight: 500, marginBottom: "0.75rem" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "13px", opacity: 0.8, marginBottom: "1.25rem", maxWidth: "360px", textAlign: "center" }}>
          {process.env.NODE_ENV === "production"
            ? "An unexpected error occurred. Please try again or return to the portfolio."
            : error.message || "An unexpected error occurred."}
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="button" onClick={() => reset()} style={actionStyle}>
            Try again
          </button>
          <a href="/" style={actionStyle}>
            Portfolio
          </a>
        </div>
      </body>
    </html>
  );
}
