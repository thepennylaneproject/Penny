# Finding: f-6af2fc10

> **Status:** open | **Severity:** nit | **Priority:** P3 | **Type:** debt | **Confidence:** inference

## Title

repair_service migration DROP POLICY names may not match earlier migration

## Description

20260402231116_repair_service.sql drops policies named users_can_view_repair_jobs, etc. The earlier 20260402163740_rls_policies.sql creates policies named "Users can access repair jobs for their projects". IF EXISTS avoids errors, but the older FOR ALL policy may remain alongside newer SELECT/INSERT policies, producing redundant or confusing policy sets until manually reconciled.

## Proof hooks

- **[code_ref]** DROP uses different names than CREATE in 002
  - File: `supabase/migrations/20260402231116_repair_service.sql`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized finding_id from data id field.

## Sources

- `data-20260407-052750`
