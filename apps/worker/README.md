# penny worker

Processes `penny_audit_jobs` from BullMQ queue **penny-audit** (or polls the DB every `penny_JOB_POLL_MS` if `REDIS_URL` is unset).

## Env

On startup the worker loads, in order (later files override): repo-root `.env` / `.env.local`, `apps/dashboard/.env` / `apps/dashboard/.env.local`, then `apps/worker/.env` / `apps/worker/.env.local`. So you can keep a single repo-root `.env.local` (or `apps/dashboard/.env.local`) and run `npm run dev` from `apps/worker/` without copying `DATABASE_URL`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same Postgres as dashboard (Supabase). Alias: `penny_DATABASE_URL`. You can also use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and let the worker derive the Postgres URL. |
| `OPENAI_API_KEY` | For real audits | Without it, jobs complete with a config finding only. |
| `REDIS_URL` / `penny_REDIS_URL` | No | If set, uses BullMQ; else polls DB. **Production:** set this to avoid steady DB QPS from polling. |
| `penny_REPO_ROOT` | No | Path to penny repo root (expects `core_system_prompt`, `expectations/`, `the_penny_lane_project/`). Default: parent of `worker/`. |
| `penny_AUDIT_MODEL` | No | Default `gpt-4o-mini`. |
| `penny_JOB_POLL_MS` | No | Poll interval when Redis disabled after draining one batch. Default `3000`. |
| `penny_JOB_POLL_IDLE_MS` | No | Idle backoff when queue empty (no job found). Default `5000`. |
| `penny_JOB_POLL_BATCH_SIZE` | No | Max queued jobs to fetch and drain per DB poll cycle. Default `10`. |
| `penny_LLM_TIMEOUT_MS` | No | Per-request timeout for worker LLM provider calls. Default `45000`. |

## Scripts

- `npm run dev` — `tsx watch src/index.ts`
- `npm run build && npm start` — compiled JS

Deploy this process on any long-lived host (Railway, Fly, VPS, etc.) with repo checkout or mount. Without `REDIS_URL`, the worker falls back to polling `penny_audit_jobs` every `penny_JOB_POLL_MS` and drains up to `penny_JOB_POLL_BATCH_SIZE` queued jobs per cycle. This is safer than the old one-job/30-second-idle behavior, but Redis is still preferred in production when running one or more workers.

## Stuck in `queued`?

If the dashboard shows Redis on but jobs never leave `queued`, the worker is not running or is pointed at a different Redis/DB than the dashboard. Start the worker locally: `cd apps/worker && npm install && npm run dev`.

To drop pending work: use the dashboard **Clear queue (Redis + DB)** or `POST /api/orchestration/queue/clear` with the same Bearer secret as enqueue.

## Code context sampling (why few findings?)

Each job runs **one LLM pass** per app. The worker sends the expectations doc plus:

1. **Intelligence report** — If the mirror tree contains a markdown file whose name includes `report` (e.g. `advocera_report.md`), the worker prepends a **bounded excerpt** (see `MAX_REPORT_CHARS` in `src/context.ts`).
2. **Sampled source files** from `the_penny_lane_project/<App>/`, not the whole repo or the full manual `audits/` corpus. Limits are in `src/context.ts` (on the order of **12 files**, **~6k characters** per file, bounded recursion). A small `findings` array is normal unless you raise those limits or add other importers.

See [docs/penny_NEAR_TERM_THEMES.md](../docs/penny_NEAR_TERM_THEMES.md) for workflow and theme priorities.

Without `OPENAI_API_KEY`, the worker records a single **config** finding instead of a real audit.

## Where completed runs are stored

Postgres tables **`penny_audit_jobs`** (enqueue + status) and **`penny_audit_runs`** (finished run: `job_type`, `summary`, `findings_added`, `payload`). The dashboard **project** view includes a **Worker audit history** section when `DATABASE_URL` is set.
