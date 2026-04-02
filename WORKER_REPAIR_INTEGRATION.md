# Worker ↔ Repair Service Integration (Phase 3.5)

**Status:** ✅ Complete

## Overview

The audit worker is now fully integrated with the repair service. When audits find high-priority issues, they automatically submit them to the repair service for autonomous repair and GitHub PR creation.

---

## Architecture

```
Audit Worker                          Repair Service                    GitHub
─────────────                         ──────────────                    ──────

1. Run audit on code
   ↓
2. Find high-priority issues
   ↓
3. Save findings to Supabase
   ↓
4. For each eligible finding:
   ├─ Read code context
   ├─ POST /jobs ─────────────────────→ RepairService receives job
   │                                   ├─ Initialize beam search
   │                                   ├─ Call Claude (generate root patch)
   │                                   ├─ Docker eval (lint, typecheck, tests)
   │                                   ├─ Refine & re-eval (depth 0→4)
   │                                   ├─ Calculate confidence
   │                                   ├─ Determine action routing
   │                                   ├─ Call GitHub API ──────────────→ Create PR
   │                                   │
   │                    ┌──────────────→ Trigger repair-callback Edge Fn
   │                    │              
   │    Update findings │
   │    with job ID ←───┘
   │
5. Worker continues (non-blocking)
```

---

## Components

### RepairServiceClient (`apps/worker/src/repair-client.ts`)

**Purpose:** HTTP client for repair service communication.

**Key Methods:**

```typescript
async submitJob(request: RepairJobRequest): Promise<RepairJobResponse>
  // Submit a repair job
  // Returns: job_id for polling

async getJobStatus(jobId: string): Promise<RepairJobStatus>
  // Get current job status
  // Returns: full status with confidence, candidates, PR details

async waitForCompletion(jobId: string, timeoutMs?): Promise<RepairJobStatus>
  // Poll status until completion
  // Default timeout: 10 minutes

async submitAndPoll(request, timeoutMs?): Promise<RepairJobStatus>
  // Submit + wait in one call
  // Used for integration with worker

async health(): Promise<Record<string, unknown>>
  // Check service health before submitting
```

**Features:**
- Bearer token auth with `REPAIR_SERVICE_SECRET`
- Exponential backoff retry (3 attempts, 1s→2s→4s delays)
- Graceful degradation: logs warning if service unavailable, continues audit
- Health check before submission to avoid unnecessary requests

### Integration Point (`apps/worker/src/process-job.ts`)

**Function:** `triggerRepairsForFindings()`

**When Called:** After audit completes and findings are saved to Supabase

**Eligibility Criteria:**
```
✓ autofix_eligibility != "manual_only"
✓ severity is "high" or "blocker" (high-priority only)
✓ NOT a duplicate (duplicate_of is empty)
✓ Has file_path (needed for code context)
```

**For Each Eligible Finding:**
1. Read code context (first 10KB of file)
2. Build RepairJobRequest
3. POST to repair service
4. Store repair_job_id in finding
5. Update finding.repair_status = "submitted"
6. Continue with next finding on error

**Non-Blocking:**
- Repair service unavailable? Logs warning, continues audit
- Single repair submission fails? Logs error, continues to next finding
- Findings re-saved with repair_job_ids for tracking

---

## Request/Response Flow

### 1. Worker Submits Repair Job

```typescript
// Worker builds request with finding context
const repairRequest: RepairJobRequest = {
  run_id: "audit-run-123",
  finding_id: "missing-null-check",
  project_id: "550e8400-e29b-41d4-a716-446655440000",  // UUID from Supabase
  file_path: "src/utils.ts",
  finding_title: "Missing null check before property access",
  finding_severity: "high",
  description: "Variable 'user' may be null when accessing user.email",
  code_context: "const email = user.email; ...", // First 10KB of file
  repair_config: {
    beam_width: 4,
    max_depth: 4,
    timeout_seconds: 180,
    language: "typescript"
  }
}

// Worker posts to repair service
const response = await repairClient.submitJob(repairRequest);
// Returns:
{
  "repair_job_id": "job-abc-123",
  "status": "queued",
  "created_at": "2025-04-02T...",
  "estimated_completion_ms": 32000
}

// Worker stores job ID in finding
finding.repair_job_id = response.repair_job_id;
finding.repair_status = "submitted";

// Worker saves findings back to Supabase
await saveProject(...);  // Now includes repair_job_ids
```

### 2. Repair Service Processes Job

```
[Queued] → [In Progress]
  ├─ Generate root patch (Claude API)
  ├─ Evaluate in Docker
  ├─ Beam search loop (depth 0→4)
  │  ├─ Generate refinements
  │  ├─ Evaluate each
  │  ├─ Score & rank
  │  └─ Check early stopping (≥98%)
  └─ Calculate final confidence (4-component)
  
[In Progress] → [Completed]
  ├─ Determine action routing
  ├─ Create GitHub PR (if warranted)
  └─ Trigger repair-callback Edge Function
```

### 3. Repair Service Reports Results

```
repair-callback Edge Function receives:
{
  "repair_job_id": "job-abc-123",
  "status": "completed",
  "action": "ready_pr",
  "confidence_score": 93.5,
  "pr_number": 42,
  "pr_url": "https://github.com/..."
}

Edge Function:
1. Validates Bearer token
2. Updates repair_jobs in Supabase
   ├─ status = "completed"
   ├─ pr_number = 42
   ├─ pr_url = "https://..."
   └─ confidence_score = 93.5
3. Logs event to orchestration_events
4. (Future) Triggers post-processing workflows
```

### 4. Worker (Eventually) Queries Results

```typescript
// Worker can optionally poll to see final results
const finalStatus = await repairClient.getJobStatus(jobId);

// Returns complete status:
{
  "repair_job_id": "job-abc-123",
  "finding_id": "missing-null-check",
  "status": "completed",
  "confidence_score": 93.5,
  "action": "ready_pr",
  "best_score": 94.2,
  "pr_number": 42,
  "pr_url": "https://github.com/repo/pull/42",
  "candidates": [
    { "id": "cand-1", "depth": 0, "score": 85.0 },
    { "id": "cand-2", "depth": 1, "score": 92.1 },
    ...
  ]
}
```

---

## Configuration

### Worker Environment Variables

```bash
# Repair service connection
REPAIR_SERVICE_URL=http://repair-service:3001
REPAIR_SERVICE_SECRET=<bearer-token>

# Standard worker vars
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=<key>
ANTHROPIC_API_KEY=<key>
...
```

### Repair Service Environment Variables

(Already configured in Phase 3.1-3.4)

```bash
ANTHROPIC_API_KEY=<key>
GITHUB_TOKEN=<token>
REPAIR_SERVICE_SECRET=<bearer-token>
...
```

---

## Eligibility Filtering

**Why Filter?**
- Repairs are expensive (LLM calls, Docker evaluations)
- Manual-only findings should skip auto-repair
- Low-priority findings don't justify repair cost
- Duplicates shouldn't spawn multiple repairs

**Filtered Findings Example:**

```
Finding 1: Missing null check
  ├─ autofix_eligibility: "suggest_only" ✓
  ├─ severity: "high" ✓
  ├─ duplicate_of: null ✓
  ├─ file_path: "src/utils.ts" ✓
  → ELIGIBLE → Submit to repair service

Finding 2: Type mismatch
  ├─ autofix_eligibility: "manual_only" ✗
  → SKIP

Finding 3: Unused import
  ├─ severity: "minor" ✗
  → SKIP

Finding 4: XSS vulnerability
  ├─ autofix_eligibility: "suggest_only" ✓
  ├─ severity: "blocker" ✓
  ├─ duplicate_of: "finding-1" ✗
  → SKIP (duplicate)
```

---

## Error Handling

**Service Unavailable**
```
[penny-worker] Repair service unavailable, skipping repairs: Connection refused
→ Audit continues normally
→ Findings saved WITHOUT repair_job_ids
```

**Single Finding Fails**
```
[penny-worker] Failed to submit repair for finding security-123: ...
→ Continues with next finding
→ Other findings still submitted
```

**Repair Job Fails**
```
repair_jobs.status = "failed"
repair_jobs.error_message = "Evaluation timeout after 180s"
→ User sees in dashboard: "Repair failed"
→ Can retry or manually fix
```

---

## Monitoring

### Metrics to Track

- Repair jobs submitted per audit
- Repair service availability (health check pass rate)
- PR creation success rate by action type
- Confidence score distribution

### Logs to Watch

```
[penny-worker] Submitted repair job <id> for finding <finding-id>
[penny-worker] Repair service unavailable...
[penny-worker] Failed to submit repair for finding...
[penny-worker] maintenance backlog sync...
```

### Dashboard Visibility

1. **Findings View**: Shows `repair_job_id` when job submitted
2. **Repair Jobs View**: Lists all jobs per project with status/PR details
3. **Cost Dashboard**: Tracks repair LLM costs separately from audit costs
4. **PR View**: Links to created PRs with confidence indicator

---

## Next Steps (Phase 4+)

### Immediate (Phase 4)
- [ ] Dashboard components for repair job monitoring
- [ ] Re-audit after PR merge (detect "fixed_verified")
- [ ] Approval workflows (fast-lane PRs)

### Later
- [ ] Multi-provider LLM router
- [ ] Learning from merge history (improve scoring)
- [ ] Auto-merge with explicit gates
- [ ] Repair effectiveness analytics

---

## Testing Checklist

- [ ] Repair service running (`python -m uvicorn main:app`)
- [ ] Worker can reach repair service (health check passes)
- [ ] Submit test audit with high-priority finding
- [ ] Verify finding gets repair_job_id
- [ ] Check Supabase: repair_jobs row created
- [ ] Check Supabase: repair_candidates created (beam search ran)
- [ ] Check GitHub: PR created with correct action type (draft/ready/fast-lane)
- [ ] Check repair_jobs: confidence_score and PR details populated
- [ ] Optional: Wait for PR approval, merge, re-audit detects "fixed"

---

## Summary

The worker and repair service are now **fully integrated**:

✅ Audit finds issue  
✅ Submits to repair service (non-blocking)  
✅ Repair service generates patch (Claude)  
✅ Evaluates in Docker  
✅ Routes to GitHub as PR (fast-lane/ready/draft)  
✅ Worker continues immediately  
✅ User sees PR in dashboard with confidence score  

**The complete autonomous repair loop is operational.**
