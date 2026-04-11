# Finding: f-a0973cda

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** debt | **Confidence:** evidence

## Title

Repair job list queries use SELECT *

## Description

Repair job list queries use SELECT *. Postgres helpers select all columns from penny_repair_jobs. Payload-heavy jsonb columns inflate memory and network when only a subset is needed for list UIs.

## Impact

Performance, cost, or scalability; see description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[code_ref]** code_ref — apps/dashboard/lib/maintenance-store.ts
- **[code_ref]** code_ref — apps/dashboard/lib/maintenance-store.ts

## History

- 2026-04-11T16:12:32Z — **performance-cost-auditor** — created: From performance suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized performance agent output: finding_id, proof_hooks from hooks, history, suggested_fix per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
