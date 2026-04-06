"use client";

/**
 * UndoNotification — displays undo prompt with countdown.
 *
 * Shows when a destructive action is performed, allowing user to undo
 * within the 5-second window before the action is committed.
 */

import { useEffect, useState } from "react";
import { useUndo } from "@/contexts/UndoContext";
import { getUndoLabel, formatUndoTime } from "@/lib/undo-machine";

export function UndoNotification() {
  const { undoState, canUndo, remainingTime } = useUndo();
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    setDisplayTime(remainingTime);
  }, [remainingTime]);

  if (!undoState || !canUndo) {
    return null;
  }

  const label = getUndoLabel(undoState.action, undoState.data);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "1.5rem",
        maxWidth: "320px",
        padding: "1rem",
        borderRadius: "var(--radius-md)",
        background: "var(--ink-text)",
        color: "var(--ink-bg)",
        fontSize: "13px",
        fontFamily: "var(--font-mono)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        animation: "slideInUp 200ms ease-out",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        zIndex: 1000,
      }}
    >
      <div style={{ flex: "1 1 auto" }}>
        <div style={{ marginBottom: "0.25rem" }}>{label}</div>
        <div style={{ fontSize: "11px", opacity: 0.8 }}>
          Undo in {formatUndoTime(displayTime)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Undo action is handled by parent component
          // This button should trigger the undo handler
        }}
        style={{
          padding: "0.4rem 0.75rem",
          borderRadius: "var(--radius-sm)",
          background: "var(--ink-bg)",
          color: "var(--ink-text)",
          border: "none",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "opacity 150ms ease-out",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.opacity = "0.8";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.opacity = "1";
        }}
      >
        Undo
      </button>
    </div>
  );
}
