-- PENNY DASHBOARD PROJECT STORE (v5)
-- Creates the penny_projects table used by the dashboard's project CRUD layer.
-- This is distinct from the audit system's `projects` table — it stores the
-- full project document as a JSONB blob for flexible schema evolution.
--
-- Required for: dashboard project create / list / update / delete
-- Required env: DATABASE_URL (PostgreSQL connection string, see .env.example)

CREATE TABLE IF NOT EXISTS penny_projects (
    name              TEXT        PRIMARY KEY,
    repository_url    TEXT,
    project_json      JSONB       NOT NULL DEFAULT '{}',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional cleanup tables referenced during project deletion.
-- The dashboard delete operation attempts to remove related records from these
-- tables but tolerates their absence (uses Promise.allSettled). Create them
-- here so a full deployment is consistent.

CREATE TABLE IF NOT EXISTS penny_audit_runs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT        REFERENCES penny_projects(name) ON DELETE CASCADE,
    kind         TEXT,
    status       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penny_audit_jobs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT        REFERENCES penny_projects(name) ON DELETE CASCADE,
    job_type     TEXT,
    status       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penny_orchestration_events (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT        REFERENCES penny_projects(name) ON DELETE CASCADE,
    event_type   TEXT,
    payload      JSONB       DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penny_project_snapshots (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT        REFERENCES penny_projects(name) ON DELETE CASCADE,
    snapshot     JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_penny_audit_runs_project    ON penny_audit_runs(project_name);
CREATE INDEX IF NOT EXISTS idx_penny_audit_jobs_project    ON penny_audit_jobs(project_name);
CREATE INDEX IF NOT EXISTS idx_penny_orch_events_project   ON penny_orchestration_events(project_name);
CREATE INDEX IF NOT EXISTS idx_penny_snapshots_project     ON penny_project_snapshots(project_name);
