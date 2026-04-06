"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function DashboardLogin({
  onSuccess,
  sessionHint,
}: {
  onSuccess: () => void;
  /** Shown under the intro copy (e.g. after 401 / expired session). */
  sessionHint?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase auth is not configured for this dashboard.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      setPassword("");
      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight:       "100vh",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        padding:         "2rem",
        background:      "var(--ink-bg)",
      }}
    >
      <form
        onSubmit={submit}
        autoComplete="on"
        style={{
          width:          "100%",
          maxWidth:       "400px",
          padding:        "1.75rem",
          background:     "var(--ink-bg-raised)",
          border:         "0.5px solid var(--ink-border)",
          borderRadius:   "var(--radius-lg)",
        }}
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          value={email}
          onChange={() => {}}
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
          }}
        />
        <div
          style={{
            fontSize:       "9px",
            fontFamily:     "var(--font-mono)",
            letterSpacing:  "0.1em",
            textTransform:  "uppercase",
            color:          "var(--ink-text-4)",
            marginBottom:   "0.5rem",
          }}
        >
          penny dashboard
        </div>
        <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 1rem" }}>
          Sign in
        </h1>
        <p style={{ fontSize: "12px", color: "var(--ink-text-3)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Sign in with the Supabase account Penny shares with Lane.
        </p>
        {sessionHint ? (
          <p style={{ fontSize: "12px", color: "var(--ink-text-3)", marginBottom: "1rem", lineHeight: 1.5 }}>
            {sessionHint}
          </p>
        ) : null}
        <details style={{ fontSize: "11px", color: "var(--ink-text-4)", marginBottom: "1rem", lineHeight: 1.6 }}>
          <summary style={{ cursor: "pointer", marginBottom: "0.5rem", color: "var(--ink-text-3)" }}>
            Which credentials should I use?
          </summary>
          <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "0.5px solid var(--ink-border-faint)" }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "var(--ink-text-2)" }}>Email:</strong> Your Supabase user email
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong style={{ color: "var(--ink-text-2)" }}>Password:</strong> The password stored in Supabase Auth
            </div>
            <div style={{ fontSize: "10px", color: "var(--ink-text-4)", marginTop: "0.5rem" }}>
              Lane and Penny both trust the same Supabase JWT after sign-in.
            </div>
          </div>
        </details>
        <label
          htmlFor="dashboard-email"
          style={{
            display:       "block",
            fontSize:      "9px",
            fontFamily:    "var(--font-mono)",
            color:         "var(--ink-text-4)",
            marginBottom:  "0.35rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Email
        </label>
        <input
          id="dashboard-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width:          "100%",
            fontSize:       "13px",
            fontFamily:     "var(--font-mono)",
            padding:        "0.5rem 0.65rem",
            marginBottom:   "0.75rem",
            boxSizing:      "border-box",
          }}
        />
        <label
          htmlFor="dashboard-password"
          style={{
            display:       "block",
            fontSize:      "9px",
            fontFamily:    "var(--font-mono)",
            color:         "var(--ink-text-4)",
            marginBottom:  "0.35rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Password
        </label>
        <input
          id="dashboard-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width:          "100%",
            fontSize:       "13px",
            fontFamily:     "var(--font-mono)",
            padding:        "0.5rem 0.65rem",
            marginBottom:   "1rem",
            boxSizing:      "border-box",
          }}
        />
        {error ? (
          <p style={{ color: "var(--ink-red)", fontSize: "12px", marginBottom: "0.75rem" }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "0.5rem 1rem" }}
        >
          {submitting ? "…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
