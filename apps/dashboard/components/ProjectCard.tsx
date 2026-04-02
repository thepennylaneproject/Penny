import type { Project } from "@/lib/types";
import { ProgressBar } from "./ProgressBar";
import { STATUS_GROUPS } from "@/lib/constants";
import { sortMaintenanceBacklog } from "@/lib/resolve-next-action";
import { BACKLOG_NEXT_STEP_LABEL } from "@/lib/ui-copy";

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const findings  = project.findings ?? [];
  const backlog = project.maintenanceBacklog ?? [];
  const openBacklog = sortMaintenanceBacklog(
    backlog.filter((item) => !["done", "deferred"].includes(item.canonical_status))
  );
  const topBacklog = openBacklog[0];
  const active    = findings.filter((f) => STATUS_GROUPS.active.includes(f.status));
  const pending   = findings.filter((f) => STATUS_GROUPS.pending.includes(f.status));
  const resolved  = findings.filter((f) => STATUS_GROUPS.resolved.includes(f.status));
  const blockers  = active.filter((f) => f.severity === "blocker").length;
  const questions = active.filter((f) => f.type === "question").length;
  const canShip   = blockers === 0 && questions === 0 && pending.length === 0 && findings.length > 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background:   "var(--ink-bg-raised)",
        border:       "0.5px solid var(--ink-border-faint)",
        borderRadius: "var(--radius-lg)",
        padding:      "1rem 1.25rem",
        cursor:       "pointer",
        transition:   "border-color 0.12s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--ink-border)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--ink-border-faint)";
      }}
    >
      {/* Header */}
      <div
        style={{
          display:       "flex",
          justifyContent: "space-between",
          alignItems:    "center",
          marginBottom:  findings.length > 0 ? "0.75rem" : 0,
        }}
      >
        <span
          style={{
            fontWeight: 500,
            fontSize:   "13px",
            color:      "var(--ink-text)",
          }}
        >
          {project.name}
        </span>
        {project.repositoryUrl && (
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
            repo
          </span>
        )}
        {(project.status ?? "active") === "draft" && (
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-blue)" }}>
            draft
          </span>
        )}
        {canShip && (
          <span
            style={{
              fontSize:   "10px",
              fontFamily: "var(--font-mono)",
              color:      "var(--ink-green)",
              letterSpacing: "0.03em",
            }}
          >
            ✓ ship
          </span>
        )}
        {blockers > 0 && (
          <span
            style={{
              fontSize:   "10px",
              fontFamily: "var(--font-mono)",
              color:      "var(--ink-red)",
            }}
          >
            {blockers} blocker{blockers > 1 ? "s" : ""}
          </span>
        )}
        {findings.length === 0 && (
          <span
            style={{
              fontSize:   "10px",
              fontFamily: "var(--font-mono)",
              color:      "var(--ink-text-4)",
            }}
          >
            no data
          </span>
        )}
      </div>

      {findings.length > 0 && (
        <>
          <ProgressBar
            value={resolved.length}
            max={findings.length}
            segments={[
              { value: active.length,   color: "var(--ink-amber)" },
              { value: pending.length,  color: "var(--ink-blue)" },
              { value: resolved.length, color: "var(--ink-green)" },
            ]}
          />
          <div
            style={{
              display:       "flex",
              justifyContent: "space-between",
              marginTop:     "0.375rem",
              fontSize:      "10px",
              fontFamily:    "var(--font-mono)",
              color:         "var(--ink-text-4)",
            }}
          >
            <span>{active.length} active</span>
            <span>{resolved.length}/{findings.length} resolved</span>
          </div>
          {backlog.length > 0 && (
            <div
              style={{
                marginTop: "0.35rem",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-4)",
                lineHeight: 1.4,
              }}
            >
              <div>
                {backlog.length} backlog item{backlog.length === 1 ? "" : "s"}
              </div>
              {topBacklog ? (
                <div style={{ marginTop: "0.25rem", color: "var(--ink-text-3)" }}>
                  <span style={{ color: "var(--ink-text-4)" }}>Top:</span>{" "}
                  {(topBacklog.title ?? "").slice(0, 72)}
                  {(topBacklog.title ?? "").length > 72 ? "…" : ""}
                  <span style={{ color: "var(--ink-text-4)" }}>
                    {" "}
                    · {BACKLOG_NEXT_STEP_LABEL[topBacklog.next_action] ?? topBacklog.next_action}
                    {topBacklog.risk_class ? ` · risk ${topBacklog.risk_class}` : ""}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
