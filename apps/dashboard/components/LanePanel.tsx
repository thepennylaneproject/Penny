"use client";

import { useState } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { runLaneAudit, type LaneAuditResponse } from "@/lib/lane";
import { isDegradedAuditPlaceholderFinding } from "@/lib/degraded-audit-finding";

interface LanePanelProps {
  projectName: string;
  repositoryUrl?: string;
}

export function LanePanel({
  projectName,
  repositoryUrl,
}: LanePanelProps) {
  const { laneBaseUrl, laneServerConfigured } = useRuntimeConfig();
  const [audit, setAudit] = useState<LaneAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionableFindings = audit?.findings.filter(
    (finding) => !isDegradedAuditPlaceholderFinding(finding)
  ) ?? [];
  const degradedFindingCount = audit ? audit.findings.length - actionableFindings.length : 0;

  const runAudit = async () => {
    if (!repositoryUrl) {
      setError("Add a project repository URL before running Lane.");
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
      setError(err instanceof Error ? err.message : "Lane request failed.");
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
            Lane
          </div>
          <div style={{ fontSize: "12px", color: "var(--ink-text-3)", lineHeight: 1.5 }}>
            Run Lane directly from Penny and keep the findings in Penny&apos;s operator UI.
          </div>
          {!laneBaseUrl ? (
            <div style={{ fontSize: "10px", color: "var(--ink-amber)", lineHeight: 1.5 }}>
              {laneServerConfigured
                ? "Lane is configured server-side, but the dashboard proxy is unavailable."
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
          {loading ? "Running…" : "Run Lane"}
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
          {actionableFindings.length === 0 ? (
            <div style={{ fontSize: "11px", color: degradedFindingCount > 0 ? "var(--ink-amber)" : "var(--ink-text-4)" }}>
              {degradedFindingCount > 0
                ? "Lane returned only a runtime placeholder. Retry when Lane capacity is healthy."
                : "Lane completed without returning findings."}
            </div>
          ) : (
            actionableFindings.map((finding) => (
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
          {degradedFindingCount > 0 && actionableFindings.length > 0 ? (
            <div style={{ fontSize: "10px", color: "var(--ink-amber)" }}>
              Lane dropped {degradedFindingCount} runtime placeholder finding{degradedFindingCount === 1 ? "" : "s"}.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
