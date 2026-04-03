# Phase 2 — Quick Reference

## Status: ✅ Observability & Cost Tracking Integrated

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

### Next: Prompt Files
The worker can load all 17 audit agents **if** the prompt files exist. They don't exist yet.

**Required files:** 17 prompt files (from v2.0 `audits/prompts/`)
- 6 core agents: logic, security, performance, ux, data, deploy
- 6 visual agents: color, typography, components, layout, polish, tokens
- 2 investor agents: investor-readiness, code-debt
- 1 intelligence: intelligence_extraction_prompt
- Plus synthesizers and base audit template

**Action:** See `PHASE_2_PROMPT_MIGRATION.md` for detailed steps

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
- Repair service API endpoint design is separate
- Worker ready to call repair service (pending client implementation)
- Supabase repair_jobs table ready to receive repair tasks

---

## Deployment Notes

### Environment Variables (Worker)
```env
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
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
Once prompt files are in place:

```bash
# Full audit (default)
curl -X POST http://worker:3000/audit \
  -H "Content-Type: application/json" \
  -d '{"project": "my-project"}'

# Specific agent
curl -X POST http://worker:3000/audit \
  -H "Content-Type: application/json" \
  -d '{"project": "my-project", "audit_kind": "logic"}'

# Visual-only
curl -X POST http://worker:3000/audit \
  -H "Content-Type: application/json" \
  -d '{"project": "my-project", "audit_kind": "visual"}'

# Intelligence report
curl -X POST http://worker:3000/audit \
  -H "Content-Type: application/json" \
  -d '{"project": "my-project", "audit_kind": "intelligence"}'
```

Watch worker logs for observability JSON output and check Supabase for model_usage rows.

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
→ Verify SUPABASE_SERVICE_ROLE_KEY is set and Supabase is reachable.

**Loop detection false positives?**
→ Threshold is 4 runs in 5 minutes. Adjust in `observability.ts` if needed (currently hardcoded).

---

## Next Steps (Priority Order)

1. **[HIGH] Copy prompt files** → 15 agents become live
2. **[HIGH] Verify prompts load** → No-op warnings in worker logs
3. **[MEDIUM] Test audit jobs** → Cost tracking appears in model_usage
4. **[MEDIUM] Set up audit suite config** → Per-project agent selection
5. **[LOW] Phase 3 design** → Repair service + dashboard UI
