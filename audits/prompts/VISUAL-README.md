# LYRA Visual Audit Suite v1.1

Systematic visual audit for app cohesion. Six agents read your code and produce a cohesion score with a prioritized cleanup plan. No rendering required -- agents work from source (Tailwind classes, CSS, component files).

## Agents

| Agent | Prompt | What It Covers |
|-------|--------|---------------|
| V1: Tokens | `visual-tokens.md` | Color palette, spacing scale, type scale, shadow scale, token governance |
| V2: Typography | `visual-typography.md` | Heading hierarchy, font sizes, weights, line heights, text color hierarchy |
| V3: Layout | `visual-layout.md` | Page structure, section spacing, grid, whitespace, responsive, containers |
| V4: Components | `visual-components.md` | Buttons, cards, forms, modals, nav, toasts, badges, tables, icons |
| V5: Color | `visual-color.md` | Palette usage, semantic color, contrast ratios, surface hierarchy, dark mode |
| V6: Polish | `visual-polish.md` | Hover/focus/active states, transitions, shadows, radii, loading, micro-interactions |
| Synthesizer | `visual-synthesizer.md` | Merges all, scores cohesion 1-5 on 5 dimensions, `atlas_narrative`, ranked cleanup plan |
| Optional narrative | `visual-atlas-narrative.md` | Human-facing ATLAS-format memo from synthesizer JSON + optional screenshots |

## Cohesion Scoring

The synthesizer rates your app on 5 dimensions (1-5 each):

- **Systematic** -- is there a design system or is it ad-hoc?
- **Hierarchical** -- can users instantly tell what matters on each page?
- **Consistent** -- does the same component look the same everywhere?
- **Communicative** -- does color/contrast reliably convey meaning?
- **Polished** -- do interactions feel intentional and finished?

Overall score interpretation:
- 4.5-5.0 = Ship with confidence
- 3.5-4.4 = Targeted cleanup needed
- 2.5-3.4 = Visually fragmented, invest in system
- 1.5-2.4 = Significant design debt
- 1.0-1.4 = Rebuild visual layer

## ATLAS design protocol (cross-reference)

The repo includes [ATLAS_AUDIT_PROTOCOL.md](../../atlas/ATLAS_AUDIT_PROTOCOL.md) (scored design layers) and [ATLAS_AGENT_PROMPT.md](../../atlas/ATLAS_AGENT_PROMPT.md) (optional strong-POV design identity). Lyra visual agents embed **protocol-aligned checklist hints** where they can be verified from source; they do **not** adopt the full ATLAS agent voice by default.

### Layer to Lyra agent map

| ATLAS layer | Focus | Primary Lyra agent(s) | Notes |
|-------------|--------|----------------------|--------|
| 1 — First impressions | 3-second hierarchy, purpose, primary action, focal point | V3 Layout, V2 Typography, V4 Components | Code-only: infer from structure and emphasis patterns, not a live screenshot. |
| 2 — Typography | Type scale, legibility, measure, weights | V2 Typography, V1 Tokens | |
| 3 — Color & palette | Palette logic, contrast, semantic vs brand, dark mode | V5 Color, V1 Tokens | |
| 4 — Spacing & layout | Scale, proximity, grid, max-width, rhythm | V3 Layout, V1 Tokens | |
| 5 — Interactive elements | Buttons, states, forms, touch targets, friction | V4 Components, V6 Polish | |
| 6 — Motion & animation | Transitions, easing, duration, reduced motion | V6 Polish | |
| 7 — Content & microcopy | Labels, errors, empty states (when visible in code) | V4 Components | Strings in JSX/templates only. |
| 8 — Texture & craft | Shadows, radii, icons, selection, scrollbars | V6 Polish, V1 Tokens | |
| 9 — Performance & accessibility | Semantic HTML, a11y hints in code, asset patterns | V5 Color, V6 Polish | Partial; dedicated a11y crawl is future work. |

### Scoring: not interchangeable

- **Lyra cohesion** is the average of five 1–5 dimensions in the visual synthesizer output (`cohesion_scores.overall`). It measures codebase-extrapolated **system cohesion**.
- **ATLAS** uses per-item scores (0–4) and a percentage letter grade across many checklist rows; that scale is **not** the same number line as Lyra’s 1–5. The synthesizer may emit an **`atlas_narrative`** object that **summarizes merged findings** in ATLAS-shaped headings (critical issues, three moves, redesign scope)—derived from LYRA severity/priority, not a second numeric scorecard.

### Optional: narrative-only pass

After the standard synthesizer run, you can run [visual-atlas-narrative.md](visual-atlas-narrative.md) with the merged JSON plus optional screenshots for a stakeholder-facing write-up. See that prompt for details.

## How to Run

### Fast Lane (30-45 min): pick 2-3 agents

| What You're Worried About | Run These |
|---------------------------|-----------|
| "Does my app look cohesive?" | V4 (Components) + V5 (Color) |
| "Is my spacing all over the place?" | V1 (Tokens) + V3 (Layout) |
| "My headings feel random" | V2 (Typography) + V1 (Tokens) |
| "It doesn't feel polished" | V6 (Polish) + V4 (Components) |
| "I'm about to launch" | All 6 + Synthesizer |

### Deep Audit (2-3 hours): all agents

```
1. Run V1 (Tokens) first -- it maps the foundation everything else references
2. Run V2-V6 in any order (parallel if your tool supports it)
3. Run the Synthesizer last with all 6 outputs
4. Review the cohesion scores and ranked plan
5. Use session.py to triage and track fixes
```

### Saving Outputs

Same structure as the core audit suite:

```bash
mkdir -p audits/runs/$(date +%Y-%m-%d)
# Save each agent output:
#   audits/runs/YYYY-MM-DD/visual-tokens-YYYYMMDD-HHmmss.json
#   audits/runs/YYYY-MM-DD/visual-typography-YYYYMMDD-HHmmss.json
#   ...
#   audits/runs/YYYY-MM-DD/visual-synthesized-YYYYMMDD-HHmmss.json
```

## Integration with Core LYRA Suite

These prompts produce standard LYRA v1.1 schema JSON (`suite: "visual"`). They work with:
- `session.py` for triage and fix tracking
- `cleanup_open_findings.py` for enum normalization
- The existing `audits/open_findings.json` and `audits/findings/` case files
- The existing synthesizer (for cross-suite dedup if you run visual + core in the same cycle)

## What This Replaces

Instead of manually going through every page checking:
- [ ] Are my headings consistent? (V2 does this)
- [ ] Are my buttons the same everywhere? (V4 does this)
- [ ] Is my spacing from a scale? (V1 + V3 do this)
- [ ] Do my colors make sense? (V5 does this)
- [ ] Does everything have hover/focus states? (V6 does this)
- [ ] Does this feel like one product? (Synthesizer scores this)

You paste a prompt, get structured findings, fix the top items, re-audit the affected files.
