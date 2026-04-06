"use client";

import { useState } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { runLaneAudit, type LaneAuditResponse } from "@/lib/lane";

interface LaneAuditPanelProps {
  projectName: string;
  repositoryUrl?: string;
}

export function LaneAuditPanel({
  projectName,
  repositoryUrl,
}: LaneAuditPanelProps) {
  const { laneBaseUrl, laneServerConfigured } = useRuntimeConfig();
  const [audit, setAudit] = useState<LaneAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    if (!repositoryUrl) {
      setError("Add a project repository URL before running a Lane audit.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await runLaneAudit(laneBaseUrl, {
        mode: "audit",
        project_id: projectName,
        project_name: projectName,
        repository: repositoryUrl,
        prompt: `Audit ${projectName} for the highest-confidence bugs, risks, and repair opportunities.`,
      });
      setAudit(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lane audit failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        border: "0.5px solid var(--ink-border-faint)",
        borderRadius: "var(--radius-md)",
        padding: "0.9rem 1rem",
        background: "var(--ink-bg-sunken)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-text-4)",
              marginBottom: "0.25rem",
            }}
          >
            Lane audit
          </div>
          <div style={{ fontSize: "12px", color: "var(--ink-text-3)", lineHeight: 1.5 }}>
            Run Lane directly from Penny and keep the findings in Penny's operator UI.
          </div>
          {!laneBaseUrl ? (
            <div style={{ fontSize: "10px", color: "var(--ink-amber)", lineHeight: 1.5 }}>
              {laneServerConfigured
                ? "A server-only Lane host is configured. Direct browser audits still need NEXT_PUBLIC_LANE_API_BASE_URL."
                : "Lane endpoint unavailable in this environment."}
            </div>
          ) : null}
        </div>
        <span style={{ marginLeft: "auto" }} />
        <button
          type="button"
          onClick={runAudit}
          disabled={loading || !laneBaseUrl}
          style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "0.45rem 0.75rem" }}
        >
          {loading ? "Running…" : "Run Lane audit"}
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: "11px", color: "var(--ink-red)", marginBottom: audit ? "0.75rem" : 0 }}>
          {error}
        </div>
      ) : null}

      {audit ? (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={{ fontSize: "11px", color: "var(--ink-text-3)" }}>
            <strong style={{ color: "var(--ink-text-2)" }}>{audit.summary}</strong>
            {" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{audit.run_id}</span>
          </div>
          {audit.findings.length === 0 ? (
            <div style={{ fontSize: "11px", color: "var(--ink-text-4)" }}>
              Lane completed without returning findings.
            </div>
          ) : (
            audit.findings.map((finding) => (
              <div
                key={finding.id}
                style={{
                  border: "0.5px solid var(--ink-border-faint)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.65rem 0.75rem",
                  background: "var(--ink-bg-raised)",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
                    {finding.id}
                  </span>
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
                    {finding.severity}
                  </span>
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
                    {finding.type}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-text-2)", marginBottom: "0.35rem" }}>
                  {finding.message}
                </div>
                <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
                  {finding.file}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
