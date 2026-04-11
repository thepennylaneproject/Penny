# Audit Workflow Guardrails

This workflow prevents audit/release loops when only audit artifacts change.

**Re-audits are verification runs.** Their job is to confirm applied fixes hold (`fixed_pending_verify` → `fixed_verified`), detect regressions, and surface new findings. Agent outputs are read-only on the codebase; the synthesizer proposes merged state; `ingest-synth` applies it.

## Setup (once per repo)

```bash
# From repo root:
python3 audits/session.py init
```

This generates `audits/project.toml` with auto-detected paths, package manager, and preflight commands. Edit the `[paths.*]` sections to match your repo layout. If you skip this step, session.py falls back to dynamic detection.

## 1) Pre-audit gate

Before running agents, check whether qualifying source changes exist since the last audit.

```bash
git diff --name-only $(git log -1 --format=%H -- audits/runs) HEAD
```

**Qualifying changes (Penny)** — treat as source/product work that may warrant a full audit pass when present in the diff above:

- `apps/` — dashboard (Next.js), worker, `repair-service`
- `packages/` — shared TypeScript (`shared-types`, etc.)
- `services/` — Python repair engine and APIs
- `supabase/` — migrations and Edge functions
- Workspace / build roots: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`
- `.github/workflows/`
- Root deploy config such as `netlify.toml`

**Artifact-only** — if every changed path is under `audits/` (findings, prompts, `session.py`, `project.toml`, `artifacts/`, `runs/`, etc.), skip the full audit and record an artifact-only note. Optionally extend the same policy to repo-root documentation only (for example `README.md`) if the team agrees those changes never require a product re-audit.

## 2) Preflight

```bash
python3 audits/session.py preflight
```

Runs the commands from `audits/project.toml` `[preflight]` (or auto-detects). Writes `lint.txt`, `typecheck.txt`, `tests.txt`, and `build.txt` under `audits/artifacts/_run_/`.

## 3) Batched audit

```bash
python3 audits/session.py audit-batch          # WIP-scoped re-audit
python3 audits/session.py audit-batch --full   # All agents, full scope
python3 audits/session.py audit-batch --skip-preflight
```

Writes `audits/artifacts/_batch/LATEST.md` — a paste-ready checklist with per-agent paths (from `project.toml`), focus paths, and run IDs.

### Manual agents

| Agent | Prompt | Run ID |
|-------|--------|--------|
| Logic | `audits/prompts/agent-logic.md` | `logic-YYYYMMDD-HHmmss` |
| Data | `audits/prompts/agent-data.md` | `data-YYYYMMDD-HHmmss` |
| UX | `audits/prompts/agent-ux.md` | `ux-YYYYMMDD-HHmmss` |
| Performance | `audits/prompts/agent-performance.md` | `perf-YYYYMMDD-HHmmss` |
| Security | `audits/prompts/agent-security.md` | `security-YYYYMMDD-HHmmss` |
| Deploy | `audits/prompts/agent-deploy.md` | `deploy-YYYYMMDD-HHmmss` |

Save to `audits/runs/<YYYY-MM-DD>/<run_id>.json`. Run synthesizer last.

## 4) Ingest

```bash
python3 audits/session.py ingest-synth audits/runs/<date>/synthesized-<id>.json --strict
```

`--strict` (default in batch) fails if any `fixed_pending_verify` finding is missing from the synthesizer output. This prevents zombie findings.

### Reconcile (after ingest)

```bash
python3 audits/reconcile_merge_statuses.py --dry-run
python3 audits/reconcile_merge_statuses.py --apply
```

### Linear sync (after reconcile)

```bash
python3 audits/linear_sync.py status
python3 audits/linear_sync.py push --dry-run
python3 audits/linear_sync.py push
```

## 5) Triage

```bash
python3 audits/session.py              # what to do next
python3 audits/session.py triage       # full list
python3 audits/session.py fix <id>     # → in_progress
python3 audits/session.py done <id>    # → fixed_pending_verify
python3 audits/session.py verify <id>  # → fixed_verified
python3 audits/session.py skip <id>    # defer
python3 audits/session.py decide <id> <decision>
```

## 6) Re-audit scope

```bash
python3 audits/session.py reaudit
```

## 7) Housekeeping

```bash
python3 audits/session.py prune-closed --dry-run
python3 audits/session.py prune-closed
python3 audits/cleanup_open_findings.py --dry-run
python3 audits/cleanup_open_findings.py
```

## 8) Release gate

```bash
python3 audits/session.py canship
```
