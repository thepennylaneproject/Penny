"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { EngineStatus } from "@/lib/audit-reader";
import { UI_COPY } from "@/lib/ui-copy";
import { workflowsDocHref } from "@/lib/docs-links";

export type NavView = "portfolio" | "engine" | "jobs";

interface ShellProps {
  children:    React.ReactNode;
  activeView:  NavView;
  /** Which nav item is highlighted; defaults to `activeView`. Use `"portfolio"` while a project is open so sidebar matches portfolio context. */
  navHighlightView?: NavView;
  onNavigate:  (view: NavView) => void;
  /** After a successful `POST /api/sync/audit`, refresh portfolio data from the parent. */
  onAuditSynced?: () => void;
}

export function Shell({ children, activeView, navHighlightView, onNavigate, onAuditSynced }: ShellProps) {
  const highlightView = navHighlightView ?? activeView;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [engineStatusError, setEngineStatusError] = useState<string | null>(null);
  const [syncing,      setSyncing]      = useState(false);
  const [syncMsg,      setSyncMsg]      = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setEngineStatusError(null);
    try {
      const res = await apiFetch("/api/engine/status");
      if (res.ok) {
        setEngineStatus(await res.json());
        return;
      }
      setEngineStatus(null);
      setEngineStatusError(`Could not load engine status (${res.status}).`);
    } catch (e) {
      setEngineStatus(null);
      setEngineStatusError(
        e instanceof Error ? e.message : "Network error loading engine status."
      );
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await apiFetch("/api/sync/audit", { method: "POST" });
      await res.json().catch(() => null);
      if (res.ok) {
        setSyncMsg(UI_COPY.auditSyncOkShort);
        await fetchStatus();
        onAuditSynced?.();
      } else {
        setSyncMsg(UI_COPY.auditSyncFailedShort);
      }
    } catch {
      setSyncMsg(UI_COPY.auditSyncFailedShort);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (syncMsg) {
      const timer = setTimeout(() => setSyncMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncMsg]);

  const queueSize      = engineStatus?.queue_size ?? 0;
  const activeAuditJobs = engineStatus?.active_audit_jobs ?? 0;
  const activeJobCount  = queueSize + activeAuditJobs;
  const workflowsHref  = workflowsDocHref();

  function fmtDate(d: string | null): string {
    if (!d) return "never";
    try {
      return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return d; }
  }

  const NAV_ITEMS: { key: NavView; label: string }[] = [
    { key: "portfolio", label: UI_COPY.navPortfolio },
    { key: "engine",    label: UI_COPY.navRepairLedger },
    { key: "jobs",      label: "Activity" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--ink-bg)" }}>
      {/* ── Mobile top bar ── */}
      <div className="shell-mobile-bar">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          style={{
            border: "none",
            background: "none",
            padding: "2px 4px",
            fontSize: "18px",
            color: "var(--ink-text-3)",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          {sidebarOpen ? "×" : "☰"}
        </button>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "16px",
            fontStyle: "italic",
            color: "var(--ink-text)",
          }}
        >
          Penny
        </span>
      </div>
      {/* ── Mobile backdrop ── */}
      <div
        className={`shell-sidebar-backdrop${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      {/* ── Sidebar ── */}
      <aside
        className={`shell-sidebar${sidebarOpen ? " open" : ""}`}
        style={{
          width:         "var(--sidebar-width)",
          minWidth:      "var(--sidebar-width)",
          borderRight:   "0.5px solid var(--ink-border-faint)",
          display:       "flex",
          flexDirection: "column",
          padding:       "1.75rem 0 1.25rem",
          position:      "sticky",
          top:           0,
          height:        "100vh",
          background:    "var(--ink-bg)",
        }}
      >
        {/* Wordmark */}
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <span
            style={{
              fontFamily:   "var(--font-serif)",
              fontSize:     "19px",
              fontStyle:    "italic",
              color:        "var(--ink-text)",
              letterSpacing: "0.01em",
            }}
          >
            Penny
          </span>
        </div>

        {/* Nav */}
        <nav
          style={{
            padding:       "0 1.25rem",
            display:       "flex",
            flexDirection: "column",
            gap:           "0.125rem",
          }}
        >
          {NAV_ITEMS.map(({ key, label }) => {
            const isActive = highlightView === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                onNavigate(key);
                setSidebarOpen(false);
              }}
                style={{
                  textAlign:    "left",
                  fontSize:     "13px",
                  fontFamily:   "var(--font-sans)",
                  color:        isActive ? "var(--ink-text)" : "var(--ink-text-3)",
                  fontWeight:   isActive ? 500 : 400,
                  background:   isActive ? "var(--ink-bg-raised)" : "transparent",
                  border:       "none",
                  borderRadius: "var(--radius-md)",
                  padding:      "4px 8px",
                  cursor:       "pointer",
                  transition:   "background 0.1s, color 0.1s",
                  display:      "flex",
                  alignItems:   "center",
                  gap:          "0.5rem",
                }}
              >
                {label}
                {key === "engine" && queueSize > 0 && (
                  <span
                    title={UI_COPY.navLedgerCountTitle}
                    style={{
                      fontSize:     "9px",
                      fontFamily:   "var(--font-mono)",
                      background:   "var(--ink-amber-bg)",
                      color:        "var(--ink-amber)",
                      border:       "0.5px solid var(--ink-amber-border)",
                      borderRadius: "3px",
                      padding:      "1px 5px",
                      lineHeight:   1,
                    }}
                  >
                    {queueSize}
                  </span>
                )}
                {key === "jobs" && activeJobCount > 0 && (
                  <span
                    title={`${activeJobCount} active job${activeJobCount !== 1 ? "s" : ""}`}
                    style={{
                      fontSize:     "9px",
                      fontFamily:   "var(--font-mono)",
                      background:   "var(--ink-blue-bg, var(--ink-amber-bg))",
                      color:        "var(--ink-blue, var(--ink-amber))",
                      border:       "0.5px solid var(--ink-blue-border, var(--ink-amber-border))",
                      borderRadius: "3px",
                      padding:      "1px 5px",
                      lineHeight:   1,
                    }}
                  >
                    {activeJobCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        <div
          style={{
            padding: "0 1.25rem 0.75rem",
            borderTop: "0.5px solid var(--ink-border-faint)",
            marginTop: "0.5rem",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-text-4)",
              marginBottom: "0.35rem",
            }}
          >
            {UI_COPY.sourceTruthTitle}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
              lineHeight: 1.5,
            }}
          >
            {UI_COPY.sourceTruthBody}{" "}
            {workflowsHref ? (
              <a
                href={workflowsHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--ink-blue)" }}
              >
                {UI_COPY.sourceTruthDocLink}
              </a>
            ) : (
              <code style={{ fontSize: "9px", color: "var(--ink-text-3)" }}>
                {UI_COPY.sourceTruthDocPath}
              </code>
            )}
          </p>
        </div>

        {/* Engine footer */}
        <div style={{ padding: "0 1.25rem" }}>
          {syncMsg && (
            <div
              style={{
                fontSize:     "11px",
                color:        syncMsg.includes("✓") || syncMsg.startsWith("✓") ? "var(--ink-green)" : "var(--ink-red)",
                marginBottom: "0.375rem",
                fontFamily:   "var(--font-mono)",
              }}
            >
              {syncMsg}
            </div>
          )}
          {engineStatusError && (
            <div
              style={{
                fontSize:     "10px",
                fontFamily:   "var(--font-mono)",
                color:        "var(--ink-amber)",
                marginBottom: "0.5rem",
                lineHeight:   1.45,
              }}
            >
              <span>{engineStatusError}</span>
              {" "}
              <button
                type="button"
                onClick={() => void fetchStatus()}
                style={{
                  fontSize:       "10px",
                  border:         "none",
                  background:     "none",
                  color:          "inherit",
                  cursor:         "pointer",
                  textDecoration: "underline",
                  padding:        0,
                }}
              >
                Retry
              </button>
            </div>
          )}
          {engineStatus && (
            <div
              style={{
                fontSize:     "11px",
                color:        "var(--ink-text-4)",
                fontFamily:   "var(--font-mono)",
                marginBottom: "0.375rem",
                lineHeight:   1.5,
              }}
            >
              <span>{engineStatus.audit_run_count} audits</span>
              {" · "}
              <span>{engineStatus.repair_run_count} repairs</span>
              {queueSize > 0 && (
                <span style={{ color: "var(--ink-amber)" }} title={UI_COPY.navLedgerCountTitle}>
                  {" · "}{queueSize} queued
                </span>
              )}
              <br />
              <span>Last: {fmtDate(engineStatus.last_audit_date)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            title={UI_COPY.syncAuditImportTitle}
            style={{
              fontSize:   "11px",
              fontFamily: "var(--font-mono)",
              border:     "none",
              background: "transparent",
              padding:    "0",
              color:      syncing ? "var(--ink-text-4)" : "var(--ink-text-3)",
              cursor:     syncing ? "default" : "pointer",
            }}
          >
            {syncing ? "importing…" : UI_COPY.syncAuditImportLabel}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main
        className="shell-main"
        style={{
          flex:     1,
          minWidth: 0,
          padding:  "2.5rem 3rem",
          maxWidth: "calc(var(--content-max) + 6rem)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
