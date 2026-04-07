# Finding: f-ea12bf0f

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** enhancement | **Confidence:** evidence

## Title

Portfolio project card overlay buttons rely on title= only (export/remove)

## Description

Export (↓) and remove (×) controls use title attributes for tooltips but omit aria-label. Screen reader users get unclear accessible names compared to visible icon-only affordances elsewhere that use aria-label (e.g. dismiss buttons on the same page).

## Proof hooks

- **[code_ref]** apps/dashboard/app/page.tsx:610-630 — buttons with title="Export" and title="Remove" only.

## History

- 2026-04-07T05:55:03.000Z — **ux-flow-auditor** — created: Compared with other buttons on page using aria-label.
- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized proof_hooks from agent hooks[] field.

## Sources

- `ux-20260407-055503`
