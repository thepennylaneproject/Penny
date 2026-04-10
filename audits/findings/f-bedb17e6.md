# Finding: f-bedb17e6

> **Status:** fixed_verified | **Severity:** minor | **Priority:** P3 | **Type:** debt | **Confidence:** evidence

## Title

readAuditRunFiles ignores nested audits/runs/<date>/*.json layout

## Description

LYRA workflow stores runs under `audits/runs/YYYY-MM-DD/<run_id>.json`. `readAuditRunFiles` only lists `*.json` at the top level of `audits/runs`, so nested JSON files are omitted from engine status aggregation.

## Proof hooks

- **[code_ref]** `readdirSync` + `.filter(f => f.endsWith('.json'))` — `apps/dashboard/lib/audit-reader.ts`
- **[artifact_ref]** Nested layout under `audits/runs/2026-04-07/`.

## History

- 2026-04-09T22:15:06Z — **synthesizer** — merged from `data-20260409-221501`.

## Sources

- `data-20260409-221501`
- `synthesized-20260409-221506`
