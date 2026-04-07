# Finding: f-cacebef8

> **Status:** open | **Severity:** major | **Priority:** P1 | **Type:** debt | **Confidence:** evidence

## Title

next/font Google Fonts requires network at build time

## Description

layout.tsx uses next/font/google for Inter, JetBrains Mono, and DM Serif Display. The preflight build failed because Google Fonts could not be fetched (sandboxed/offline build). CI and locked-down environments need self-hosted or committed font files to avoid flaky builds and external dependency on fonts.googleapis.com during `next build`.

## Proof hooks

- **[artifact_ref]** Build failed fetching fonts
  - File: `audits/artifacts/_run_/build.txt`
- **[code_ref]** next/font/google imports
  - File: `apps/dashboard/app/layout.tsx`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — note_added: Normalized finding_id from perf agent id field; merged history.

## Sources

- `perf-20260407-121845`
