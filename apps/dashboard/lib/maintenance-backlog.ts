import type {
  Finding,
  MaintenanceBacklogItem,
  MaintenanceBacklogStatus,
  MaintenanceSourceType,
  NextActionRecommendation,
  Project,
  RepairRiskClass,
} from "./types";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function riskClassForFinding(finding: Finding): RepairRiskClass {
  if (finding.repair_policy?.risk_class) return finding.repair_policy.risk_class;
  if (finding.severity === "blocker") return "critical";
  if (finding.severity === "major") return "high";
  if (finding.severity === "minor") return "medium";
  return "low";
}

function backlogStatusForFinding(finding: Finding): MaintenanceBacklogStatus {
  switch (finding.status) {
    case "in_progress":
      return "in_progress";
    case "fixed_pending_verify":
      return "blocked";
    case "fixed_verified":
    case "wont_fix":
    case "deferred":
    case "duplicate":
    case "converted_to_enhancement":
      return "done";
    default:
      return "open";
  }
}

function nextActionForFinding(finding: Finding): NextActionRecommendation {
  if (finding.status === "fixed_pending_verify") return "verify";
  if (finding.status === "in_progress") return "review";
  if (finding.status === "deferred") return "defer";
  if (finding.repair_policy?.approval_required) return "plan_task";
  if (finding.repair_policy?.autofix_eligibility === "eligible") return "queue_repair";
  return "plan_task";
}

function dedupeKeysForFinding(finding: Finding): string[] {
  return [
    `finding:${finding.finding_id}`,
    `title:${slug(finding.title)}`,
    `category:${slug(finding.category ?? "uncategorized")}:${slug(finding.title)}`,
  ];
}

export function backlogItemFromFinding(
  projectName: string,
  finding: Finding,
  sourceType: MaintenanceSourceType = "finding"
): MaintenanceBacklogItem {
  const now = new Date().toISOString();
  return {
    id: `backlog-${projectName}-${finding.finding_id}`,
    project_name: projectName,
    title: finding.title,
    summary: finding.description,
    canonical_status: backlogStatusForFinding(finding),
    source_type: sourceType,
    priority: finding.priority,
    severity: finding.severity,
    risk_class: riskClassForFinding(finding),
    next_action: nextActionForFinding(finding),
    finding_ids: [finding.finding_id],
    dedupe_keys: dedupeKeysForFinding(finding),
    duplicate_of: finding.duplicate_of,
    blocked_reason:
      finding.status === "fixed_pending_verify"
        ? "Waiting for verification."
        : undefined,
    provenance: {
      manifest_revision: finding.last_seen_revision,
      finding_id: finding.finding_id,
      source_type: sourceType,
    },
    created_at: finding.first_seen_at ?? now,
    updated_at: finding.last_seen_at ?? now,
  };
}

export function normalizeMaintenanceBacklog(
  projectName: string,
  findings: Finding[],
  externalItems: MaintenanceBacklogItem[] = []
): MaintenanceBacklogItem[] {
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
  const severityOrder = { blocker: 0, major: 1, minor: 2, nit: 3 } as const;
  const merged = new Map<string, MaintenanceBacklogItem>();
  for (const item of externalItems) {
    merged.set(item.id, item);
  }
  for (const finding of findings) {
    const candidate = backlogItemFromFinding(projectName, finding);
    const existing = [...merged.values()].find((item) =>
      item.finding_ids.includes(finding.finding_id) ||
      item.dedupe_keys?.some((key) => candidate.dedupe_keys?.includes(key))
    );
    if (existing) {
      existing.finding_ids = [...new Set([...existing.finding_ids, finding.finding_id])];
      existing.updated_at = candidate.updated_at;
      existing.priority =
        (priorityOrder[existing.priority] ?? 9) <= (priorityOrder[candidate.priority] ?? 9)
          ? existing.priority
          : candidate.priority;
      existing.severity =
        (severityOrder[existing.severity] ?? 9) <= (severityOrder[candidate.severity] ?? 9)
          ? existing.severity
          : candidate.severity;
      existing.risk_class = candidate.risk_class;
      existing.next_action = candidate.next_action;
      existing.canonical_status = candidate.canonical_status;
      existing.provenance = {
        ...existing.provenance,
        ...candidate.provenance,
      };
      continue;
    }
    merged.set(candidate.id, candidate);
  }
  return [...merged.values()].sort((a, b) => {
    const byPriority =
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
    if (byPriority !== 0) return byPriority;
    const bySeverity =
      (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  });
}

export function withNormalizedBacklog(project: Project): Project {
  return {
    ...project,
    maintenanceBacklog: normalizeMaintenanceBacklog(
      project.name,
      project.findings ?? [],
      project.maintenanceBacklog ?? []
    ),
  };
}
