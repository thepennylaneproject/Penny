"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { DashboardLogin } from "@/components/DashboardLogin";
import { MetricCard } from "@/components/MetricCard";
import { EmptyState } from "@/components/EmptyState";
import { ProjectCard } from "@/components/ProjectCard";
import { ImportModal } from "@/components/ImportModal";
import { NextActionCard } from "@/components/NextActionCard";
import { PatternPanel } from "@/components/PatternPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { SignInPrompt, ConfigurationError, RetryableError } from "@/components/AppReadinessUI";
import { STATUS_GROUPS } from "@/lib/constants";
import { isInQueuedSet } from "@/lib/finding-validation";
import { fragileShortPathSet, overlappingFragileShortPaths } from "@/lib/fragile-files";
import { resolveNextAction } from "@/lib/resolve-next-action";
import { usePortfolioProjects } from "@/hooks/use-portfolio-projects";
import { useEngineQueue } from "@/hooks/use-engine-queue";
import { useQueueRepair } from "@/hooks/use-queue-repair";
import { resolveAppReadiness } from "@/hooks/use-app-readiness";
import { UI_COPY } from "@/lib/ui-copy";
import type { ImportSummary } from "@/lib/import-summary";

const PATTERN_PANEL_STORAGE_KEY = "penny_portfolio_patterns_open";

export default function Home() {
  const router = useRouter();

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
    runQueueRepair,
    queueActionError,
    setQueueActionError,
    queueWarning,
    setQueueWarning,
    queueing,
  } = useQueueRepair({ fetchQueue });

  const [showImportMode, setShowImportMode] = useState<"repository" | "json" | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pendingRemoveName, setPendingRemoveName] = useState<string | null>(null);
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void fetchProjects();
    void fetchQueue();
  }, [fetchProjects, fetchQueue]);

  // Re-fetch queue every 30 s so "queued" badges stay accurate without a full page reload.
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchQueue();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  useEffect(() => {
    const handleUndoSuccess = () => {
      void fetchProjects();
      void fetchQueue();
    };

    window.addEventListener("penny:undo-success", handleUndoSuccess);
    return () => window.removeEventListener("penny:undo-success", handleUndoSuccess);
  }, [fetchProjects, fetchQueue]);

  useEffect(() => {
    try {
      setPatternsOpen(sessionStorage.getItem(PATTERN_PANEL_STORAGE_KEY) === "1");
    } catch {
      setPatternsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Portfolio — Penny";
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

  const onAuditSynced = useCallback(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleImport = useCallback(async (project: Project): Promise<ImportSummary> => {
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
    setShowImportMode(null);
  }, [fetchProjects]);

  const executeRemoveProject = useCallback(async (name: string) => {
    setRemoveError(null);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((project) => project.name !== name));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setRemoveError(
        typeof body.error === "string"
          ? body.error
          : `Could not remove project (${res.status}). Try again.`
      );
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : "Network error while removing project."
      );
    }
  }, [setProjects]);

  const handleExport = useCallback((project: Project) => {
    const data = JSON.stringify(
      { schema_version: "1.1.0", open_findings: project.findings ?? [] },
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name}-open_findings.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const nextAction = useMemo(() => resolveNextAction(projects), [projects]);
  const fragilePaths = useMemo(() => fragileShortPathSet(projects), [projects]);
  const nextActionFinding = useMemo(() => {
    if (!nextAction) return undefined;
    const project = projects.find((candidate) => candidate.name === nextAction.projectName);
    return project?.findings?.find((finding) => finding.finding_id === nextAction.findingId);
  }, [projects, nextAction]);
  const fragileLabels = useMemo(
    () => overlappingFragileShortPaths(nextActionFinding, fragilePaths, 4),
    [nextActionFinding, fragilePaths]
  );
  const fragileHint =
    fragileLabels.length > 0
      ? `Hotspot overlap — other active findings share: ${fragileLabels.join(", ")}`
      : null;

  // Consolidated app readiness state
  const appReadiness = resolveAppReadiness({
    projectsLoading: loading,
    queueLoading: false,
    needsAuth,
    projectsError,
    hostMisconfigured,
    loginHint,
  });

  if (hostMisconfigured) {
    return (
      <ConfigurationError
        message={hostMisconfigured}
        hint={UI_COPY.hostMisconfigDetailsSummary}
        onRetry={() => {
          setHostMisconfigured(null);
          setLoading(true);
          void fetchProjects();
        }}
      />
    );
  }

  if (needsAuth) {
    return (
      <SignInPrompt
        hint="Please sign in to continue managing your audit findings."
        onSignIn={() => {
          setLoginHint(null);
          setLoading(true);
          void fetchProjects();
          void fetchQueue();
        }}
      />
    );
  }

  const totalFindings = projects.reduce((acc, project) => acc + (project.findings?.length ?? 0), 0);
  const totalBacklog = projects.reduce((acc, project) => acc + (project.maintenanceBacklog?.length ?? 0), 0);
  const totalBlockers = projects.reduce(
    (acc, project) =>
      acc +
      (project.findings ?? []).filter(
        (finding) => finding.severity === "blocker" && STATUS_GROUPS.active.includes(finding.status)
      ).length,
    0
  );
  const totalActive = projects.reduce(
    (acc, project) =>
      acc + (project.findings ?? []).filter((finding) => STATUS_GROUPS.active.includes(finding.status)).length,
    0
  );
  const totalResolved = projects.reduce(
    (acc, project) =>
      acc + (project.findings ?? []).filter((finding) => STATUS_GROUPS.resolved.includes(finding.status)).length,
    0
  );
  const shippable = projects.filter((project) => {
    const findings = project.findings ?? [];
    const blockerCount = findings.filter(
      (finding) => finding.severity === "blocker" && STATUS_GROUPS.active.includes(finding.status)
    ).length;
    const questionCount = findings.filter(
      (finding) => finding.type === "question" && STATUS_GROUPS.active.includes(finding.status)
    ).length;
    return findings.length > 0 && blockerCount === 0 && questionCount === 0;
  }).length;

  if (loading) {
    return (
      <DashboardRouteShell activeView="portfolio" onAuditSynced={onAuditSynced}>
        <PageLoadingSkeleton />
      </DashboardRouteShell>
    );
  }

  if (projectsError && projects.length === 0) {
    return (
      <DashboardRouteShell activeView="portfolio" onAuditSynced={onAuditSynced}>
        <RetryableError
          message={projectsError}
          hint="Failed to load your projects. Please check your connection and try again."
          onRetry={() => {
            setLoading(true);
            void fetchProjects();
          }}
        />
      </DashboardRouteShell>
    );
  }

  return (
    <DashboardRouteShell activeView="portfolio" onAuditSynced={onAuditSynced}>
      <ConfirmDialog
        open={pendingRemoveName !== null}
        title={UI_COPY.confirmRemoveProjectTitle}
        body={(() => {
          if (!pendingRemoveName) return "";
          const project = projects.find((candidate) => candidate.name === pendingRemoveName);
          const findingCount = project?.findings?.length ?? 0;
          const countNote =
            findingCount > 0
              ? ` ${findingCount} finding${findingCount !== 1 ? "s" : ""} will be permanently deleted.`
              : "";
          return `${UI_COPY.confirmRemoveProjectBody}${countNote}`;
        })()}
        confirmLabel={UI_COPY.confirmRemove}
        cancelLabel={UI_COPY.confirmCancel}
        danger
        onCancel={() => setPendingRemoveName(null)}
        onConfirm={() => {
          const name = pendingRemoveName;
          setPendingRemoveName(null);
          if (name) void executeRemoveProject(name);
        }}
      />

      {showImportMode && (
        <ImportModal
          onImport={handleImport}
          onOnboardRepository={handleOnboardRepository}
          fixedMode={showImportMode}
          onClose={() => setShowImportMode(null)}
        />
      )}

      {queueWarning && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-amber)",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-amber)",
            borderRadius: "var(--radius-md)",
            lineHeight: 1.45,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <span style={{ flex: "1 1 auto" }}>{queueWarning}</span>
          <button
            type="button"
            onClick={() => setQueueWarning(null)}
            aria-label="Dismiss warning"
            style={{ opacity: 0.8, border: "none", background: "none", color: "inherit", cursor: "pointer", flexShrink: 0 }}
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem" }}>
        <div>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--ink-text-4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.25rem",
            }}
          >
            Portfolio
          </div>
          <h1 style={{ fontSize: "17px", fontWeight: 500, margin: 0, color: "var(--ink-text)" }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          <button
            type="button"
            aria-label="Refresh portfolio"
            title="Refresh"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await Promise.all([fetchProjects(), fetchQueue()]);
              setRefreshing(false);
            }}
            style={{
              fontSize:   "11px",
              fontFamily: "var(--font-mono)",
              padding:    "4px 8px",
              background: "transparent",
              border:     "0.5px solid var(--ink-border-faint)",
              color:      refreshing ? "var(--ink-text-4)" : "var(--ink-text-3)",
              cursor:     refreshing ? "default" : "pointer",
              opacity:    refreshing ? 0.6 : 1,
            }}
          >
            ↺
          </button>
          <button
            type="button"
            onClick={() => setShowImportMode("repository")}
            style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 12px" }}
          >
            New project
          </button>
          <button
            type="button"
            onClick={() => setShowImportMode("json")}
            style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 12px" }}
          >
            Import findings
          </button>
        </div>
      </div>

      {projects.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
            gap: "0 2rem",
            borderBottom: "0.5px solid var(--ink-border-faint)",
            paddingBottom: "1.25rem",
            marginBottom: "2rem",
          }}
        >
          <MetricCard label="Projects" value={projects.length} sub={`${shippable} shippable`} />
          <MetricCard label="Findings" value={totalFindings} />
          <MetricCard label="Backlog" value={totalBacklog} />
          <MetricCard label="Active" value={totalActive} accent={totalActive > 0 ? "var(--ink-amber)" : undefined} />
          <MetricCard label="Resolved" value={totalResolved} accent={totalResolved > 0 ? "var(--ink-green)" : undefined} />
          <MetricCard label="Blockers" value={totalBlockers} accent={totalBlockers > 0 ? "var(--ink-red)" : undefined} />
        </div>
      )}

      {nextAction && (
        <NextActionCard
          source={nextAction.source}
          title={nextAction.title}
          findingId={nextAction.findingId}
          priority={nextAction.priority}
          severity={nextAction.severity}
          projectName={nextAction.projectName}
          isQueued={isInQueuedSet(queuedFindingIds, nextAction.projectName, nextAction.findingId)}
          onQueue={() => void runQueueRepair(nextAction.findingId, nextAction.projectName)}
          onOpen={() => {
            setQueueActionError(null);
            router.push(
              `/projects/${encodeURIComponent(nextAction.projectName)}?finding=${encodeURIComponent(nextAction.findingId)}`
            );
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
          onClick={() => router.push("/repairs")}
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            border: "none",
            background: "transparent",
            padding: 0,
            color: "var(--ink-text-3)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Open {UI_COPY.navRepairLedger.toLowerCase()} & audit activity →
        </button>
      </div>

      {projects.length === 0 && !showImportMode && (
        <EmptyState
          icon="◆"
          title="No projects yet. Start from a repository or import an existing open_findings.json."
          action={
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setShowImportMode("repository")}
                style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "5px 14px" }}
              >
                New project
              </button>
              <button
                type="button"
                onClick={() => setShowImportMode("json")}
                style={{ fontSize: "12px", fontFamily: "var(--font-mono)", padding: "5px 14px" }}
              >
                Import findings
              </button>
            </div>
          }
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "0.625rem",
        }}
      >
        {projects.map((project) => (
          <div key={project.name} style={{ position: "relative" }}>
            <ProjectCard
              project={project}
              onClick={() => router.push(`/projects/${encodeURIComponent(project.name)}`)}
            />
            <div
              style={{
                position: "absolute",
                top: "0.5rem",
                right: "0.5rem",
                display: "flex",
                gap: "0.25rem",
                opacity: 0.72,
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleExport(project);
                }}
                aria-label={`Export open findings for ${project.name}`}
                style={{
                  fontSize: "9px",
                  padding: "1px 5px",
                  fontFamily: "var(--font-mono)",
                  background: "var(--ink-bg)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span aria-hidden="true">↓</span>
                <span>Export</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingRemoveName(project.name);
                }}
                aria-label={`Remove ${project.name} from portfolio`}
                style={{
                  fontSize: "9px",
                  padding: "1px 5px",
                  fontFamily: "var(--font-mono)",
                  background: "var(--ink-bg)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span aria-hidden="true">×</span>
                <span>Remove</span>
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
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              border: "none",
              background: "transparent",
              padding: 0,
              color: "var(--ink-text-3)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {patternsOpen ? "Hide portfolio patterns" : "Show portfolio patterns"}
          </button>
        </div>
      )}
      {patternsOpen && projects.length > 0 ? <PatternPanel projects={projects} /> : null}

      {projects.length > 0 && (
        <div
          style={{
            marginTop: "3rem",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-4)",
            borderTop: "0.5px solid var(--ink-border-faint)",
            paddingTop: "1rem",
          }}
        >
          Penny v3.0 · findings persist via api
        </div>
      )}

    </DashboardRouteShell>
  );
}
