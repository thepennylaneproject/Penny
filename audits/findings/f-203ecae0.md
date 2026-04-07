# Finding: f-203ecae0

> **Status:** open | **Severity:** major | **Priority:** P1 | **Type:** debt | **Confidence:** evidence

## Title

Next.js NFT tracing warns that the whole monorepo may be pulled into the server trace

## Description

Production build logs report an unexpected file in the NFT list, linking next.config.ts to dynamic filesystem usage (mergeEnvLocal) and API routes importing onboarding helpers. That pattern can enlarge traced server bundles and slow cold starts on Netlify/Vercel-style deploys.

## Proof hooks

- **[artifact_ref]** Turbopack NFT warning
  - File: `audits/artifacts/_run_/build.txt`
- **[code_ref]** fs.readFileSync in next config
  - File: `apps/dashboard/next.config.ts`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — note_added: Normalized finding_id from perf agent id field; merged history.

## Sources

- `perf-20260407-121845`
