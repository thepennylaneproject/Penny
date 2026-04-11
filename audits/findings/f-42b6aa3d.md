# Finding: f-42b6aa3d

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** debt | **Confidence:** evidence

## Title

Intelligence audit uses one wide LLM pass over full anchor context

## Description

Intelligence audit uses one wide LLM pass over full anchor context. intelligence runs buildIntelligenceContext and a single auditWithLane before domain passes. Cost and latency scale with repository size and prompt length; monitor token metrics already partially logged.

## Impact

Performance, cost, or scalability; see description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[code_ref]** code_ref — apps/worker/src/process-job.ts

## History

- 2026-04-11T16:12:32Z — **performance-cost-auditor** — created: From performance suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized performance agent output: finding_id, proof_hooks from hooks, history, suggested_fix per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
