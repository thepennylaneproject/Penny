# Finding: f-f0fc96a0

> **Status:** fixed_verified | **Severity:** major | **Priority:** P1 | **Type:** bug | **Confidence:** evidence

## Title

pnpm test fails: duplicate --run passed to Vitest

## Description

Root script pnpm test runs turbo with extra --run; penny-dashboard already uses vitest --run in its test script. Vitest exits with 'Expected a single value for option "--run", received [true, true]'.

## Proof hooks

- **[error_text]** audits/artifacts/_run_/tests.txt: Vitest cac error duplicate --run.
- **[code_ref]** apps/dashboard/package.json "test": "vitest --run" combined with root `pnpm test -- --run`.

## History

- 2026-04-07T00:38:28.000Z — **runtime-bug-hunter** — created: Reproduced via preflight test run.
- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized proof_hooks from hooks[].
- 2026-04-10 — **synthesizer** — verified: root `package.json` `test` is `turbo run test` without duplicate `--run`; dashboard tests pass. Removed from `open_findings.json` (`synthesized-20260410-201500`).

## Sources

- `logic-20260407-003828`
- `synthesized-20260410-201500`
