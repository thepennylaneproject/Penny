# LYRA Audit Suite v1.1 -- Starter Kit

Drop this `audits/` directory into any repo to get a full multi-agent audit system.

## File Tree

```
audits/
  LYRA-AUDIT-SUITE.md          # Full reference doc (schema, rubrics, all agent prompts in long form)
  WORKFLOW.md                   # Operational guardrails (gates, triage, release rules)
  README.md                    # This file
  session.py                   # Session runner -- the low-cognitive-load workflow
  cleanup_open_findings.py      # Normalizes enum drift and long IDs in open_findings.json
  setup.sh                     # First-time setup script

  schema/
    audit-output.schema.json    # JSON Schema v1.1.0 -- the contract all agents must follow

  prompts/                      # Copy-paste into your agent runner (Cursor, Copilot, Claude Code)
    agent-logic.md              # Agent A: Runtime & Logic Bug Hunter
    agent-data.md               # Agent B: Data Integrity / Schema / RLS Auditor
    agent-ux.md                 # Agent C: UX Flow & Copy Consistency Auditor
    agent-performance.md        # Agent D: Performance & Cost Auditor
    agent-security.md           # Agent E: Security & Privacy Auditor
    agent-deploy.md             # Agent F: Build/Deploy & Observability Auditor
    agent-observability.md      # Dashboard-ready agent observability plan for metrics, alerts, anomalies, and logs
    dashboard-architect.md      # Dashboard planner for pages, components, data flow, and realtime design
    ui-builder.md               # React UI builder for dashboard components and state handling
    synthesizer.md              # Synthesizer (Chief of Staff) -- runs last, merges all outputs

  findings/
    TEMPLATE.md                 # Case file template (one per finding, created by Synthesizer)

  artifacts/
    _run_/                      # Preflight baselines (refreshed each audit run)
      .gitkeep

  runs/                         # Immutable run outputs (JSON + Markdown per run)
    .gitkeep

  external_wisdom/              # Wisdom Capture Cards for outside tips/advice
    .gitkeep

  open_findings.json            # Canonical current state (Synthesizer manages this)
  index.json                    # Append-only run history
```

## Setup (2 minutes)

1. Copy the entire `audits/` directory into your project root.

2. Customize `audits/prompts/` for your repo structure. In each agent prompt, update the "Required Inputs" section to match your project's layout. Common changes:
   - Source directory (`src/`, `app/`, `lib/`, `server/`)
   - Server functions (`netlify/functions/`, `pages/api/`, `api/`)
   - Database files (`supabase/migrations/`, `prisma/schema.prisma`)
   - Build config (`vite.config.ts`, `next.config.js`)

3. Customize `WORKFLOW.md` qualifying change paths for your repo.

4. Commit the structure:
   ```bash
   git add audits/
   git commit -m "chore: add LYRA audit suite v1.1"
   ```

## First Audit Run (15 minutes)

```bash
# 1. Preflight: capture baselines
rm -rf audits/artifacts/_run_ && mkdir -p audits/artifacts/_run_
npm test -- --run > audits/artifacts/_run_/tests.txt 2>&1 || true
npm run lint > audits/artifacts/_run_/lint.txt 2>&1 || true
npm run build > audits/artifacts/_run_/build.txt 2>&1 || true
npx tsc --noEmit > audits/artifacts/_run_/typecheck.txt 2>&1 || true

# 2. Create today's run directory
mkdir -p audits/runs/$(date +%Y-%m-%d)

# 3. Run an agent: open the prompt file, paste into your LLM tool, save the JSON output
#    Example: audits/runs/2026-03-06/logic-20260306-120000.json

# 4. Run the synthesizer with the agent output(s)
#    Save: audits/runs/2026-03-06/synthesized-20260306-120500.json

# 5. Review findings, fix P0s, commit
git add audits/
git commit -m "audit: first LYRA run"
```

## Session Runner (the low-cognitive-load workflow)

Instead of reading findings JSON and deciding what to do, just run:

```bash
python3 audits/session.py          # Tells you exactly what to do next
```

It walks you through the decision tree automatically: finish in-progress fixes, then verify pending ones, then fix blockers, then decide questions, then work the P1 list. The full command set:

```bash
python3 audits/session.py              # What should I do next?
python3 audits/session.py triage       # Show prioritized fix list
python3 audits/session.py fix <id>     # Start working on a finding
python3 audits/session.py done <id> [commit]  # Mark fix applied
python3 audits/session.py skip <id> [reason]  # Defer a finding
python3 audits/session.py decide <id> <decision>  # Answer a question
python3 audits/session.py reaudit      # Which agents to re-run after fixes
python3 audits/session.py canship      # Am I ready to deploy?
python3 audits/session.py status       # Full dashboard
```

**Typical session loop:**
1. `python3 audits/session.py` -- it tells you what to do
2. Do it
3. `python3 audits/session.py` -- it tells you the next thing
4. Repeat until `canship` says you're clear

## Quick Reference

```bash
# See all open findings
cat audits/open_findings.json | python3 -m json.tool

# See run history
cat audits/index.json | python3 -m json.tool

# Find a specific finding
cat audits/findings/f-a3b7c9e1.md

# Search by file path
grep -r "myFile" audits/findings/

# Search by category
grep -l "null-ref" audits/findings/*.md

# Find open questions needing decisions
grep -l "question" audits/findings/*.md

# Clean up enum drift
python3 audits/cleanup_open_findings.py --dry-run
python3 audits/cleanup_open_findings.py
```

## Platform Notes

| Platform | Notes |
|----------|-------|
| **Cursor** | Prompts work as-is. Paste and run. |
| **Claude Code** | Prompts work as-is. |
| **GitHub Copilot** | Agent mode may try to fix code instead of auditing. The prompts include a read-only lock line. If it still edits files, prepend the Copilot wrapper from LYRA-AUDIT-SUITE.md. |
| **Other LLMs** | Any model that can output JSON works. Adjust `run_metadata.model` field. |

## When Things Drift

Agents will occasionally use non-standard enum values (`high` instead of `major`, `vulnerability` instead of `bug`). Run the cleanup script periodically:

```bash
python3 audits/cleanup_open_findings.py --dry-run   # preview changes
python3 audits/cleanup_open_findings.py              # apply and backup original
```

The synthesizer prompt also includes a normalization step, so drift should decrease over time.
