"use client";

import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { Project, Finding, FindingStatus } from "@/lib/types";
import { Badge } from "./Badge";
import { MetricCard } from "./MetricCard";
import { ProgressBar } from "./ProgressBar";
import { EmptyState } from "./EmptyState";
import { FindingRow } from "./FindingRow";
import { FindingDetail } from "./FindingDetail";
import { LinearSync } from "./LinearSync";
import { ProjectAuditHistory } from "./ProjectAuditHistory";
import { LanePanel } from "./LanePanel";
import { OnboardingReviewPanel } from "./OnboardingReviewPanel";
import { MaintenancePanel } from "./MaintenancePanel";
import { BulkActionsPanel } from "./BulkActionsPanel";
import { ProjectManagementPanel } from "./ProjectManagementPanel";
import { ProjectRepairConfig } from "./ProjectRepairConfig";
import { RepairCostEstimator } from "./RepairCostEstimator";
import { useRepairCosts } from "@/hooks/use-repair-costs";
import { STATUS_GROUPS, sortFindings } from "@/lib/constants";
import { UI_COPY } from "@/lib/ui-copy";

type FilterKey = "active" | "pending" | "resolved" | "all";

type ProjectTab = "findings" | "operations";

const FILTER_LABELS: Record<FilterKey, string> = {
  active: "active",
  pending: "pending verification",
  resolved: "resolved",
  all: "all",
};

export type RefetchProjectResult = {
  project: Project | null;
  refreshError: string | null;
};

interface ProjectViewProps {
  project:           Project;
  onBack:            () => void;
  onUpdateFinding:   (projectName: string, findingId: string, status: FindingStatus) => Promise<void>;
  refetchProject:    () => Promise<RefetchProjectResult>;
  onQueueRepair?:    (findingId: string, projectName: string) => Promise<void>;
  queuedFindingIds?: Set<string>;
  initialFindingId?: string;
}

const tabButtonStyle = (active: boolean): CSSProperties => ({
  fontSize:    "11px",
  fontFamily:  "var(--font-mono)",
  padding:     "4px 10px",
  background:  active ? "var(--ink-bg-raised)" : "transparent",
  border:      active ? "0.5px solid var(--ink-border)" : "0.5px solid transparent",
  fontWeight:  active ? 500 : 400,
  color:       active ? "var(--ink-text)" : "var(--ink-text-4)",
  borderRadius: "var(--radius-md)",
  cursor:      "pointer",
});

export function ProjectView({
  project,
  onBack,
  onUpdateFinding,
  refetchProject,
  onQueueRepair,
  queuedFindingIds,
  initialFindingId,
}: ProjectViewProps) {
  const showOnboarding =
    (project.status ?? "active") === "draft" ||
    Boolean(project.onboardingState?.reviewRequired);
  const [opsHydrated, setOpsHydrated] = useState({
    bulk: false,
    linear: false,
    history: false,
    repair: false,
    repairConfig: false,
  });
  const [tab, setTab] = useState<ProjectTab>("findings");
  const filterStorageKey = `penny_pv_filter_${project.name}`;
  const searchStorageKey = `penny_pv_search_${project.name}`;
  const [filter, setFilterState] = useState<FilterKey>(() => {
    try {
      const saved = sessionStorage.getItem(filterStorageKey);
      if (saved && ["active", "pending", "resolved", "all"].includes(saved)) return saved as FilterKey;
    } catch { /* ignore */ }
    return "active";
  });
  const [search, setSearchState] = useState(() => {
    try { return sessionStorage.getItem(searchStorageKey) ?? ""; }
    catch { return ""; }
  });
  const setFilter = (v: FilterKey) => {
    setFilterState(v);
    try { sessionStorage.setItem(filterStorageKey, v); } catch { /* ignore */ }
  };
  const setSearch = (v: string) => {
    setSearchState(v);
    try {
      if (v) sessionStorage.setItem(searchStorageKey, v);
      else sessionStorage.removeItem(searchStorageKey);
    } catch { /* ignore */ }
  };
  const [selected, setSelected] = useState<Finding | null>(null);
  const [findings, setFindings] = useState<Finding[]>(project.findings ?? []);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Set to server error detail when save succeeded but refetch failed */
  const [refreshAfterSaveError, setRefreshAfterSaveError] = useState<string | null>(null);
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [batchQueuing, setBatchQueuing] = useState(false);
  const [batchQueueResult, setBatchQueueResult] = useState<string | null>(null);
  const [repairConfigSaving, setRepairConfigSaving] = useState(false);
  const batchResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFindings(project.findings ?? []);
  }, [project.name, project.findings]);

  // Auto-select a finding when navigated here via deep-link (e.g. NextActionCard "Open").
  // Only runs once when findings first load; user can close the drawer normally after.
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (!initialFindingId || didAutoSelect.current || findings.length === 0) return;
    const target = findings.find((f) => f.finding_id === initialFindingId);
    if (target) {
      didAutoSelect.current = true;
      setSelected(target);
      // Switch to findings tab in case it isn't already active
      setTab("findings");
      // Switch filter to "all" if the finding wouldn't be visible under the current filter
      setFilter("all");
    }
  }, [initialFindingId, findings]);

  // Fetch repair costs for this project
  const { costs: repairCosts, totalCost } = useRepairCosts(project.name, {
    enabled: opsHydrated.repair,
  });

  const filtered = sortFindings(
    findings.filter((f) => {
      const statusMatch  = filter === "all" || (STATUS_GROUPS[filter] ?? []).includes(f.status);
      const searchLower  = search.toLowerCase();
      const searchMatch  = !search
        || f.title?.toLowerCase().includes(searchLower)
        || f.finding_id?.toLowerCase().includes(searchLower)
        || (f.category?.toLowerCase().includes(searchLower) ?? false);
      return statusMatch && searchMatch;
    })
  );

  const counts = {
    active:   findings.filter((f) => STATUS_GROUPS.active.includes(f.status)).length,
    pending:  findings.filter((f) => STATUS_GROUPS.pending.includes(f.status)).length,
    resolved: findings.filter((f) => STATUS_GROUPS.resolved.includes(f.status)).length,
  };
  const blockers  = findings.filter((f) => f.severity === "blocker" && STATUS_GROUPS.active.includes(f.status)).length;
  const questions = findings.filter((f) => f.type === "question" && STATUS_GROUPS.active.includes(f.status)).length;
  const resolved  = counts.resolved;
  const total     = findings.length;
  const canShip   = blockers === 0 && questions === 0 && counts.pending === 0;

  const handleAction = useCallback(
    async (findingId: string, newStatus: FindingStatus) => {
      setActionError(null);
      setRefreshAfterSaveError(null);
      try {
        await onUpdateFinding(project.name, findingId, newStatus);
        setFindings((prev) =>
          prev.map((f) => (f.finding_id === findingId ? { ...f, status: newStatus } : f))
        );
        setSelected((prev) =>
          prev?.finding_id === findingId ? { ...prev, status: newStatus } : prev
        );
        const { project: refreshed, refreshError } = await refetchProject();
        if (refreshed) {
          setFindings(refreshed.findings ?? []);
          const f = refreshed.findings?.find((x) => x.finding_id === findingId);
          if (f) setSelected(f);
        } else if (refreshError) {
          setRefreshAfterSaveError(refreshError);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Could not update finding. Check connection and try again.";
        setActionError(msg);
      }
    },
    [project.name, onUpdateFinding, refetchProject]
  );

  const handleToggleSelect = useCallback((findingId: string, checked: boolean) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(findingId);
      else next.delete(findingId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedFindingIds((prev) => {
      const allIds = filtered.map((f) => f.finding_id);
      if (allIds.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, [filtered]);

  const handleBatchQueueRepair = useCallback(async () => {
    if (selectedFindingIds.size === 0 || batchQueuing) return;
    setBatchQueuing(true);
    setBatchQueueResult(null);
    try {
      const res = await apiFetch("/api/bulk-operations/repair-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: project.name,
          finding_ids: Array.from(selectedFindingIds),
          priority: "normal",
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? `Failed (${res.status})`));
      setSelectedFindingIds(new Set());
      const msg = String(data.message ?? `Queued ${String(data.queued_count)} finding(s) for repair.`);
      setBatchQueueResult(msg);
      if (batchResultTimer.current) clearTimeout(batchResultTimer.current);
      batchResultTimer.current = setTimeout(() => setBatchQueueResult(null), 4000);
    } catch (err) {
      setBatchQueueResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      if (batchResultTimer.current) clearTimeout(batchResultTimer.current);
      batchResultTimer.current = setTimeout(() => setBatchQueueResult(null), 6000);
    } finally {
      setBatchQueuing(false);
    }
  }, [selectedFindingIds, batchQueuing, project.name]);

  const selectedFinding =
    selected && (findings.find((f) => f.finding_id === selected.finding_id) ?? selected);

  const tabItems: { id: ProjectTab; label: string }[] = [
    { id: "findings", label: "Findings" },
    { id: "operations", label: "Project workflow" },
  ];

  return (
    <div>
      {/* Back + project header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={onBack}
          style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "3px 10px" }}
        >
          ← portfolio
        </button>
        <h2 style={{ fontSize: "17px", fontWeight: 500, margin: 0, color: "var(--ink-text)" }}>
          {project.name}
        </h2>
        {project.repositoryUrl && (
          <a
            href={project.repositoryUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}
          >
            repo
          </a>
        )}
        {(project.status ?? "active") === "draft" && (
          <Badge color="minor">draft</Badge>
        )}
        {canShip && (
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-green)" }} title="No blockers or open questions. Ready to deploy.">
            ✓ ready to deploy
          </span>
        )}
        {!canShip && blockers > 0 && (
          <Badge color="blocker">{blockers} blocker{blockers > 1 ? "s" : ""}</Badge>
        )}
        <span style={{ marginLeft: "auto" }} />
        <a
          href={`/api/projects/${encodeURIComponent(project.name)}/export-findings`}
          download
          title={UI_COPY.exportOpenFindingsTitle}
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            textDecoration: "none",
            borderBottom: "0.5px solid var(--ink-border-faint)",
            paddingBottom: "1px",
          }}
        >
          {UI_COPY.exportOpenFindingsJson}
        </a>
      </div>

      <div
        role="tablist"
        aria-label="Project sections"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.25rem",
          marginBottom: "1.5rem",
          borderBottom: "0.5px solid var(--ink-border-faint)",
          paddingBottom: "0.75rem",
        }}
      >
        {tabItems.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={tabButtonStyle(tab === id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "operations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <LanePanel projectName={project.name} repositoryUrl={project.repositoryUrl} />

          {/* ── Project management ──────────────────────────────── */}
          <details
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              Project management
            </summary>
            <div style={{ marginTop: "1rem" }}>
              <ProjectManagementPanel
                project={project}
                onDeleted={onBack}
                onUpdated={async () => { await refetchProject(); }}
              />
            </div>
          </details>

          <details
            open={showOnboarding}
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              {UI_COPY.opsSectionSetup}
            </summary>
            <div style={{ marginTop: "1rem" }}>
              {showOnboarding ? (
                <OnboardingReviewPanel
                  project={project}
                  onUpdated={async () => {
                    await refetchProject();
                  }}
                />
              ) : (
                <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0 }}>
                  No setup review required for this project.
                </p>
              )}
            </div>
          </details>

          <details
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setOpsHydrated((s) => ({ ...s, bulk: true }));
              }
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              {UI_COPY.opsSectionBulk}
            </summary>
            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {opsHydrated.bulk ? (
                <>
                  <BulkActionsPanel
                    activeProject={project.name}
                    onActionComplete={() => {
                      void refetchProject();
                    }}
                  />
                  <MaintenancePanel projectName={project.name} />
                </>
              ) : (
                <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0 }}>
                  Expand to load bulk tools and backlog.
                </p>
              )}
            </div>
          </details>

          <details
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setOpsHydrated((s) => ({ ...s, linear: true }));
              }
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              {UI_COPY.opsSectionLinear}
            </summary>
            <div style={{ marginTop: "1rem" }}>
              {opsHydrated.linear ? (
                <LinearSync
                  projectName={project.name}
                  onRefresh={async () => { await refetchProject(); }}
                />
              ) : (
                <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0 }}>
                  Expand to load Linear sync.
                </p>
              )}
            </div>
          </details>

          <details
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setOpsHydrated((s) => ({ ...s, history: true }));
              }
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              {UI_COPY.opsSectionHistory}
            </summary>
            <div style={{ marginTop: "1rem" }}>
              {opsHydrated.history ? (
                <ProjectAuditHistory projectName={project.name} projectStatus={project.status} />
              ) : (
                <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0 }}>
                  Expand to load audit run history.
                </p>
              )}
            </div>
          </details>

          <details
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setOpsHydrated((s) => ({ ...s, repair: true }));
              }
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              Repair cost summary
            </summary>
            <div style={{ marginTop: "1rem" }}>
              {opsHydrated.repair ? (
                <RepairCostEstimator
                  costs={repairCosts}
                  jobCount={repairCosts.length}
                  averageConfidence={undefined}
                />
              ) : (
                <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0 }}>
                  Expand to load repair cost dashboard.
                </p>
              )}
            </div>
          </details>

          <details
            style={{
              border: "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding: "0.5rem 0.75rem",
              background: "var(--ink-bg-sunken)",
            }}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setOpsHydrated((s) => ({ ...s, repairConfig: true }));
              }
            }}
          >
            <summary
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-3)",
                cursor: "pointer",
              }}
            >
              Repair defaults
            </summary>
            <div style={{ marginTop: "1rem" }}>
              {opsHydrated.repairConfig ? (
                <ProjectRepairConfig
                  projectName={project.name}
                  settings={project.repairConfig}
                  isLoading={repairConfigSaving}
                  onSave={async (settings) => {
                    setRepairConfigSaving(true);
                    try {
                      const res = await apiFetch(
                        `/api/projects/${encodeURIComponent(project.name)}`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ repairConfig: settings }),
                        }
                      );
                      if (!res.ok) {
                        const body = (await res.json().catch(() => ({}))) as { error?: string };
                        throw new Error(body.error ?? `Could not save repair settings (${res.status}).`);
                      }
                      const updated = (await res.json()) as Project;
                      setFindings(updated.findings ?? []);
                      await refetchProject();
                    } finally {
                      setRepairConfigSaving(false);
                    }
                  }}
                />
              ) : (
                <p style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0 }}>
                  Expand to load repair configuration.
                </p>
              )}
            </div>
          </details>
        </div>
      )}

      {tab === "findings" && (
        <>
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
              gap:                 "0 2rem",
              marginBottom:        "1.5rem",
              borderBottom:        "0.5px solid var(--ink-border-faint)",
              paddingBottom:       "1.25rem",
            }}
          >
            <MetricCard label="Total"         value={total} />
            <MetricCard label="Active"        value={counts.active}  accent={counts.active  > 0 ? "var(--ink-amber)" : undefined} />
            <MetricCard label="Pending verification" value={counts.pending} />
            <MetricCard label="Resolved"      value={resolved}       accent={resolved > 0 ? "var(--ink-green)" : undefined} />
            <MetricCard label="Blockers"      value={blockers}       accent={blockers > 0 ? "var(--ink-red)"   : undefined} />
            <MetricCard label="Questions"     value={questions}      accent={questions > 0 ? "var(--ink-blue)" : undefined} />
            {project.manifest && <MetricCard label="Manifest modules" value={project.manifest.modules.length} />}
          </div>

          {project.manifest && (
            <div
              style={{
                marginBottom: "1rem",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-4)",
                lineHeight: 1.45,
              }}
            >
              Coverage map: {project.manifest.domains.length} domains, revision {project.manifest.revision.slice(0, 8)}.
            </div>
          )}

          <div style={{ marginBottom: "0.375rem" }}>
            <ProgressBar
              value={resolved}
              max={total}
              segments={[
                { value: counts.active,   color: "var(--ink-amber)" },
                { value: counts.pending,  color: "var(--ink-blue)" },
                { value: resolved,        color: "var(--ink-green)" },
              ]}
            />
          </div>
          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", marginBottom: "1.5rem" }}>
            {resolved} of {total} resolved
          </div>

          {actionError && (
            <div
              role="alert"
              style={{
                marginBottom: "1rem",
                padding: "0.65rem 0.85rem",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-red)",
                background: "var(--ink-bg-sunken)",
                border: "0.5px solid var(--ink-border-faint)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                aria-label="Dismiss"
                style={{ flexShrink: 0, border: "none", background: "transparent", color: "var(--ink-text-4)", cursor: "pointer", padding: "0 4px" }}
              >
                ×
              </button>
            </div>
          )}

          {refreshAfterSaveError !== null && (
            <div
              role="status"
              style={{
                marginBottom: "1rem",
                padding: "0.65rem 0.85rem",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-amber)",
                background: "var(--ink-bg-sunken)",
                border: "0.5px solid var(--ink-border-faint)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <div style={{ lineHeight: 1.5 }}>
                <div style={{ color: "var(--ink-text-2)", marginBottom: "0.35rem" }}>
                  {UI_COPY.findingSavedLine}
                </div>
                <div>
                  {UI_COPY.findingRefreshFailedLine}{" "}
                  <span style={{ color: "var(--ink-text-3)" }}>{refreshAfterSaveError}</span>
                </div>
                <div style={{ marginTop: "0.35rem", color: "var(--ink-text-4)" }}>
                  {UI_COPY.findingRefreshFailedHint}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => void refetchProject().then(({ project: p, refreshError }) => {
                    if (p) {
                      setFindings(p.findings ?? []);
                      setRefreshAfterSaveError(null);
                    } else if (refreshError) {
                      setRefreshAfterSaveError(refreshError);
                    }
                  })}
                  style={{ fontSize: "11px", border: "none", background: "none", color: "inherit", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setRefreshAfterSaveError(null)}
                  aria-label="Dismiss"
                  style={{ border: "none", background: "transparent", color: "var(--ink-text-4)", cursor: "pointer", padding: "0 4px" }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className="project-findings-split">
            <div>
              <div
                style={{
                  display:     "flex",
                  gap:         "0.25rem",
                  marginBottom: "0.75rem",
                  flexWrap:    "wrap",
                  alignItems:  "center",
                  borderBottom: "0.5px solid var(--ink-border-faint)",
                  paddingBottom: "0.75rem",
                }}
              >
                {(["active", "pending", "resolved", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    style={{
                      fontSize:    "11px",
                      fontFamily:  "var(--font-mono)",
                      padding:     "2px 8px",
                      background:  filter === f ? "var(--ink-bg-raised)" : "transparent",
                      border:      filter === f ? "0.5px solid var(--ink-border)" : "0.5px solid transparent",
                      fontWeight:  filter === f ? 500 : 400,
                      color:       filter === f ? "var(--ink-text)" : "var(--ink-text-4)",
                    }}
                  >
                    {FILTER_LABELS[f]}{f !== "all" && ` (${counts[f] ?? 0})`}
                  </button>
                ))}
                <input
                  type="text"
                  placeholder="search findings…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search findings"
                  style={{
                    marginLeft:  "auto",
                    fontSize:    "11px",
                    fontFamily:  "var(--font-mono)",
                    width:       "160px",
                    maxWidth:    "100%",
                    padding:     "3px 8px",
                  }}
                />
              </div>

              {/* Batch action bar */}
              {filtered.length > 0 && (
                <div
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          "0.5rem",
                    marginBottom: "0.5rem",
                    minHeight:    "26px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((f) => selectedFindingIds.has(f.finding_id))}
                    ref={(el) => {
                      if (el) {
                        const someSelected = filtered.some((f) => selectedFindingIds.has(f.finding_id));
                        const allSelected  = filtered.every((f) => selectedFindingIds.has(f.finding_id));
                        el.indeterminate = someSelected && !allSelected;
                      }
                    }}
                    onChange={handleSelectAll}
                    aria-label="Select all visible findings"
                    style={{ cursor: "pointer", accentColor: "var(--ink-text-2)" }}
                  />
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
                    {selectedFindingIds.size > 0 ? `${selectedFindingIds.size} selected` : "select all"}
                  </span>
                  {selectedFindingIds.size > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleBatchQueueRepair()}
                        disabled={batchQueuing}
                        style={{
                          fontSize:        "10px",
                          fontFamily:      "var(--font-mono)",
                          padding:         "2px 10px",
                          background:      "var(--ink-bg-raised)",
                          border:          "0.5px solid var(--ink-border)",
                          borderRadius:    "var(--radius-md)",
                          cursor:          batchQueuing ? "not-allowed" : "pointer",
                          color:           "var(--ink-text)",
                          opacity:         batchQueuing ? 0.6 : 1,
                        }}
                      >
                        {batchQueuing ? "queuing…" : `queue ${selectedFindingIds.size} for repair`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFindingIds(new Set())}
                        style={{
                          fontSize:     "10px",
                          fontFamily:   "var(--font-mono)",
                          padding:      "2px 6px",
                          background:   "transparent",
                          border:       "none",
                          cursor:       "pointer",
                          color:        "var(--ink-text-4)",
                        }}
                      >
                        clear
                      </button>
                    </>
                  )}
                  {batchQueueResult && (
                    <span
                      style={{
                        fontSize:   "10px",
                        fontFamily: "var(--font-mono)",
                        color:      batchQueueResult.startsWith("Error") ? "var(--ink-red)" : "var(--ink-green)",
                        marginLeft: "0.25rem",
                      }}
                    >
                      {batchQueueResult}
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {filtered.length === 0 && (
                  <EmptyState
                    icon={
                      total === 0 ? "◆" :
                      filter === "active" && resolved === total ? "✓" :
                      "→"
                    }
                    title={
                      total === 0
                        ? "No findings. Run Lane to discover issues."
                        : filter === "active" && resolved === total
                        ? "All findings resolved. Ready to deploy."
                        : filter === "active"
                        ? "No active findings"
                        : "No findings match this filter"
                    }
                    action={
                      total === 0 ? (
                        <button
                          type="button"
                          onClick={() => setTab("operations")}
                          style={{
                            fontSize:   "11px",
                            fontFamily: "var(--font-mono)",
                            padding:    "5px 14px",
                          }}
                        >
                          Go to project workflow →
                        </button>
                      ) : undefined
                    }
                  />
                )}
                {filtered.map((f) => (
                  <FindingRow
                    key={f.finding_id}
                    finding={f}
                    onClick={() => setSelected(f)}
                    selected={selectedFindingIds.has(f.finding_id)}
                    onSelect={handleToggleSelect}
                  />
                ))}
              </div>
            </div>

            <div className="project-findings-split-detail">
              {selectedFinding ? (
                <FindingDetail
                  finding={selectedFinding}
                  projectName={project.name}
                  projectRepositoryUrl={project.repositoryUrl}
                  onClose={() => setSelected(null)}
                  onAction={handleAction}
                  onQueueRepair={onQueueRepair}
                  queuedFindingIds={queuedFindingIds}
                />
              ) : (
                <div
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-text-4)",
                    lineHeight: 1.5,
                    padding: "1rem 0",
                  }}
                >
                  Select a finding from the list to review details and actions.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
