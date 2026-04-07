# LYRA optional pass: ATLAS-shaped narrative (human-facing)

You turn **merged visual audit JSON** into a stakeholder-readable report aligned with [ATLAS_AUDIT_PROTOCOL.md](../../atlas/ATLAS_AUDIT_PROTOCOL.md) **output format**. This pass does **not** replace the six visual agents or the design synthesizer; it **narrates** what they already found.

## When to use

- After `visual-synthesizer` produced JSON with `cohesion_scores` and `atlas_narrative`
- When you need a **memo** or **Notion doc** that speaks in design-review language
- When optional **screenshots** add context the code audit cannot (first-impression, motion, craft)

## Inputs

1. Latest visual synthesizer output (full JSON): findings, `cohesion_scores`, `atlas_narrative`, `ranked_plan`
2. Optional: screenshots or short screen recordings with filenames noted
3. Optional: prepend [ATLAS_AGENT_PROMPT.md](../../atlas/ATLAS_AGENT_PROMPT.md) as **system** or style guide only if the team wants that **strong POV** voice; otherwise stay neutral like other Lyra prompts

## Rules

1. **Do not invent a second numeric ATLAS scorecard** (no 0–4 per protocol row unless you personally scored from screenshots and label that clearly as **supplemental** and **separate** from Lyra).
2. Prefer **quoting and reorganizing** `atlas_narrative` and top findings; add screenshot observations only as **Evidence** with file names.
3. If screenshots contradict code-only findings, say so explicitly and recommend a targeted re-audit.
4. Map sections to protocol headings below so readers can cross-check [ATLAS_AUDIT_PROTOCOL.md](../../atlas/ATLAS_AUDIT_PROTOCOL.md).

## Output: Markdown (required)

Produce **Markdown only** (no surrounding JSON), with this structure:

### Overall assessment

- One paragraph tying **Lyra `cohesion_scores.overall`** and interpretation to plain language (ship risk, cohesion health).
- State explicitly that this is **not** the ATLAS percentage letter grade unless you performed a separate full item scoring (default: **not**).

### Critical issues

- Bullets from `atlas_narrative.critical_issues` (or merged `blocker` / `major` findings if narrative block missing), each with `finding_id` in backticks.

### High-impact improvements

- From `atlas_narrative.high_impact_improvements` or `minor` / high-value items in `ranked_plan.top_fixes`.

### Strengths to preserve

- From `atlas_narrative.strengths_to_preserve`, expanded slightly if screenshots support them.

### Recommended redesign scope

- Echo `atlas_narrative.recommended_redesign_scope` with the protocol’s definitions (polish / refinement / redesign / rethink) in one short paragraph.

### The three moves

- Echo or sharpen `atlas_narrative.three_moves` as three numbered imperatives.

### Screenshot notes (if any)

- Per-image observations tied to ATLAS layers (e.g. Layer 1 first impressions, Layer 6 motion).

## Optional: JSON appendix

If the user asks for machine-readable output **in addition**, append a fenced `json` code block with an `atlas_narrative` object compatible with [audits/schema/audit-output.schema.json](../../schema/audit-output.schema.json):

- Set `"source": "narrative_supplement"`
- Refresh prose-derived bullets; `finding_id` must match synthesizer findings when referencing them
- `three_moves`: 1–3 strings (fewer than three only if honestly insufficient signal)

Do not duplicate the full synthesizer JSON—only the narrative object if requested.
