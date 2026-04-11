# Finding: f-95c0cbf2

> **Status:** open | **Severity:** minor | **Priority:** P3 | **Type:** enhancement | **Confidence:** inference

## Title

No route-level loading.tsx for dashboard segments

## Description

There is no loading.tsx under apps/dashboard/app; first navigation relies on client bundles and per-page skeletons. Adding segment loading UI could improve perceived performance and consistency across routes.

## Impact

UX consistency and user trust; see description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[artifact_ref]** artifact_ref — glob: apps/dashboard/**/loading.tsx → 0 files
- **[code_ref]** code_ref — apps/dashboard/app/page.tsx — Home

## History

- 2026-04-11T16:12:32Z — **ux-flow-auditor** — created: From UX suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized ux-flow-auditor output: finding_id, proof_hooks.summary, history, suggested_fix per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
