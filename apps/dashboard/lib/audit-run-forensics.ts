/**
 * Helpers to surface worker run payload (`project_audit_details`) without dumping raw LLM by default.
 */

import type { pennyAuditRunRow } from "@/lib/orchestration-jobs";

export interface ProjectAuditDetailShape {
  project?: string;
  scope_type?: string;
  scope_paths?: string[];
  scan_roots?: string[];
  findings_returned?: number;
  findings_added?: number;
  manifest_revision?: string;
  checklist_id?: string;
  coverage_complete?: boolean;
  completion_confidence?: string;
  files_in_scope?: string[];
  files_reviewed?: string[];
  known_finding_ids?: string[];
  known_findings_referenced?: string[];
  exhaustiveness?: string;
  repo_root?: string;
  raw_llm_output?: string;
}

function asDetail(raw: unknown): ProjectAuditDetailShape | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ProjectAuditDetailShape;
}

export function getProjectAuditDetailsArray(
  payload: Record<string, unknown> | undefined
): unknown[] {
  const raw = payload?.project_audit_details;
  return Array.isArray(raw) ? raw : [];
}

/** Per-project slice from a job payload (weekly jobs include many). */
export function findDetailForProject(
  payload: Record<string, unknown> | undefined,
  projectName: string
): ProjectAuditDetailShape | null {
  const want = projectName.trim().toLowerCase();
  if (!want) return null;
  for (const item of getProjectAuditDetailsArray(payload)) {
    const d = asDetail(item);
    if (d?.project && d.project.trim().toLowerCase() === want) return d;
  }
  return null;
}

/** Deep-clone payload and replace `raw_llm_output` on each project detail with a placeholder. */
export function redactAuditRunPayload(
  payload: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  try {
    const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const details = clone.project_audit_details;
    if (Array.isArray(details)) {
      clone.project_audit_details = details.map((item) => {
        const d = asDetail(item);
        if (!d) return item;
        if (!Object.prototype.hasOwnProperty.call(d, "raw_llm_output")) return d;
        return {
          ...d,
          raw_llm_output:
            "[omitted — open “Raw model output” below if you need the trace]",
        };
      });
    }
    return clone;
  } catch {
    return { ...payload };
  }
}

export function concatRawLlmForProject(
  payload: Record<string, unknown> | undefined,
  projectName: string
): string | null {
  const d = findDetailForProject(payload, projectName);
  const raw = d?.raw_llm_output;
  if (typeof raw === "string" && raw.trim()) return raw;
  return null;
}

export interface ForensicsLine {
  label: string;
  value: string;
}

export function forensicsLinesForProject(
  payload: Record<string, unknown> | undefined,
  projectName: string
): ForensicsLine[] {
  const d = findDetailForProject(payload, projectName);
  if (!d) return [];

  const lines: ForensicsLine[] = [];
  if (d.scope_type) lines.push({ label: "Scope type", value: d.scope_type });
  if (d.scope_paths?.length)
    lines.push({
      label: "Scope paths",
      value: d.scope_paths.slice(0, 8).join(", ") + (d.scope_paths.length > 8 ? " …" : ""),
    });
  if (d.scan_roots?.length)
    lines.push({ label: "Scan roots", value: d.scan_roots.join(", ") });
  if (typeof d.findings_returned === "number")
    lines.push({ label: "Findings returned (LLM)", value: String(d.findings_returned) });
  if (typeof d.findings_added === "number")
    lines.push({ label: "Findings added (net new)", value: String(d.findings_added) });
  if (d.checklist_id) lines.push({ label: "Checklist", value: d.checklist_id });
  if (d.manifest_revision)
    lines.push({ label: "Manifest revision", value: d.manifest_revision.slice(0, 12) });
  if (typeof d.coverage_complete === "boolean")
    lines.push({
      label: "Coverage (detail)",
      value: d.coverage_complete ? "complete" : "partial",
    });
  if (d.completion_confidence)
    lines.push({ label: "Confidence (detail)", value: d.completion_confidence });
  if (d.exhaustiveness)
    lines.push({ label: "Manifest mode", value: d.exhaustiveness });

  const inScope = d.files_in_scope?.length ?? 0;
  const reviewed = d.files_reviewed?.length ?? 0;
  if (inScope > 0 || reviewed > 0) {
    lines.push({
      label: "Files",
      value: `${reviewed} reviewed / ${inScope} in scope (paths may be sampled)`,
    });
  }

  const knownRef = d.known_findings_referenced?.length ?? 0;
  if (knownRef > 0)
    lines.push({
      label: "Known findings referenced",
      value: String(knownRef),
    });

  return lines;
}

export interface RunSeriesAlert {
  message: string;
  tone: "amber";
}

function sortedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x).trim()).filter(Boolean).sort();
}

/**
 * Stable scope signature for comparing two runs (same project). Uses `project_audit_details`
 * when present; returns null if the payload has no per-project slice (cannot claim scope unchanged).
 */
export function scopeFingerprintForRunCompare(
  run: pennyAuditRunRow,
  projectName: string
): string | null {
  const name = projectName.trim();
  if (!name) return null;
  const detail = findDetailForProject(run.payload, name);
  if (!detail) return null;
  const payload = run.payload ?? {};
  const auditKind = typeof payload.audit_kind === "string" ? payload.audit_kind.trim() : "";
  return [
    `job:${run.job_type}`,
    `kind:${auditKind}`,
    `st:${detail.scope_type ?? ""}`,
    `sp:${sortedStringList(detail.scope_paths).join("\x1e")}`,
    `sr:${sortedStringList(detail.scan_roots).join("\x1e")}`,
    `mr:${String(detail.manifest_revision ?? run.manifest_revision ?? "")}`,
    `ck:${String(detail.checklist_id ?? run.checklist_id ?? "")}`,
    `ex:${String(detail.exhaustiveness ?? run.exhaustiveness ?? "")}`,
  ].join("|");
}

/** Prefer DB column; fall back to per-project payload slice when older rows omit columns. */
export function effectiveCoverageComplete(
  run: pennyAuditRunRow,
  projectName: string
): boolean | null {
  if (typeof run.coverage_complete === "boolean") return run.coverage_complete;
  const d = findDetailForProject(run.payload, projectName.trim());
  if (typeof d?.coverage_complete === "boolean") return d.coverage_complete;
  return null;
}

export interface RunSeriesAlertsOptions {
  /** Used for payload-backed coverage and scope fingerprint; defaults to `runs[0].project_name`. */
  projectName?: string;
}

/**
 * Lightweight comparisons between consecutive runs (newest first), same project list.
 */
export function runSeriesAlerts(
  runs: pennyAuditRunRow[],
  options?: RunSeriesAlertsOptions
): RunSeriesAlert[] {
  const alerts: RunSeriesAlert[] = [];
  const a = runs[0];
  const b = runs[1];
  if (!a || !b) return alerts;

  const projectName = (options?.projectName ?? a.project_name ?? b.project_name ?? "").trim();
  const covA = projectName ? effectiveCoverageComplete(a, projectName) : a.coverage_complete;
  const covB = projectName ? effectiveCoverageComplete(b, projectName) : b.coverage_complete;

  if (covB === true && covA === false) {
    alerts.push({
      tone: "amber",
      message:
        "Latest run reports partial coverage while the prior run was complete — review scope, sampling, or model behavior.",
    });
  }

  if (
    projectName &&
    a.findings_added === 0 &&
    b.findings_added === 0
  ) {
    const fpA = scopeFingerprintForRunCompare(a, projectName);
    const fpB = scopeFingerprintForRunCompare(b, projectName);
    if (fpA && fpB && fpA === fpB) {
      alerts.push({
        tone: "amber",
        message:
          "Two consecutive runs added no findings with the same declared scope — the model may be under-reporting or the area may be genuinely clean.",
      });
    }
  }

  return alerts;
}
