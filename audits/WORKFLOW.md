# Audit Workflow Guardrails

This workflow prevents audit/release loops when only audit artifacts change.

**Re-audits (batched or targeted) are not “documentation-only” runs.** Their job is to **verify that applied fixes still hold** (move toward `fixed_verified` when evidence supports it) and to **detect regressions** (new or recurring findings, failed preflight checks, or drift from prior runs). Agent outputs are read-only on the codebase, but the **synthesizer** is expected to merge results into `open_findings.json` with that verification lens—same as a QA pass on the last fix cycle.

## 1) Pre-audit gate (mandatory)

Before running agents, check whether qualifying source changes exist since the last audit.

Qualifying change paths (Penny monorepo):

- `apps/**` — Turbo workspaces (e.g. Next.js dashboard at `apps/dashboard/`, worker at `apps/worker/`, repair helpers under `apps/repair-service/`)
- `packages/**` — shared TypeScript packages
- `services/**` — Python repair API and engine
- `supabase/**` — migrations and local Supabase config
- `.github/workflows/**`
- Root and repo tooling: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, root `tsconfig*.json`, `netlify.toml`, `.env.example`
- App or service config when it changes: `apps/*/package.json`, `apps/*/next.config.*`, `apps/*/vercel.json`, `apps/*/tsconfig*.json`, `services/*/Dockerfile`, `services/*/railway.toml`

Changes only under `audits/` (prompts, runs, findings) do not qualify for a full re-audit unless you intentionally refresh agent outputs.

Quick manual check:

```bash
# What changed since last audit run?
git diff --name-only $(git log -1 --format=%H -- audits/runs) HEAD
```

If the only changes are under `audits/`, skip the full audit and record an artifact-only note.

## 2) Preflight (mandatory, 1-2 minutes)

```bash
rm -rf audits/artifacts/_run_ && mkdir -p audits/artifacts/_run_

# Run whatever your project supports (ignore failures)
npm test -- --run > audits/artifacts/_run_/tests.txt 2>&1 || true
npm run lint > audits/artifacts/_run_/lint.txt 2>&1 || true
npm run build > audits/artifacts/_run_/build.txt 2>&1 || true
npx tsc --noEmit > audits/artifacts/_run_/typecheck.txt 2>&1 || true
```

Replace `npm` with `pnpm` or `yarn` as appropriate. If a command doesn't exist, the `|| true` skips it.

**One command (Penny monorepo):** from the repo root, dashboard preflight is:

```bash
python3 audits/session.py preflight
```

This writes `lint.txt`, `typecheck.txt`, `tests.txt`, and `build.txt` under `audits/artifacts/_run_/`.

## 2b) Batched re-audit (preflight + checklist + paste block)

Instead of copying six agent names and paths by hand, run:

```bash
python3 audits/session.py audit-batch
```

- Runs **preflight** (same as above).
- Builds the **re-audit plan** from findings `in_progress` / `fixed_pending_verify` (plus `git diff --name-only HEAD` and path triggers).
- Writes **`audits/artifacts/_batch/LATEST.md`** (and a timestamped copy): ordered agent steps, suggested `run_id` stem, focus paths, and a **single block** you can paste into Cursor to run all agents + synthesizer in one session.

Deep audit (all six agents + monorepo scope hints, no WIP required):

```bash
python3 audits/session.py audit-batch --full
```

Reuse the last preflight artifacts without re-running commands:

```bash
python3 audits/session.py audit-batch --skip-preflight
```

`LATEST.md` is overwritten each run; the matching `audit-batch-<UTC-stamp>.md` in the same folder is a durable snapshot of that checklist. After agent JSON + synthesizer output land in `audits/runs/<YYYY-MM-DD>/`, apply the merge to `audits/open_findings.json`, `audits/index.json`, and any touched `audits/findings/*.md` (see §4) so the release gate in §7 stays accurate.

## 3) Agent execution

Run 1-6 agents depending on Fast Lane vs Deep Audit:

| Agent | Prompt | Run ID format |
|-------|--------|---------------|
| A: Logic | `audits/prompts/agent-logic.md` | `logic-<YYYYMMDD>-<HHmmss>` |
| B: Data | `audits/prompts/agent-data.md` | `data-<YYYYMMDD>-<HHmmss>` |
| C: UX | `audits/prompts/agent-ux.md` | `ux-<YYYYMMDD>-<HHmmss>` |
| D: Performance | `audits/prompts/agent-performance.md` | `perf-<YYYYMMDD>-<HHmmss>` |
| E: Security | `audits/prompts/agent-security.md` | `security-<YYYYMMDD>-<HHmmss>` |
| F: Deploy | `audits/prompts/agent-deploy.md` | `deploy-<YYYYMMDD>-<HHmmss>` |

Save each output to: `audits/runs/<YYYY-MM-DD>/<run_id>.json`

## 4) Synthesizer

Run `audits/prompts/synthesizer.md` last with all agent outputs.

Save to: `audits/runs/<YYYY-MM-DD>/synthesized-<YYYYMMDD>-<HHmmss>.json`

The synthesizer updates:
- `audits/open_findings.json` (canonical state)
- `audits/index.json` (run history)
- `audits/findings/<ID>.md` (case files)

On **re-audit** cycles, the merge step should treat preflight artifacts (`audits/artifacts/_run_/`) and agent JSON as the verification signal: **promote** findings from `fixed_pending_verify` to `fixed_verified` when the original problem is no longer supported by evidence; **keep or escalate** status when checks still fail or agents report the same issue; **add or reopen** findings when something that was fixed has **regressed**.

### 4b) Linear (after merge)

**Canonical state lives in the repo** (`audits/open_findings.json`). Linear is a mirror: if you merge synthesizer output but skip push, issues stay open in Linear while the finding row is gone or stale locally.

1. Optional: `python3 audits/reconcile_merge_statuses.py --dry-run` then `--apply` if a merge downgraded statuses vs git baseline.
2. Push LYRA → Linear (requires `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, etc. — see `audits/linear_sync.py` header):

   ```bash
   python3 audits/linear_sync.py status    # unsynced + stale mapping hints
   python3 audits/linear_sync.py push --dry-run
   python3 audits/linear_sync.py push
   ```

3. Prefer **push** after repo changes. Use **pull** only when you intentionally changed workflow state in Linear and want those states copied into rows that still exist in `open_findings.json`. Avoid blind **sync** (push then pull) if the two sides disagree — reconcile in one direction first.

Findings **removed** from `open_findings.json` still have rows in `audits/linear_sync.json`. Push closes their Linear issues: it uses the cached terminal status when present, otherwise **infers `fixed_verified` → Done** and updates the map so the next run does not skip closing.

## 5) Triage gate

Use the session runner instead of reading JSON manually:

```bash
python3 audits/session.py              # What to do next
python3 audits/session.py triage       # Full prioritized list
python3 audits/session.py fix <id>     # Start a fix
python3 audits/session.py done <id>    # Mark fix applied
python3 audits/session.py skip <id>    # Defer
python3 audits/session.py decide <id> <decision>  # Answer a question
```

The session runner applies the rubric automatically:

- P0 blockers: fix now.
- P0/P1 majors with small effort: fix this session.
- Questions: decide now or defer with explicit note.
- Everything else: note and move on.

Timebox each cycle (recommended: 60-90 minutes).

## 6) Re-audit scope rule

Re-audits exist to **confirm fixes** and **guard against regression** on the touched surface area (see intro). After applying fixes, determine what to re-audit:

```bash
python3 audits/session.py reaudit
```

The plan merges several sources so it still works when `suggested_fix.affected_files` is empty:

- Paths from `suggested_fix.affected_files` when present
- Paths scraped from `proof_hooks` (`file` and paths embedded in `summary` text)
- `git diff --name-only` against `HEAD` (plus staged) while you have `in_progress` or `fixed_pending_verify` findings, so local edits map to agents
- Monorepo-oriented triggers (`apps/dashboard/…`, `supabase/migrations/…`, `.github/workflows/…`, etc.)

It also warns when `open_findings.json` `run_id` does not match the newest `audits/index.json` run — run the synthesizer and update both (§4). Re-audit only the surfaced paths; run the full synthesizer once at cycle end. If no qualifying code/runtime changes occurred, record an artifact-only delta and close the cycle.

## 7) Release gate

Before deploying, check:

```bash
python3 audits/session.py canship
```

This verifies:

- Latest `open_findings.json` run_id matches latest `audits/index.json` entry.
- No blocker findings remain open from the current cycle.
- All `question` findings have a decision or explicit deferral.

## 8) Definition of done

- One synthesized run artifact for the cycle.
- One set of status/decision updates in `audits/open_findings.json`.
- No duplicate fresh-audit passes without qualifying code/runtime changes.

## 9) Enum cleanup

If agents have drifted on enum values, run:

```bash
python3 audits/cleanup_open_findings.py --dry-run   # preview
python3 audits/cleanup_open_findings.py              # apply
```
