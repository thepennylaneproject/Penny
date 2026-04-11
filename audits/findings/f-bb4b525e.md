# Finding: f-bb4b525e

> **Status:** open | **Severity:** minor | **Priority:** P3 | **Type:** question | **Confidence:** speculation

## Title

Worker pg Pool max may cap concurrent DB work

## Description

Worker pg Pool max may cap concurrent DB work. createPool sets max: 5. Under parallel portfolio work or many concurrent claim/complete paths, queueing may add latency; validate against expected job concurrency.

## Impact

Performance, cost, or scalability; see description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[code_ref]** code_ref — apps/worker/src/db.ts

## History

- 2026-04-11T16:12:32Z — **performance-cost-auditor** — created: From performance suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized performance agent output: finding_id, proof_hooks from hooks, history, suggested_fix per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
