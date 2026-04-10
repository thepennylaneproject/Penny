-- model_usage had RLS enabled in 20260402163740_rls_policies.sql with no policies.
-- Mirror audit_runs / repair_costs: owners can read usage for their project's runs.

DROP POLICY IF EXISTS "users_can_view_model_usage" ON model_usage;
CREATE POLICY "users_can_view_model_usage"
  ON model_usage
  FOR SELECT
  USING (
    run_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM audit_runs ar
      JOIN projects p ON p.id = ar.project_id
      WHERE ar.id = model_usage.run_id
        AND p.owner_id = auth.uid()
    )
  );

GRANT SELECT ON model_usage TO anon, authenticated;
