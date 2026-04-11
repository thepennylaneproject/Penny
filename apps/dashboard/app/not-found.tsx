import type { Metadata } from "next";
import Link from "next/link";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";

export const metadata: Metadata = {
  title: "Not found",
};

export default function NotFound() {
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
          Not found
        </div>
        <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 0.75rem" }}>
          This page isn&apos;t here
        </h1>
        <p
          style={{
            fontSize: "12px",
            color: "var(--ink-text-3)",
            lineHeight: 1.55,
            marginBottom: "1.25rem",
          }}
        >
          That URL doesn&apos;t match anything in Penny. Check the address or head back to your portfolio.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            fontSize: "12px",
            padding: "6px 14px",
            backgroundColor: "var(--ink-button-bg)",
            color: "var(--ink-button-text)",
            borderRadius: "4px",
            textDecoration: "none",
          }}
        >
          Back to portfolio
        </Link>
      </div>
    </DashboardRouteShell>
  );
}
