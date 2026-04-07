# Finding: f-2c1c5aa4

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** debt | **Confidence:** evidence

## Title

penny_finding_status enum includes value not present in TS FindingStatus

## Description

PostgreSQL enum penny_finding_status includes 'assigned' (20260402163739_lyra_schema.sql). apps/dashboard/lib/types.ts FindingStatus union does not include 'assigned', so rows or API payloads using that value will not type-check in client code and may break narrowing or switches.

## Proof hooks

- **[code_ref]** DB enum values
  - File: `supabase/migrations/20260402163739_lyra_schema.sql`
- **[code_ref]** TS union omits assigned
  - File: `apps/dashboard/lib/types.ts`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized finding_id from data id field.

## Sources

- `data-20260407-052750`
