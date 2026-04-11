"use client";

/**
 * RepairStatusBadge — displays current repair job status with guidance.
 *
 * Shows the current state of a repair operation and provides context
 * about what's happening and what to expect next.
 */

import type { RepairJob } from "@/lib/types";
import {
  REPAIR_STATUS_LABELS,
  REPAIR_STATUS_GUIDANCE,
  REPAIR_STATUS_COLOR,
  estimateTimeRemaining,
} from "@/lib/repair-status-machine";

interface RepairStatusBadgeProps {
  job: RepairJob;
  compact?: boolean;
}

export function RepairStatusBadge({ job, compact = false }: RepairStatusBadgeProps) {
  const status = job.status;
  const guidance = REPAIR_STATUS_GUIDANCE[status];
  const colors = REPAIR_STATUS_COLOR[status];
  const label = REPAIR_STATUS_LABELS[status];

  // Calculate elapsed time
  const now = new Date();
  const startTime = new Date(job.queued_at);
  const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
  const timeRemaining = estimateTimeRemaining(status, elapsedSeconds);

  if (compact) {
    // Compact badge for use in lists/tables
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.35rem 0.6rem",
          borderRadius: "var(--radius-sm)",
          fontSize: "11px",
          fontWeight: 500,
          color: colors.text,
          background: colors.background,
          border: `1px solid ${colors.border}`,
          whiteSpace: "nowrap",
        }}
        title={guidance.description}
      >
        <span style={{ fontSize: "12px" }}>{guidance.icon}</span>
        {label}
      </div>
    );
  }

  // Full status card with guidance
  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: "var(--radius-md)",
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.text,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ fontSize: "24px", flexShrink: 0 }}>{guidance.icon}</div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "0.4rem",
              color: colors.text,
            }}
          >
            {guidance.title}
          </div>
          <p
            style={{
              fontSize: "12px",
              lineHeight: 1.5,
              margin: 0,
              opacity: 0.9,
            }}
          >
            {guidance.description}
          </p>
          {timeRemaining && (
            <p
              style={{
                fontSize: "11px",
                lineHeight: 1.4,
                margin: "0.5rem 0 0",
                opacity: 0.75,
              }}
            >
              Estimated time: {timeRemaining}
            </p>
          )}
          {job.error && (
            <p
              style={{
                fontSize: "11px",
                lineHeight: 1.4,
                margin: "0.5rem 0 0",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-red)",
              }}
            >
              {job.error}
            </p>
          )}
          {job.model_used && (
            <p
              style={{
                fontSize: "11px",
                lineHeight: 1.4,
                margin: "0.5rem 0 0",
                opacity: 0.75,
              }}
            >
              Model: <code style={{ fontSize: "10px" }}>{job.model_used}</code>
            </p>
          )}
          {job.cost_usd && (
            <p
              style={{
                fontSize: "11px",
                lineHeight: 1.4,
                margin: "0.5rem 0 0",
                opacity: 0.75,
              }}
            >
              Cost: ${job.cost_usd.toFixed(4)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
