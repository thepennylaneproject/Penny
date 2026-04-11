"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Flow = "signin" | "recovery" | "forgot";

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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [flow, setFlow] = useState<Flow>("signin");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const onChange = (event: AuthChangeEvent) => {
      if (event === "PASSWORD_RECOVERY") {
        setFlow("recovery");
        setError("");
        setInfo("");
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(onChange);
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setFlow("recovery");
    }
  }, []);

  async function submitSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setInfo("");
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

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setInfo("");
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      setSubmitting(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase auth is not configured for this dashboard.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setInfo("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      setSubmitting(false);
      return;
    }
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase auth is not configured for this dashboard.");
        return;
      }
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        { redirectTo }
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setInfo(
        "If an account exists for that email, you will receive a reset link. After you click it, return here to choose a new password."
      );
      setFlow("signin");
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return (
      <p style={{ color: "var(--ink-red)", fontSize: "12px" }}>
        Supabase auth is not configured for this dashboard.
      </p>
    );
  }

  if (flow === "recovery") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "var(--ink-bg)",
        }}
      >
        <form
          onSubmit={submitRecovery}
          autoComplete="on"
          style={{
            width: "100%",
            maxWidth: "400px",
            padding: "1.75rem",
            background: "var(--ink-bg-raised)",
            border: "0.5px solid var(--ink-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-text-4)",
              marginBottom: "0.5rem",
            }}
          >
            Penny dashboard
          </div>
          <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 1rem" }}>
            Set a new password
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--ink-text-3)",
              marginBottom: "1rem",
              lineHeight: 1.5,
            }}
          >
            You opened a password reset link. Choose a new password below, then you can use the
            dashboard as usual.
          </p>
          <label
            htmlFor="dashboard-new-password"
            style={{
              display: "block",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
              marginBottom: "0.35rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            New password
          </label>
          <input
            id="dashboard-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{
              width: "100%",
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
              padding: "0.5rem 0.65rem",
              marginBottom: "0.75rem",
              boxSizing: "border-box",
            }}
          />
          <label
            htmlFor="dashboard-confirm-password"
            style={{
              display: "block",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
              marginBottom: "0.35rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Confirm password
          </label>
          <input
            id="dashboard-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              width: "100%",
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
              padding: "0.5rem 0.65rem",
              marginBottom: "1rem",
              boxSizing: "border-box",
            }}
          />
          {error ? (
            <p style={{ color: "var(--ink-red)", fontSize: "12px", marginBottom: "0.75rem" }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={submitting}
              style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "0.5rem 1rem" }}
            >
              {submitting ? "…" : "Save password"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setFlow("signin");
                setError("");
              }}
              style={{
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                padding: "0.5rem 1rem",
                background: "transparent",
                border: "0.5px solid var(--ink-border-faint)",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (flow === "forgot") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "var(--ink-bg)",
        }}
      >
        <form
          onSubmit={submitForgot}
          style={{
            width: "100%",
            maxWidth: "400px",
            padding: "1.75rem",
            background: "var(--ink-bg-raised)",
            border: "0.5px solid var(--ink-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-text-4)",
              marginBottom: "0.5rem",
            }}
          >
            Penny dashboard
          </div>
          <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 1rem" }}>
            Reset password
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--ink-text-3)",
              marginBottom: "1rem",
              lineHeight: 1.5,
            }}
          >
            We will email you a link. After you open it, use this screen to set a new password
            (not the regular sign-in form).
          </p>
          <label
            htmlFor="forgot-email"
            style={{
              display: "block",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
              marginBottom: "0.35rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
              padding: "0.5rem 0.65rem",
              marginBottom: "1rem",
              boxSizing: "border-box",
            }}
          />
          {error ? (
            <p style={{ color: "var(--ink-red)", fontSize: "12px", marginBottom: "0.75rem" }}>
              {error}
            </p>
          ) : null}
          {info ? (
            <p
              style={{
                color: "var(--ink-text-3)",
                fontSize: "12px",
                marginBottom: "0.75rem",
                lineHeight: 1.5,
              }}
            >
              {info}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={submitting}
              style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "0.5rem 1rem" }}
            >
              {submitting ? "…" : "Send reset link"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setFlow("signin");
                setError("");
                setInfo("");
              }}
              style={{
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                padding: "0.5rem 1rem",
                background: "transparent",
                border: "0.5px solid var(--ink-border-faint)",
              }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--ink-bg)",
      }}
    >
      <form
        onSubmit={submitSignIn}
        autoComplete="on"
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "1.75rem",
          background: "var(--ink-bg-raised)",
          border: "0.5px solid var(--ink-border)",
          borderRadius: "var(--radius-lg)",
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
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-text-4)",
            marginBottom: "0.5rem",
          }}
        >
          Penny dashboard
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
        {info ? (
          <p
            style={{
              fontSize: "12px",
              color: "var(--ink-amber)",
              marginBottom: "1rem",
              lineHeight: 1.5,
            }}
          >
            {info}
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
            display: "block",
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-4)",
            marginBottom: "0.35rem",
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
            width: "100%",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            padding: "0.5rem 0.65rem",
            marginBottom: "0.75rem",
            boxSizing: "border-box",
          }}
        />
        <label
          htmlFor="dashboard-password"
          style={{
            display: "block",
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-4)",
            marginBottom: "0.35rem",
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
            width: "100%",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            padding: "0.5rem 0.65rem",
            marginBottom: "0.75rem",
            boxSizing: "border-box",
          }}
        />
        {error ? (
          <p style={{ color: "var(--ink-red)", fontSize: "12px", marginBottom: "0.75rem" }}>{error}</p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <button
            type="submit"
            disabled={submitting}
            style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "0.5rem 1rem" }}
          >
            {submitting ? "…" : "Sign in"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setFlow("forgot");
              setError("");
              setInfo("");
            }}
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              padding: 0,
              border: "none",
              background: "none",
              color: "var(--ink-text-3)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Forgot password?
          </button>
        </div>
      </form>
    </div>
  );
}
