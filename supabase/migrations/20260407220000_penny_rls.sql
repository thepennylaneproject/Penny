-- Migration: Enable Row Level Security on all penny_* dashboard tables
-- Fixes: f-9ef3f9e1 — penny_* tables had no RLS and relied solely on connection
--        string secrecy for tenant isolation.
--
-- Strategy:
--   1. Add owner_id to penny_projects (the root table) so rows are tied to an
--      auth.users identity.
--   2. Enable RLS on every penny_* table.
--   3. Grant authenticated users access to rows they own; child tables inherit
--      access via a sub-select against penny_projects.owner_id.
--   4. Revoke all privileges from the anon role so unauthenticated PostgREST
--      requests are rejected at the DB layer, not just application code.
--   (service_role bypasses RLS automatically in Supabase and is unaffected.)

-- ── 1. Add owner_id to penny_projects ────────────────────────────────────────
ALTER TABLE penny_projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Enable RLS on all penny_* tables ──────────────────────────────────────
ALTER TABLE penny_projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_audit_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_audit_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_orchestration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_project_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_repair_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_maintenance_backlog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_maintenance_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_project_manifests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_linear_sync          ENABLE ROW LEVEL SECURITY;

-- ── 3. Index to make child-table RLS sub-selects efficient ───────────────────
-- Child table policies use EXISTS (SELECT 1 FROM penny_projects WHERE name = …
-- AND owner_id = auth.uid()). A composite index makes those lookups O(log n).
CREATE INDEX IF NOT EXISTS idx_penny_projects_name_owner
  ON penny_projects (name, owner_id);

-- ── 4. penny_projects: owner-scoped policy ───────────────────────────────────
-- WITH CHECK (auth.uid() = owner_id) prevents authenticated users from
-- inserting rows where owner_id IS NULL or belongs to another user, because
-- NULL = auth.uid() evaluates to NULL (falsy) in SQL.
CREATE POLICY "penny_projects_owner_access"
  ON penny_projects
  FOR ALL
  TO authenticated
  USING  (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ── 5. Child table policies (inherit ownership via penny_projects) ────────────

CREATE POLICY "penny_audit_jobs_owner_access"
  ON penny_audit_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_audit_jobs.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_audit_runs_owner_access"
  ON penny_audit_runs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_audit_runs.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_orchestration_events_owner_access"
  ON penny_orchestration_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_orchestration_events.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_project_snapshots_owner_access"
  ON penny_project_snapshots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_project_snapshots.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_repair_jobs_owner_access"
  ON penny_repair_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_repair_jobs.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_maintenance_backlog_owner_access"
  ON penny_maintenance_backlog
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_maintenance_backlog.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_maintenance_tasks_owner_access"
  ON penny_maintenance_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_maintenance_tasks.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_project_manifests_owner_access"
  ON penny_project_manifests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_project_manifests.project_name
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "penny_linear_sync_owner_access"
  ON penny_linear_sync
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM penny_projects pp
      WHERE pp.name = penny_linear_sync.project_name
        AND pp.owner_id = auth.uid()
    )
  );

-- ── 6. Revoke anon role access from all penny_* tables ───────────────────────
REVOKE ALL ON penny_projects             FROM anon;
REVOKE ALL ON penny_audit_jobs           FROM anon;
REVOKE ALL ON penny_audit_runs           FROM anon;
REVOKE ALL ON penny_orchestration_events FROM anon;
REVOKE ALL ON penny_project_snapshots    FROM anon;
REVOKE ALL ON penny_repair_jobs          FROM anon;
REVOKE ALL ON penny_maintenance_backlog  FROM anon;
REVOKE ALL ON penny_maintenance_tasks    FROM anon;
REVOKE ALL ON penny_project_manifests    FROM anon;
REVOKE ALL ON penny_linear_sync          FROM anon;
