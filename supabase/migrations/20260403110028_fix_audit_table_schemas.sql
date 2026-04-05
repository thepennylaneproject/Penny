-- Migration 008: Fix incomplete penny_audit_jobs and penny_audit_runs schemas
--
-- Migration 005 created these tables with only skeleton columns.
-- This migration adds all columns required by orchestration-jobs.ts and the worker.
-- Also drops foreign-key constraints on project_name so jobs can be inserted
-- without a matching row in penny_projects (projects are synced asynchronously).

-- ── penny_audit_jobs: add missing columns ────────────────────────────────────
ALTER TABLE penny_audit_jobs
  ADD COLUMN IF NOT EXISTS repository_url    TEXT,
  ADD COLUMN IF NOT EXISTS manifest_revision TEXT,
  ADD COLUMN IF NOT EXISTS checklist_id      TEXT,
  ADD COLUMN IF NOT EXISTS repo_ref          TEXT,
  ADD COLUMN IF NOT EXISTS payload           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error             TEXT,
  ADD COLUMN IF NOT EXISTS started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at       TIMESTAMPTZ;

-- Drop FK so jobs can reference projects not yet in penny_projects
ALTER TABLE penny_audit_jobs
  DROP CONSTRAINT IF EXISTS penny_audit_jobs_project_name_fkey;

CREATE INDEX IF NOT EXISTS penny_audit_jobs_project_idx
  ON penny_audit_jobs (lower(trim(project_name)));
CREATE INDEX IF NOT EXISTS penny_audit_jobs_status_idx
  ON penny_audit_jobs (status);
CREATE INDEX IF NOT EXISTS penny_audit_jobs_created_idx
  ON penny_audit_jobs (created_at DESC);

-- ── penny_audit_runs: add missing columns ────────────────────────────────────
ALTER TABLE penny_audit_runs
  ADD COLUMN IF NOT EXISTS job_id                UUID,
  ADD COLUMN IF NOT EXISTS job_type              TEXT        NOT NULL DEFAULT 'weekly_audit',
  ADD COLUMN IF NOT EXISTS summary               TEXT,
  ADD COLUMN IF NOT EXISTS findings_added        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manifest_revision     TEXT,
  ADD COLUMN IF NOT EXISTS checklist_id          TEXT,
  ADD COLUMN IF NOT EXISTS coverage_complete     BOOLEAN,
  ADD COLUMN IF NOT EXISTS completion_confidence TEXT,
  ADD COLUMN IF NOT EXISTS exhaustiveness        TEXT,
  ADD COLUMN IF NOT EXISTS payload               JSONB       NOT NULL DEFAULT '{}'::jsonb;

-- Drop FK so runs can reference projects not yet in penny_projects
ALTER TABLE penny_audit_runs
  DROP CONSTRAINT IF EXISTS penny_audit_runs_project_name_fkey;

CREATE INDEX IF NOT EXISTS penny_audit_runs_project_idx
  ON penny_audit_runs (lower(trim(project_name)));
CREATE INDEX IF NOT EXISTS penny_audit_runs_created_idx
  ON penny_audit_runs (created_at DESC);

-- ── Other penny_* tables: drop FK constraints for the same reason ────────────
ALTER TABLE penny_orchestration_events
  DROP CONSTRAINT IF EXISTS penny_orchestration_events_project_name_fkey;

ALTER TABLE penny_project_snapshots
  DROP CONSTRAINT IF EXISTS penny_project_snapshots_project_name_fkey;
