-- Migration 007: penny_project_manifests and penny_linear_sync
-- Required for /api/orchestration/runs and Linear sync features

-- ── penny_project_manifests ──────────────────────────────────────────────────
-- Stores versioned project manifests written by the worker after each audit.
CREATE TABLE IF NOT EXISTS penny_project_manifests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name    TEXT        NOT NULL,
  repo_revision   TEXT        NOT NULL DEFAULT '',
  source_root     TEXT,
  checklist_id    TEXT,
  exhaustiveness  TEXT        NOT NULL DEFAULT 'exhaustive',
  manifest        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_name, repo_revision)
);

CREATE INDEX IF NOT EXISTS penny_project_manifests_project_idx
  ON penny_project_manifests (lower(trim(project_name)));
CREATE INDEX IF NOT EXISTS penny_project_manifests_generated_idx
  ON penny_project_manifests (generated_at DESC);

-- ── penny_linear_sync ────────────────────────────────────────────────────────
-- Stores per-project Linear sync state (issue mappings, last sync timestamp).
CREATE TABLE IF NOT EXISTS penny_linear_sync (
  project_name TEXT        PRIMARY KEY,
  state        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
