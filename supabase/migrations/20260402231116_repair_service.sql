-- Phase 3: Repair Service — extends tables from 001_lyra_schema.sql
-- NOTE: repair_jobs, repair_candidates, orchestration_events are created in 001.
-- This migration adds Phase 3 columns and repair_costs; it must NOT CREATE those tables again.

-- ---------------------------------------------------------------------------
-- repair_jobs: add Phase 3 columns (001 already created the base table)
-- ---------------------------------------------------------------------------
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'typescript';
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS finding_type TEXT DEFAULT 'bug';
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS finding_severity TEXT DEFAULT 'high';
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS beam_width INT DEFAULT 4;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS max_depth INT DEFAULT 4;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS timeout_seconds INT DEFAULT 180;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS validation_commands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS best_candidate_id UUID;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS best_score FLOAT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS total_candidates_evaluated INT DEFAULT 0;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS confidence_score FLOAT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS confidence_breakdown JSONB;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS pr_id UUID;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS pr_number INT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS pr_url TEXT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE repair_jobs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Backfill project_id from findings for existing rows
UPDATE repair_jobs r
SET project_id = f.project_id
FROM findings f
WHERE r.finding_id = f.id
  AND r.project_id IS NULL;

-- Optional CHECKs (skip if already present from a prior partial run)
DO $$
BEGIN
  ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_beam_width_chk
    CHECK (beam_width IS NULL OR (beam_width >= 1 AND beam_width <= 10));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_max_depth_chk
    CHECK (max_depth IS NULL OR (max_depth >= 1 AND max_depth <= 5));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_timeout_chk
    CHECK (timeout_seconds IS NULL OR (timeout_seconds >= 30 AND timeout_seconds <= 900));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_best_score_chk
    CHECK (best_score IS NULL OR (best_score >= 0 AND best_score <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_confidence_chk
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- repair_candidates: tree depth / ordering (001 has parent_candidate_id tree)
-- ---------------------------------------------------------------------------
ALTER TABLE repair_candidates ADD COLUMN IF NOT EXISTS depth INT;
ALTER TABLE repair_candidates ADD COLUMN IF NOT EXISTS sequence_number INT;
ALTER TABLE repair_candidates ADD COLUMN IF NOT EXISTS error_log TEXT;
ALTER TABLE repair_candidates ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;

-- Assign unique (depth, sequence_number) per job so the index below can apply
UPDATE repair_candidates c
SET
  depth = COALESCE(c.depth, 0),
  sequence_number = COALESCE(
    c.sequence_number,
    sub.rn - 1
  )
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY repair_job_id ORDER BY created_at) AS rn
  FROM repair_candidates
) sub
WHERE c.id = sub.id;

ALTER TABLE repair_candidates ALTER COLUMN depth SET DEFAULT 0;
ALTER TABLE repair_candidates ALTER COLUMN sequence_number SET DEFAULT 0;
ALTER TABLE repair_candidates ALTER COLUMN depth SET NOT NULL;
ALTER TABLE repair_candidates ALTER COLUMN sequence_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS repair_candidates_unique_per_job
  ON repair_candidates (repair_job_id, depth, sequence_number);

-- ---------------------------------------------------------------------------
-- repair_costs: new table (not in 001)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repair_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,

  model TEXT NOT NULL,
  input_tokens INT NOT NULL CHECK (input_tokens >= 0),
  output_tokens INT NOT NULL CHECK (output_tokens >= 0),
  cost_usd FLOAT NOT NULL CHECK (cost_usd >= 0),

  usage_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- orchestration_events: 001 has run_id/entity_*; API uses repair_job_id + action
-- ---------------------------------------------------------------------------
ALTER TABLE orchestration_events ADD COLUMN IF NOT EXISTS repair_job_id UUID REFERENCES repair_jobs(id) ON DELETE CASCADE;
ALTER TABLE orchestration_events ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE orchestration_events ADD COLUMN IF NOT EXISTS confidence_score FLOAT;
ALTER TABLE orchestration_events ADD COLUMN IF NOT EXISTS pr_number INT;

-- Relax NOT NULL on legacy columns so repair-scoped rows can omit generic fields
ALTER TABLE orchestration_events ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE orchestration_events ALTER COLUMN entity_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_repair_jobs_project_id ON repair_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_run_id ON repair_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_status ON repair_jobs(status);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_created_at ON repair_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_candidates_job_id ON repair_candidates(repair_job_id);
CREATE INDEX IF NOT EXISTS idx_repair_candidates_depth ON repair_candidates(repair_job_id, depth);
CREATE INDEX IF NOT EXISTS idx_repair_costs_job_id ON repair_costs(repair_job_id);
CREATE INDEX IF NOT EXISTS idx_repair_costs_created_at ON repair_costs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_events_job_id ON orchestration_events(repair_job_id);
CREATE INDEX IF NOT EXISTS idx_orchestration_events_created_at ON orchestration_events(created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: 20260402163740_rls_policies.sql created a single FOR ALL policy named exactly
-- "Users can access repair jobs for their projects" (human-readable name, not snake_case).
-- Drop that first, then replace with granular SELECT/INSERT policies. Stuck DBs where an
-- older revision omitted the quoted drop are reconciled in 20260410141000_drop_legacy_repair_jobs_rls_policy.sql.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can access repair jobs for their projects" ON repair_jobs;
DROP POLICY IF EXISTS "users_can_view_repair_jobs" ON repair_jobs;
CREATE POLICY "users_can_view_repair_jobs"
  ON repair_jobs
  FOR SELECT
  USING (
    (
      repair_jobs.project_id IS NOT NULL
      AND repair_jobs.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM findings f
      JOIN projects p ON p.id = f.project_id
      WHERE f.id = repair_jobs.finding_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_can_create_repair_jobs" ON repair_jobs;
CREATE POLICY "users_can_create_repair_jobs"
  ON repair_jobs
  FOR INSERT
  WITH CHECK (
    (
      repair_jobs.project_id IS NOT NULL
      AND repair_jobs.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM findings f
      JOIN projects p ON p.id = f.project_id
      WHERE f.id = repair_jobs.finding_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_can_view_repair_candidates" ON repair_candidates;
CREATE POLICY "users_can_view_repair_candidates"
  ON repair_candidates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM repair_jobs rj
      JOIN findings f ON f.id = rj.finding_id
      JOIN projects p ON p.id = f.project_id
      WHERE rj.id = repair_candidates.repair_job_id
        AND p.owner_id = auth.uid()
    )
  );

ALTER TABLE repair_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_repair_costs" ON repair_costs;
CREATE POLICY "users_can_view_repair_costs"
  ON repair_costs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM repair_jobs rj
      JOIN findings f ON f.id = rj.finding_id
      JOIN projects p ON p.id = f.project_id
      WHERE rj.id = repair_costs.repair_job_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_can_view_orchestration_events" ON orchestration_events;
CREATE POLICY "users_can_view_orchestration_events"
  ON orchestration_events
  FOR SELECT
  USING (
    repair_job_id IS NULL
    OR EXISTS (
      SELECT 1 FROM repair_jobs rj
      JOIN findings f ON f.id = rj.finding_id
      JOIN projects p ON p.id = f.project_id
      WHERE rj.id = orchestration_events.repair_job_id
        AND p.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM audit_runs ar
      JOIN projects p ON p.id = ar.project_id
      WHERE ar.id = orchestration_events.run_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_can_insert_orchestration_events" ON orchestration_events;
CREATE POLICY "users_can_insert_orchestration_events"
  ON orchestration_events
  FOR INSERT
  WITH CHECK (
    repair_job_id IS NULL
    OR EXISTS (
      SELECT 1 FROM repair_jobs rj
      JOIN findings f ON f.id = rj.finding_id
      JOIN projects p ON p.id = f.project_id
      WHERE rj.id = orchestration_events.repair_job_id
        AND p.owner_id = auth.uid()
    )
  );

-- Grants: authenticated only for repair_jobs (f-58c68aa7). RLS still applies; anon must not hold
-- table privileges—reduces blast radius if policies regress. service_role bypasses RLS as usual.
-- Remote schema dumps may re-grant anon; 20260407210000_findings_index_repair_jobs_grants.sql revokes anon on repair_jobs.
GRANT SELECT, INSERT, UPDATE ON repair_jobs TO authenticated;
GRANT SELECT ON repair_candidates TO anon, authenticated;
GRANT SELECT ON repair_costs TO anon, authenticated;
GRANT SELECT, INSERT ON orchestration_events TO anon, authenticated;
