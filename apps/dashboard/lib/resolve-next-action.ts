import type {
  Finding,
  MaintenanceBacklogItem,
  NextActionRecommendation,
  Project,
  RepairRiskClass,
} from "@/lib/types";
import { PRIORITY_ORDER, SEVERITY_ORDER, STATUS_GROUPS, sortFindings } from "@/lib/constants";

/** Same priority-then-severity ordering as findings / portfolio sorting. */
export function sortMaintenanceBacklog(
  items: MaintenanceBacklogItem[]
): MaintenanceBacklogItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? ""] ?? 9;
    const pb = PRIORITY_ORDER[b.priority ?? ""] ?? 9;
    if (pa !== pb) return pa - pb;
    const sa = SEVERITY_ORDER[a.severity ?? ""] ?? 9;
    const sb = SEVERITY_ORDER[b.severity ?? ""] ?? 9;
    return sa - sb;
  });
}

export type NextActionSource = "backlog" | "finding";

/** Unified “what to do next” for the portfolio hero card. */
export interface ResolvedNextAction {
  source: NextActionSource;
  projectName: string;
  title: string;
  findingId: string;
  severity: string;
  priority: string;
  /** Set when source is backlog — from the winning backlog row */
  backlogRiskClass?: RepairRiskClass;
  backlogNextAction?: NextActionRecommendation;
  backlogSummary?: string;
}

function backlogScore(priority: string | undefined, severity: string | undefined): [number, number] {
  return [PRIORITY_ORDER[priority ?? ""] ?? 9, SEVERITY_ORDER[severity ?? ""] ?? 9];
}

function isBetterBacklog(
  candPri: string | undefined,
  candSev: string | undefined,
  curPri: string | undefined,
  curSev: string | undefined
): boolean {
  const [cpa, csa] = backlogScore(candPri, candSev);
  const [ppa, psa] = backlogScore(curPri, curSev);
  if (ppa > cpa) return true;
  if (ppa === cpa && psa > csa) return true;
  return false;
}

/**
 * Prefer a maintenance backlog item (same cross-project tie-break as legacy dashboard).
 * If none, use the top active finding portfolio-wide (P0 before P1, then severity).
 */
export function resolveNextAction(projects: Project[]): ResolvedNextAction | null {
  let best: ResolvedNextAction | null = null;

  for (const p of projects) {
    const backlog = sortMaintenanceBacklog(
      [...(p.maintenanceBacklog ?? [])].filter(
        (item) => !["done", "deferred"].includes(item.canonical_status)
      )
    );
    if (backlog.length === 0) continue;
    const first = backlog[0];
    const fid = first.finding_ids[0] ?? "";
    if (!fid) continue;

    if (
      !best ||
      isBetterBacklog(first.priority, first.severity, best.priority, best.severity)
    ) {
      best = {
        source: "backlog",
        projectName: p.name,
        title: first.title ?? "",
        findingId: fid,
        severity: first.severity ?? "nit",
        priority: first.priority ?? "P3",
        backlogRiskClass: first.risk_class,
        backlogNextAction: first.next_action,
        backlogSummary: first.summary,
      };
    }
  }

  if (best) return best;

  const candidates: { project: Project; finding: Finding }[] = [];
  for (const p of projects) {
    for (const f of p.findings ?? []) {
      if (STATUS_GROUPS.active.includes(f.status)) {
        candidates.push({ project: p, finding: f });
      }
    }
  }
  if (candidates.length === 0) return null;

  const sorted = sortFindings(candidates.map((c) => c.finding));
  const top = sorted[0];
  const owner = candidates.find((c) => c.finding.finding_id === top.finding_id);
  if (!owner) return null;

  return {
    source: "finding",
    projectName: owner.project.name,
    title: top.title ?? "",
    findingId: top.finding_id,
    severity: top.severity ?? "nit",
    priority: top.priority ?? "P3",
  };
}
