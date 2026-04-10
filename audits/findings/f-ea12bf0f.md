# Finding: f-ea12bf0f

> **Status:** fixed_verified | **Severity:** minor | **Priority:** P2 | **Type:** enhancement | **Confidence:** evidence

## Title

Portfolio project card overlay buttons rely on title= only (export/remove)

## Description

Export and remove controls on portfolio cards were icon-first with `title` tooltips and weak accessible naming.

**Resolution (2026-04-10):** Buttons show visible **Export** and **Remove** text next to glyphs, use descriptive `aria-label`s, mark decorative glyphs `aria-hidden`, and slightly increase control strip opacity for visibility.

## Proof hooks

- **[code_ref]** Overlay button row — `apps/dashboard/app/page.tsx` (portfolio grid)

## History

- 2026-04-07T05:55:03.000Z — **ux-flow-auditor** — created: Compared with other buttons on page using aria-label.
- 2026-04-07T18:45:00.000Z — **synthesizer** — merged: Normalized proof_hooks from agent hooks[] field.
- 2026-04-10T02:59:31Z — **solo-dev** — patch_applied: Fix applied via session runner.
- 2026-04-10T03:02:02Z — **ux-flow-auditor** — note_added: Re-audit (`ux-20260410-030202`): visible labels + aria-labels verified.
- 2026-04-10T03:05:00Z — **synthesizer** — merged: `fixed_pending_verify` → `fixed_verified`; removed from `open_findings.json` (`synthesized-20260410-030202`).

## Sources

- `ux-20260407-055503`
- `ux-20260410-030202`
- `synthesized-20260410-030202`
