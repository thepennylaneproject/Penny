# Finding: f-2eb9f62b

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** debt | **Confidence:** evidence

## Title

penny-worker omitted from turbo typecheck task

## Description

pnpm run typecheck only executed @penny/shared-types and penny-dashboard (turbo output). apps/worker has no typecheck script; TypeScript is enforced via build tsc only. Risk: type errors could be missed if someone runs typecheck without build.

## Proof hooks

- **[artifact_ref]** audits/artifacts/_run_/typecheck.txt shows Tasks: 2 successful — shared-types and dashboard only.
- **[code_ref]** apps/worker/package.json scripts list build but no typecheck entry.

## History

- 2026-04-07T00:38:28.000Z — **runtime-bug-hunter** — created: Compared turbo typecheck scope to workspace packages.
- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized proof_hooks from hooks[].

## Sources

- `logic-20260407-003828`
