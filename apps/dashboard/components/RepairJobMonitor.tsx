"use client";

import { useState, useEffect } from "react";
import { ProgressBar } from "./ProgressBar";

export interface RepairJob {
  repair_job_id: string;
  finding_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked";
  confidence_score?: number;
  confidence_breakdown?: {
    validation: number;
    locality: number;
    risk: number;
    uncertainty_penalty: number;
  };
  action?: string;
  best_score?: number;
  total_candidates_evaluated?: number;
  pr_number?: number;
  pr_url?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface RepairJobMonitorProps {
  job: RepairJob;
  onRefresh?: () => void;
}

const STATUS_BADGE: Record<string, { background: string; color: string }> = {
  queued:      { background: "var(--ink-bg-sunken)", color: "var(--ink-blue)" },
  in_progress: { background: "var(--ink-bg-sunken)", color: "var(--ink-amber)" },
  completed:   { background: "var(--ink-bg-sunken)", color: "var(--ink-green)" },
  failed:      { background: "var(--ink-bg-sunken)", color: "var(--ink-red)" },
  blocked:     { background: "var(--ink-bg-sunken)", color: "var(--ink-text-3)" },
};

const ACTION_LABELS: Record<string, string> = {
  fast_lane_ready_pr: "Fast Lane PR",
  ready_pr:           "Ready PR",
  draft_pr:           "Draft PR",
  candidate_only:     "Candidate",
  do_not_repair:      "Blocked",
};

export function RepairJobMonitor({ job, onRefresh }: RepairJobMonitorProps) {
  const [elapsed, setElapsed] = useState<string>("");

  useEffect(() => {
    const updateElapsed = () => {
      const start = job.started_at
        ? new Date(job.started_at).getTime()
        : new Date(job.created_at).getTime();
      const end = job.completed_at
        ? new Date(job.completed_at).getTime()
        : Date.now();
      const ms = end - start;
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) setElapsed(`${hours}h ${minutes % 60}m`);
      else if (minutes > 0) setElapsed(`${minutes}m ${seconds % 60}s`);
      else setElapsed(`${seconds}s`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [job]);

  const confidencePercent = job.confidence_score ?? 0;
  const statusStyle = STATUS_BADGE[job.status] ?? STATUS_BADGE.blocked;
  const actionLabel = job.action ? ACTION_LABELS[job.action] : null;

  return (
    <div
      style={{
        border:       "0.5px solid var(--ink-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "1rem",
        display:      "flex",
        flexDirection: "column",
        gap:          "1rem",
        fontFamily:   "var(--font-mono)",
      }}
    >
      {/* Header: finding ID + status badges */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink-text)" }}>
            {job.finding_id}
          </div>
          <div style={{ fontSize: "11px", color: "var(--ink-text-4)", marginTop: "0.25rem" }}>
            Job: {job.repair_job_id.slice(0, 8)}…
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              borderRadius: "var(--radius-sm)",
              padding:      "2px 8px",
              fontSize:     "11px",
              fontWeight:   500,
              background:   statusStyle.background,
              color:        statusStyle.color,
              border:       `0.5px solid ${statusStyle.color}`,
            }}
          >
            {job.status === "in_progress" ? "in progress…" : job.status}
          </span>
          {actionLabel ? (
            <span
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                borderRadius: "var(--radius-sm)",
                padding:      "2px 8px",
                fontSize:     "11px",
                fontWeight:   500,
                background:   "var(--ink-bg-sunken)",
                color:        "var(--ink-blue)",
                border:       "0.5px solid var(--ink-blue)",
              }}
            >
              {actionLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* Confidence score + breakdown */}
      {job.confidence_score !== undefined && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", color: "var(--ink-text-3)" }}>Confidence</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-text)" }}>
              {confidencePercent.toFixed(1)}%
            </span>
          </div>
          <ProgressBar value={confidencePercent} max={100} />

          {job.confidence_breakdown && (
            <div
              style={{
                display:             "grid",
                gridTemplateColumns: "1fr 1fr",
                gap:                 "0.5rem",
                marginTop:           "0.25rem",
              }}
            >
              {(
                [
                  ["Validation", job.confidence_breakdown.validation],
                  ["Locality",   job.confidence_breakdown.locality],
                  ["Risk",       job.confidence_breakdown.risk],
                  ["Uncertainty", -job.confidence_breakdown.uncertainty_penalty],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    background:   "var(--ink-bg-sunken)",
                    padding:      "0.5rem",
                    borderRadius: "var(--radius-sm)",
                    border:       "0.5px solid var(--ink-border-faint)",
                  }}
                >
                  <div style={{ fontSize: "10px", color: "var(--ink-text-4)" }}>{label}</div>
                  <div
                    style={{
                      fontSize:   "13px",
                      fontWeight: 600,
                      color:      value < 0 ? "var(--ink-red)" : "var(--ink-text)",
                      marginTop:  "0.15rem",
                    }}
                  >
                    {value < 0 ? "" : ""}{value.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Candidates evaluated */}
      {job.total_candidates_evaluated !== undefined && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: "var(--ink-text-3)" }}>Candidates evaluated</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-text)" }}>
            {job.total_candidates_evaluated}
          </span>
        </div>
      )}

      {/* Best score */}
      {job.best_score !== undefined && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: "var(--ink-text-3)" }}>Best patch score</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-text)" }}>
            {job.best_score.toFixed(1)}%
          </span>
        </div>
      )}

      {/* PR link */}
      {job.pr_url && (
        <div
          style={{
            background:   "var(--ink-bg-sunken)",
            border:       "0.5px solid var(--ink-border)",
            borderRadius: "var(--radius-sm)",
            padding:      "0.5rem 0.75rem",
          }}
        >
          <a
            href={job.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize:       "11px",
              color:          "var(--ink-blue)",
              fontWeight:     500,
              textDecoration: "none",
            }}
          >
            PR #{job.pr_number} → {job.pr_url.split("/").pop()}
          </a>
        </div>
      )}

      {/* Error message */}
      {job.error_message && (
        <div
          style={{
            background:   "var(--ink-bg-sunken)",
            border:       "0.5px solid var(--ink-red)",
            borderRadius: "var(--radius-sm)",
            padding:      "0.5rem 0.75rem",
          }}
        >
          <p style={{ fontSize: "11px", color: "var(--ink-red)", margin: 0 }}>
            {job.error_message}
          </p>
        </div>
      )}

      {/* Elapsed time */}
      <div
        style={{
          paddingTop: "0.5rem",
          borderTop:  "0.5px solid var(--ink-border-faint)",
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--ink-text-4)" }}>Elapsed</span>
        <span style={{ fontSize: "11px", color: "var(--ink-text-3)" }}>{elapsed}</span>
      </div>

      {/* Refresh button */}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          style={{
            width:        "100%",
            padding:      "0.5rem",
            fontSize:     "11px",
            fontFamily:   "var(--font-mono)",
            fontWeight:   500,
            color:        "var(--ink-blue)",
            background:   "var(--ink-bg-sunken)",
            border:       "0.5px solid var(--ink-border-faint)",
            borderRadius: "var(--radius-sm)",
            cursor:       "pointer",
          }}
        >
          Refresh status
        </button>
      )}
    </div>
  );
}
