# Finding: f-af487c6c

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** bug | **Confidence:** evidence

## Title

Portfolio orchestration uses file-backed engine status while engine status API uses Postgres when DATABASE_URL is set

## Description

See logic-20260410-182313.json.

## Impact

—

## Suggested fix

See synthesizer / agent notes.

**Affected files:** —

## Proof hooks

- **[code_ref]** apps/dashboard/app/api/orchestration/route.ts — getEngineStatus only
- **[code_ref]** apps/dashboard/app/api/engine/status/route.ts — DB branch when jobsStoreConfigured

## History

- 2026-04-10T18:23:13Z — **runtime-bug-hunter** — created: logic-20260410-182313.
- 2026-04-10T18:25:00Z — **synthesizer** — merged: synthesized-20260410-182313.

---
*Last canonical synthesizer run: `synthesized-20260410-182313`*
