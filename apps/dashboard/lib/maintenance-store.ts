import { createPostgresPool } from "./postgres";
import { buildStaleRepairError, getRepairJobStaleTimeoutMs } from "./job-timeouts";
import { normalizeProjectName } from "./project-identity";
import { parseRepairProof } from "./repair-proof";
import type {
  MaintenanceBacklogItem,
  MaintenanceTask,
  ProjectManifest,
  RepairJob,
} from "./types";

function pool() {
  return createPostgresPool();
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item : String(item ?? "")).trim())
        .filter((item) => item.length > 0)
    : [];
}

function coerceTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return undefined;
  const asString = String(value).trim();
  return asString ? asString : undefined;
}

export async function getLatestManifestForProject(
  projectName: string
): Promise<ProjectManifest | null> {
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await pool().query(
    `SELECT manifest
       FROM penny_project_manifests
       WHERE lower(trim(project_name)) = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
    [projectNameKey]
  );
  const manifest = rows[0]?.manifest;
  return manifest ? (manifest as ProjectManifest) : null;
}

export async function listRepairJobsForProject(
  projectName: string,
  limit = 50
): Promise<RepairJob[]> {
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await pool().query(
    `SELECT *
       FROM penny_repair_jobs
       WHERE lower(trim(project_name)) = $1
       ORDER BY created_at DESC
       LIMIT $2`,
    [projectNameKey, limit]
  );
  return rows.map((row) => {
    const repairPolicy = asJsonObject(row.repair_policy);
    const payload = asJsonObject(row.payload);
    return {
      id: String(row.id),
      finding_id: String(row.finding_id),
      project_name: String(row.project_name),
      queued_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      started_at: coerceTimestamp(row.started_at ?? payload.started_at),
      status: String(row.status) as RepairJob["status"],
      patch_applied:
        typeof row.patch_applied === "boolean" ? row.patch_applied : undefined,
      completed_at:
        row.finished_at instanceof Date
          ? row.finished_at.toISOString()
          : row.finished_at != null
            ? String(row.finished_at)
            : undefined,
      error: row.error != null ? String(row.error) : undefined,
      targeted_files: Array.isArray(row.targeted_files)
        ? (row.targeted_files as string[])
        : [],
      applied_files: asStringArray(payload.applied_files),
      verification_commands: Array.isArray(row.verification_commands)
        ? (row.verification_commands as string[])
        : [],
      rollback_notes:
        row.rollback_notes != null ? String(row.rollback_notes) : undefined,
      repair_policy: {
        ...repairPolicy,
        ...asJsonObject(payload.repair_policy),
      },
      maintenance_task_id:
        row.maintenance_task_id != null ? String(row.maintenance_task_id) : undefined,
      backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
      provenance: asJsonObject(row.provenance),
      reported_status:
        typeof payload.reported_status === "string"
          ? (payload.reported_status as RepairJob["reported_status"])
          : undefined,
      repair_proof: parseRepairProof(payload.repair_proof) ?? undefined,
    };
  });
}

/** Newest-first repair ledger rows for one finding (Postgres store only). */
export async function listRepairJobsForFinding(
  projectName: string,
  findingId: string,
  limit = 8
): Promise<RepairJob[]> {
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await pool().query(
    `SELECT *
       FROM penny_repair_jobs
       WHERE lower(trim(project_name)) = $1
         AND finding_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
    [projectNameKey, findingId, limit]
  );
  return rows.map((row) => {
    const repairPolicy = asJsonObject(row.repair_policy);
    const payload = asJsonObject(row.payload);
    return {
      id: String(row.id),
      finding_id: String(row.finding_id),
      project_name: String(row.project_name),
      queued_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      started_at: coerceTimestamp(row.started_at ?? payload.started_at),
      status: String(row.status) as RepairJob["status"],
      patch_applied:
        typeof row.patch_applied === "boolean" ? row.patch_applied : undefined,
      completed_at:
        row.finished_at instanceof Date
          ? row.finished_at.toISOString()
          : row.finished_at != null
            ? String(row.finished_at)
            : undefined,
      error: row.error != null ? String(row.error) : undefined,
      targeted_files: Array.isArray(row.targeted_files)
        ? (row.targeted_files as string[])
        : [],
      applied_files: asStringArray(payload.applied_files),
      verification_commands: Array.isArray(row.verification_commands)
        ? (row.verification_commands as string[])
        : [],
      rollback_notes:
        row.rollback_notes != null ? String(row.rollback_notes) : undefined,
      repair_policy: {
        ...repairPolicy,
        ...asJsonObject(payload.repair_policy),
      },
      maintenance_task_id:
        row.maintenance_task_id != null ? String(row.maintenance_task_id) : undefined,
      backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
      provenance: asJsonObject(row.provenance),
      reported_status:
        typeof payload.reported_status === "string"
          ? (payload.reported_status as RepairJob["reported_status"])
          : undefined,
      repair_proof: parseRepairProof(payload.repair_proof) ?? undefined,
    };
  });
}

export async function listRecentRepairJobs(limit = 50): Promise<RepairJob[]> {
  const rows = await pool().query(
    `SELECT *
       FROM penny_repair_jobs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((row) => {
    const payload = asJsonObject(row.payload);
    return {
      id: String(row.id),
      finding_id: String(row.finding_id),
      project_name: String(row.project_name),
      queued_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      started_at: coerceTimestamp(row.started_at ?? payload.started_at),
      status: String(row.status) as RepairJob["status"],
      patch_applied:
        typeof row.patch_applied === "boolean" ? row.patch_applied : undefined,
      completed_at:
        row.finished_at instanceof Date
          ? row.finished_at.toISOString()
          : row.finished_at != null
            ? String(row.finished_at)
            : undefined,
      error: row.error != null ? String(row.error) : undefined,
      targeted_files: Array.isArray(row.targeted_files)
        ? (row.targeted_files as string[])
        : [],
      applied_files: asStringArray(payload.applied_files),
      verification_commands: Array.isArray(row.verification_commands)
        ? (row.verification_commands as string[])
        : [],
      rollback_notes:
        row.rollback_notes != null ? String(row.rollback_notes) : undefined,
      repair_policy: asJsonObject(row.repair_policy),
      maintenance_task_id:
        row.maintenance_task_id != null ? String(row.maintenance_task_id) : undefined,
      backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
      provenance: asJsonObject(row.provenance),
      reported_status:
        typeof payload.reported_status === "string"
          ? (payload.reported_status as RepairJob["reported_status"])
          : undefined,
      repair_proof: parseRepairProof(payload.repair_proof) ?? undefined,
    };
  });
}

export async function insertRepairJobRecord(args: {
  project_name: string;
  finding_id: string;
  repair_policy?: Record<string, unknown>;
  targeted_files?: string[];
  verification_commands?: string[];
  rollback_notes?: string;
  maintenance_task_id?: string;
  backlog_id?: string;
  provenance?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): Promise<RepairJob> {
  const rows = await pool().query(
    `INSERT INTO penny_repair_jobs (
       project_name,
       finding_id,
       status,
       repair_policy,
       targeted_files,
       verification_commands,
       rollback_notes,
       maintenance_task_id,
       backlog_id,
       provenance,
       payload
     )
     VALUES ($1, $2, 'queued', $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb)
     RETURNING *`,
    [
      args.project_name,
      args.finding_id,
      JSON.stringify(args.repair_policy ?? {}),
      JSON.stringify(args.targeted_files ?? []),
      JSON.stringify(args.verification_commands ?? []),
      args.rollback_notes ?? null,
      args.maintenance_task_id ?? null,
      args.backlog_id ?? null,
      JSON.stringify(args.provenance ?? {}),
      JSON.stringify(args.payload ?? {}),
    ]
  );
  const row = rows[0] ?? {};
  return {
    id: row.id != null ? String(row.id) : undefined,
    finding_id: String(row.finding_id ?? args.finding_id),
    project_name: String(row.project_name ?? args.project_name),
    queued_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
    started_at: coerceTimestamp(row.started_at),
    status: String(row.status ?? "queued") as RepairJob["status"],
    targeted_files: Array.isArray(row.targeted_files)
      ? (row.targeted_files as string[])
      : args.targeted_files ?? [],
    verification_commands: Array.isArray(row.verification_commands)
      ? (row.verification_commands as string[])
      : args.verification_commands ?? [],
    rollback_notes:
      row.rollback_notes != null
        ? String(row.rollback_notes)
        : args.rollback_notes,
    repair_policy: args.repair_policy,
    applied_files: [],
    maintenance_task_id:
      row.maintenance_task_id != null ? String(row.maintenance_task_id) : args.maintenance_task_id,
    backlog_id: row.backlog_id != null ? String(row.backlog_id) : args.backlog_id,
    provenance: asJsonObject(row.provenance),
  };
}

/**
 * Remove queued/running repair jobs for a finding (cancel from queue).
 * Completed/failed rows are kept for the ledger.
 */
export async function deleteActiveRepairJobsForFinding(args: {
  finding_id: string;
  project_name?: string;
}): Promise<number> {
  const findingId = args.finding_id.trim();
  const projectName = args.project_name?.trim() ?? "";
  if (projectName) {
    const projectNameKey = normalizeProjectName(projectName);
    const rows = await pool().query(
      `DELETE FROM penny_repair_jobs
        WHERE finding_id = $1
          AND lower(trim(project_name)) = $2
          AND status IN ('queued', 'running')
        RETURNING id`,
      [findingId, projectNameKey]
    );
    return rows.length;
  }
  console.warn(
    `deleteActiveRepairJobsForFinding called without project_name for finding_id=${findingId}. ` +
      "Removing active jobs across all projects with this finding_id."
  );
  const rows = await pool().query(
    `DELETE FROM penny_repair_jobs
      WHERE finding_id = $1
        AND status IN ('queued', 'running')
      RETURNING id`,
    [findingId]
  );
  return rows.length;
}

function rowToBacklog(row: Record<string, unknown>): MaintenanceBacklogItem {
  return {
    id: String(row.id),
    project_name: String(row.project_name),
    title: String(row.title),
    summary: row.summary != null ? String(row.summary) : undefined,
    canonical_status: String(row.canonical_status) as MaintenanceBacklogItem["canonical_status"],
    source_type: String(row.source_type) as MaintenanceBacklogItem["source_type"],
    priority: String(row.priority) as MaintenanceBacklogItem["priority"],
    severity: String(row.severity) as MaintenanceBacklogItem["severity"],
    risk_class: String(row.risk_class) as MaintenanceBacklogItem["risk_class"],
    next_action: String(row.next_action) as MaintenanceBacklogItem["next_action"],
    finding_ids: Array.isArray(row.finding_ids) ? (row.finding_ids as string[]) : [],
    dedupe_keys: Array.isArray(row.dedupe_keys) ? (row.dedupe_keys as string[]) : [],
    duplicate_of: row.duplicate_of != null ? String(row.duplicate_of) : undefined,
    blocked_reason: row.blocked_reason != null ? String(row.blocked_reason) : undefined,
    provenance: asJsonObject(row.provenance),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ""),
  };
}

function rowToTask(row: Record<string, unknown>): MaintenanceTask {
  return {
    id: String(row.id),
    project_name: String(row.project_name),
    backlog_id: String(row.backlog_id),
    title: String(row.title),
    intended_outcome: String(row.intended_outcome),
    status: String(row.status) as MaintenanceTask["status"],
    target_domains: Array.isArray(row.target_domains) ? (row.target_domains as string[]) : [],
    target_files: Array.isArray(row.target_files) ? (row.target_files as string[]) : [],
    risk_class: String(row.risk_class) as MaintenanceTask["risk_class"],
    verification_profile:
      row.verification_profile != null
        ? String(row.verification_profile) as MaintenanceTask["verification_profile"]
        : undefined,
    verification_commands: Array.isArray(row.verification_commands)
      ? (row.verification_commands as string[])
      : [],
    rollback_notes: row.rollback_notes != null ? String(row.rollback_notes) : undefined,
    notes: row.notes != null ? String(row.notes) : undefined,
    provenance: asJsonObject(row.provenance),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ""),
  };
}

export async function listMaintenanceBacklogForProject(
  projectName: string,
  limit = 100
): Promise<MaintenanceBacklogItem[]> {
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await pool().query(
    `SELECT *
       FROM penny_maintenance_backlog
       WHERE lower(trim(project_name)) = $1
       ORDER BY
         CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT $2`,
    [projectNameKey, limit]
  );
  return rows.map(rowToBacklog);
}

export async function listMaintenanceTasksForProject(
  projectName: string,
  limit = 100
): Promise<MaintenanceTask[]> {
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await pool().query(
    `SELECT *
       FROM penny_maintenance_tasks
       WHERE lower(trim(project_name)) = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
    [projectNameKey, limit]
  );
  return rows.map(rowToTask);
}

export async function upsertMaintenanceBacklogItems(
  projectName: string,
  items: MaintenanceBacklogItem[]
): Promise<void> {
  if (items.length === 0) return;

  const ids: string[]           = [];
  const titles: string[]        = [];
  const summaries: (string | null)[] = [];
  const statuses: string[]      = [];
  const sourceTypes: string[]   = [];
  const priorities: string[]    = [];
  const severities: string[]    = [];
  const riskClasses: string[]   = [];
  const nextActions: string[]   = [];
  const findingIds: string[]    = [];
  const dedupeKeys: string[]    = [];
  const duplicateOfs: (string | null)[] = [];
  const blockedReasons: (string | null)[] = [];
  const provenances: string[]   = [];
  const createdAts: (string | null)[] = [];

  for (const item of items) {
    ids.push(item.id);
    titles.push(item.title);
    summaries.push(item.summary ?? null);
    statuses.push(item.canonical_status);
    sourceTypes.push(item.source_type);
    priorities.push(item.priority);
    severities.push(item.severity);
    riskClasses.push(item.risk_class);
    nextActions.push(item.next_action);
    findingIds.push(JSON.stringify(item.finding_ids ?? []));
    dedupeKeys.push(JSON.stringify(item.dedupe_keys ?? []));
    duplicateOfs.push(item.duplicate_of ?? null);
    blockedReasons.push(item.blocked_reason ?? null);
    provenances.push(JSON.stringify(item.provenance ?? {}));
    createdAts.push(item.created_at ?? null);
  }

  await pool().query(
    `INSERT INTO penny_maintenance_backlog (
       id, project_name, title, summary, canonical_status, source_type,
       priority, severity, risk_class, next_action, finding_ids, dedupe_keys,
       duplicate_of, blocked_reason, provenance, created_at, updated_at
     )
     SELECT
       t.id, $2, t.title, t.summary, t.canonical_status, t.source_type,
       t.priority, t.severity, t.risk_class, t.next_action,
       t.finding_ids_json::jsonb, t.dedupe_keys_json::jsonb,
       t.duplicate_of, t.blocked_reason, t.provenance_json::jsonb,
       COALESCE(t.created_at_txt::timestamptz, now()), now()
     FROM UNNEST(
       $1::text[], $3::text[], $4::text[], $5::text[], $6::text[],
       $7::text[], $8::text[], $9::text[], $10::text[], $11::text[],
       $12::text[], $13::text[], $14::text[], $15::text[], $16::text[]
     ) AS t(id, title, summary, canonical_status, source_type, priority, severity,
            risk_class, next_action, finding_ids_json, dedupe_keys_json,
            duplicate_of, blocked_reason, provenance_json, created_at_txt)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       canonical_status = EXCLUDED.canonical_status,
       source_type = EXCLUDED.source_type,
       priority = EXCLUDED.priority,
       severity = EXCLUDED.severity,
       risk_class = EXCLUDED.risk_class,
       next_action = EXCLUDED.next_action,
       finding_ids = EXCLUDED.finding_ids,
       dedupe_keys = EXCLUDED.dedupe_keys,
       duplicate_of = EXCLUDED.duplicate_of,
       blocked_reason = EXCLUDED.blocked_reason,
       provenance = EXCLUDED.provenance,
       updated_at = now()`,
    [
      ids,           // $1
      projectName,   // $2
      titles,        // $3
      summaries,     // $4
      statuses,      // $5
      sourceTypes,   // $6
      priorities,    // $7
      severities,    // $8
      riskClasses,   // $9
      nextActions,   // $10
      findingIds,    // $11
      dedupeKeys,    // $12
      duplicateOfs,  // $13
      blockedReasons, // $14
      provenances,   // $15
      createdAts,    // $16
    ]
  );
}

export async function createMaintenanceTask(
  task: Omit<MaintenanceTask, "id" | "created_at" | "updated_at">
): Promise<MaintenanceTask> {
  const rows = await pool().query(
    `INSERT INTO penny_maintenance_tasks (
       project_name, backlog_id, title, intended_outcome, status,
       target_domains, target_files, risk_class, verification_profile,
       verification_commands, rollback_notes, notes, provenance
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11, $12, $13::jsonb)
     RETURNING *`,
    [
      task.project_name,
      task.backlog_id,
      task.title,
      task.intended_outcome,
      task.status,
      JSON.stringify(task.target_domains ?? []),
      JSON.stringify(task.target_files ?? []),
      task.risk_class,
      task.verification_profile ?? null,
      JSON.stringify(task.verification_commands ?? []),
      task.rollback_notes ?? null,
      task.notes ?? null,
      JSON.stringify(task.provenance ?? {}),
    ]
  );
  return rowToTask(rows[0]);
}

export async function updateMaintenanceBacklogStatus(
  id: string,
  status: string,
  nextAction: string
): Promise<void> {
  await pool().query(
    `UPDATE penny_maintenance_backlog
        SET canonical_status = $2,
            next_action = $3,
            updated_at = now()
      WHERE id = $1`,
    [id, status, nextAction]
  );
}

export async function updateMaintenanceTaskStatus(
  id: string,
  status: string
): Promise<MaintenanceTask> {
  const rows = await pool().query(
    `UPDATE penny_maintenance_tasks
        SET status = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, status]
  );
  if (!rows[0]) {
    throw new Error(`Maintenance task not found: ${id}`);
  }
  return rowToTask(rows[0]);
}

/**
 * Mark a queued repair job as running.
 * Called by the repair engine when it dequeues and begins processing a job.
 */
export async function markRepairJobRunning(
  findingId: string,
  projectName: string
): Promise<RepairJob | null> {
  const projectNameKey = normalizeProjectName(projectName);
  const rows = await pool().query(
    `UPDATE penny_repair_jobs
         SET status = 'running',
             started_at = COALESCE(started_at, now()),
             payload = payload || jsonb_build_object('started_at', now()::text)
        WHERE finding_id = $1 AND lower(trim(project_name)) = $2 AND status = 'queued'
        RETURNING *`,
    [findingId, projectNameKey]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: row.id != null ? String(row.id) : undefined,
    finding_id: String(row.finding_id),
    project_name: String(row.project_name),
    queued_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    started_at: coerceTimestamp(row.started_at),
    status: "running",
    targeted_files: Array.isArray(row.targeted_files)
      ? (row.targeted_files as string[])
      : [],
    verification_commands: Array.isArray(row.verification_commands)
      ? (row.verification_commands as string[])
      : [],
    rollback_notes:
      row.rollback_notes != null ? String(row.rollback_notes) : undefined,
    repair_policy: asJsonObject(row.repair_policy),
    maintenance_task_id:
      row.maintenance_task_id != null ? String(row.maintenance_task_id) : undefined,
    backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
    provenance: asJsonObject(row.provenance),
  };
}

/**
 * Update a repair job with completion status and metadata from the repair engine.
 * Called by the Python repair engine when a repair run completes.
 */
export async function updateRepairJobCompletion(args: {
  finding_id: string;
  project_name: string;
  status: "completed" | "failed";
  reported_status?: "completed" | "failed" | "applied";
  patch_applied?: boolean;
  applied_files?: string[];
  error?: string;
  run_id?: string;
  repair_proof?: RepairJob["repair_proof"];
}): Promise<RepairJob> {
  const projectNameKey = normalizeProjectName(args.project_name);
  const rows = await pool().query(
    `UPDATE penny_repair_jobs
        SET status = $1,
            patch_applied = COALESCE($2, patch_applied),
            error = COALESCE($3, error),
            finished_at = now(),
            payload = jsonb_build_object(
              'applied_files', COALESCE($4::jsonb, payload->'applied_files', '[]'::jsonb),
              'run_id', COALESCE($5, payload->>'run_id'),
              'repair_proof', COALESCE($6::jsonb, payload->'repair_proof', '{}'::jsonb),
              'reported_status', COALESCE($7, payload->>'reported_status')
            ) || (payload - 'applied_files' - 'run_id' - 'repair_proof' - 'reported_status')
        WHERE finding_id = $8 AND lower(trim(project_name)) = $9 AND status IN ('queued', 'running')
        RETURNING *`,
    [
      args.status,
      args.patch_applied ?? null,
      args.error ?? null,
      JSON.stringify(args.applied_files ?? []),
      args.run_id ?? null,
      JSON.stringify(args.repair_proof ?? {}),
      args.reported_status ?? args.status,
      args.finding_id,
      projectNameKey,
    ]
  );

  if (!rows[0]) {
    throw new Error(
      `Repair job not found or not in queued status: ${args.project_name}/${args.finding_id}`
    );
  }

  const row = rows[0];
  const payload = asJsonObject(row.payload);
  return {
    id: row.id != null ? String(row.id) : undefined,
    finding_id: String(row.finding_id),
    project_name: String(row.project_name),
    queued_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    started_at: coerceTimestamp(row.started_at ?? payload.started_at),
    status: String(row.status) as RepairJob["status"],
    patch_applied:
      typeof row.patch_applied === "boolean" ? row.patch_applied : undefined,
    completed_at:
      row.finished_at instanceof Date
        ? row.finished_at.toISOString()
        : row.finished_at != null
          ? String(row.finished_at)
          : undefined,
    error: row.error != null ? String(row.error) : undefined,
    targeted_files: Array.isArray(row.targeted_files)
      ? (row.targeted_files as string[])
      : [],
    applied_files: asStringArray(payload.applied_files),
    verification_commands: Array.isArray(row.verification_commands)
      ? (row.verification_commands as string[])
      : [],
    rollback_notes:
      row.rollback_notes != null ? String(row.rollback_notes) : undefined,
    repair_policy: asJsonObject(row.repair_policy),
    maintenance_task_id:
      row.maintenance_task_id != null ? String(row.maintenance_task_id) : undefined,
    backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
    provenance: asJsonObject(row.provenance),
    reported_status:
      typeof payload.reported_status === "string"
        ? (payload.reported_status as RepairJob["reported_status"])
        : undefined,
    repair_proof: parseRepairProof(payload.repair_proof) ?? undefined,
  };
}

export async function recoverStaleRepairJobs(
  timeoutMs = getRepairJobStaleTimeoutMs()
): Promise<RepairJob[]> {
  const rows = await pool().query(
    `UPDATE penny_repair_jobs
        SET status = 'failed',
            error = COALESCE(error, $2),
            finished_at = now(),
            started_at = COALESCE(started_at, NULLIF(payload->>'started_at', '')::timestamptz),
            payload = jsonb_set(
              jsonb_set(COALESCE(payload, '{}'::jsonb), '{recovery_reason}', to_jsonb('stale_timeout'::text), true),
              '{stale_recovered_at}',
              to_jsonb(now()::text),
              true
            )
      WHERE status = 'running'
        AND COALESCE(started_at, NULLIF(payload->>'started_at', '')::timestamptz, created_at)
            < now() - ($1 * interval '1 millisecond')
      RETURNING *`,
    [timeoutMs, buildStaleRepairError(timeoutMs)]
  );

  return rows.map((row) => {
    const payload = asJsonObject(row.payload);
    return {
      id: String(row.id),
      finding_id: String(row.finding_id),
      project_name: String(row.project_name),
      queued_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      started_at: coerceTimestamp(row.started_at ?? payload.started_at),
      status: String(row.status) as RepairJob["status"],
      patch_applied:
        typeof row.patch_applied === "boolean" ? row.patch_applied : undefined,
      completed_at: coerceTimestamp(row.finished_at),
      error: row.error != null ? String(row.error) : undefined,
      targeted_files: Array.isArray(row.targeted_files)
        ? (row.targeted_files as string[])
        : [],
      applied_files: asStringArray(payload.applied_files),
      verification_commands: Array.isArray(row.verification_commands)
        ? (row.verification_commands as string[])
        : [],
      rollback_notes:
        row.rollback_notes != null ? String(row.rollback_notes) : undefined,
      repair_policy: asJsonObject(row.repair_policy),
      maintenance_task_id:
        row.maintenance_task_id != null ? String(row.maintenance_task_id) : undefined,
      backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
      provenance: asJsonObject(row.provenance),
      reported_status:
        typeof payload.reported_status === "string"
          ? (payload.reported_status as RepairJob["reported_status"])
          : undefined,
      repair_proof: parseRepairProof(payload.repair_proof) ?? undefined,
    };
  });
}
