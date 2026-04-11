-- Per-finding Linear sync queue rows (bulk-operations API).
-- Distinct from penny_linear_sync (single JSONB state row per project).

CREATE TABLE IF NOT EXISTS penny_linear_sync_new (
  project_name      TEXT        NOT NULL,
  finding_id        TEXT        NOT NULL,
  linear_issue_id   TEXT        NOT NULL DEFAULT '',
  linear_team_key   TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_name, finding_id)
);

CREATE INDEX IF NOT EXISTS penny_linear_sync_new_project_idx
  ON penny_linear_sync_new (lower(trim(project_name)));

ALTER TABLE penny_linear_sync_new ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "penny_linear_sync_new_owner_scope" ON penny_linear_sync_new;
CREATE POLICY "penny_linear_sync_new_owner_scope"
ON penny_linear_sync_new
FOR ALL
USING (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_linear_sync_new.project_name))
      AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR EXISTS (
    SELECT 1
    FROM penny_projects p
    WHERE lower(trim(p.name)) = lower(trim(penny_linear_sync_new.project_name))
      AND p.owner_id = auth.uid()
  )
);
