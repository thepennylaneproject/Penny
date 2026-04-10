-- Accepted audit decisions (2026-04-07):
-- f-ed623fc2: composite index for project + status + created_at list queries
-- f-58c68aa7: drop anon table privileges on repair_jobs; keep authenticated (+ service_role bypass)
-- Optional ops follow-up: EXPLAIN (ANALYZE, BUFFERS) on hot list queries with production-like row counts.

CREATE INDEX IF NOT EXISTS idx_findings_project_status_created_at
  ON findings (project_id, status, created_at DESC);

REVOKE SELECT, INSERT, UPDATE ON repair_jobs FROM anon;
