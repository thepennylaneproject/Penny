# Finding: f-9ef3f9e1

> **Status:** fixed_verified | **Severity:** major | **Priority:** P1 | **Type:** debt | **Confidence:** evidence

## Title

Dashboard penny_* tables have no RLS in migrations

## Description

Migrations create penny_projects, penny_audit_jobs, penny_audit_runs, penny_repair_jobs, penny_maintenance_*, penny_project_manifests, penny_linear_sync, etc., without ENABLE ROW LEVEL SECURITY or policies. The auth-scoped LYRA tables (projects, findings, …) use owner_id and policies; the dashboard document store does not mirror that model. If these tables are exposed via PostgREST with default grants, tenant isolation relies entirely on application code and connection string secrecy, not database enforcement.

## Proof hooks

- **[code_ref]** penny_projects DDL has no RLS
  - File: `supabase/migrations/20260403102352_penny_projects.sql`
- **[data_shape]** Contrast with LYRA tables

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized finding_id from data id field.
- 2026-04-10 — **synthesizer** — verified in repo: `supabase/migrations/20260408120000_penny_tables_rls.sql` enables RLS and policies on `penny_*` tables. Confirm migration applied on remote Supabase (see **f-23063538**). Removed from `open_findings.json` (`synthesized-20260410-201500`).

## Sources

- `data-20260407-052750`
- `synthesized-20260410-201500`
