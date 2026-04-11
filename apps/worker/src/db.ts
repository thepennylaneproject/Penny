import pg from "pg";
import { resolvePgPoolMax } from "./concurrency-config.js";

const { Pool } = pg;

function normalizeProjectName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRepositoryUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

/** Params: $1 normalized name, $2 normalized repo or null, $3 raw name for ordering tie-break. */
const PENNY_PROJECT_IDENTITY_ORDER_BY = `
      ORDER BY
        CASE
          WHEN name = $3 THEN 0
          WHEN lower(name) = $1 THEN 1
          WHEN $2::text IS NOT NULL
            AND repository_url IS NOT NULL
            AND lower(
              regexp_replace(
                regexp_replace(repository_url, '\\.git$', '', 'i'),
                '/+$',
                ''
              )
            ) = $2 THEN 2
          ELSE 3
        END,
        name ASC
      LIMIT 1`;

function pennyProjectIdentityWhereClause(): string {
  return `
      WHERE lower(name) = $1
         OR (
           $2::text IS NOT NULL
           AND repository_url IS NOT NULL
           AND lower(
             regexp_replace(
               regexp_replace(repository_url, '\\.git$', '', 'i'),
               '/+$',
               ''
             )
           ) = $2
         )`;
}

export function createPool(): pg.Pool {
  // Try environment variables in order of preference
  let url =
    process.env.DATABASE_URL?.trim() ||
    process.env.penny_DATABASE_URL?.trim() ||
    "";

  // If no direct database URL, try to construct from Supabase credentials
  if (!url) {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (supabaseUrl && serviceRoleKey) {
      try {
        // Extract project ID from Supabase URL (e.g., https://abc123.supabase.co)
        const projectId = new URL(supabaseUrl).hostname.split(".")[0];
        // Construct Postgres connection string
        // Format: postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.com:5432/postgres
        url = `postgresql://postgres:${serviceRoleKey}@db.${projectId}.supabase.com:5432/postgres`;
      } catch (e) {
        console.warn("[penny-worker] Failed to construct Supabase connection string", e);
      }
    }
  }

  if (!url) {
    throw new Error(
      "Database connection required. Set DATABASE_URL (or penny_DATABASE_URL), or set SUPABASE_URL + " +
        "SUPABASE_SERVICE_ROLE_KEY. penny-worker loads .env/.env.local from the repo root, apps/dashboard, " +
        "then apps/worker."
    );
  }

  return new Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    max: resolvePgPoolMax(),
  });
}

export interface JobRow {
  id: string;
  job_type: string;
  project_name: string | null;
  repository_url: string | null;
  status: string;
  created_at?: string;
  manifest_revision?: string | null;
  checklist_id?: string | null;
  repo_ref?: string | null;
  payload: Record<string, unknown>;
}

export async function claimJob(
  pool: pg.Pool,
  jobId: string
): Promise<JobRow | null> {
  const r = await pool.query(
     `UPDATE penny_audit_jobs
      SET status = 'running', started_at = COALESCE(started_at, now())
      WHERE id = $1 AND status = 'queued'
      RETURNING id, job_type, project_name, repository_url, status, created_at, manifest_revision, checklist_id, repo_ref, payload`,
    [jobId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    job_type: row.job_type,
    project_name: row.project_name,
    repository_url: row.repository_url,
    status: row.status,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at != null
          ? String(row.created_at)
          : undefined,
    manifest_revision: row.manifest_revision,
    checklist_id: row.checklist_id,
    repo_ref: row.repo_ref,
    payload:
      typeof row.payload === "object" && row.payload ? row.payload : {},
  };
}

export async function completeJob(
  pool: pg.Pool,
  jobId: string,
  error: string | null,
  run: {
    job_type: string;
    project_name: string | null;
    summary: string;
    findings_added: number;
    manifest_revision?: string | null;
    checklist_id?: string | null;
    coverage_complete?: boolean | null;
    completion_confidence?: string | null;
    exhaustiveness?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const status = error ? "failed" : "completed";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE penny_audit_jobs SET status = $2, finished_at = now(), error = $3 WHERE id = $1`,
      [jobId, status, error]
    );
    await client.query(
      `INSERT INTO penny_audit_runs (
         job_id,
         job_type,
         project_name,
         status,
         summary,
         findings_added,
         manifest_revision,
         checklist_id,
         coverage_complete,
         completion_confidence,
         exhaustiveness,
         payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        jobId,
        run.job_type,
        run.project_name,
        status,
        run.summary,
        run.findings_added,
        run.manifest_revision ?? null,
        run.checklist_id ?? null,
        run.coverage_complete ?? null,
        run.completion_confidence ?? null,
        run.exhaustiveness ?? null,
        JSON.stringify(run.payload ?? {}),
      ]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function loadProject(
  pool: pg.Pool,
  name: string
): Promise<Record<string, unknown> | null> {
  const normalizedName = normalizeProjectName(name);
  const normalizedRepo = normalizeRepositoryUrl(null);
  const primary = await pool.query(
    `SELECT name, repository_url, project_json
       FROM penny_projects
      ${pennyProjectIdentityWhereClause()}
      ${PENNY_PROJECT_IDENTITY_ORDER_BY}`,
    [normalizedName, normalizedRepo, name]
  );
  let row = primary.rows[0] as
    | { name: string; repository_url: string | null; project_json: unknown }
    | undefined;
  if (!row) {
    const fallback = await pool.query(
      `SELECT name, repository_url, project_json
         FROM penny_projects
        WHERE name = $1`,
      [name]
    );
    row = fallback.rows[0] as
      | { name: string; repository_url: string | null; project_json: unknown }
      | undefined;
  }
  if (!row) return null;
  const canonicalName = String(row.name);
  const j = row.project_json;
  let p: Record<string, unknown>;
  try {
    p = typeof j === "string" ? JSON.parse(j) : (j as Record<string, unknown>);
  } catch (e) {
    console.error(`[penny-worker] loadProject parse error for ${name}`, e);
    return null;
  }
  if (!p || typeof p !== "object") return null;
  // Return the full project object to preserve stack and any future fields.
  return {
    ...p,
    name: (p.name as string) || canonicalName,
    repositoryUrl:
      (p.repositoryUrl as string | undefined) ?? row.repository_url ?? undefined,
    findings: Array.isArray(p.findings) ? p.findings : [],
  };
}

export async function saveProject(
  pool: pg.Pool,
  project: Record<string, unknown> & { name: string; findings: unknown[] }
): Promise<void> {
  // repositoryUrl goes into the dedicated column; body goes into project_json.
  // Single round-trip: resolve identity in a CTE, then INSERT ... ON CONFLICT (matches loadProject predicate).
  const normalizedName = normalizeProjectName(project.name);
  const normalizedRepo = normalizeRepositoryUrl(
    (project.repositoryUrl as string | null | undefined) ?? null
  );
  const lastUpdated =
    (project.lastUpdated as string | undefined) ?? new Date().toISOString();
  const bodyJson = JSON.stringify({
    ...project,
    name: project.name,
    lastUpdated,
  });
  await pool.query(
    `WITH resolved AS (
       SELECT name, repository_url
         FROM penny_projects
        ${pennyProjectIdentityWhereClause()}
        ${PENNY_PROJECT_IDENTITY_ORDER_BY}
     ),
     canon AS (
       SELECT
         COALESCE((SELECT r.name FROM resolved r), $3::text) AS canonical_name,
         COALESCE(
           $2::text,
           (
             SELECT lower(
               regexp_replace(
                 regexp_replace(trim(repository_url), '\\.git$', '', 'i'),
                 '/+$',
                 ''
               )
             )
             FROM resolved
           )
         ) AS repo_col
     )
     INSERT INTO penny_projects (name, repository_url, project_json, updated_at)
     SELECT
       c.canonical_name,
       c.repo_col,
       jsonb_set(
         CASE
           WHEN c.repo_col IS NULL THEN ($4::jsonb #- '{repositoryUrl}')
           ELSE jsonb_set($4::jsonb, '{repositoryUrl}', to_jsonb(c.repo_col::text))
         END,
         '{name}',
         to_jsonb(c.canonical_name)
       ),
       now()
     FROM canon c
     ON CONFLICT (name) DO UPDATE SET
       repository_url = COALESCE(EXCLUDED.repository_url, penny_projects.repository_url),
       project_json = EXCLUDED.project_json,
       updated_at = now()`,
    [normalizedName, normalizedRepo, project.name, bodyJson]
  );
}

export async function listAllProjects(
  pool: pg.Pool
): Promise<Array<Record<string, unknown> & { name: string; findings: unknown[] }>> {
  const r = await pool.query(`SELECT project_json FROM penny_projects ORDER BY name`);
  const out: Array<Record<string, unknown> & { name: string; findings: unknown[] }> = [];
  for (const row of r.rows) {
    let j: Record<string, unknown>;
    try {
      j =
        typeof row.project_json === "string"
          ? JSON.parse(row.project_json)
          : (row.project_json as Record<string, unknown>);
    } catch (e) {
      console.error("[penny-worker] listAllProjects parse error", e);
      continue;
    }
    if (!j || typeof j !== "object") continue;
    out.push({
      ...j,
      name: (j.name != null && String(j.name)) || "unknown",
      findings: Array.isArray(j.findings) ? j.findings : [],
    });
  }
  return out;
}

export async function saveProjectManifest(
  pool: pg.Pool,
  args: {
    projectName: string;
    repoRevision: string;
    sourceRoot: string;
    checklistId?: string;
    exhaustiveness?: string;
    manifest: Record<string, unknown>;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO penny_project_manifests (
       project_name,
       repo_revision,
       source_root,
       checklist_id,
       exhaustiveness,
       manifest,
       generated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
     ON CONFLICT (project_name, repo_revision) DO UPDATE SET
       source_root = EXCLUDED.source_root,
       checklist_id = EXCLUDED.checklist_id,
       exhaustiveness = EXCLUDED.exhaustiveness,
       manifest = EXCLUDED.manifest,
       generated_at = now()`,
    [
      args.projectName,
      args.repoRevision,
      args.sourceRoot,
      args.checklistId ?? null,
      args.exhaustiveness ?? "exhaustive",
      JSON.stringify(args.manifest),
    ]
  );
}

export async function loadLatestProjectManifest(
  pool: pg.Pool,
  projectName: string
): Promise<Record<string, unknown> | null> {
  const projectNameKey = normalizeProjectName(projectName);
  const result = await pool.query(
    `SELECT manifest
       FROM penny_project_manifests
       WHERE lower(trim(project_name)) = $1
       ORDER BY generated_at DESC
       LIMIT 1`,
    [projectNameKey]
  );
  return (result.rows[0]?.manifest as Record<string, unknown> | undefined) ?? null;
}

export async function insertRepairJob(
  pool: pg.Pool,
  args: {
    projectName: string;
    findingId: string;
    repairPolicy?: Record<string, unknown>;
    targetedFiles?: string[];
    verificationCommands?: string[];
    rollbackNotes?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `INSERT INTO penny_repair_jobs (
       project_name,
       finding_id,
       status,
       repair_policy,
       targeted_files,
       verification_commands,
       rollback_notes,
       payload
     )
     VALUES ($1, $2, 'queued', $3::jsonb, $4::jsonb, $5::jsonb, $6, $7::jsonb)
     RETURNING *`,
    [
      args.projectName,
      args.findingId,
      JSON.stringify(args.repairPolicy ?? {}),
      JSON.stringify(args.targetedFiles ?? []),
      JSON.stringify(args.verificationCommands ?? []),
      args.rollbackNotes ?? null,
      JSON.stringify(args.payload ?? {}),
    ]
  );
  return (result.rows[0] as Record<string, unknown> | undefined) ?? {};
}

function inferBacklogRiskClass(
  finding: Record<string, unknown>
): "low" | "medium" | "high" | "critical" {
  const repairPolicy =
    typeof finding.repair_policy === "object" && finding.repair_policy
      ? (finding.repair_policy as Record<string, unknown>)
      : {};
  const riskClass = repairPolicy.risk_class;
  if (
    riskClass === "low" ||
    riskClass === "medium" ||
    riskClass === "high" ||
    riskClass === "critical"
  ) {
    return riskClass;
  }
  const severity = String(finding.severity ?? "minor").toLowerCase();
  if (severity === "blocker") return "critical";
  if (severity === "major") return "high";
  if (severity === "minor") return "medium";
  return "low";
}

function inferBacklogNextAction(finding: Record<string, unknown>): string {
  const status = String(finding.status ?? "open");
  const repairPolicy =
    typeof finding.repair_policy === "object" && finding.repair_policy
      ? (finding.repair_policy as Record<string, unknown>)
      : {};
  if (status === "fixed_pending_verify") return "verify";
  if (status === "deferred") return "defer";
  if (repairPolicy.approval_required === true) return "plan_task";
  if (repairPolicy.autofix_eligibility === "eligible") return "queue_repair";
  return "plan_task";
}

function inferBacklogStatus(finding: Record<string, unknown>): string {
  const status = String(finding.status ?? "open");
  if (status === "in_progress") return "in_progress";
  if (status === "fixed_pending_verify") return "blocked";
  if (
    status === "fixed_verified" ||
    status === "wont_fix" ||
    status === "deferred" ||
    status === "duplicate" ||
    status === "converted_to_enhancement"
  ) {
    return "done";
  }
  return "open";
}

export async function upsertMaintenanceBacklogFromFindings(
  pool: pg.Pool,
  projectName: string,
  findings: Array<Record<string, unknown>>
): Promise<void> {
  // Filter out findings without a valid id or title before batching
  const valid = findings.filter((f) => {
    return String(f.finding_id ?? "").trim() && String(f.title ?? "").trim();
  });
  if (valid.length === 0) return;

  const ids: string[]                  = [];
  const titles: string[]               = [];
  const summaries: (string | null)[]   = [];
  const statuses: string[]             = [];
  const priorities: string[]           = [];
  const severities: string[]           = [];
  const riskClasses: string[]          = [];
  const nextActions: string[]          = [];
  const findingIdArrays: string[]      = [];
  const dedupeKeyArrays: string[]      = [];
  const duplicateOfs: (string | null)[] = [];
  const blockedReasons: (string | null)[] = [];
  const provenances: string[]          = [];
  const createdAts: (string | null)[]  = [];

  for (const f of valid) {
    const fid   = String(f.finding_id).trim();
    const title = String(f.title).trim();

    ids.push(`backlog-${projectName}-${fid}`);
    titles.push(title);
    summaries.push(typeof f.description === "string" ? f.description : null);
    statuses.push(inferBacklogStatus(f));
    priorities.push(String(f.priority ?? "P2"));
    severities.push(String(f.severity ?? "minor"));
    riskClasses.push(inferBacklogRiskClass(f));
    nextActions.push(inferBacklogNextAction(f));
    findingIdArrays.push(JSON.stringify([fid]));
    dedupeKeyArrays.push(JSON.stringify([
      `finding:${fid}`,
      `title:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ]));
    duplicateOfs.push(typeof f.duplicate_of === "string" ? f.duplicate_of : null);
    blockedReasons.push(
      String(f.status ?? "") === "fixed_pending_verify" ? "Waiting for verification." : null
    );
    provenances.push(JSON.stringify({
      manifest_revision: typeof f.last_seen_revision === "string" ? f.last_seen_revision : undefined,
      finding_id: fid,
      source_type: "finding",
    }));
    createdAts.push(typeof f.first_seen_at === "string" ? f.first_seen_at : null);
  }

  await pool.query(
    `INSERT INTO penny_maintenance_backlog (
       id, project_name, title, summary, canonical_status, source_type,
       priority, severity, risk_class, next_action, finding_ids, dedupe_keys,
       duplicate_of, blocked_reason, provenance, created_at, updated_at
     )
     SELECT
       t.id, $2, t.title, t.summary, t.canonical_status, 'finding',
       t.priority, t.severity, t.risk_class, t.next_action,
       t.finding_ids_json::jsonb, t.dedupe_keys_json::jsonb,
       t.duplicate_of, t.blocked_reason, t.provenance_json::jsonb,
       COALESCE(t.created_at_txt::timestamptz, now()), now()
     FROM UNNEST(
       $1::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
       $11::text[], $12::text[], $13::text[], $14::text[], $15::text[]
     ) AS t(id, title, summary, canonical_status,
            priority, severity, risk_class, next_action, finding_ids_json,
            dedupe_keys_json, duplicate_of, blocked_reason, provenance_json, created_at_txt)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       canonical_status = EXCLUDED.canonical_status,
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
      ids,             // $1
      projectName,     // $2
      titles,          // $3
      summaries,       // $4
      statuses,        // $5
      priorities,      // $6
      severities,      // $7
      riskClasses,     // $8
      nextActions,     // $9
      findingIdArrays, // $10
      dedupeKeyArrays, // $11
      duplicateOfs,    // $12
      blockedReasons,  // $13
      provenances,     // $14
      createdAts,      // $15
    ]
  );
}
