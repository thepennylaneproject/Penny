import type { EngineStatus } from "./audit-reader";
import { STATUS_GROUPS } from "./constants";
import type { Finding, Project } from "./types";

export type OrchestrationStage =
  | "onboarding"
  | "visual_audit_missing"
  | "audit_due"
  | "repair_in_progress"
  | "current"
  | "manual_override";

export type OrchestrationActionKind =
  | "onboard_project"
  | "run_visual_audit"
  | "run_full_audit"
  | "run_synthesizer"
  | "drain_repair_queue"
  | "manual_override";

export interface OrchestrationAction {
  kind: OrchestrationActionKind;
  label: string;
  reason: string;
  trigger: "queued" | "scheduled" | "manual";
}

export interface ProjectOrchestrationState {
  project_name: string;
  stage: OrchestrationStage;
  active_findings: number;
  resolved_findings: number;
  has_visual_coverage: boolean;
  last_updated: string | null;
  re_audit_due: boolean;
  recommended_action: OrchestrationAction;
}

export interface PortfolioOrchestrationState {
  projects: ProjectOrchestrationState[];
  summary: {
    total_projects: number;
    onboarding: number;
    visual_audit_missing: number;
    audit_due: number;
    repair_in_progress: number;
    current: number;
  };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysSince(value: string | undefined): number | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const diff = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function isVisualFinding(finding: Finding): boolean {
  const suite = (finding as Finding & { suite?: string }).suite;
  if (suite === "visual") return true;
  const haystack = `${finding.category ?? ""} ${finding.title ?? ""} ${finding.description ?? ""}`.toLowerCase();
  return haystack.includes("visual") || haystack.includes("design");
}

function hasVisualCoverage(project: Project): boolean {
  return (project.findings ?? []).some(isVisualFinding);
}

function activeFindingCount(project: Project): number {
  return (project.findings ?? []).filter((finding) =>
    STATUS_GROUPS.active.includes(finding.status)
  ).length;
}

function resolvedFindingCount(project: Project): number {
  return (project.findings ?? []).filter((finding) =>
    STATUS_GROUPS.resolved.includes(finding.status)
  ).length;
}

function buildAction(
  kind: OrchestrationActionKind,
  label: string,
  reason: string,
  trigger: OrchestrationAction["trigger"]
): OrchestrationAction {
  return { kind, label, reason, trigger };
}

export function deriveProjectOrchestration(
  project: Project,
  engineStatus?: EngineStatus
): ProjectOrchestrationState {
  const activeFindings = activeFindingCount(project);
  const resolvedFindings = resolvedFindingCount(project);
  const visualCoverage = hasVisualCoverage(project);
  const ageDays = daysSince(project.lastUpdated ?? undefined);
  // Only consider this project's own queued jobs, not the global queue size
  const projectQueuedFindings = (engineStatus?.queued_findings ?? []).filter(
    (j) => j.project_name === project.name
  );
  const queueBusy = projectQueuedFindings.length > 0;
  // pending (fixed_pending_verify) findings represent unresolved verification debt
  const pendingFindings = (project.findings ?? []).filter((f) =>
    STATUS_GROUPS.pending.includes(f.status)
  ).length;
  const reAuditDue =
    activeFindings > 0 ||
    pendingFindings > 0 ||
    (ageDays != null && ageDays >= 7);

  if ((project.findings ?? []).length === 0) {
    return {
      project_name: project.name,
      stage: "onboarding",
      active_findings: 0,
      resolved_findings: 0,
      has_visual_coverage: false,
      last_updated: project.lastUpdated ?? null,
      re_audit_due: true,
      recommended_action: buildAction(
        "onboard_project",
        "Onboard project",
        "No findings have been imported yet.",
        "queued"
      ),
    };
  }

  if (!visualCoverage) {
    return {
      project_name: project.name,
      stage: "visual_audit_missing",
      active_findings: activeFindings,
      resolved_findings: resolvedFindings,
      has_visual_coverage: false,
      last_updated: project.lastUpdated ?? null,
      re_audit_due: true,
      recommended_action: buildAction(
        "run_visual_audit",
        "Run visual audit",
        "This project has findings, but no visual-suite coverage is detected.",
        "queued"
      ),
    };
  }

  if (queueBusy) {
    return {
      project_name: project.name,
      stage: "repair_in_progress",
      active_findings: activeFindings,
      resolved_findings: resolvedFindings,
      has_visual_coverage: true,
      last_updated: project.lastUpdated ?? null,
      re_audit_due: reAuditDue,
      recommended_action: buildAction(
        "drain_repair_queue",
        "Drain repair queue",
        "There are queued repair jobs that should finish before another audit cycle.",
        "manual"
      ),
    };
  }

  if (reAuditDue) {
    return {
      project_name: project.name,
      stage: "audit_due",
      active_findings: activeFindings,
      resolved_findings: resolvedFindings,
      has_visual_coverage: true,
      last_updated: project.lastUpdated ?? null,
      re_audit_due: true,
      recommended_action: buildAction(
        "run_full_audit",
        "Run re-audit",
        ageDays != null
          ? `Last update was ${ageDays} day${ageDays === 1 ? "" : "s"} ago.`
          : "Open findings still need another audit pass.",
        "queued"
      ),
    };
  }

  return {
    project_name: project.name,
    stage: "current",
    active_findings: activeFindings,
    resolved_findings: resolvedFindings,
    has_visual_coverage: true,
    last_updated: project.lastUpdated ?? null,
    re_audit_due: false,
    recommended_action: buildAction(
      "run_synthesizer",
      "Run synthesizer",
      "The project is current; synthesize the latest audit state before the next cycle.",
      "scheduled"
    ),
  };
}

export function derivePortfolioOrchestration(
  projects: Project[],
  engineStatus?: EngineStatus
): PortfolioOrchestrationState {
  const states = projects.map((project) =>
    deriveProjectOrchestration(project, engineStatus)
  );

  return {
    projects: states,
    summary: {
      total_projects: states.length,
      onboarding: states.filter((state) => state.stage === "onboarding").length,
      visual_audit_missing: states.filter((state) => state.stage === "visual_audit_missing").length,
      audit_due: states.filter((state) => state.stage === "audit_due").length,
      repair_in_progress: states.filter((state) => state.stage === "repair_in_progress").length,
      current: states.filter((state) => state.stage === "current").length,
    },
  };
}
