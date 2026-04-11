# Finding: f-4e0bb50c

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** debt | **Confidence:** evidence

## Title

Orchestration audit lists use SELECT * on job and run tables

## Description

Orchestration audit lists use SELECT * on job and run tables. listRecentAuditJobs, listRecentAuditRuns, and project-scoped variants fetch full rows. Consider explicit column lists aligned to rowJob/rowRun mappers to reduce I/O as payload columns grow.

## Impact

Performance, cost, or scalability; see description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[code_ref]** code_ref — apps/dashboard/lib/orchestration-jobs.ts

## History

- 2026-04-11T16:12:32Z — **performance-cost-auditor** — created: From performance suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized performance agent output: finding_id, proof_hooks from hooks, history, suggested_fix per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
