"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Project, FindingStatus } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { DashboardLogin } from "@/components/DashboardLogin";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectView } from "@/components/ProjectView";
import { ImportModal } from "@/components/ImportModal";
import { NextActionCard } from "@/components/NextActionCard";
import { PatternPanel } from "@/components/PatternPanel";
import { EngineView } from "@/components/EngineView";
import { JobQueueView } from "@/components/JobQueueView";
import { Shell, type NavView } from "@/components/Shell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { STATUS_GROUPS } from "@/lib/constants";
import { isInQueuedSet } from "@/lib/finding-validation";
import { fragileShortPathSet, overlappingFragileShortPaths } from "@/lib/fragile-files";
import { resolveNextAction } from "@/lib/resolve-next-action";
import { usePortfolioProjects } from "@/hooks/use-portfolio-projects";
import { useEngineQueue } from "@/hooks/use-engine-queue";
import { useQueueRepair } from "@/hooks/use-queue-repair";
import { useSyncUrlToPortfolioState, useSyncPortfolioUrl } from "@/hooks/use-portfolio-url";
import { UI_COPY } from "@/lib/ui-copy";
import type { ImportSummary } from "@/lib/import-summary";

const PATTERN_PANEL_STORAGE_KEY = "penny_portfolio_patterns_open";

export default function Home() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const {
    projects,
    setProjects,
    loading,
    setLoading,
    needsAuth,
    projectsError,
    hostMisconfigured,
    setHostMisconfigured,
    loginHint,
    setLoginHint,
    fetchProjects,
  } = usePortfolioProjects();

  const {
    queuedFindingIds,
    queueError,
    setQueueError,
    fetchQueue,
  } = useEngineQueue();

  const {
    queueRepair,
    runQueueRepair,
    queueActionError,
    setQueueActionError,
    queueing,
  } = useQueueRepair({ fetchQueue });

  const [activeProject,   setActiveProject]     = useState<string | null>(null);
  const [activeView,      setActiveView]        = useState<NavView>("portfolio");
  const [showImport,       setShowImport]        = useState(false);
  const [removeError,      setRemoveError]      = useState<string | null>(null);
  const [pendingRemoveName, setPendingRemoveName] = useState<string | null>(null);
  const [deepLinkWarning,  setDeepLinkWarning]  = useState<string | null>(null);
  const [patternsOpen, setPatternsOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchQueue();
  }, [fetchProjects, fetchQueue]);

  useEffect(() => {
    try {
      setPatternsOpen(sessionStorage.getItem(PATTERN_PANEL_STORAGE_KEY) === "1");
    } catch {
      setPatternsOpen(false);
    }
  }, []);

  const setPatternsOpenPersist = (open: boolean) => {
    setPatternsOpen(open);
    try {
      if (open) sessionStorage.setItem(PATTERN_PANEL_STORAGE_KEY, "1");
      else sessionStorage.removeItem(PATTERN_PANEL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!activeProject) return;
    if (projects.some((p) => p.name === activeProject)) return;
    const missing = activeProject;
    setDeepLinkWarning(`Project “${missing}” was not found. Showing portfolio.`);
    setActiveProject(null);
  }, [loading, activeProject, projects]);

  useSyncUrlToPortfolioState(setActiveProject, setActiveView);
  useSyncPortfolioUrl(activeView, activeProject, pathname, router);

  useEffect(() => {
    if (activeProject) {
      document.title = `${activeProject} — penny`;
    } else if (activeView === "engine") {
      document.title = "Engine — penny";
    } else if (activeView === "jobs") {
      document.title = "Activity — penny";
    } else {
      document.title = "Portfolio — penny";
    }
  }, [activeView, activeProject]);

  const shellNavHighlight: NavView = activeProject ? "portfolio" : activeView;

  const onAuditSynced = useCallback(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const refetchProject = useCallback(async (): Promise<{
    project: Project | null;
    refreshError: string | null;
  }> => {
    if (!activeProject) return { project: null, refreshError: null };
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(activeProject)}`);
      if (!res.ok) {
        return {
          project: null,
          refreshError: `Could not refresh project (${res.status}).`,
        };
      }
      const p = await res.json();
      setProjects((prev) => prev.map((x) => (x.name === activeProject ? p : x)));
      return { project: p, refreshError: null };
    } catch (e) {
      return {
        project: null,
        refreshError:
          e instanceof Error ? e.message : "Network error refreshing project.",
      };
    }
  }, [activeProject, setProjects]);

  const onUpdateFinding = useCallback(
    async (projectName: string, findingId: string, status: FindingStatus) => {
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(projectName)}/findings/${encodeURIComponent(findingId)}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          typeof body.error === "string"
            ? body.error
            : `Could not save status (${res.status}). Try again.`;
        throw new Error(msg);
      }
    },
    []
  );

  const handleImport = useCallback(async (project: Project): Promise<ImportSummary> => {
    // QA-008: Use /api/import which handles both create and update so that
    // re-importing an existing project merges findings instead of returning 409.
    const res = await apiFetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: project.name,
        open_findings: project.findings ?? [],
        repositoryUrl: project.repositoryUrl,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      import_summary?: ImportSummary;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Failed to import project"
      );
    }
    if (!data.import_summary) {
      throw new Error("Import response missing summary");
    }
    await fetchProjects();
    return data.import_summary;
  }, [fetchProjects]);

  const handleOnboardRepository = useCallback(async (input: {
    name?: string;
    repository_url?: string;
    default_branch?: string;
  }) => {
    const res = await apiFetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error ?? "Failed to onboard repository");
    }
    await fetchProjects();
    setShowImport(false);
  }, [fetchProjects]);

  const executeRemoveProject = useCallback(
    async (name: string) => {
      setRemoveError(null);
      try {
        const res = await apiFetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (res.ok) {
          setProjects((prev) => prev.filter((p) => p.name !== name));
          if (activeProject === name) setActiveProject(null);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRemoveError(
          typeof body.error === "string"
            ? body.error
            : `Could not remove project (${res.status}). Try again.`
        );
      } catch (e) {
        setRemoveError(e instanceof Error ? e.message : "Network error while removing project.");
      }
    },
    [activeProject, setProjects]
  );

  const handleExport = useCallback((project: Project) => {
    const data = JSON.stringify({ schema_version: "1.1.0", open_findings: project.findings ?? [] }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${project.name}-open_findings.json`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleNavigate = useCallback((view: NavView) => {
    setActiveView(view);
    setActiveProject(null); // Return to view root when navigating
    setPendingRemoveName(null);
  }, []);

  const nextAction = useMemo(() => resolveNextAction(projects), [projects]);
  const fragilePaths = useMemo(() => fragileShortPathSet(projects), [projects]);
  const nextActionFinding = useMemo(() => {
    if (!nextAction) return undefined;
    const proj = projects.find((p) => p.name === nextAction.projectName);
    return proj?.findings?.find((f) => f.finding_id === nextAction.findingId);
  }, [projects, nextAction]);
  const fragileLabels = useMemo(
    () => overlappingFragileShortPaths(nextActionFinding, fragilePaths, 4),
    [nextActionFinding, fragilePaths]
  );
  const fragileHint =
    fragileLabels.length > 0
      ? `Hotspot overlap — other active findings share: ${fragileLabels.join(", ")}`
      : null;

  if (hostMisconfigured) {
    return (
      <div
        style={{
          minHeight:      "100vh",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "2rem",
          background:     "var(--ink-bg)",
          fontFamily:     "var(--font-mono), ui-monospace, monospace",
        }}
      >
        <div style={{ maxWidth: "440px" }}>
          <div
            style={{
              fontSize:       "9px",
              letterSpacing:  "0.1em",
              textTransform:  "uppercase",
              color:          "var(--ink-text-4)",
              marginBottom:   "0.5rem",
            }}
          >
            penny dashboard
          </div>
          <h1 style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 0.75rem", color: "var(--ink-text)" }}>
            Host misconfigured
          </h1>
          <p style={{ fontSize: "12px", color: "var(--ink-text-3)", lineHeight: 1.55, marginBottom: "1rem" }}>
            {hostMisconfigured}
          </p>
          <details style={{ fontSize: "12px", color: "var(--ink-text-3)", marginBottom: "1.25rem" }}>
            <summary style={{ cursor: "pointer", marginBottom: "0.5rem", color: "var(--ink-text-2)" }}>
              {UI_COPY.hostMisconfigDetailsSummary}
            </summary>
            <p style={{ lineHeight: 1.55, margin: "0.5rem 0 0" }}>
              Add <code style={{ fontSize: "11px" }}>DASHBOARD_API_SECRET</code> or{" "}
              <code style={{ fontSize: "11px" }}>ORCHESTRATION_ENQUEUE_SECRET</code> in Netlify or your host
              environment (see repository README). For staging only, you can set{" "}
              <code style={{ fontSize: "11px" }}>penny_ALLOW_OPEN_API=true</code>.
            </p>
          </details>
          <button
            type="button"
            onClick={() => {
              setHostMisconfigured(null);
              setLoading(true);
              void fetchProjects();
            }}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <DashboardLogin
        sessionHint={loginHint ?? undefined}
        onSuccess={() => {
          setLoginHint(null);
          setLoading(true);
          void fetchProjects();
          void fetchQueue();
        }}
      />
    );
  }

  // ── Project view (overrides nav) ──
  const currentProject = activeProject ? projects.find((p) => p.name === activeProject) : null;
  if (currentProject && activeProject) {
    return (
      <Shell
        activeView={activeView}
        navHighlightView={shellNavHighlight}
        onNavigate={handleNavigate}
        onAuditSynced={onAuditSynced}
      >
        <ProjectView
          project={currentProject}
          onBack={() => {
            setQueueActionError(null);
            setActiveProject(null);
          }}
          onUpdateFinding={onUpdateFinding}
          refetchProject={refetchProject}
          onQueueRepair={queueRepair}
          queuedFindingIds={queuedFindingIds}
        />
      </Shell>
    );
  }

  // ── Engine view ──
  if (activeView === "engine") {
    return (
      <Shell
        activeView={activeView}
        navHighlightView={shellNavHighlight}
        onNavigate={handleNavigate}
        onAuditSynced={onAuditSynced}
      >
        <EngineView />
      </Shell>
    );
  }

  // ── Activity / job queue view ──
  if (activeView === "jobs") {
    return (
      <Shell
        activeView={activeView}
        navHighlightView={shellNavHighlight}
        onNavigate={handleNavigate}
        onAuditSynced={onAuditSynced}
      >
        <JobQueueView />
      </Shell>
    );
  }

  // ── Portfolio view ──

  // Compute portfolio totals
  const totalFindings = projects.reduce((acc, project) => acc + (project.findings?.length ?? 0), 0);
  const totalBacklog = projects.reduce((acc, project) => acc + (project.maintenanceBacklog?.length ?? 0), 0);
  const totalBlockers = projects.reduce(
    (acc, project) => acc + (project.findings ?? []).filter((f) => f.severity === "blocker" && STATUS_GROUPS.active.includes(f.status)).length,
    0
  );
  const totalActive   = projects.reduce(
    (acc, project) => acc + (project.findings ?? []).filter((f) => STATUS_GROUPS.active.includes(f.status)).length,
    0
  );
  const totalResolved = projects.reduce(
    (acc, project) => acc + (project.findings ?? []).filter((f) => STATUS_GROUPS.resolved.includes(f.status)).length,
    0
  );
  const shippable = projects.filter((project) => {
    const findings = project.findings ?? [];
    const blockerCount = findings.filter((x) => x.severity === "blocker" && STATUS_GROUPS.active.includes(x.status)).length;
    const questionCount = findings.filter((x) => x.type === "question" && STATUS_GROUPS.active.includes(x.status)).length;
    return findings.length > 0 && blockerCount === 0 && questionCount === 0;
  }).length;

  if (loading) {
    return (
      <Shell
        activeView={activeView}
        navHighlightView={shellNavHighlight}
        onNavigate={handleNavigate}
        onAuditSynced={onAuditSynced}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="skeleton-bar" style={{ width: "120px", height: "12px" }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
              gap: "0 2rem",
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div className="skeleton-bar" style={{ width: "50px", height: "8px" }} />
                <div className="skeleton-bar" style={{ width: "36px", height: "18px" }} />
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.625rem",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton-bar"
                style={{ height: "80px", borderRadius: "var(--radius-md)" }}
              />
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (projectsError && projects.length === 0) {
    return (
      <Shell
        activeView={activeView}
        navHighlightView={shellNavHighlight}
        onNavigate={handleNavigate}
        onAuditSynced={onAuditSynced}
      >
        <div style={{ maxWidth: "420px" }}>
          <p style={{ fontSize: "13px", color: "var(--ink-red)", marginBottom: "1rem" }}>{projectsError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchProjects();
            }}
            style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "6px 14px" }}
          >
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      activeView={activeView}
      navHighlightView={shellNavHighlight}
      onNavigate={handleNavigate}
      onAuditSynced={onAuditSynced}
    >
      <ConfirmDialog
        open={pendingRemoveName !== null}
        title={UI_COPY.confirmRemoveProjectTitle}
        body={
          pendingRemoveName
            ? `${UI_COPY.confirmRemoveProjectBody} (${pendingRemoveName})`
            : ""
        }
        confirmLabel={UI_COPY.confirmRemove}
        cancelLabel={UI_COPY.confirmCancel}
        danger
        onCancel={() => setPendingRemoveName(null)}
        onConfirm={() => {
          const n = pendingRemoveName;
          setPendingRemoveName(null);
          if (n) void executeRemoveProject(n);
        }}
      />
      {/* Import modal */}
          {showImport && (
            <ImportModal
              onImport={handleImport}
              onOnboardRepository={handleOnboardRepository}
              onClose={() => setShowImport(false)}
            />
          )}

      {deepLinkWarning && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-border-faint)",
            borderRadius: "var(--radius-md)",
            lineHeight: 1.45,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <span>{deepLinkWarning}</span>
          <button
            type="button"
            onClick={() => setDeepLinkWarning(null)}
            aria-label="Dismiss"
            style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", opacity: 0.85 }}
          >
            ×
          </button>
        </div>
      )}

      {(queueError || removeError) && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-amber)",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-border-faint)",
            borderRadius: "var(--radius-md)",
            lineHeight: 1.45,
          }}
        >
          {queueError && (
            <div style={{ marginBottom: removeError ? "0.5rem" : 0 }}>
              <span>{queueError}</span>
              <button
                type="button"
                onClick={() => void fetchQueue()}
                style={{
                  marginLeft: "0.5rem",
                  fontSize: "11px",
                  textDecoration: "underline",
                  cursor: "pointer",
                  border: "none",
                  background: "none",
                  color: "inherit",
                }}
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setQueueError(null)}
                aria-label="Dismiss queue message"
                style={{ marginLeft: "0.35rem", opacity: 0.8, border: "none", background: "none", color: "inherit", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
          )}
          {removeError && (
            <div>
              <span>{removeError}</span>
              <button
                type="button"
                onClick={() => setRemoveError(null)}
                aria-label="Dismiss remove error"
                style={{ marginLeft: "0.35rem", opacity: 0.8, border: "none", background: "none", color: "inherit", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Portfolio header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem" }}>
        <div>
          <div
            style={{
              fontSize:      "9px",
              fontFamily:    "var(--font-mono)",
              fontWeight:    500,
              color:         "var(--ink-text-4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom:  "0.25rem",
            }}
          >
            Portfolio
          </div>
          <h1 style={{ fontSize: "17px", fontWeight: 500, margin: 0, color: "var(--ink-text)" }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 12px" }}
        >
          Onboard project
        </button>
      </div>

      {/* Metrics */}
      {projects.length > 0 && (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
            gap:                 "0 2rem",
            borderBottom:        "0.5px solid var(--ink-border-faint)",
            paddingBottom:       "1.25rem",
            marginBottom:        "2rem",
          }}
        >
          <MetricCard label="Projects"  value={projects.length} sub={`${shippable} shippable`} />
          <MetricCard label="Findings"  value={totalFindings} />
          <MetricCard label="Backlog"   value={totalBacklog} />
          <MetricCard label="Active"    value={totalActive}   accent={totalActive   > 0 ? "var(--ink-amber)" : undefined} />
          <MetricCard label="Resolved"  value={totalResolved} accent={totalResolved > 0 ? "var(--ink-green)" : undefined} />
          <MetricCard label="Blockers"  value={totalBlockers} accent={totalBlockers > 0 ? "var(--ink-red)"   : undefined} />
        </div>
      )}

      {/* Next action hero */}
      {nextAction && (
        <NextActionCard
          source={nextAction.source}
          title={nextAction.title}
          findingId={nextAction.findingId}
          priority={nextAction.priority}
          severity={nextAction.severity}
          projectName={nextAction.projectName}
          isQueued={isInQueuedSet(queuedFindingIds, nextAction.projectName, nextAction.findingId)}
          onQueue={() =>
            void runQueueRepair(nextAction.findingId, nextAction.projectName)
          }
          onOpen={() => {
            setQueueActionError(null);
            setActiveProject(nextAction.projectName);
          }}
          queueError={queueActionError}
          onDismissQueueError={() => setQueueActionError(null)}
          queueing={queueing}
          backlogRiskClass={
            nextAction.source === "backlog" ? nextAction.backlogRiskClass : undefined
          }
          backlogNextStepKey={
            nextAction.source === "backlog" ? nextAction.backlogNextAction : undefined
          }
          backlogSummary={nextAction.source === "backlog" ? nextAction.backlogSummary : undefined}
          fragileHint={fragileHint}
          onOpenPatterns={
            fragileHint
              ? () => {
                  setPatternsOpenPersist(true);
                  requestAnimationFrame(() => {
                    document
                      .getElementById("penny-pattern-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  });
                }
              : undefined
          }
        />
      )}

      <div style={{ marginBottom: "1.75rem" }}>
        <button
          type="button"
          onClick={() => handleNavigate("engine")}
          style={{
            fontSize:     "11px",
            fontFamily:   "var(--font-mono)",
            border:       "none",
            background:   "transparent",
            padding:      0,
            color:        "var(--ink-text-3)",
            cursor:       "pointer",
            textDecoration: "underline",
          }}
        >
          Open {UI_COPY.navRepairLedger.toLowerCase()} & worker operations →
        </button>
      </div>

      {/* Empty state */}
      {projects.length === 0 && !showImport && (
        <EmptyState
          icon="◆"
          title="No projects yet. Onboard from a repo or import an open_findings.json to get started."
          action={
            <button
              type="button"
              onClick={() => setShowImport(true)}
              style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "5px 14px" }}
            >
              Onboard project
            </button>
          }
        />
      )}

      {/* Project grid */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap:                 "0.625rem",
        }}
      >
        {projects.map((p) => (
          <div key={p.name} style={{ position: "relative" }}>
            <ProjectCard project={p} onClick={() => setActiveProject(p.name)} />
            <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", display: "flex", gap: "0.25rem", opacity: 0.4 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleExport(p); }}
                title="Export"
                style={{ fontSize: "9px", padding: "1px 5px", fontFamily: "var(--font-mono)", background: "var(--ink-bg)" }}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPendingRemoveName(p.name); }}
                title="Remove"
                style={{ fontSize: "9px", padding: "1px 5px", fontFamily: "var(--font-mono)", background: "var(--ink-bg)" }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {projects.length > 0 && (
        <div style={{ marginTop: "2.5rem", marginBottom: patternsOpen ? "1rem" : 0 }}>
          <button
            type="button"
            onClick={() => setPatternsOpenPersist(!patternsOpen)}
            style={{
              fontSize:       "11px",
              fontFamily:     "var(--font-mono)",
              border:         "none",
              background:     "transparent",
              padding:        0,
              color:          "var(--ink-text-3)",
              cursor:         "pointer",
              textDecoration: "underline",
            }}
          >
            {patternsOpen ? "Hide portfolio patterns" : "Show portfolio patterns"}
          </button>
        </div>
      )}
      {patternsOpen && projects.length > 0 ? <PatternPanel projects={projects} /> : null}

      {/* Footer */}
      {projects.length > 0 && (
        <div
          style={{
            marginTop:  "3rem",
            fontSize:   "10px",
            fontFamily: "var(--font-mono)",
            color:      "var(--ink-text-4)",
            borderTop:  "0.5px solid var(--ink-border-faint)",
            paddingTop: "1rem",
          }}
        >
          penny v1.1 · findings persist via api
        </div>
      )}
    </Shell>
  );
}
