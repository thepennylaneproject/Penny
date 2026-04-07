# Audit Workflow Guardrails

This workflow prevents audit/release loops when only audit artifacts change.

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

After applying fixes, determine what to re-audit:

```bash
python3 audits/session.py reaudit
```

This reads the files touched by your fixes and tells you exactly which agents to re-run on which scope.

- Re-audit only files touched by fixes.
- Run full synthesizer once at cycle end.
- If no qualifying code/runtime changes occurred, record an artifact-only delta and close cycle.

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
