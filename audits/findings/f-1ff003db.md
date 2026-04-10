# Finding: f-1ff003db

> **Status:** fixed_verified | **Severity:** major | **Priority:** P2 | **Type:** bug | **Confidence:** evidence

## Title

Onboarding cluster POST uses process.cwd() when repo path is not local

## Description

When `repoAccess` was a remote URL (does not start with `/`), older code could fall back to `process.cwd()`, so collectors read the dashboard tree instead of the target repository.

**Resolution (2026-04-10):** `POST` returns **400** when the project has no absolute local checkout; `repoPath` is only the local path. A regression guard comment documents that `process.cwd()` must not be reintroduced.

## Proof hooks

- **[code_ref]** Local-only gate and `repoPath = repoAccess` after validation — `apps/dashboard/app/api/projects/[name]/onboarding/cluster/route.ts`
- **[repro_steps]** (historical) Remote-only `repositoryUrl` without `localPath` previously hit cwd fallback.

## History

- 2026-04-09T22:15:06Z — **synthesizer** — merged from `logic-20260409-221500`.
- 2026-04-10T02:58:57Z — **solo-dev** — patch_applied: Fix applied via session runner.
- 2026-04-10T03:02:02Z — **runtime-bug-hunter** — note_added: Re-audit (`logic-20260410-030202`): no `process.cwd()` fallback; 400 for non-local `repoAccess`.
- 2026-04-10T03:05:00Z — **synthesizer** — merged: `fixed_pending_verify` → `fixed_verified`; removed from `open_findings.json` (`synthesized-20260410-030202`).

## Sources

- `logic-20260409-221500`
- `synthesized-20260409-221506`
- `logic-20260410-030202`
- `synthesized-20260410-030202`
