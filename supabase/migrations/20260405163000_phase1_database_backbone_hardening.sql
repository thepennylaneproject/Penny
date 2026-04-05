-- Phase 1 hardening: align repair job public IDs and dashboard contract

ALTER TYPE penny_repair_status ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE penny_repair_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE penny_repair_status ADD VALUE IF NOT EXISTS 'selected';
ALTER TYPE penny_repair_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE penny_repair_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ---------------------------------------------------------------------------
-- repair_jobs: add public job identifier and progress payload
-- ---------------------------------------------------------------------------
ALTER TABLE repair_jobs
  ADD COLUMN IF NOT EXISTS repair_job_id UUID;

UPDATE repair_jobs
SET repair_job_id = id
WHERE repair_job_id IS NULL;

ALTER TABLE repair_jobs
  ALTER COLUMN repair_job_id SET DEFAULT gen_random_uuid();

ALTER TABLE repair_jobs
  ALTER COLUMN repair_job_id SET NOT NULL;

ALTER TABLE repair_jobs
  ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{}'::jsonb;

UPDATE repair_jobs
SET progress = '{}'::jsonb
WHERE progress IS NULL;

ALTER TABLE repair_jobs
  ALTER COLUMN progress SET DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_jobs_repair_job_id
  ON repair_jobs (repair_job_id);

CREATE INDEX IF NOT EXISTS idx_repair_jobs_finding_id
  ON repair_jobs (finding_id);

CREATE INDEX IF NOT EXISTS idx_repair_jobs_status_created_at
  ON repair_jobs (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- audit/findings indexes for operational lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_runs_status
  ON audit_runs (status);

CREATE INDEX IF NOT EXISTS idx_findings_run_id
  ON findings (run_id);

CREATE INDEX IF NOT EXISTS idx_repair_candidates_winner
  ON repair_candidates (repair_job_id)
  WHERE is_winner = TRUE;
