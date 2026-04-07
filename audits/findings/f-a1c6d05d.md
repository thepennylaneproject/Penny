# Finding: f-a1c6d05d

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** enhancement | **Confidence:** inference

## Title

Project page loads the full portfolio via /api/projects

## Description

ProjectPageClient uses usePortfolioProjects, which always GETs /api/projects and filters client-side to the current project. For users with many projects this duplicates work and payload size versus a single-project GET.

## Proof hooks

- **[code_ref]** fetchProjects on mount
  - File: `apps/dashboard/components/ProjectPageClient.tsx`
- **[code_ref]** Portfolio hook hits list endpoint
  - File: `apps/dashboard/hooks/use-portfolio-projects.ts`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — note_added: Normalized finding_id from perf agent id field; merged history.

## Sources

- `perf-20260407-121845`
