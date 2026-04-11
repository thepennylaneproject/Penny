"use client";

/**
 * FindingStatusFlow — UI for status transition controls.
 *
 * Shows valid next states for the current finding status.
 * Prevents invalid transitions by hiding or disabling unavailable actions.
 */

import type { FindingStatus } from "@/lib/types";
import {
  STATUS_TRANSITIONS,
  TRANSITION_LABELS,
  STATUS_GUIDANCE,
} from "@/lib/finding-status-machine";

interface FindingStatusFlowProps {
  currentStatus: FindingStatus;
  onStatusChange: (newStatus: FindingStatus) => Promise<void>;
  isLoading?: boolean;
}

export function FindingStatusFlow({
  currentStatus,
  onStatusChange,
  isLoading = false,
}: FindingStatusFlowProps) {
  const nextStatuses = STATUS_TRANSITIONS[currentStatus];
  const guidance = STATUS_GUIDANCE[currentStatus];

  if (nextStatuses.length === 0) {
    return (
      <div
        style={{
          padding: "1rem",
          borderRadius: "var(--radius-md)",
          background: "var(--ink-bg-sunken)",
          borderLeft: "2px solid var(--ink-border)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--ink-text-3)",
            marginBottom: "0.5rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Status
        </div>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--ink-text)",
            marginBottom: "0.75rem",
          }}
        >
          {TRANSITION_LABELS[currentStatus]}
        </div>
        <p
          style={{
            fontSize: "12px",
            color: "var(--ink-text-3)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {guidance.description}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: "var(--radius-md)",
        background: "var(--ink-bg-sunken)",
        borderLeft: "2px solid var(--ink-border)",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--ink-text-3)",
          marginBottom: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Move to
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
        {nextStatuses.map((nextStatus) => (
          <button
            key={nextStatus}
            type="button"
            onClick={() => void onStatusChange(nextStatus)}
            disabled={isLoading}
            style={{
              padding: "0.6rem 0.8rem",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--ink-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--ink-bg)",
              color: "var(--ink-text)",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
              transition: "all 150ms ease-out",
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                (e.target as HTMLButtonElement).style.borderColor = "var(--ink-text-2)";
                (e.target as HTMLButtonElement).style.background = "var(--ink-bg-raised)";
              }
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.borderColor = "var(--ink-border)";
              (e.target as HTMLButtonElement).style.background = "var(--ink-bg)";
            }}
          >
            {TRANSITION_LABELS[nextStatus]}
          </button>
        ))}
      </div>
      <p
        style={{
          fontSize: "12px",
          color: "var(--ink-text-4)",
          lineHeight: 1.5,
          marginTop: "0.75rem",
          marginBottom: 0,
        }}
      >
        {guidance.description}
      </p>
    </div>
  );
}
