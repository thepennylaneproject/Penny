# Finding: f-203ecae0

> **Status:** fixed_verified | **Severity:** major | **Priority:** P1 | **Type:** debt | **Confidence:** evidence

## Title

Next.js NFT tracing warns that the whole monorepo may be pulled into the server trace

## Description

Production build logs report an unexpected file in the NFT list, linking next.config.ts to dynamic filesystem usage (mergeEnvLocal) and API routes importing onboarding helpers. That pattern can enlarge traced server bundles and slow cold starts on Netlify/Vercel-style deploys.

**Resolution (2026-04-10):** Preflight `build.txt` no longer contains Turbopack NFT-list warnings after narrowing traces (`turbopackIgnore` on monorepo root `path.join`, `joinUnderRepo` for scanned repo paths, snapshot module isolation, `onboarding-update` split for PATCH).

## Proof hooks

- **[artifact_ref]** Turbopack NFT warning (historical)
  - File: `audits/artifacts/_run_/build.txt`
- **[code_ref]** fs.readFileSync in next config (historical — config no longer merges env via fs at load)
  - File: `apps/dashboard/next.config.ts`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — note_added: Normalized finding_id from perf agent id field; merged history.
- 2026-04-10T00:19:29Z — **synthesizer** — note_added: Reconfirmed NFT warnings in `build.txt`; trace via `lib/onboarding-cluster-snapshot` (`perf-20260410-001929`).
- 2026-04-10 — **synthesizer** — note_added: Preflight build still emits NFT warnings; remains `in_progress` (`synthesized-20260410-201500`).
- 2026-04-10T02:13:03Z — **solo-dev** — patch_applied: Fix applied via session runner.
- 2026-04-10T02:14:30.000Z — **performance-cost-auditor** — note_added: Re-audit (`perf-20260410-021430`): preflight `build.txt` has no NFT-list warnings.
- 2026-04-10T02:15:00.000Z — **synthesizer** — merged: `fixed_pending_verify` → `fixed_verified`; removed from `open_findings.json` (`synthesized-20260410-021500`).

## Sources

- `perf-20260407-121845`
- `perf-20260410-001929`
- `synthesized-20260410-001929`
- `synthesized-20260410-201500`
- `perf-20260410-021430`
- `synthesized-20260410-021500`
