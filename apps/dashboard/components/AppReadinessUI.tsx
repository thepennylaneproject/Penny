"use client";

/**
 * UI components for each error/loading state from AppReadinessState.
 */

import { DashboardRouteShell } from "./DashboardRouteShell";
import { DashboardLogin } from "./DashboardLogin";

export function SignInPrompt({ hint, onSignIn }: { hint: string; onSignIn?: () => void }) {
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
          Authentication
        </div>
        <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 0.75rem" }}>
          Sign in to continue
        </h1>
        <p style={{ fontSize: "12px", color: "var(--ink-text-3)", lineHeight: 1.55, marginBottom: "1.5rem" }}>
          {hint}
        </p>
        <DashboardLogin onSuccess={onSignIn ?? (() => {})} />
      </div>
    </DashboardRouteShell>
  );
}

export function ConfigurationError({
  message,
  hint,
  onRetry,
}: {
  message: string;
  hint?: string;
  onRetry?: () => void;
}) {
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
          Configuration
        </div>
        <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 0.75rem" }}>
          Host is misconfigured
        </h1>
        <p style={{ fontSize: "12px", color: "var(--ink-text-3)", lineHeight: 1.55, marginBottom: "1rem" }}>
          {message}
        </p>
        {hint && (
          <details style={{ fontSize: "12px", color: "var(--ink-text-3)", marginBottom: "1.25rem" }}>
            <summary style={{ cursor: "pointer", marginBottom: "0.5rem", color: "var(--ink-text-2)" }}>
              {hint}
            </summary>
            <p style={{ lineHeight: 1.55, margin: "0.5rem 0 0" }}>
              Add <code style={{ fontSize: "11px" }}>DASHBOARD_API_SECRET</code> or{" "}
              <code style={{ fontSize: "11px" }}>ORCHESTRATION_ENQUEUE_SECRET</code> in Netlify or your host
              environment (see repository README). For staging only, you can set{" "}
              <code style={{ fontSize: "11px" }}>penny_ALLOW_OPEN_API=true</code>.
            </p>
          </details>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            Retry
          </button>
        )}
      </div>
    </DashboardRouteShell>
  );
}

export function RetryableError({
  message,
  hint,
  onRetry,
}: {
  message: string;
  hint?: string;
  onRetry: () => void;
}) {
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
          Could not load portfolio
        </h1>
        <p style={{ fontSize: "12px", color: "var(--ink-text-3)", lineHeight: 1.55, marginBottom: "1rem" }}>
          {message}
        </p>
        {hint && (
          <p style={{ fontSize: "12px", color: "var(--ink-text-4)", marginBottom: "1rem" }}>
            {hint}
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
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
