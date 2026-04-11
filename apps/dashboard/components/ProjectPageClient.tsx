"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FindingStatus, Project } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { ProjectView } from "@/components/ProjectView";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { SignInPrompt, ConfigurationError, RetryableError } from "@/components/AppReadinessUI";
import { usePortfolioProjects } from "@/hooks/use-portfolio-projects";
import { useSupabaseAuthReady } from "@/hooks/use-supabase-auth-ready";
import { useEngineQueue } from "@/hooks/use-engine-queue";
import { useQueueRepair } from "@/hooks/use-queue-repair";
import { UI_COPY } from "@/lib/ui-copy";

interface ProjectPageClientProps {
  projectName: string;
  initialFindingId?: string;
}

function ProjectMissingState({
  projectName,
  onBack,
}: {
  projectName: string;
  onBack: () => void;
}) {
  return (
    <DashboardRouteShell activeView="portfolio">
      <div style={{ maxWidth: "440px" }}>
        <div
          style={{
            fontSize: "9px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-text-4)",
            marginBottom: "0.5rem",
          }}
        >
          project
        </div>
        <h1
          style={{
            fontSize: "15px",
            fontWeight: 500,
            margin: "0 0 0.75rem",
            color: "var(--ink-text)",
          }}
        >
          Project not found
        </h1>
        <p
          style={{
            fontSize: "12px",
            color: "var(--ink-text-3)",
            lineHeight: 1.55,
            marginBottom: "1rem",
          }}
        >
          Project “{projectName}” is not in this portfolio anymore.
        </p>
        <button type="button" onClick={onBack} style={{ fontSize: "12px", padding: "6px 14px" }}>
          Back to portfolio
        </button>
      </div>
    </DashboardRouteShell>
  );
}

export function ProjectPageClient({ projectName, initialFindingId }: ProjectPageClientProps) {
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
    setLoginHint,
    fetchProjectByName,
  } = usePortfolioProjects();

  const authReady = useSupabaseAuthReady();

  const { queuedFindingIds, fetchQueue } = useEngineQueue();
  const { queueRepair } = useQueueRepair({ fetchQueue });

  useEffect(() => {
    if (!authReady) return;
    void fetchProjectByName(projectName);
    void fetchQueue();
  }, [authReady, fetchProjectByName, fetchQueue, projectName]);

  useEffect(() => {
    document.title = `${projectName} — Penny`;
  }, [projectName]);

  const onAuditSynced = useCallback(() => {
    void fetchProjectByName(projectName);
  }, [fetchProjectByName, projectName]);

  const refetchProject = useCallback(async (): Promise<{
    project: Project | null;
    refreshError: string | null;
  }> => {
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}`);
      if (!res.ok) {
        return {
          project: null,
          refreshError: `Could not refresh project (${res.status}).`,
        };
      }
      const project = await res.json();
      setProjects((prev) =>
        prev.map((candidate) => (candidate.name === projectName ? project : candidate))
      );
      return { project, refreshError: null };
    } catch (error) {
      return {
        project: null,
        refreshError:
          error instanceof Error ? error.message : "Network error refreshing project.",
      };
    }
  }, [projectName, setProjects]);

  useEffect(() => {
    const handleUndoSuccess = () => {
      void fetchProjectByName(projectName);
      void fetchQueue();
      void refetchProject();
    };

    window.addEventListener("penny:undo-success", handleUndoSuccess);
    return () => window.removeEventListener("penny:undo-success", handleUndoSuccess);
  }, [fetchProjectByName, fetchQueue, projectName, refetchProject]);

  const onUpdateFinding = useCallback(
    async (resolvedProjectName: string, findingId: string, status: FindingStatus) => {
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(resolvedProjectName)}/findings/${encodeURIComponent(findingId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const message =
          typeof body.error === "string"
            ? body.error
            : `Could not save status (${res.status}). Try again.`;
        throw new Error(message);
      }
    },
    []
  );

  if (hostMisconfigured) {
    return (
      <ConfigurationError
        message={hostMisconfigured}
        hint={UI_COPY.hostMisconfigDetailsSummary}
        onRetry={() => {
          setHostMisconfigured(null);
          setLoading(true);
          void fetchProjectByName(projectName);
        }}
      />
    );
  }

  if (!authReady || loading) {
    return (
      <DashboardRouteShell activeView="portfolio" onAuditSynced={onAuditSynced}>
        <PageLoadingSkeleton />
      </DashboardRouteShell>
    );
  }

  if (needsAuth) {
    return (
      <SignInPrompt
        hint="Please sign in to continue viewing this project."
        onSignIn={() => {
          setLoginHint(null);
          setLoading(true);
          void fetchProjectByName(projectName);
          void fetchQueue();
        }}
      />
    );
  }

  if (projectsError && projects.length === 0) {
    return (
      <DashboardRouteShell activeView="portfolio" onAuditSynced={onAuditSynced}>
        <RetryableError
          title="Could not load project"
          message={projectsError}
          hint="Failed to load this project. Please check your connection and try again."
          onRetry={() => {
            setLoading(true);
            void fetchProjectByName(projectName);
          }}
        />
      </DashboardRouteShell>
    );
  }

  const currentProject = projects.find((project) => project.name === projectName);
  if (!currentProject) {
    return <ProjectMissingState projectName={projectName} onBack={() => router.push("/")} />;
  }

  return (
    <DashboardRouteShell activeView="portfolio" onAuditSynced={onAuditSynced}>
      <ProjectView
        project={currentProject}
        onBack={() => router.push("/")}
        onUpdateFinding={onUpdateFinding}
        refetchProject={refetchProject}
        onQueueRepair={queueRepair}
        queuedFindingIds={queuedFindingIds}
        initialFindingId={initialFindingId}
      />
    </DashboardRouteShell>
  );
}
