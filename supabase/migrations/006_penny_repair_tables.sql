-- Migration 006: penny repair and maintenance tables
-- Required for /api/engine/status, /api/engine/queue, and maintenance workflows
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- ── penny_repair_jobs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penny_repair_jobs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name          TEXT        NOT NULL,
  finding_id            TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'queued',
  repair_policy         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  targeted_files        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  verification_commands JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rollback_notes        TEXT,
  maintenance_task_id   TEXT,
  backlog_id            TEXT,
  provenance            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  payload               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  patch_applied         BOOLEAN,
  error                 TEXT,
  started_at            TIMESTAMPTZ,
  finished_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS penny_repair_jobs_project_idx
  ON penny_repair_jobs (lower(trim(project_name)));
CREATE INDEX IF NOT EXISTS penny_repair_jobs_finding_idx
  ON penny_repair_jobs (finding_id);
CREATE INDEX IF NOT EXISTS penny_repair_jobs_status_idx
  ON penny_repair_jobs (status);
CREATE INDEX IF NOT EXISTS penny_repair_jobs_created_idx
  ON penny_repair_jobs (created_at DESC);

-- ── penny_maintenance_backlog ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penny_maintenance_backlog (
  id               TEXT        PRIMARY KEY,
  project_name     TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  summary          TEXT,
  canonical_status TEXT        NOT NULL,
  source_type      TEXT        NOT NULL,
  priority         TEXT        NOT NULL,
  severity         TEXT        NOT NULL,
  risk_class       TEXT        NOT NULL,
  next_action      TEXT        NOT NULL,
  finding_ids      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  dedupe_keys      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of     TEXT,
  blocked_reason   TEXT,
  provenance       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS penny_maintenance_backlog_project_idx
  ON penny_maintenance_backlog (lower(trim(project_name)));
CREATE INDEX IF NOT EXISTS penny_maintenance_backlog_status_idx
  ON penny_maintenance_backlog (canonical_status);

-- ── penny_maintenance_tasks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penny_maintenance_tasks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name          TEXT        NOT NULL,
  backlog_id            TEXT,
  title                 TEXT        NOT NULL,
  intended_outcome      TEXT        NOT NULL DEFAULT '',
  status                TEXT        NOT NULL,
  target_domains        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  target_files          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  risk_class            TEXT        NOT NULL DEFAULT 'medium',
  verification_profile  TEXT,
  verification_commands JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rollback_notes        TEXT,
  notes                 TEXT,
  provenance            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS penny_maintenance_tasks_project_idx
  ON penny_maintenance_tasks (lower(trim(project_name)));
CREATE INDEX IF NOT EXISTS penny_maintenance_tasks_backlog_idx
  ON penny_maintenance_tasks (backlog_id);
CREATE INDEX IF NOT EXISTS penny_maintenance_tasks_status_idx
  ON penny_maintenance_tasks (status);
