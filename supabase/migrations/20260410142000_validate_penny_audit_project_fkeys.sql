-- f-645511df: Validate penny_* FKs added NOT VALID in 20260410140000 after placeholder
-- backfill. Idempotent: skips constraints that are already validated.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'penny_audit_jobs'
      AND c.conname = 'penny_audit_jobs_project_name_fkey'
      AND c.convalidated = false
  ) THEN
    ALTER TABLE public.penny_audit_jobs
      VALIDATE CONSTRAINT penny_audit_jobs_project_name_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'penny_audit_runs'
      AND c.conname = 'penny_audit_runs_project_name_fkey'
      AND c.convalidated = false
  ) THEN
    ALTER TABLE public.penny_audit_runs
      VALIDATE CONSTRAINT penny_audit_runs_project_name_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'penny_orchestration_events'
      AND c.conname = 'penny_orchestration_events_project_name_fkey'
      AND c.convalidated = false
  ) THEN
    ALTER TABLE public.penny_orchestration_events
      VALIDATE CONSTRAINT penny_orchestration_events_project_name_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'penny_project_snapshots'
      AND c.conname = 'penny_project_snapshots_project_name_fkey'
      AND c.convalidated = false
  ) THEN
    ALTER TABLE public.penny_project_snapshots
      VALIDATE CONSTRAINT penny_project_snapshots_project_name_fkey;
  END IF;
END $$;
