# Finding: f-3bbfbe6f

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** enhancement | **Confidence:** inference

## Title

Segment error UI drops app chrome (sidebar)

## Description

app/error.tsx renders a standalone layout without Shell, so recoverable errors in nested routes remove navigation until the user follows Portfolio. Consider nested error boundaries or wrapping error UI with shell for wayfinding.

## Impact

UX consistency and user trust; see description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[code_ref]** code_ref — apps/dashboard/app/error.tsx — Error
- **[code_ref]** code_ref — apps/dashboard/components/Shell.tsx — Shell

## History

- 2026-04-11T16:12:32Z — **ux-flow-auditor** — created: From UX suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized ux-flow-auditor output: finding_id, proof_hooks.summary, history, suggested_fix per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
