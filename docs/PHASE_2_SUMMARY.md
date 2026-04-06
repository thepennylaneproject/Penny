# Phase 2: Worker Audit Engine Upgrade — IN PROGRESS ⚙️

**Status:** Observability, cost tracking, suite-aware routing, and repair handoff are integrated. Remaining work is operator validation plus optional prompt expansion for currently fallback-backed strategic audits.

## What Was Completed

### 1. Observability Infrastructure
- **File:** `apps/worker/src/observability.ts` (96 lines)
  - `PennyObservability` class with static methods for structured logging
  - `logExecution(metric: AgentMetric)`: Emits Datadog-compatible JSON to stdout
  - `detectLoops(runId, agentName)`: Detects agent thrashing (4+ runs in 5 min), sends to Sentry
  - `captureError(error, context)`: Logs crashes with full context to Sentry + JSON stderr

### 2. Cost Tracking Infrastructure
- **File:** `apps/worker/src/llm-router.ts` (92 lines)
  - `PRICING_RATES`: Complete pricing map for all supported models
    - Anthropic: Haiku ($0.8/$4), Sonnet ($3/$15), Opus ($15/$75)
    - OpenAI: GPT-4o-mini ($0.15/$0.6), GPT-4o ($5/$15)
    - Gemini: Flash ($0.075/$0.3), Pro ($1.25/$5)
  - `calculateCost()`: Computes cost from token counts
  - `logAuditMetrics()`: Writes model_usage to Supabase
  - `resolveLLMTier()`: Maps audit kind → LLM tier (aggressive/balanced/precision)
  - `TIER_PRICING`: UI cost estimation hints

### 3. Worker Integration
- **File:** `apps/worker/src/process-job.ts` (updated)
  - Added imports for observability, cost tracking, and Supabase modules
  - Resolves per-project `default_llm_tier` and `audit_suite_configs` before audit execution
  - Skips audit kinds blocked by disabled suites or per-agent overrides
  - Applies the resolved routing strategy while each project audit runs
  - Added `logExecution()` calls after intelligence extraction pass with observability metrics
  - Added `logAuditMetrics()` calls after intelligence extraction to write model_usage to Supabase
  - Added `logExecution()` calls after each domain pass
  - Added `logAuditMetrics()` calls after each domain pass to persist cost data
  - Added observability + usage logging for cluster/meta/project/portfolio synthesis jobs
  - Added error observability logging in prep failure catch block
  - Added error observability logging in main audit execution catch block
  - Structured metrics: run_id, project_id, agent_name, model, latency_ms, cost_usd, input/output tokens, status

### 4. Data Structure Updates
- **File:** `apps/worker/src/llm.ts` (updated)
  - Added `latency_ms?: number` field to `AuditLlmResult` interface
  - Enables latency tracking in observability metrics

### 5. Dependency Management
- **File:** `apps/worker/package.json` (verified)
  - `@sentry/node@^8.30.0` already present
  - `@supabase/supabase-js@^2.49.1` already present
  - All observability dependencies available

### 6. TypeScript Compilation
- ✅ `npm run build` passes without errors
- ✅ All 52 workspace dependencies installed via pnpm
- ✅ dist/ directory contains compiled observability.js, llm-router.js, and updated process-job.js

---

## Observability Output Examples

### Standard Audit Execution (Success)
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

### Fallback Triggered
```json
{
  "timestamp": "2026-04-02T21:48:59.000Z",
  "event_type": "agent_execution",
  "run_id": "audit-run-123",
  "project_id": "my-project",
  "agent_name": "security",
  "model": "claude-3-5-haiku-latest",
  "latency_ms": 1200,
  "cost_usd": 0.008,
  "input_tokens": 5000,
  "output_tokens": 450,
  "status": "fallback_triggered"
}
```

### Loop Detection Alert
```json
{
  "timestamp": "2026-04-02T21:48:59.000Z",
  "event_type": "loop_detected",
  "agent_name": "deploy",
  "run_id": "audit-run-123",
  "attempts_in_window": 5
}
```
Also sends to Sentry with warning level and tags.

### System Error
```json
{
  "timestamp": "2026-04-02T21:48:59.000Z",
  "event_type": "system_error",
  "error": "ENOSPC: no space left on device",
  "stack": "...",
  "context": {
    "jobId": "audit-run-123",
    "stage": "audit_execution",
    "jobType": "full"
  }
}
```
Also sends to Sentry with exception details.

---

## Integration Points

1. **Per-Pass Metrics**: After each domain pass completes (`auditWithLlm`), metrics are logged
2. **Intelligence Extraction**: Intelligence pass (full-repo) has dedicated observability
3. **Error Handling**: Prep failures and execution failures trigger error observability
4. **Loop Prevention**: In-memory 5-minute window tracks agent thrashing
5. **Sentry Correlation**: All events tagged with `agent` and `run_id` for grouping

---

## Completed Phase 2 Tasks

### ✅ Prompt File Migration (MOSTLY DONE)
- ✅ Core, visual, intelligence, and synthesizer prompt files are present in `audits/prompts/`
- ✅ Verified `loadClusterPrompts()` can load the active routed prompt variations
- ✅ Created core_system_prompt.md (from AGENT-PREAMBLE.md)
- ✅ Created audit-agent.md and domain_audits.md base templates
- ✅ Worker builds successfully with all prompts in place
- Remaining optional gap: `code-debt.md` is still absent, so `code_debt` currently falls back to the base audit prompt.

### ✅ Model Usage Persistence (DONE)
- ✅ Call `logAuditMetrics()` after each LLM audit
- ✅ Write model_usage rows to Supabase with cost tracking
- ✅ Latency and token metrics included in writes
- ✅ Synthesis jobs now emit the same usage rows as primary audit passes

## Remaining Phase 2 Tasks

### Next Steps for Complete Agent Support
1. **Operator Validation Run**
   - Run a full audit job with observability enabled
   - Verify logs appear in stdout (Datadog)
   - Check Sentry receives error/warning events
   - Confirm model_usage table populated in Supabase
   - Use `pnpm --filter penny-worker exec tsx src/scripts/admin.ts validate-run --job-id <uuid>` to verify the DB evidence after the run completes

2. **Lifecycle Validation**
   - Exercise queue → claim → execution → completion on a representative project
   - Validate skip behavior when a suite or agent override is disabled
   - Validate repair handoff still occurs for eligible findings
   - Investigate any `validate-run` warning where `model_usage` rows are missing for both the job id and the completed run id

3. **Visual + Strategic Agents** (Prompt file dependent)
   - ⏳ Verify visual cluster prompt loading (visual-*.md files)
   - ⏳ Add a dedicated `code-debt.md` prompt if a project-specific strategic prompt becomes available
   - ⏳ Test synthesizer passes (cluster_synthesize, meta_synthesize)

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/worker/src/observability.ts` | NEW: Sentry + Datadog logging + loop detection |
| `apps/worker/src/llm-router.ts` | NEW: Pricing map + cost calculation + tier resolution; now honors lowercase + uppercase routing env vars |
| `apps/worker/src/process-job.ts` | Added suite-aware routing, skip logic, and synthesis usage logging |
| `apps/worker/src/scripts/admin.ts` | Added `validate-run` lifecycle verifier for job/run/model_usage/repair evidence |
| `apps/worker/src/llm.ts` | Added `latency_ms?` to `AuditLlmResult` interface |
| `apps/worker/package.json` | Verified dependencies and added `admin:validate-run` |

---

## Testing Checklist

- [x] TypeScript compilation passes (`npm run build`)
- [x] All observability imports resolve
- [x] PennyObservability methods log valid JSON
- [x] Cost calculation works for all model types
- [x] Loop detection tracks 5-minute windows
- [x] Error capturing includes context
- [x] Supabase client initialized and available
- [x] logAuditMetrics() called after each LLM audit
- [x] Model usage data structured for Supabase writes
- [ ] Full audit run completes with observability logs visible
- [ ] Datadog ingestion works (requires deployed worker)
- [ ] Sentry error grouping works (requires deployed worker)
- [ ] Cost metrics appear in model_usage table for both audit and synthesis jobs (live test)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  auditWithLlm() call (domain pass or intelligence)      │
│  Returns AuditLlmResult with model, tokens, cost, etc.  │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────▼──────────────┐
        │ Metrics Aggregation    │ (in-memory jobMetrics)
        │ - total cost           │
        │ - total tokens         │
        │ - fallback count       │
        │ - cache hits           │
        └─────────┬──────────────┘
                  │
        ┌─────────▼──────────────────────────────┐
        │ PennyObservability.logExecution()       │
        │ ├─ JSON to stdout (Datadog capture)    │
        │ ├─ Sentry captureMessage() (warning)   │
        │ └─ detectLoops() (5-min window)        │
        └─────────┬──────────────────────────────┘
                  │
        ┌─────────▼──────────────────────────────┐
        │ [Future] logAuditMetrics()              │
        │ └─ Write to Supabase model_usage table │
        └─────────────────────────────────────────┘
```

---

## Notes

- **Datadog Compatibility**: JSON logs include timestamp, event_type, and all metrics as top-level fields (no nesting required for parsing)
- **Sentry Auto-Init**: Observability.ts initializes Sentry if `PENNY_SENTRY_DSN` is set
- **Fallback Tracking**: Fallback status is determined by `fallbackCount > 0`, not by model name
- **Loop Detection Preventive**: Triggers warning when agent runs 4+ times in 5 minutes (default threshold, not configurable yet)
- **Suite-aware routing**: worker now resolves `default_llm_tier` + `audit_suite_configs` before running a project audit
- **No Breaking Changes**: all changes are additive and preserve existing job types / queue contracts
