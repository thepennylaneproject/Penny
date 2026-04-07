# Lyra audit agent system

## Stack (greenfield)

| Piece | Role |
|-------|------|
| **Worker** (`worker/`) | BullMQ consumer (or DB poll if no Redis). Runs LLM audits using `core_system_prompt` + `audits/prompts/audit-agent.md`. Writes findings to **Supabase Postgres** (`lyra_projects`). |
| **Dashboard** | Next.js on **Netlify**. Enqueues jobs via `POST /api/orchestration/jobs` (Bearer `ORCHESTRATION_ENQUEUE_SECRET`). |
| **Scheduled weekly audit** | Netlify scheduled function `dashboard/netlify/functions/enqueue-weekly-audit.ts` — Monday 09:00 UTC (same cadence as the old workflow). |

GitHub Actions / Copilot issue triggers are **removed**. Optional future use: GitHub API only for repo read / PRs.

---

## The 11 applications

| App | Directory | Expectations |
|-----|-----------|--------------|
| Advocera | `the_penny_lane_project/Advocera/` | `expectations/advocera-expectations.md` |
| Codra | `the_penny_lane_project/Codra/` | `expectations/codra-expectations.md` |
| FounderOS | `the_penny_lane_project/FounderOS/` | `expectations/founderos-expectations.md` |
| Mythos | `the_penny_lane_project/Mythos/` | `expectations/mythos-expectations.md` |
| Passagr | `the_penny_lane_project/Passagr/` | `expectations/passagr-expectations.md` |
| Relevnt | `the_penny_lane_project/Relevnt/` | `expectations/relevnt-expectations.md` |
| embr | `the_penny_lane_project/embr/` | `expectations/embr-expectations.md` |
| ready | `the_penny_lane_project/ready/` | `expectations/ready-expectations.md` |
| Dashboard | `the_penny_lane_project/dashboard/` | `expectations/dashboard-expectations.md` |
| Restoration Project | `the_penny_lane_project/restoration-project/` | `expectations/restoration-project-expectations.md` |
| sarahsahl.pro | `the_penny_lane_project/sarahsahl_pro/` | `expectations/sarahsahl-pro-expectations.md` |

Worker app list: `worker/src/apps.ts`.

---

## Prompts

- **Core:** repo root `core_system_prompt`
- **Audit behavior:** `audits/prompts/audit-agent.md` (JSON findings contract)
- Legacy reference: `.github/agents/audit-agent.md` (human/Copilot-oriented copy)

---

## Database

Apply migration: [`supabase/migrations/20250318120000_lyra_core.sql`](../supabase/migrations/20250318120000_lyra_core.sql) (`lyra_projects`, `lyra_audit_jobs`, `lyra_audit_runs`).

---

## Worker run

```bash
cd worker
cp ../.env.example .env   # or set DATABASE_URL, OPENAI_API_KEY, REDIS_URL (optional), LYRA_REPO_ROOT
npm install && npm run dev
```

See `worker/README.md`.
