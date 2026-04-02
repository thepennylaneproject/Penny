"use client";

import { Badge } from "./Badge";
import type { NextActionSource } from "@/lib/resolve-next-action";
import { BACKLOG_NEXT_STEP_LABEL, UI_COPY } from "@/lib/ui-copy";

const SEVERITY_BORDER: Record<string, string> = {
  blocker: "var(--ink-red)",
  major:   "var(--ink-amber)",
  minor:   "var(--ink-blue)",
  nit:     "var(--ink-gray)",
};

const SOURCE_LABEL: Record<NextActionSource, string> = {
  backlog: "From backlog",
  finding: "From findings",
};

interface NextActionCardProps {
  source:      NextActionSource;
  title:       string;
  findingId:   string;
  priority:    string;
  severity:    string;
  projectName: string;
  isQueued:    boolean;
  onQueue:     () => void | Promise<void>;
  onOpen:      () => void;
  queueError?: string | null;
  onDismissQueueError?: () => void;
  /** True while a queue request is in flight */
  queueing?: boolean;
  /** From maintenance backlog row when source is backlog */
  backlogRiskClass?: string;
  backlogNextStepKey?: string;
  backlogSummary?: string;
  /** Hotspot overlap copy; show “View patterns” when `onOpenPatterns` is set */
  fragileHint?: string | null;
  onOpenPatterns?: () => void;
}

export function NextActionCard({
  source,
  title,
  findingId,
  priority,
  severity,
  projectName,
  isQueued,
  onQueue,
  onOpen,
  queueError,
  onDismissQueueError,
  queueing = false,
  backlogRiskClass,
  backlogNextStepKey,
  backlogSummary,
  fragileHint,
  onOpenPatterns,
}: NextActionCardProps) {
  const accentColor = SEVERITY_BORDER[severity] ?? "var(--ink-gray)";

  return (
    <div
      className="animate-fade-in"
      style={{
        borderLeft:     `3px solid ${accentColor}`,
        background:     "var(--ink-bg-raised)",
        borderRadius:   `0 var(--radius-lg) var(--radius-lg) 0`,
        padding:        "1.25rem 1.5rem",
        marginBottom:   "2rem",
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize:      "9px",
          fontFamily:    "var(--font-mono)",
          fontWeight:    500,
          color:         "var(--ink-text-4)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom:  "0.625rem",
        }}
      >
        Next action
      </div>

      <div
        style={{
          fontSize:     "10px",
          fontFamily:   "var(--font-mono)",
          color:        "var(--ink-text-4)",
          marginBottom: "0.5rem",
        }}
      >
        {SOURCE_LABEL[source]}
      </div>

      {(backlogRiskClass || backlogNextStepKey) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.35rem",
            marginBottom: "0.5rem",
            alignItems: "center",
          }}
        >
          {backlogNextStepKey ? (
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                border: "0.5px solid var(--ink-border-faint)",
              }}
            >
              Next: {BACKLOG_NEXT_STEP_LABEL[backlogNextStepKey] ?? backlogNextStepKey}
            </span>
          ) : null}
          {backlogRiskClass ? (
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                border: "0.5px solid var(--ink-border-faint)",
              }}
            >
              Risk: {backlogRiskClass}
            </span>
          ) : null}
        </div>
      )}

      {backlogSummary?.trim() ? (
        <div
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            lineHeight: 1.45,
            marginBottom: "0.6rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {backlogSummary.trim()}
        </div>
      ) : null}

      {fragileHint ? (
        <div
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-amber)",
            lineHeight: 1.45,
            marginBottom: "0.65rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>{fragileHint}</span>
          {onOpenPatterns ? (
            <button
              type="button"
              onClick={onOpenPatterns}
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                padding: "2px 8px",
                border: "0.5px solid var(--ink-border-faint)",
                background: "transparent",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              {UI_COPY.nextActionViewPatterns}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Project + badges */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "0.5rem",
          marginBottom: "0.375rem",
          flexWrap:   "wrap",
        }}
      >
        <span
          style={{
            fontSize:   "12px",
            color:      "var(--ink-text-3)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {projectName}
        </span>
        <Badge color={severity} small>{severity}</Badge>
        <Badge small>{priority}</Badge>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize:   "15px",
          fontWeight: 500,
          color:      "var(--ink-text)",
          lineHeight: 1.4,
          marginBottom: "0.75rem",
        }}
      >
        {title}
      </div>

      {/* Footer row */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap:   "wrap",
          gap:        "0.5rem",
        }}
      >
        <span
          style={{
            fontSize:   "11px",
            color:      "var(--ink-text-4)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {findingId}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              fontSize:    "11px",
              fontFamily:  "var(--font-mono)",
              padding:     "3px 10px",
              border:      "0.5px solid var(--ink-border-faint)",
              background:  "transparent",
              color:       "var(--ink-text-3)",
              cursor:      "pointer",
            }}
          >
            {UI_COPY.nextActionOpenProject}
          </button>

          {!isQueued ? (
            <button
              type="button"
              disabled={queueing}
              onClick={() => {
                void Promise.resolve(onQueue()).catch(() => {
                  /* errors handled via queueError from parent */
                });
              }}
              style={{
                fontSize:    "11px",
                fontFamily:  "var(--font-mono)",
                padding:     "3px 10px",
                borderColor: accentColor,
                color:       queueing ? "var(--ink-text-4)" : accentColor,
                cursor:      queueing ? "default" : "pointer",
                opacity:     queueing ? 0.7 : 1,
              }}
            >
              {queueing ? UI_COPY.ledgerAdding : UI_COPY.addToLedger}
            </button>
          ) : (
            <span
              style={{
                fontSize:   "11px",
                fontFamily: "var(--font-mono)",
                color:      "var(--ink-amber)",
              }}
            >
              {UI_COPY.onLedger}
            </span>
          )}
        </div>
      </div>

      {queueError ? (
        <div
          style={{
            marginTop:    "0.75rem",
            paddingTop:   "0.65rem",
            borderTop:    "0.5px solid var(--ink-border-faint)",
            fontSize:     "11px",
            fontFamily:   "var(--font-mono)",
            color:        "var(--ink-red)",
            lineHeight:   1.45,
            display:      "flex",
            alignItems:   "flex-start",
            gap:          "0.5rem",
            flexWrap:     "wrap",
          }}
        >
          <span style={{ flex: "1 1 auto" }}>{queueError}</span>
          {onDismissQueueError ? (
            <button
              type="button"
              onClick={() => {
                onDismissQueueError();
              }}
              style={{
                fontSize:      "11px",
                border:        "none",
                background:    "none",
                color:         "inherit",
                cursor:        "pointer",
                textDecoration: "underline",
                padding:       0,
              }}
            >
              dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
