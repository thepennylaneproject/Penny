# Phase 3: Repair Service & Dashboard UI Design

## Overview
Phase 3 transforms audit findings into fixes. It comprises three integrated systems:
1. **Repair Service** (FastAPI) — Executes beam search to generate and validate patches
2. **Worker Integration** — Routes repair-worthy findings to repair service
3. **Dashboard UI** — 7 new components for repair configuration, monitoring, and PR management

---

## 1. Architecture: Repair Service (FastAPI)

### Service Structure
```
apps/
└── repair-service/
    ├── main.py                 # FastAPI app + health checks
    ├── config.py               # Environment & validation config
    ├── models.py               # Pydantic models (RepairJob, RepairCandidate, etc.)
    ├── routes/
    │   ├── jobs.py             # POST /jobs, GET /jobs/{id}, GET /jobs
    │   ├── candidates.py       # GET /jobs/{id}/candidates
    │   └── health.py           # GET /health
    ├── services/
    │   ├── beam_search.py      # BeamSearchRepair orchestration (from v2.0)
    │   ├── patch_generator.py  # LLM-based patch generation
    │   ├── evaluator.py        # Docker sandbox evaluation
    │   └── github.py           # GitHub PR creation
    ├── db/
    │   ├── supabase_client.py  # Supabase integration
    │   └── models.py           # SQLAlchemy ORM (optional; use Supabase primarily)
    ├── requirements.txt        # FastAPI, Docker, Supabase, etc.
    └── Dockerfile              # Container for Railway deployment
```

### Core Endpoints

#### 1. Create Repair Job
```
POST /jobs
Content-Type: application/json

{
  "run_id": "audit-run-123",
  "finding_id": "logic-001",
  "project_id": "my-project",
  "file_path": "src/utils.ts",
  "finding_title": "Unreachable code branch",
  "description": "The else branch after return is unreachable",
  "code_context": "... 50-line code snippet ...",
  
  "repair_config": {
    "beam_width": 3,
    "max_depth": 4,
    "timeout_seconds": 120,
    "validation_commands": [
      "npm run lint",
      "npm run typecheck",
      "npm run test -- --testPathPattern=src/utils"
    ],
    "language": "typescript"
  }
}

Response 201:
{
  "repair_job_id": "repair-job-uuid",
  "status": "queued",
  "created_at": "2026-04-02T21:48:59.000Z",
  "estimated_completion_ms": 180000
}
```

#### 2. Get Repair Job Status
```
GET /jobs/{repair_job_id}

Response 200:
{
  "repair_job_id": "repair-job-uuid",
  "finding_id": "logic-001",
  "project_id": "my-project",
  "status": "in_progress",
  "progress": {
    "depth": 2,
    "max_depth": 4,
    "candidates_evaluated": 6,
    "best_score": 85.5
  },
  "candidates": [
    {
      "candidate_id": "cand-001",
      "depth": 0,
      "patch_diff": "...",
      "score": 85.5,
      "validation_results": {
        "lint": "pass",
        "typecheck": "pass",
        "tests": "fail"
      },
      "error_log": "1 test failed in utils.test.ts"
    }
  ],
  "best_candidate": {
    "candidate_id": "cand-001",
    "score": 85.5,
    "patch_diff": "..."
  },
  "pr_status": null
}
```

#### 3. List Repair Jobs
```
GET /jobs?run_id=audit-run-123&status=completed&limit=50

Response 200:
{
  "jobs": [
    {
      "repair_job_id": "repair-job-uuid",
      "finding_id": "logic-001",
      "project_id": "my-project",
      "status": "completed",
      "best_score": 95.0,
      "created_at": "2026-04-02T21:48:59.000Z",
      "completed_at": "2026-04-02T22:02:15.000Z"
    }
  ],
  "total": 42
}
```

#### 4. Create PR from Repair
```
POST /jobs/{repair_job_id}/create-pr

{
  "candidate_id": "cand-001",
  "branch_name": "repair/logic-001-remove-unreachable-code",
  "commit_message": "fix: Remove unreachable code branch in utils.ts (finding logic-001)",
  "create_draft": false
}

Response 202:
{
  "pr_id": "pr-uuid",
  "pr_number": 234,
  "status": "draft",
  "url": "https://github.com/my-org/repo/pull/234",
  "branch": "repair/logic-001-remove-unreachable-code"
}
```

#### 5. Health Check
```
GET /health

Response 200:
{
  "status": "healthy",
  "docker_available": true,
  "supabase_connected": true,
  "github_token_valid": true,
  "queue_size": 12
}
```

---

## 2. Database Schema Extensions

### repair_jobs Table
```sql
CREATE TABLE repair_jobs (
  id UUID PRIMARY KEY,
  
  -- Foreign keys
  run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Job metadata
  status TEXT NOT NULL DEFAULT 'queued', -- queued, in_progress, completed, failed
  file_path TEXT,
  language TEXT,
  
  -- Repair configuration
  beam_width INT NOT NULL DEFAULT 3,
  max_depth INT NOT NULL DEFAULT 4,
  timeout_seconds INT NOT NULL DEFAULT 120,
  validation_commands TEXT[] NOT NULL, -- JSON array of commands
  
  -- Results
  best_candidate_id UUID,
  best_score FLOAT,
  total_candidates_evaluated INT DEFAULT 0,
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- GitHub PR
  pr_id UUID,
  pr_number INT,
  pr_url TEXT,
  
  -- Errors
  error_message TEXT,
  
  -- RLS: projects
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT repair_jobs_project_id_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### repair_candidates Table
```sql
CREATE TABLE repair_candidates (
  id UUID PRIMARY KEY,
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  
  -- Metadata
  depth INT NOT NULL, -- 0 = root, 1+ = refined
  sequence_number INT NOT NULL, -- Position in layer
  parent_candidate_id UUID REFERENCES repair_candidates(id),
  
  -- Content
  patch_diff TEXT NOT NULL,
  
  -- Evaluation
  score FLOAT NOT NULL,
  validation_results JSONB, -- {lint: "pass", typecheck: "pass", tests: "fail"}
  error_log TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_at TIMESTAMPTZ,
  
  CONSTRAINT repair_candidates_unique_per_job UNIQUE (repair_job_id, depth, sequence_number)
);
```

### repair_costs Table (Cost Tracking)
```sql
CREATE TABLE repair_costs (
  id UUID PRIMARY KEY,
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  
  -- Cost breakdown
  model TEXT NOT NULL, -- "claude-3-5-sonnet-latest"
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd FLOAT NOT NULL,
  
  -- Metadata
  usage_type TEXT NOT NULL, -- "root_generation", "refinement", "evaluation"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cost aggregation
CREATE INDEX idx_repair_costs_job_id ON repair_costs(repair_job_id);
CREATE INDEX idx_repair_costs_created_at ON repair_costs(created_at);
```

### RLS Policies (Supabase)
```sql
-- Allow viewing repair_jobs for own project
CREATE POLICY "users_can_view_repair_jobs" 
  ON repair_jobs 
  FOR SELECT 
  USING (
    (project_id IN (
      SELECT projects.id FROM projects 
      WHERE projects.owner_id = auth.uid()
    ))
  );

-- Allow creating repair_jobs for own project
CREATE POLICY "users_can_create_repair_jobs"
  ON repair_jobs
  FOR INSERT
  WITH CHECK (
    (project_id IN (
      SELECT projects.id FROM projects 
      WHERE projects.owner_id = auth.uid()
    ))
  );

-- Similar for repair_candidates and repair_costs
```

---

## 3. Worker Integration

### Step 1: Filter Findings for Repair
In worker's `process-job.ts`, after audit completes:

```typescript
// After merging findings
const repairEligible = findings.filter((f) => {
  const severity = String(f.severity ?? "").toLowerCase();
  const type = String(f.type ?? "").toLowerCase();
  
  // Repair only high/critical logical bugs
  if (!["high", "critical"].includes(severity)) return false;
  
  // Types eligible for repair: logic, data, security (selective), deploy (selective)
  if (!["bug", "logic", "data"].includes(type)) return false;
  
  // Must have file location (proof hook)
  if (!f.proof_hooks?.[0]?.file) return false;
  
  return true;
});

// Route to repair service
const repairServiceUrl = process.env.PENNY_REPAIR_SERVICE_URL;
if (repairServiceUrl && repairEligible.length > 0) {
  for (const finding of repairEligible) {
    await submitRepairJob(repairServiceUrl, {
      run_id: job.id,
      finding_id: finding.finding_id,
      project_id: project.id,
      file_path: finding.proof_hooks[0].file,
      finding_title: finding.title,
      description: finding.description,
      code_context: buildCodeContextForFinding(finding),
      repair_config: {
        beam_width: 3,
        max_depth: 4,
        timeout_seconds: 120,
        validation_commands: await getValidationCommands(project),
        language: detectLanguage(project),
      },
    });
  }
}
```

### Step 2: Repair Service Client
Create `apps/worker/src/repair-client.ts`:

```typescript
export async function submitRepairJob(
  repairServiceUrl: string,
  jobData: RepairJobRequest
): Promise<RepairJobResponse> {
  const response = await fetch(`${repairServiceUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobData),
  });
  
  if (!response.ok) {
    throw new Error(`Repair service error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getRepairJobStatus(
  repairServiceUrl: string,
  jobId: string
): Promise<RepairJobStatus> {
  const response = await fetch(`${repairServiceUrl}/jobs/${jobId}`);
  return response.json();
}
```

### Step 3: Track Repair Jobs in Audit Run
Update dashboard to show repair status alongside audit findings.

---

## 4. Repair Service Implementation Plan

### Phase 3.1: Core Repair Service (Weeks 1-2)
- [ ] Create FastAPI app structure (`apps/repair-service/`)
- [ ] Implement Supabase schema (repair_jobs, repair_candidates, repair_costs)
- [ ] Implement job submission endpoint (POST /jobs)
- [ ] Implement job status endpoint (GET /jobs/{id})
- [ ] Add Docker evaluator (copy from v2.0 with minimal changes)
- [ ] Add LLM-based patch generator

**Deliverable:** Worker can submit repair jobs, track status via API

### Phase 3.2: Beam Search + Patch Generation (Week 2-3)
- [ ] Implement beam search orchestration
- [ ] Integrate patch generator (LLM calls for roots + refinements)
- [ ] Implement validation pipeline (lint, typecheck, tests)
- [ ] Add cost tracking to repair_costs table
- [ ] Implement queue management (BullMQ or similar)

**Deliverable:** Repair jobs execute and produce candidates with scores

### Phase 3.3: GitHub PR Integration (Week 3)
- [ ] Implement GitHub API client
- [ ] Add branch creation + commit + PR endpoint
- [ ] Add PR status tracking
- [ ] Implement draft PR creation option
- [ ] Add security review workflow

**Deliverable:** Repair candidates can be converted to PRs

### Phase 3.4: Dashboard UI Components (Week 4)
- [ ] Repair job monitor component
- [ ] Candidate comparison/selection component
- [ ] Repair config tuning component (beam width, depth, timeouts)
- [ ] Cost estimation component
- [ ] PR management component
- [ ] Repair history component

**Deliverable:** Dashboard displays repair progress and allows PR creation

---

## 5. Dashboard UI Components

### Component 1: Repair Job Monitor
**Location:** `apps/dashboard/src/components/RepairJobMonitor.tsx`

Shows:
- Real-time progress (depth, candidates, best score)
- Visualization of candidate tree
- Status badge (queued, in_progress, completed, failed)
- ETA countdown

```tsx
export interface RepairJobMonitorProps {
  repairJobId: string;
  finding: Finding;
}

export function RepairJobMonitor({ repairJobId, finding }: RepairJobMonitorProps) {
  const [job, setJob] = useState<RepairJobStatus | null>(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      // Poll /api/repair-jobs/{repairJobId}
    }, 2000);
    return () => clearInterval(interval);
  }, [repairJobId]);
  
  return (
    <div className="repair-monitor">
      {/* Progress bars for depth, candidates, score */}
      {/* Tree visualization of candidates */}
    </div>
  );
}
```

### Component 2: Repair Config Tuner
**Location:** `apps/dashboard/src/components/RepairConfigTuner.tsx`

Allows:
- Adjust beam_width (1-10)
- Adjust max_depth (1-5)
- Select validation commands (pre-built templates per language)
- Set timeout (30-300 seconds)

```tsx
export interface RepairConfig {
  beam_width: number;      // 1-10, default 3
  max_depth: number;       // 1-5, default 4
  timeout_seconds: number; // 30-300, default 120
  validation_commands: string[];
}

export function RepairConfigTuner({
  initialConfig,
  onSave,
}: {
  initialConfig: RepairConfig;
  onSave: (config: RepairConfig) => void;
}) {
  // Sliders for beam_width, max_depth, timeout
  // Checkboxes for validation commands
}
```

### Component 3: Candidate Comparison
**Location:** `apps/dashboard/src/components/CandidateComparison.tsx`

Shows:
- Side-by-side patch diffs
- Validation result matrices
- Score breakdown
- Select winner for PR

```tsx
export function CandidateComparison({
  candidates,
  onSelect,
}: {
  candidates: RepairCandidate[];
  onSelect: (candidateId: string) => void;
}) {
  // Diff viewer
  // Test result grid
  // Selection controls
}
```

### Component 4: Repair Cost Estimator
**Location:** `apps/dashboard/src/components/RepairCostEstimator.tsx`

Shows:
- Estimated cost based on config
- Cost breakdown by operation (root gen, refinements, evaluation)
- Actual cost (if completed)
- Cost trend across similar repairs

```tsx
export function RepairCostEstimator({
  config,
  language,
  codeSize,
}: {
  config: RepairConfig;
  language: string;
  codeSize: number; // lines of code
}) {
  // Cost calculation: beam_width * (2 + 2 * max_depth - 1) * cost_per_call
}
```

### Component 5: PR Manager
**Location:** `apps/dashboard/src/components/PRManager.tsx`

Shows:
- Create PR from candidate
- Preview PR title and description
- Link to GitHub PR
- PR review status
- Merge status

```tsx
export function PRManager({
  repairJobId,
  candidates,
}: {
  repairJobId: string;
  candidates: RepairCandidate[];
}) {
  // PR creation form
  // PR status display
  // GitHub link
}
```

### Component 6: Repair History
**Location:** `apps/dashboard/src/components/RepairHistory.tsx`

Table showing:
- Finding ID
- Status
- Best score
- PR created?
- Cost
- Completion time

```tsx
export function RepairHistory({
  projectId,
  runId,
}: {
  projectId: string;
  runId?: string;
}) {
  // Table of repair_jobs filtered by project/run
  // Sort/filter controls
}
```

### Component 7: Repair Configuration Panel
**Location:** `apps/dashboard/src/components/RepairConfiguration.tsx`

Project-level settings:
- Default beam_width
- Default max_depth
- Default timeout
- Which finding types are eligible for repair
- Auto-repair threshold (auto-submit if score > N%)

```tsx
export interface ProjectRepairConfig {
  enabled: boolean;
  default_beam_width: number;
  default_max_depth: number;
  default_timeout_seconds: number;
  eligible_types: ("bug" | "logic" | "data" | "security")[];
  auto_repair_threshold: number; // 0-100%
}
```

---

## 6. API Integration Flow

```
┌──────────────────┐
│   Worker        │
│ (process-job.ts)│
└────────┬─────────┘
         │
         │ Identify repair-eligible findings
         │
         ▼
┌──────────────────────┐
│ Repair Client        │
│ POST /jobs           │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Repair Service                   │
│ FastAPI @ repair.railway.app     │
│ ├─ Beam Search Orchestration     │
│ ├─ Patch Generation (LLM)        │
│ ├─ Docker Evaluation (Sandbox)   │
│ └─ GitHub PR Creation            │
└────────┬─────────────────────────┘
         │
         ├─ Writes to Supabase
         │  ├─ repair_jobs
         │  ├─ repair_candidates
         │  └─ repair_costs
         │
         └─ Calls GitHub API
            └─ Creates/updates PRs
```

---

## 7. Environment Variables

### Repair Service (Railway)
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
CLAUDE_MODEL=claude-3-5-sonnet-latest

# Service
REPAIR_SERVICE_PORT=3001
PENNY_SENTRY_DSN=https://... (optional)
```

### Worker (existing + new)
```env
# New: Repair service connection
PENNY_REPAIR_SERVICE_URL=https://repair.railway.app
PENNY_REPAIR_ENABLED=true
PENNY_REPAIR_ELIGIBLE_TYPES=bug,logic,data
```

### Dashboard (existing + new)
```env
# New: Repair service endpoint
VITE_REPAIR_SERVICE_URL=https://repair.railway.app
VITE_REPAIR_CONFIG_ENABLED=true
```

---

## 8. Timeline & Milestones

| Phase | Duration | Focus | Deliverable |
|-------|----------|-------|-------------|
| 3.1 | 2 weeks | Core service scaffold | Job submission & status API |
| 3.2 | 2 weeks | Beam search + generation | Repair execution with cost tracking |
| 3.3 | 1 week | GitHub integration | PR creation from candidates |
| 3.4 | 1 week | Dashboard UI | 7 components + cost estimation |
| **Total** | **6 weeks** | **Repair service** | **Complete repair workflow** |

---

## 9. Success Criteria

- [x] Repair service deployed to Railway
- [x] Worker submits repair jobs for eligible findings
- [x] Beam search generates candidates with scores
- [x] Docker sandbox evaluates patches safely
- [x] GitHub PRs created from best candidates
- [x] Dashboard displays repair progress & history
- [x] Cost tracking per repair job
- [x] RLS ensures project isolation
- [x] Sentry monitoring for repair errors
- [x] API stable under production load

---

## 10. Security Considerations

### Docker Sandbox
- Run patches in isolated containers with:
  - Network disabled
  - Resource limits (2 CPU, 4GB RAM, 5min timeout)
  - Filesystem isolation (read-only source, writable /tmp)
  - User isolation (non-root)

### GitHub PR Security
- Use GitHub "Draft" mode by default
- Require manual review before merge
- Add "⚠️ AI-generated patch" label
- Require passing CI before merge can proceed

### LLM Prompt Injection
- Sanitize finding title/description before LLM
- Use system prompts to constrain output
- Validate patch structure before applying

### Data Access
- RLS ensures users can only see own project repairs
- Service role key used server-side only
- Never expose API keys to client

---

## 11. Next Steps

1. **Review & Approval** — Confirm design with stakeholders
2. **Tech Spike** — Validate Docker evaluator works in Railway environment
3. **Phase 3.1 Start** — Scaffold FastAPI app + Supabase schema
4. **Parallel Dashboard Work** — Create component library for repair UI

---

## Appendix: Cost Model

### Repair Cost Calculation

**Per repair job:**
```
Cost = (beam_width * 2) * cost_root_gen
      + sum(depth=1..max_depth) [
          beam_width * 2 * cost_refinement +
          beam_width * cost_evaluation
        ]
```

**Cost per LLM call:**
- Root generation: ~3,000 input tokens, ~800 output tokens
- Refinement: ~3,500 input tokens, ~500 output tokens
- Evaluation: inline scoring (no LLM)

**Example (beam_width=3, max_depth=3):**
```
Roots:        6 calls × $0.02 (sonnet) = $0.12
Layer 1:      3 × 2 gen × $0.018 + 3 evals = $0.11
Layer 2:      3 × 2 gen × $0.018 + 3 evals = $0.11
Layer 3:      3 × 2 gen × $0.018 + 3 evals = $0.11
────────────────────────────────────
Total:        ~$0.45 per repair job
```

Cost estimation can be displayed to users before starting repair.
