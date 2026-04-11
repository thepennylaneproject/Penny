/**
 * penny_audit_jobs / penny_audit_runs — shared types and DB access for dashboard API + worker alignment.
 */

import { createPostgresPool, readDatabaseConfig } from "./postgres";
import { randomUUID } from "node:crypto";
import { normalizeProjectName } from "./project-identity";
import type { EngineStatus, RepairRunSummary } from "./audit-reader";
import { getEngineStatus } from "./audit-reader";
import { listRecentRepairJobs } from "./maintenance-store";
import type { RepairJob } from "./types";

function repairJobToRunSummary(job: RepairJob): RepairRunSummary {
  return {
    run_id: String(job.id ?? job.finding_id),
    finding_id: job.finding_id,
    project_name: job.project_name,
    started_at: job.started_at,
    completed_at: job.completed_at,
    total_cost_usd: job.cost_usd,
    patch_applied: job.patch_applied,
    provider_alias: job.provider_used,
    model: job.model_used,
  };
}

export type pennyJobType =
  | "weekly_audit"
  | "onboard_project"
  | "onboard_repository"
  | "re_audit_project"
  | "synthesize_project"
  | "audit_project"
  | "repair_finding";

export type pennyJobStatus = "queued" | "running" | "completed" | "failed";

export interface pennyAuditJobRow {
  id: string;
  job_type: string;
  project_name: string | null;
  repository_url: string | null;
  manifest_revision: string | null;
  checklist_id: string | null;
  repo_ref: string | null;
  status: pennyJobStatus;
  payload: Record<string, unknown>;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface pennyAuditRunRow {
  id: string;
  job_id: string | null;
  job_type: string;
  project_name: string | null;
  status: string;
  summary: string | null;
  findings_added: number;
  manifest_revision: string | null;
  checklist_id: string | null;
  coverage_complete: boolean | null;
  completion_confidence: string | null;
  exhaustiveness: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

function pool() {
  return createPostgresPool();
}

function rowJob(r: Record<string, unknown>): pennyAuditJobRow {
  return {
    id: String(r.id),
    job_type: String(r.job_type),
    project_name: r.project_name != null ? String(r.project_name) : null,
    repository_url: r.repository_url != null ? String(r.repository_url) : null,
    manifest_revision:
      r.manifest_revision != null ? String(r.manifest_revision) : null,
    checklist_id: r.checklist_id != null ? String(r.checklist_id) : null,
    repo_ref: r.repo_ref != null ? String(r.repo_ref) : null,
    status: r.status as pennyJobStatus,
    payload:
      typeof r.payload === "object" && r.payload !== null
        ? (r.payload as Record<string, unknown>)
        : {},
    error: r.error != null ? String(r.error) : null,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    started_at:
      r.started_at instanceof Date
        ? r.started_at.toISOString()
        : r.started_at != null
          ? String(r.started_at)
          : null,
    finished_at:
      r.finished_at instanceof Date
        ? r.finished_at.toISOString()
        : r.finished_at != null
          ? String(r.finished_at)
          : null,
  };
}

/** Aligned to {@link rowJob} — avoids SELECT * when new columns are added. */
const PENNY_AUDIT_JOBS_COLUMNS =
  "id, job_type, project_name, repository_url, manifest_revision, checklist_id, repo_ref, status, payload, error, created_at, started_at, finished_at";

/** Aligned to {@link rowRun}. */
const PENNY_AUDIT_RUNS_COLUMNS =
  "id, job_id, job_type, project_name, status, summary, findings_added, manifest_revision, checklist_id, coverage_complete, completion_confidence, exhaustiveness, payload, created_at";

function rowRun(r: Record<string, unknown>): pennyAuditRunRow {
  return {
    id: String(r.id),
    job_id: r.job_id != null ? String(r.job_id) : null,
    job_type: String(r.job_type),
    project_name: r.project_name != null ? String(r.project_name) : null,
    status: String(r.status),
    summary: r.summary != null ? String(r.summary) : null,
    findings_added: Number(r.findings_added ?? 0),
    manifest_revision:
      r.manifest_revision != null ? String(r.manifest_revision) : null,
    checklist_id: r.checklist_id != null ? String(r.checklist_id) : null,
    coverage_complete:
      typeof r.coverage_complete === "boolean" ? r.coverage_complete : null,
    completion_confidence:
      r.completion_confidence != null ? String(r.completion_confidence) : null,
    exhaustiveness: r.exhaustiveness != null ? String(r.exhaustiveness) : null,
    payload:
      typeof r.payload === "object" && r.payload !== null
        ? (r.payload as Record<string, unknown>)
        : {},
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  };
}

export function jobsStoreConfigured(): boolean {
  return readDatabaseConfig().configured;
}

/** Ensures a penny_projects row exists so FK constraints can reference it (async sync safe). */
async function ensurePennyProjectPlaceholder(
  db: ReturnType<typeof pool>,
  projectName: string,
  repositoryUrl: string | null
): Promise<void> {
  const name = projectName.trim();
  if (!name) return;
  const now = new Date().toISOString();
  const projectJson = {
    name,
    findings: [],
    lastUpdated: now,
    status: "active",
    sourceType: "orchestration_placeholder",
  };
  await db.query(
    `INSERT INTO penny_projects (name, repository_url, project_json, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (name) DO NOTHING`,
    [name, repositoryUrl, JSON.stringify(projectJson)]
  );
}

export async function insertAuditJob(
  jobType: pennyJobType,
  opts: {
    project_name?: string | null;
    repository_url?: string | null;
    manifest_revision?: string | null;
    checklist_id?: string | null;
    repo_ref?: string | null;
    payload?: Record<string, unknown>;
  } = {}
): Promise<pennyAuditJobRow> {
  const id = randomUUID();
  const db = pool();
  const projectName =
    typeof opts.project_name === "string"
      ? opts.project_name.trim() || null
      : null;
  if (projectName) {
    await ensurePennyProjectPlaceholder(
      db,
      projectName,
      typeof opts.repository_url === "string"
        ? opts.repository_url.trim() || null
        : null
    );
  }
  const rows = await db.query(
    `INSERT INTO penny_audit_jobs (
       id,
       job_type,
       project_name,
       repository_url,
       manifest_revision,
       checklist_id,
       repo_ref,
       status,
       payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8::jsonb)
     RETURNING ${PENNY_AUDIT_JOBS_COLUMNS}`,
    [
      id,
      jobType,
      projectName,
      typeof opts.repository_url === "string"
        ? opts.repository_url.trim() || null
        : null,
      opts.manifest_revision ?? null,
      opts.checklist_id ?? null,
      opts.repo_ref ?? null,
      JSON.stringify(opts.payload ?? {}),
    ]
  );
  return rowJob(rows[0]);
}

export async function listRecentAuditJobs(limit = 25): Promise<pennyAuditJobRow[]> {
  const db = pool();
  const rows = await db.query(
    `SELECT ${PENNY_AUDIT_JOBS_COLUMNS} FROM penny_audit_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(rowJob);
}

export async function listRecentAuditRuns(limit = 15): Promise<pennyAuditRunRow[]> {
  const db = pool();
  const rows = await db.query(
    `SELECT ${PENNY_AUDIT_RUNS_COLUMNS} FROM penny_audit_runs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(rowRun);
}

/** Completed runs for one project (case-insensitive name match). */
export async function listAuditRunsForProject(
  projectName: string,
  limit = 30
): Promise<pennyAuditRunRow[]> {
  const db = pool();
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await db.query(
    `SELECT ${PENNY_AUDIT_RUNS_COLUMNS} FROM penny_audit_runs
     WHERE project_name IS NOT NULL
       AND LOWER(TRIM(project_name)) = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectNameKey, limit]
  );
  return rows.map(rowRun);
}

/** Job rows for one project (queued/running/history). */
export async function listAuditJobsForProject(
  projectName: string,
  limit = 20
): Promise<pennyAuditJobRow[]> {
  const db = pool();
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await db.query(
    `SELECT ${PENNY_AUDIT_JOBS_COLUMNS} FROM penny_audit_jobs
     WHERE project_name IS NOT NULL
       AND LOWER(TRIM(project_name)) = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectNameKey, limit]
  );
  return rows.map(rowJob);
}

export async function getAuditJob(id: string): Promise<pennyAuditJobRow | null> {
  const db = pool();
  const rows = await db.query(
    `SELECT ${PENNY_AUDIT_JOBS_COLUMNS} FROM penny_audit_jobs WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowJob(rows[0]) : null;
}

/** Mark every queued job failed (e.g. operator cancelled / queue reset). */
export async function failAllQueuedJobs(errorMessage: string): Promise<number> {
  const db = pool();
  const rows = await db.query(
    `UPDATE penny_audit_jobs
     SET status = 'failed', finished_at = now(), error = $1
     WHERE status = 'queued'
     RETURNING id`,
    [errorMessage]
  );
  return rows.length;
}

/** Update status (and optionally error message) for a specific job row. */
export async function updateAuditJobStatus(
  id: string,
  status: pennyJobStatus,
  error?: string
): Promise<void> {
  const db = pool();
  await db.query(
    `UPDATE penny_audit_jobs
     SET status = $2, finished_at = CASE WHEN $2 IN ('completed','failed') THEN now() ELSE finished_at END, error = $3
     WHERE id = $1`,
    [id, status, error ?? null]
  );
}

/** Cancel a single queued or running job (marks it failed). Returns the row or null if not found / not cancellable. */
export async function cancelAuditJob(id: string): Promise<pennyAuditJobRow | null> {
  const db = pool();
  const rows = await db.query(
    `UPDATE penny_audit_jobs
     SET status = 'failed', finished_at = now(), error = 'Cancelled by operator'
     WHERE id = $1 AND status IN ('queued', 'running')
     RETURNING ${PENNY_AUDIT_JOBS_COLUMNS}`,
    [id]
  );
  return rows.length > 0 ? rowJob(rows[0]) : null;
}

/** Count jobs currently queued or running (used for the activity badge). */
export async function countActiveAuditJobs(): Promise<number> {
  const db = pool();
  const rows = await db.query(
    `SELECT COUNT(*) AS count FROM penny_audit_jobs WHERE status IN ('queued', 'running')`
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Same data sources as GET /api/engine/status: Postgres when the jobs store is
 * configured, otherwise audit files via {@link getEngineStatus}.
 */
export async function resolveEngineStatus(): Promise<EngineStatus> {
  if (!jobsStoreConfigured()) {
    return getEngineStatus();
  }
  const [runs, repairJobs, activeAuditJobs] = await Promise.all([
    listRecentAuditRuns(100),
    listRecentRepairJobs(100),
    countActiveAuditJobs(),
  ]);
  const completed = repairJobs.filter((job) => job.status === "completed");
  return {
    last_audit_date: runs[0]?.created_at ?? null,
    audit_run_count: runs.length,
    repair_run_count: completed.length,
    total_cost_usd: repairJobs.reduce((sum, job) => sum + (job.cost_usd ?? 0), 0),
    queue_size: repairJobs.filter((job) => job.status === "queued").length,
    queued_findings: repairJobs,
    recent_repair_runs: completed.slice(0, 5).map(repairJobToRunSummary),
    active_audit_jobs: activeAuditJobs,
  };
}
