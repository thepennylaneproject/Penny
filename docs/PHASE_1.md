# Phase 1: Cloud Database Backbone — Supabase v2.0 Schema Adoption

**Status:** Complete in-repo / deployment verification required

## Overview

Phase 1 migrates all data persistence from local JSON files and direct PostgreSQL connections to Supabase as a single source of truth. This enables:

- ✅ Serverless database operations (no connection pooling on Netlify)
- ✅ RLS (Row-Level Security) for multi-tenant safety
- ✅ Edge Functions for cloud-native webhooks and async processing
- ✅ Real-time subscriptions for live dashboard updates
- ✅ Granular UI controls backed by database config tables

## What's Been Done

### 1. Database Schema (Complete)

**Core schema:**
- `001_lyra_schema.sql` — core tables (`projects`, `audit_runs`, `findings`, `repair_jobs`, `repair_candidates`, `model_usage`, `orchestration_events`)
- `002_rls_policies.sql` — base row-level security and ownership model

**Platform additions:**
- `003_v3_additions.sql` — 4 new tables:
  - `webhooks` — GitHub webhook registration per project
  - `schedules` — Cron-based audit scheduling
  - `audit_suite_configs` — Per-project agent selection (17 agents)
  - `intelligence_reports` — Markdown reports per project
- `004_repair_service.sql` — repair-service schema expansion:
  - extends `repair_jobs`
  - creates `repair_costs`
  - adds repair-scoped `orchestration_events`
  - adds repair indexes and policies
- `005_penny_projects.sql`, `006_penny_repair_tables.sql`, `007_penny_manifests_linear.sql`, `008_fix_audit_table_schemas.sql` — project identity, repair table normalization, manifests/Linear, and audit schema fixes
- `009_phase1_database_backbone_hardening.sql` — Phase 1 completion hardening:
  - adds public `repair_job_id`
  - adds `progress` JSONB to `repair_jobs`
  - aligns `penny_repair_status` with real app/service states
  - adds operational indexes for repair jobs, audit runs, findings, and winning candidates

### 2. Client Libraries (Complete)

**Dashboard:**
- `apps/dashboard/lib/supabase.ts` — Supabase JS client with typed query helpers
  - `createSupabaseUserClient(accessToken)` — anon key + user JWT; **RLS enforced** (use via `requireTenantSupabaseClient` in tenant API routes)
  - `createSupabaseServiceRoleClient()` / `getSupabaseServiceRoleClient()` — service role; **bypasses RLS** (workers and explicit dev-only paths)
  - Query helpers: `getProjects()`, `getFindings()`, `getAuditRuns()`, etc.
  - Mutation helpers: `updateFindingStatus()`, `insertAuditRun()`, etc.

**Worker:**
- `apps/worker/src/supabase-client.ts` — Supabase client for job processing
  - `getQueuedAuditRun()` — claim queued jobs
  - `startAuditRun()`, `completeAuditRun()` — job lifecycle
  - `insertFindings()`, `insertModelUsage()` — result persistence
  - `getAuditSuiteConfigs()` — read per-project agent config
  - `logOrchestrationEvent()` — nervous system logging

**Repair service:**
- `services/repair/api/supabase_client.py` — service-role Supabase client for repair tracking
- `services/repair/api/routes/repair.py` — creates and updates `repair_jobs`
- writes `repair_costs` rows from repair execution usage records

### 3. Contract Hardening (Complete)

- Dashboard repair-job APIs now resolve public `repair_job_id` to internal `repair_jobs.id` before querying child tables
- Dashboard repair job creation validates:
  - project name/UUID → canonical project ID
  - finding belongs to project
  - no duplicate active repair job exists
- Dashboard project repair-cost API now reads from `repair_costs` instead of the unrelated `model_usage` table
- Repair service and dashboard now share a consistent public repair job identifier contract

### 3. Dependencies (Complete)

- ✅ `@supabase/supabase-js` added to both dashboard and worker

## Remaining Work Outside Phase 1

Phase 1 is considered complete at the codebase level. The remaining work is operational execution, not missing schema design:

### 1. Apply Migrations to Target Environments

If you have a running v1.0 instance with data in `penny_audit_jobs`, `penny_findings`, etc., you need a data migration script:

```sql
-- Example: Migrate penny_audit_jobs → audit_runs
INSERT INTO audit_runs (id, project_id, kind, status, trigger_type, created_at)
SELECT
  gen_random_uuid() as id,
  p.id as project_id,
  'deep_audit' as kind,
  paj.status as status,
  'manual' as trigger_type,
  paj.created_at
FROM penny_audit_jobs paj
JOIN projects p ON p.name = paj.project_name;
```

### 2. Environment Setup

Ensure these are set in `.env.local` for local development:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For local development with Supabase CLI:
```bash
supabase start
supabase db push  # Apply all migrations including Phase 1 hardening
```

## Deployment / Verification Checklist

- [ ] Apply all migrations through `009_phase1_database_backbone_hardening.sql`
- [ ] Verify `repair_jobs` has:
  - [ ] `repair_job_id`
  - [ ] `progress`
  - [ ] status values that allow `running`, `completed`, `selected`, `blocked`, `cancelled`
- [ ] Verify `repair_costs` exists and accepts inserts from the repair service
- [ ] Verify dashboard repair-job APIs return data for:
  - [ ] `/api/repair-jobs/[jobId]`
  - [ ] `/api/repair-jobs/[jobId]/candidates`
  - [ ] `/api/repair-jobs/[jobId]/events`
  - [ ] `/api/projects/[name]/repair-costs`
- [ ] Verify worker can still write:
  - [ ] `audit_runs`
  - [ ] `findings`
  - [ ] `model_usage`
  - [ ] `orchestration_events`
- [ ] Verify repair service writes:
  - [ ] `repair_jobs`
  - [ ] `repair_costs`
- [ ] Deploy updated dashboard + worker + repair service code
- [ ] Monitor logs for Supabase auth, schema, or RLS issues

## Breaking Changes

- ✅ **No `pg` dependency in dashboard** — use Supabase client instead
- ✅ **No polling fallback in worker** — requires Redis queue (Upstash)
- ✅ **RLS enabled on all tables** — service role key needed for background jobs
- ✅ **Table names unchanged** — all v1.0 `penny_*` tables become `penny_*` (renamed from lyra)

## Production Verification Commands

```bash
# Start local Supabase
supabase start

# Apply schema
supabase db push

# Build affected apps
pnpm --filter penny-dashboard build
pnpm --filter penny-worker build
python3 -m compileall services/repair
```

Recommended manual verification after deploy:

```bash
# 1. Queue a repair from the dashboard or API
# 2. Confirm repair_jobs row has repair_job_id + progress
# 3. Confirm repair_costs rows appear for that repair_job_id
# 4. Confirm /api/repair-jobs/[jobId] and /api/projects/[name]/repair-costs return data
```

## Next Phase

**Phase 2: Worker Audit Engine Upgrade**
- Complete production readiness and operator verification of all 17 audit agents
- Tighten observability, routing behavior, and audit lifecycle validation
- Finish the remaining checklist needed to truthfully mark Phase 2 complete

## Testing Locally

```bash
# Start Supabase (includes postgres)
supabase start

# Apply migrations
supabase db push

# Run dashboard
cd apps/dashboard
npm run dev

# In another terminal, run worker
cd apps/worker
npm run dev

# In another terminal, run repair service
cd services/repair
python3 -m uvicorn api.main:app --reload --port 8000

# Check Supabase studio at http://localhost:54323
```

## References

- Supabase Docs: https://supabase.com/docs
- Schema: `supabase/migrations/`
- Clients: `apps/dashboard/lib/supabase.ts`, `apps/worker/src/supabase-client.ts`
- Plan: `/.claude/plans/staged-munching-harbor.md`
