# Phase 3: Repair Service & Dashboard — Design Summary

## What is Phase 3?

Phase 3 transforms audit **findings** into **fixes** via:

1. **Repair Service** (FastAPI) — Generates patches using beam search + LLM
2. **Worker Integration** — Routes repair-eligible findings to repair service
3. **Dashboard UI** — Manage repairs, track costs, create PRs

---

## Key Design Decisions

### 1. Architecture: Separate FastAPI Service
**Why:** 
- Repairs are compute-heavy (Docker evaluation, LLM calls, iterative refinement)
- Worker is optimized for fast audit passes, not repairs
- Independent scaling: audit worker ≠ repair capacity

**Deployment:** Railway (same as worker/dashboard)

---

### 2. Repair Flow: Beam Search with Scoring
**Why:**
- Generates multiple candidate patches (not just one)
- Evaluates each candidate in Docker sandbox
- Iteratively refines best candidates
- Guarantees validation before presenting to user

**Process:**
```
Layer 0 (Roots):    LLM generates 6 candidates (beam_width × 2)
                    ↓ Score in Docker
                    Keep top 3 (beam_width)
                    
Layer 1 (Refine):   LLM refines each of top 3 based on errors
                    ↓ Score in Docker
                    Keep top 3
                    
Layer 2-3:          Repeat until best score ≥ 95% or max_depth reached
```

**Tunable Parameters:**
- `beam_width` (1-10): How many candidates to keep per layer
- `max_depth` (1-5): How many refinement layers to try
- `timeout_seconds` (30-300): Abort if too slow

---

### 3. Database: Three New Tables
- **repair_jobs** — Job metadata, status, results
- **repair_candidates** — Each candidate patch with score
- **repair_costs** — Cost tracking per LLM call

**Integration:** Uses existing Supabase RLS for project isolation

---

### 4. Worker Integration: Selective Repair
Not all findings get repaired. Only:
- **Severity:** High or Critical
- **Type:** Bug, Logic, Data (not UX/performance)
- **Proof:** Must have file location

This keeps repair cost predictable.

---

### 5. GitHub PR Integration: Draft Mode
Repairs automatically create **draft PRs** with:
- Branch name: `repair/{finding-id}-{slug}`
- Labels: `ai-generated-patch`, `penny-repair`
- Description: Links to finding, shows best candidate score
- Status: Draft (requires human review before merge)

**User can:**
- Review patch
- Run CI/CD
- Approve for merge
- Or discard

---

### 6. Dashboard: 7 New Components
For craft-level repair control:

| Component | Purpose |
|-----------|---------|
| **Repair Job Monitor** | Real-time progress (depth, score, candidates) |
| **Repair Config Tuner** | Adjust beam_width, max_depth, timeout |
| **Candidate Comparison** | Side-by-side diff view + validation results |
| **Cost Estimator** | Predict & display repair cost |
| **PR Manager** | Create/link GitHub PRs from candidates |
| **Repair History** | Table of past repair jobs |
| **Project Config** | Default repair settings per project |

---

## Cost Model

### Per-Repair Estimate
```
beam_width=3, max_depth=3
───────────────────────
Root generation:     6 calls = $0.12
Layer 1 refine:      6 calls = $0.11
Layer 2 refine:      6 calls = $0.11
Layer 3 refine:      6 calls = $0.11
───────────────────────
Total:               ~$0.45/repair
```

Dashboard shows estimate before starting.

---

## Implementation Phases

### Phase 3.1: Core Service (2 weeks)
- [ ] FastAPI app scaffold
- [ ] Supabase schema (repair_jobs, candidates, costs)
- [ ] Job submission endpoint
- [ ] Job status endpoint
- [ ] Docker evaluator

**Exit Criteria:** Worker can submit jobs, query status

### Phase 3.2: Beam Search (2 weeks)
- [ ] Beam search orchestration
- [ ] LLM patch generation (roots + refinements)
- [ ] Docker validation pipeline
- [ ] Cost tracking writes
- [ ] Queue management

**Exit Criteria:** Repair jobs produce scored candidates

### Phase 3.3: GitHub Integration (1 week)
- [ ] GitHub API client
- [ ] Branch + commit + PR creation
- [ ] PR status tracking
- [ ] Draft PR workflow

**Exit Criteria:** Candidates convertible to PRs

### Phase 3.4: Dashboard (1 week)
- [ ] 7 new components
- [ ] Cost estimation display
- [ ] Repair history table
- [ ] Real-time progress updates

**Exit Criteria:** Dashboard displays repair workflow end-to-end

**Total: 6 weeks**

---

## Comparison to v2.0

| Aspect | v2.0 | v3.0 |
|--------|------|------|
| **Architecture** | Monolith | Microservice (FastAPI) |
| **Deployment** | Single instance | Railway (independent scaling) |
| **Database** | PostgreSQL (local) | Supabase (cloud) |
| **Cost Tracking** | Basic logging | repair_costs table + aggregation |
| **Dashboard** | Limited UI | 7 new components for full control |
| **PR Creation** | Manual | Automated (draft mode) |
| **Validation** | Docker | Same (Docker sandbox) |

---

## Security Model

### Docker Sandbox Isolation
```
├─ Network: Disabled
├─ Resources: 2 CPU, 4GB RAM, 5min timeout
├─ Filesystem: Read-only source, writable /tmp
└─ User: Non-root
```

### GitHub PR Workflow
```
Candidate → Draft PR → Requires Review → CI passes → User merges
```

### Data Access (RLS)
```
User A sees: own project repairs only
User B sees: own project repairs only
Service: Uses SUPABASE_SERVICE_ROLE_KEY (no row-level filtering)
```

### LLM Prompt Safety
```
Finding input → Sanitize → LLM call → Validate output → Apply patch
```

---

## API Surface

### Repair Service Endpoints

**Create Job**
```
POST /jobs
{
  "run_id": "uuid",
  "finding_id": "logic-001",
  "project_id": "uuid",
  "file_path": "src/app.ts",
  "repair_config": {
    "beam_width": 3,
    "max_depth": 4,
    "timeout_seconds": 120,
    "validation_commands": ["npm run test"]
  }
}
→ 201 Created
{
  "repair_job_id": "uuid",
  "status": "queued"
}
```

**Get Job Status**
```
GET /jobs/{repair_job_id}
→ 200 OK
{
  "status": "in_progress",
  "progress": {
    "depth": 2,
    "candidates_evaluated": 6,
    "best_score": 85.5
  },
  "best_candidate": { ... }
}
```

**List Jobs**
```
GET /jobs?run_id=uuid&status=completed
→ 200 OK
{
  "jobs": [ ... ],
  "total": 42
}
```

**Create PR**
```
POST /jobs/{repair_job_id}/create-pr
{
  "candidate_id": "uuid",
  "branch_name": "repair/logic-001",
  "create_draft": true
}
→ 202 Accepted
{
  "pr_id": "uuid",
  "pr_number": 234,
  "url": "https://github.com/..."
}
```

**Health Check**
```
GET /health
→ 200 OK
{
  "status": "healthy",
  "docker_available": true,
  "supabase_connected": true,
  "github_token_valid": true,
  "queue_size": 12
}
```

---

## Environment Variables

### Repair Service
```env
# Supabase
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_ORG=my-org
GITHUB_REPO=my-repo

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Service Config
REPAIR_SERVICE_PORT=3001
PENNY_SENTRY_DSN=https://... (optional)
```

### Worker (New)
```env
PENNY_REPAIR_SERVICE_URL=https://repair.railway.app
PENNY_REPAIR_ENABLED=true
PENNY_REPAIR_ELIGIBLE_TYPES=bug,logic,data
```

### Dashboard (New)
```env
VITE_REPAIR_SERVICE_URL=https://repair.railway.app
```

---

## Next Steps

1. **Read the Full Design** → `/Users/sarahsahl/penny/.claude/plans/phase-3-repair-service.md`
2. **Review Endpoints** → Section 1 (FastAPI endpoints)
3. **Validate Schema** → Section 2 (Supabase tables)
4. **Approve Timeline** → Section 8 (6-week implementation plan)
5. **Start Phase 3.1** → Begin FastAPI scaffold when ready

---

## Questions to Clarify

1. **GitHub PR Auto-Creation:** Should it be default "draft" or default "private" branch (not PR)?
   - Current: Draft mode (safest)
   
2. **Repair Eligibility:** Should we include "vulnerability" type?
   - Current: bug, logic, data only (conservative)
   
3. **Auto-Repair Threshold:** Should repairs auto-merge if score > 95%?
   - Current: Never (always requires manual merge)
   
4. **Concurrent Repairs:** Max repair jobs in parallel?
   - Current: Unbounded (Railway scales to demand)
   
5. **Repair Timeout:** Should user-configurable timeout have min/max?
   - Current: 30s-300s per job

---

## Success Metrics (Phase 3 Completion)

- ✓ Repair service deployed to production
- ✓ 100+ repairs completed (successful + failed)
- ✓ Avg repair time < 3 minutes
- ✓ Avg repair cost < $1.00
- ✓ PR merge rate > 70% (repairs user accepts)
- ✓ Zero security incidents (Docker escape, prompt injection, etc.)
- ✓ Dashboard tracks all repairs in history
- ✓ Cost estimation matches actual cost ±20%

