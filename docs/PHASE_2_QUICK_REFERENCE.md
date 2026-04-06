# Phase 2 — Quick Reference

## Status: ⚙️ Build-ready, validation pending

### What's Working Now
1. **Structured Logging** — Datadog-compatible JSON output from every audit
2. **Loop Detection** — Alerts when an agent runs 4+ times in 5 minutes (Sentry)
3. **Cost Tracking** — Calculates USD cost for every LLM call based on token usage
4. **Error Observability** — Full stack traces + context to Sentry
5. **Model Usage Persistence** — Writes to Supabase `model_usage` table

### Build Status
```bash
npm run build  # ✅ passes TypeScript compilation
npm start      # Ready to process audit jobs
```

### Key Files
| File | Purpose |
|------|---------|
| `apps/worker/src/observability.ts` | Sentry + Datadog JSON logging + loop detection |
| `apps/worker/src/llm-router.ts` | Pricing map + cost calculation + tier resolution |
| `apps/worker/src/process-job.ts` | Audit execution with observability integration |
| `PHASE_2_SUMMARY.md` | Detailed implementation notes |
| `PHASE_2_PROMPT_MIGRATION.md` | How to add the 17 agent prompt files |

### Prompt Status
The active core, visual, intelligence, and synthesizer prompt files are already present in `audits/prompts/`.

Current nuance:
- `code_debt` still falls back to the base audit prompt because `code-debt.md` is not present
- the worker now resolves `audit_suite_configs` / `default_llm_tier` before running project audits
- synthesis jobs now emit `model_usage` rows just like primary audit passes

### Cost Tracking Example
When an audit completes:
```
model_usage table ← [
  {
    run_id: "audit-run-123",
    audit_kind: "logic",
    model: "claude-3-5-sonnet-latest",
    input_tokens: 8200,
    output_tokens: 1250,
    cost_usd: 0.042,
    latency_ms: 3420
  },
  ...
]
```

### Observability Output
Every agent execution produces JSON to stdout:
```json
{
  "timestamp": "2026-04-02T21:48:59.000Z",
  "event_type": "agent_execution",
  "run_id": "audit-run-123",
  "project_id": "my-project",
  "agent_name": "logic",
  "model": "claude-3-5-sonnet-latest",
  "latency_ms": 3420,
  "cost_usd": 0.042,
  "input_tokens": 8200,
  "output_tokens": 1250,
  "status": "success"
}
```

This is captured by Railway logs → Datadog pipeline.

### Loop Detection
If an agent thrashes (runs 4+ times in 5 minutes):
- JSON log event: `event_type: "loop_detected"`
- Sentry alert: warning level with `agent` + `run_id` tags
- Prevents runaway spend

### Error Handling
If an audit fails:
- Full error logged to Sentry with context
- JSON error event to stdout with stack trace
- Job marked as failed in database

### Phase 3 Prep
- Repair service is already wired through `apps/worker/src/repair-client.ts`
- Worker submits eligible findings to the repair service after audit completion
- Supabase repair_jobs table ready to receive repair tasks

---

## Deployment Notes

### Environment Variables (Worker)
```env
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
penny_ROUTING_STRATEGY=balanced
PENNY_SENTRY_DSN=https://... (optional; observability disabled if not set)
REDIS_URL=... (for BullMQ; fallback to polling if not set)
```

### Logs Location
- **Stdout**: JSON metric logs (captured by Railway)
- **Sentry**: Error and warning events
- **Supabase**: model_usage table (persisted cost data)

### Monitoring Dashboard
- Datadog: ingest `event_type` field for metric filtering
- Sentry: filter by `agent` tag to see per-agent error rates
- Supabase: aggregate `cost_usd` by `run_id` or `audit_kind` for spend tracking

---

## Testing Audit Kinds
Use the dashboard/API to enqueue jobs, then validate them from the worker side:

```bash
# 1. Queue an audit
pnpm --filter penny-worker exec tsx src/scripts/admin.ts queue --project MyApp --type re_audit_project

# 2. List recent jobs to capture the job UUID
pnpm --filter penny-worker exec tsx src/scripts/admin.ts list-jobs

# 3. Validate the finished lifecycle
pnpm --filter penny-worker exec tsx src/scripts/admin.ts validate-run --job-id <uuid>
```

The validator checks:
- `penny_audit_jobs` status and payload
- matching `penny_audit_runs` completion row
- `audit_metrics` / `project_audit_details` in the run payload
- `model_usage` rows by job id and by completed run id
- repair handoff rows in `penny_repair_jobs`

Watch worker logs for observability JSON output and use `validate-run` to confirm DB evidence.

---

## What Phase 3 Will Add
1. Repair service API (FastAPI)
2. Per-finding repair parameters (beam width, max depth, etc.)
3. GitHub PR creation from repairs
4. Repair cost tracking (separate from audit cost tracking)
5. Dashboard UI for repair configuration

---

## Troubleshooting

**"Missing prompt file" warning?**
→ Copy the 17 prompt files from v2.0. See `PHASE_2_PROMPT_MIGRATION.md`

**Observability logs not appearing?**
→ Check Sentry DSN is set. Logs still go to stdout regardless.

**Model usage table empty?**
→ Verify `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set and Supabase is reachable. If `validate-run` still reports zero `model_usage` rows, inspect the current `audit_runs` vs `penny_audit_runs` linkage before treating Phase 2 as complete.

**Loop detection false positives?**
→ Threshold is 4 runs in 5 minutes. Adjust in `observability.ts` if needed (currently hardcoded).

---

## Next Steps (Priority Order)

1. **[HIGH] Run a real lifecycle validation** → queue, completion payload, repair handoff
2. **[HIGH] Verify `model_usage` persistence on a live run** → confirm audit/synthesis cost evidence
3. **[MEDIUM] Add `code-debt.md`** → dedicated strategic prompt instead of base fallback
4. **[LOW] Phase 3 hardening** → repair service lifecycle + safeguards
