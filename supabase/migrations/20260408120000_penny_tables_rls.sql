-- Enforce authz at the database layer for dashboard penny_* tables.
-- Service-role access remains available for backend jobs.
--
-- Deploy verification (f-23063538): after `supabase db push` / migrate on staging and production, confirm:
--   SELECT c.relname, c.relrowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'penny\_%' ESCAPE '\';
-- Expect relrowsecurity = true for each penny_* table listed below.
-- Client access: dashboard routes using createSupabaseServerClient use the end-user JWT (authenticated);
-- maintenance-store / worker use DATABASE_URL or service_role and bypass RLS—intended for server-side jobs.

ALTER TABLE penny_projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

ALTER TABLE penny_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_audit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_orchestration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_project_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_repair_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_maintenance_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_project_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_linear_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "penny_projects_owner_scope" ON penny_projects;
CREATE POLICY "penny_projects_owner_scope"
ON penny_projects
FOR ALL
USING (
  auth.role() = 'service_role'
  OR owner_id = auth.uid()
)
WITH CHECK (
  auth.role() = 'service_role'
  OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "penny_audit_runs_owner_scope" ON penny_audit_runs;
CREATE POLICY "penny_audit_runs_owner_scope"
ON penny_audit_runs
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_audit_runs.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_audit_runs.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_audit_jobs_owner_scope" ON penny_audit_jobs;
CREATE POLICY "penny_audit_jobs_owner_scope"
ON penny_audit_jobs
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_audit_jobs.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_audit_jobs.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_orchestration_events_owner_scope" ON penny_orchestration_events;
CREATE POLICY "penny_orchestration_events_owner_scope"
ON penny_orchestration_events
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_orchestration_events.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_orchestration_events.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_project_snapshots_owner_scope" ON penny_project_snapshots;
CREATE POLICY "penny_project_snapshots_owner_scope"
ON penny_project_snapshots
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_project_snapshots.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_project_snapshots.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_repair_jobs_owner_scope" ON penny_repair_jobs;
CREATE POLICY "penny_repair_jobs_owner_scope"
ON penny_repair_jobs
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_repair_jobs.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_repair_jobs.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_maintenance_backlog_owner_scope" ON penny_maintenance_backlog;
CREATE POLICY "penny_maintenance_backlog_owner_scope"
ON penny_maintenance_backlog
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_maintenance_backlog.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_maintenance_backlog.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_maintenance_tasks_owner_scope" ON penny_maintenance_tasks;
CREATE POLICY "penny_maintenance_tasks_owner_scope"
ON penny_maintenance_tasks
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_maintenance_tasks.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_maintenance_tasks.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_project_manifests_owner_scope" ON penny_project_manifests;
CREATE POLICY "penny_project_manifests_owner_scope"
ON penny_project_manifests
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_project_manifests.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_project_manifests.project_name))
      AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "penny_linear_sync_owner_scope" ON penny_linear_sync;
CREATE POLICY "penny_linear_sync_owner_scope"
ON penny_linear_sync
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_linear_sync.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_linear_sync.project_name))
      AND p.owner_id = auth.uid()
  )
);
