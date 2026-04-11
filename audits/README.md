# LYRA Audit System v2

Multi-agent code audit system. Drop it into any repo.

## What this is

Six specialized agents (logic, data, UX, performance, security, deploy) audit your codebase and produce structured JSON findings. A synthesizer merges them into a single canonical ledger. A session runner (`session.py`) handles the entire lifecycle — preflight, batching, ingestion, triage, verification, and release gating.

## What changed from v1

This system was forked into two repos (Penny and Lane) and evolved through actual use. This version captures everything that was learned:

**From Penny (automated audit system):**
- `ingest_synthesizer.py` — the synthesizer no longer writes canonical files directly. It emits JSON; deterministic code applies it.
- `reconcile_merge_statuses.py` — prevents accidental status downgrades after merge.
- `linear_sync.py` with push regression protection — won't yank a Linear issue backward when Linear is ahead of LYRA.
- `audit-batch` command — generates a paste-ready checklist instead of manual agent orchestration.
- `verify` command — manual promotion of `fixed_pending_verify` → `fixed_verified`.
- `prune-closed` command — removes terminal findings from the active ledger.

**From Lane (self-hosted coding agent):**
- `--strict` mode on ingest — fails if `fixed_pending_verify` findings are missing from synthesizer output. This is the mechanical enforcement of the carry-forward contract.
- Dynamic path detection (`full_scope_focus_paths`) — probes the actual repo instead of hardcoding monorepo paths.
- Carry-forward contract in the synthesizer prompt — every non-terminal finding must appear in every synthesizer output, or be explicitly listed in `not_rereported`.

**New in v2:**
- `project.toml` — one config file replaces all hardcoded paths in agent prompts, preflight commands, and trigger maps. The same prompts work in any repo.
- `LYRA:PATHS` injection markers in agent prompts — session.py fills in project-specific paths at batch time. Prompts are generic; configuration is data.
- `init` command — auto-detects your repo structure and generates `project.toml`.
- Config-aware preflight — reads commands from `project.toml` instead of hardcoding `pnpm` vs `npm` vs `yarn`.
- Config-aware trigger map — rebuilt from `[paths.*]` sections so re-audit scope always matches your actual project layout.

## Quick start

```bash
# 1. Copy the audits/ directory into your repo root
cp -r lyra_audit_system your-repo/audits

# 2. Generate project config
cd your-repo
python3 audits/session.py init

# 3. Edit audits/project.toml — fill in your paths

# 4. Write expectations (optional but recommended)
cp audits/expectations_TEMPLATE.md audits/expectations.md
# Edit with your project's constraints

# 5. Run your first audit
python3 audits/session.py audit-batch --full

# 6. Paste the checklist from audits/artifacts/_batch/LATEST.md
#    into your AI coding tool (Cursor, Copilot, Claude Code)

# 7. After agents + synthesizer produce JSON:
python3 audits/session.py ingest-synth audits/runs/<date>/synthesized-<id>.json --strict

# 8. Triage
python3 audits/session.py
```

## File layout

```
audits/
├── project.toml                 # YOUR project config (paths, preflight, integrations)
├── session.py                   # CLI entry point — the only script you run
├── ingest_synthesizer.py        # Merges synthesizer JSON into canonical state
├── linear_sync.py               # Bidirectional Linear sync
├── reconcile_merge_statuses.py  # Prevents status downgrades
├── cleanup_open_findings.py     # Normalizes drifted enum values
├── project_setup.py             # First-time project bootstrap
├── AGENT-PREAMBLE.md            # Injected into every agent (project boundaries)
├── WORKFLOW.md                  # Step-by-step audit workflow
├── open_findings.json           # Canonical finding state (source of truth)
├── index.json                   # Run history
├── prompts/                     # Agent + synthesizer prompts (generic)
│   ├── agent-logic.md
│   ├── agent-data.md
│   ├── agent-ux.md
│   ├── agent-performance.md
│   ├── agent-security.md
│   ├── agent-deploy.md
│   ├── agent-expectations.md
│   ├── synthesizer.md
│   └── visual-*.md              # Visual audit agents
├── findings/                    # Individual case files (one .md per finding)
├── runs/                        # Raw agent + synthesizer JSON by date
├── artifacts/
│   ├── _run_/                   # Preflight artifacts (lint, typecheck, test, build)
│   └── _batch/                  # Generated batch checklists
├── schema/
│   └── audit-output.schema.json # v1.1 output schema
└── external_wisdom/             # Ideas, notes, experimental concepts
```

## Key invariants

1. **Canonical state lives in the repo.** `open_findings.json` is the single source of truth.
2. **No finding silently disappears.** Every non-terminal finding must appear in every synthesizer output, or be listed in `not_rereported` with a reason.
3. **AI proposes, code disposes.** The synthesizer emits JSON. `ingest-synth` applies it. The synthesizer never writes canonical files directly.
4. **Status never downgrades without cause.** `reconcile_merge_statuses.py` enforces this mechanically.

## Requirements

- Python 3.9+
- `tomli` package for Python < 3.11 (`pip install tomli`)
- An AI coding tool for running agents (Cursor, GitHub Copilot, Claude Code, or any LLM chat)
