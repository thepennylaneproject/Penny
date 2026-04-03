# Phase 1: Cloud Database Backbone — Supabase v2.0 Schema Adoption

**Status:** In Progress

## Overview

Phase 1 migrates all data persistence from local JSON files and direct PostgreSQL connections to Supabase as a single source of truth. This enables:

- ✅ Serverless database operations (no connection pooling on Netlify)
- ✅ RLS (Row-Level Security) for multi-tenant safety
- ✅ Edge Functions for cloud-native webhooks and async processing
- ✅ Real-time subscriptions for live dashboard updates
- ✅ Granular UI controls backed by database config tables

## What's Been Done

### 1. Database Schema (Complete)

**v2.0 Schema (adopted):**
- `001_penny_schema.sql` — 8 core tables (projects, audit_runs, findings, repair_jobs, repair_candidates, model_usage, orchestration_events)
- `002_rls_policies.sql` — Row-level security with cascading ownership from projects

**v3.0 Additions (new):**
- `003_v3_additions.sql` — 4 new tables:
  - `webhooks` — GitHub webhook registration per project
  - `schedules` — Cron-based audit scheduling
  - `audit_suite_configs` — Per-project agent selection (17 agents)
  - `intelligence_reports` — Markdown reports per project

### 2. Client Libraries (Complete)

**Dashboard:**
- `apps/dashboard/lib/supabase.ts` — Supabase JS client with typed query helpers
  - `getSupabaseServerClient()` — service role key for server-side operations
  - Query helpers: `getProjects()`, `getFindings()`, `getAuditRuns()`, etc.
  - Mutation helpers: `updateFindingStatus()`, `insertAuditRun()`, etc.

**Worker:**
- `apps/worker/src/supabase-client.ts` — Supabase client for job processing
  - `getQueuedAuditRun()` — claim queued jobs
  - `startAuditRun()`, `completeAuditRun()` — job lifecycle
  - `insertFindings()`, `insertModelUsage()` — result persistence
  - `getAuditSuiteConfigs()` — read per-project agent config
  - `logOrchestrationEvent()` — nervous system logging

### 3. Dependencies (Complete)

- ✅ `@supabase/supabase-js` added to both dashboard and worker

## What Still Needs To Be Done

### 1. Migrate Existing Data (if upgrading live instance)

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

### 2. Update Dashboard API Routes

Replace reads/writes in these routes to use the new `supabase.ts` client:

**Critical routes:**
- `/api/projects` — list projects
- `/api/projects/[name]/findings` — get findings for project
- `/api/audit-runs` — list audit runs
- `/api/engine/queue` — enqueue repair job
- `/api/findings/lifecycle` — update finding status

**Example refactor:**

```typescript
// Before: using postgres.ts directly
const repo = getRepository();
const findings = await repo.query('SELECT * FROM findings WHERE project_id = $1', [projectId]);

// After: using supabase.ts
const client = getSupabaseServerClient();
const findings = await getFindings(client, projectId);
```

### 3. Update Worker Job Processing

Refactor `apps/worker/src/index.ts` to:
- Replace `createPool()` with `getSupabaseClient()`
- Replace `claimJob()` (pg-based) with `getQueuedAuditRun()` (Supabase-based)
- Use `insertFindings()` instead of direct INSERT
- Use `logOrchestrationEvent()` for status tracking

### 4. Integration Tests

Create tests to verify:
- ✅ Supabase client initializes with correct env vars
- ✅ `getQueuedAuditRun()` returns null when queue is empty
- ✅ `insertFindings()` upserts on finding ID collision
- ✅ RLS policies block unauthorized access
- ✅ Service role key bypasses RLS for Edge Functions

### 5. Environment Setup

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
supabase db push  # Apply migrations
```

## Migration Checklist

- [ ] Run `001_penny_schema.sql` and `002_rls_policies.sql` (if not already applied)
- [ ] Run `003_v3_additions.sql` to create new v3.0 tables
- [ ] Update all dashboard API routes to use `supabase.ts`
- [ ] Update worker `index.ts` to use `supabase-client.ts`
- [ ] Test dashboard locally against Supabase
- [ ] Test worker locally against Supabase
- [ ] Deploy migrations to production
- [ ] Deploy dashboard + worker with new code
- [ ] Monitor logs for connection issues

## Breaking Changes

- ✅ **No `pg` dependency in dashboard** — use Supabase client instead
- ✅ **No polling fallback in worker** — requires Redis queue (Upstash)
- ✅ **RLS enabled on all tables** — service role key needed for background jobs
- ✅ **Table names unchanged** — all v1.0 `penny_*` tables become `penny_*` (renamed from lyra)

## Next Phase

**Phase 2: Worker Audit Engine Upgrade**
- Port all 17 audit agents to the worker
- Implement suite routing based on `audit_suite_configs`
- Add cost tracking (`model_usage` writes)

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

# Check Supabase studio at http://localhost:54323
```

## References

- Supabase Docs: https://supabase.com/docs
- Schema: `supabase/migrations/`
- Clients: `apps/dashboard/lib/supabase.ts`, `apps/worker/src/supabase-client.ts`
- Plan: `/.claude/plans/staged-munching-harbor.md`
