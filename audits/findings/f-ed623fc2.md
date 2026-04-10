# Finding: f-ed623fc2

> **Status:** fixed_verified | **Severity:** minor | **Priority:** P2 | **Type:** question | **Confidence:** inference

## Title

Should findings have a composite index on (project_id, status, created_at)?

## Description

Migrations define idx_findings_project and idx_findings_status separately. Dashboard queries often filter by project_id and optionally status with ordering by created_at. A composite index may reduce heap fetches versus BitmapAnd of two indexes, but this should be validated with real row counts and plans.

## Proof hooks

- **[code_ref]** Separate indexes
  - File: `supabase/migrations/20260402163739_lyra_schema.sql`
- **[query]** Suggested validation

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — note_added: Normalized finding_id from perf agent id field; merged history.
- 2026-04-07T21:45:00.000Z — **synthesizer** — verified: Removed from open_findings; `20260407210000_findings_index_repair_jobs_grants.sql` adds `idx_findings_project_status_created_at`.

## Sources

- `perf-20260407-121845`
- `perf-20260407-214230`
- `synthesized-20260407-214500`
