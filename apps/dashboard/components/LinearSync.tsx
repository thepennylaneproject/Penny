"use client";

import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";

interface SyncStatus {
  configured: boolean;
  linear_reachable: boolean | null;
  linear_error: string | null;
  last_sync: string | null;
  synced_count: number;
  in_linear_only: number;
  unsynced_unresolved: number;
}

interface LinearSyncProps {
  projectName: string;
  onRefresh?: () => Promise<void>;
}

export function LinearSync({ projectName, onRefresh }: LinearSyncProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setStatusLoadError(null);
    try {
      const res = await apiFetch(
        `/api/sync/linear/status?project=${encodeURIComponent(projectName)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        configured?: boolean;
        linear_reachable?: boolean | null;
        linear_error?: string | null;
        last_sync?: string | null;
        synced_count?: number;
        in_linear_only?: number;
        unsynced_unresolved?: number;
      };
      if (res.ok) {
        setStatus({
          configured: Boolean(data.configured),
          linear_reachable:
            data.linear_reachable === true || data.linear_reachable === false
              ? data.linear_reachable
              : null,
          linear_error:
            typeof data.linear_error === "string" ? data.linear_error : null,
          last_sync: data.last_sync ?? null,
          synced_count: Number(data.synced_count ?? 0),
          in_linear_only: Number(data.in_linear_only ?? 0),
          unsynced_unresolved: Number(data.unsynced_unresolved ?? 0),
        });
        setStatusLoadError(null);
      } else {
        setStatus(null);
        setStatusLoadError(
          typeof data.error === "string"
            ? data.error
            : `Status failed (${res.status}). Use dashboard login or paste orchestration secret.`
        );
      }
    } catch {
      setStatus(null);
      setStatusLoadError("Network error loading Linear status");
    }
  }, [projectName]);

  useEffect(() => {
    setStatus(null);
    setStatusLoadError(null);
    void fetchStatus();
  }, [projectName, fetchStatus]);

  const push = useCallback(async () => {
    setAction("push");
    setSyncError(null);
    try {
      const res = await apiFetch("/api/sync/linear/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyncError(null);
        await fetchStatus();
        await onRefresh?.();
      } else {
        setSyncError((data as { error?: string }).error ?? "Push failed");
      }
    } finally {
      setAction(null);
    }
  }, [projectName, fetchStatus, onRefresh]);

  const pull = useCallback(async () => {
    setAction("pull");
    setSyncError(null);
    try {
      const res = await apiFetch("/api/sync/linear/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyncError(null);
        await fetchStatus();
        await onRefresh?.();
      } else {
        setSyncError((data as { error?: string }).error ?? "Pull failed");
      }
    } finally {
      setAction(null);
    }
  }, [projectName, fetchStatus, onRefresh]);

  if (statusLoadError && !status) {
    return (
      <div
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-red)",
          marginBottom: "1rem",
        }}
      >
        linear: {statusLoadError}
      </div>
    );
  }

  if (status === null) {
    return (
      <div
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-text-4)",
          marginBottom: "1rem",
        }}
      >
        linear: loading…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-text-4)",
          marginBottom: "1rem",
          lineHeight: 1.45,
        }}
      >
        <div>linear: not configured</div>
        <div style={{ marginTop: "0.35rem", color: "var(--ink-text-3)" }}>
          Set <code>LINEAR_API_KEY</code> and <code>LINEAR_TEAM_ID</code> in{" "}
          <code>dashboard/.env.local</code> (or repo root <code>.env.local</code> if you merge env — see
          README). Team ID must be the team UUID from Linear → Settings → API, or your team key (e.g.{" "}
          <code>ENG</code>).
        </div>
      </div>
    );
  }

  if (status.linear_reachable === false && status.linear_error) {
    return (
      <div style={{ marginBottom: "1rem", lineHeight: 1.45 }}>
        <div
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-red)",
            marginBottom: "0.35rem",
          }}
        >
          linear: API error — not communicating with Linear
        </div>
        <pre
          style={{
            margin: 0,
            padding: "0.5rem",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-border-faint)",
            borderRadius: "var(--radius-md)",
            color: "var(--ink-text-2)",
          }}
        >
          {status.linear_error}
        </pre>
        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", marginTop: "0.35rem" }}>
          Fix the key/team ID, restart <code>npm run dev</code>, then retry push/pull.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      {syncError && (
        <div
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-red)",
            marginBottom: "0.5rem",
          }}
        >
          {syncError}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
          linear
        </span>
        {status.last_sync && (
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
            {status.last_sync.slice(0, 10)}
          </span>
        )}
        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-3)" }}>
          {status.synced_count} synced
        </span>
        {status.unsynced_unresolved > 0 && (
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-amber)" }}>
            {status.unsynced_unresolved} to push
          </span>
        )}
        <button
          type="button"
          onClick={push}
          disabled={!!action}
          style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "2px 8px" }}
        >
          {action === "push" ? "…" : "push"}
        </button>
        <button
          type="button"
          onClick={pull}
          disabled={!!action}
          style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "2px 8px" }}
        >
          {action === "pull" ? "…" : "pull"}
        </button>
      </div>
    </div>
  );
}
