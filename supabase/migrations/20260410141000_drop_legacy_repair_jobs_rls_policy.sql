-- f-6af2fc10: Remove legacy FOR ALL policy from 20260402163740_rls_policies.sql
-- ("Users can access repair jobs for their projects") if granular repair_service policies
-- are present—avoids duplicate/overlapping rules when the quoted legacy name was not dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'repair_jobs'
      AND policyname IN ('users_can_view_repair_jobs', 'users_can_create_repair_jobs')
  ) THEN
    DROP POLICY IF EXISTS "Users can access repair jobs for their projects" ON repair_jobs;
  END IF;
END $$;
