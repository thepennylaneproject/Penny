-- Restore FKs to penny_projects for audit/durable tables. Backfill placeholder
-- project rows for any names referenced by jobs/runs/events/snapshots so
-- in-flight work and historical rows satisfy the constraint. NOT VALID skips
-- checking existing rows at attach time; new inserts/updates are enforced.
-- insertAuditJob (dashboard) ensures placeholders before queueing new jobs.
-- Full validation of existing rows: 20260410142000_validate_penny_audit_project_fkeys.sql.

INSERT INTO penny_projects (name, repository_url, project_json, updated_at)
SELECT
  pname,
  NULL,
  jsonb_build_object(
    'name',
    pname,
    'findings',
    '[]'::jsonb,
    'lastUpdated',
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'status',
    'active',
    'sourceType',
    'migration_placeholder'
  ),
  now()
FROM (
  SELECT DISTINCT trim(project_name) AS pname
  FROM (
    SELECT project_name FROM penny_audit_jobs
    UNION ALL
    SELECT project_name FROM penny_audit_runs
    UNION ALL
    SELECT project_name FROM penny_orchestration_events
    UNION ALL
    SELECT project_name FROM penny_project_snapshots
  ) AS refs
  WHERE project_name IS NOT NULL AND length(trim(project_name)) > 0
) AS names
ON CONFLICT (name) DO NOTHING;

ALTER TABLE penny_audit_jobs
  ADD CONSTRAINT penny_audit_jobs_project_name_fkey
  FOREIGN KEY (project_name) REFERENCES penny_projects (name) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE penny_audit_runs
  ADD CONSTRAINT penny_audit_runs_project_name_fkey
  FOREIGN KEY (project_name) REFERENCES penny_projects (name) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE penny_orchestration_events
  ADD CONSTRAINT penny_orchestration_events_project_name_fkey
  FOREIGN KEY (project_name) REFERENCES penny_projects (name) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE penny_project_snapshots
  ADD CONSTRAINT penny_project_snapshots_project_name_fkey
  FOREIGN KEY (project_name) REFERENCES penny_projects (name) ON DELETE CASCADE
  NOT VALID;
