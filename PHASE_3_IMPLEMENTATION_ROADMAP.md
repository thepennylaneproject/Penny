# Phase 3: Implementation Roadmap

## Overview
This roadmap breaks Phase 3 into 4 sub-phases across 6 weeks with concrete deliverables and exit criteria.

---

## Phase 3.0: Foundation & Planning (Pre-work)

### Tasks
- [x] Review v2.0 repair engine architecture
- [x] Design FastAPI service structure
- [x] Design Supabase schema
- [x] Design 7 dashboard components
- [x] Define API contracts
- [x] Create environment variable docs

### Deliverables
- `phase-3-repair-service.md` (full design)
- `PHASE_3_DESIGN_SUMMARY.md` (executive summary)
- This roadmap

### Exit Criteria
- All stakeholders approve design
- Tech spike validates Docker in Railway environment
- GitHub API integration path confirmed

---

## Phase 3.1: Core Service Foundation (Weeks 1-2)

### Goal
Scaffold FastAPI service and establish repair job lifecycle infrastructure.

### Tasks

#### 3.1.1: Project Setup
```bash
# Create service directory
mkdir -p apps/repair-service/{routes,services,db}

# Create Python files
touch apps/repair-service/{main.py,config.py,models.py,requirements.txt}
```

**Dependencies:**
- FastAPI 0.104+
- Uvicorn
- Pydantic v2
- supabase-py
- PyGithub (for PR creation)
- docker (Python SDK)

**Exit:** Service starts on `uvicorn main:app --reload`

#### 3.1.2: Pydantic Models
File: `apps/repair-service/models.py`

```python
# Request/Response models
class RepairJobRequest(BaseModel):
    run_id: UUID
    finding_id: str
    project_id: UUID
    file_path: str
    finding_title: str
    description: str
    code_context: str
    repair_config: dict

class RepairJobResponse(BaseModel):
    repair_job_id: UUID
    status: str
    created_at: datetime
    estimated_completion_ms: int

# Status enums
class RepairStatus(str, Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
```

**Exit:** Type-safe request/response validation

#### 3.1.3: Supabase Schema
File: `supabase/migrations/004_repair_service.sql`

```sql
-- repair_jobs table
CREATE TABLE repair_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES audit_runs(id),
  finding_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  status TEXT DEFAULT 'queued',
  file_path TEXT,
  language TEXT,
  beam_width INT DEFAULT 3,
  max_depth INT DEFAULT 4,
  timeout_seconds INT DEFAULT 120,
  validation_commands TEXT[],
  best_candidate_id UUID,
  best_score FLOAT,
  total_candidates_evaluated INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  pr_id UUID,
  pr_number INT,
  pr_url TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- repair_candidates table
CREATE TABLE repair_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id),
  depth INT NOT NULL,
  sequence_number INT NOT NULL,
  parent_candidate_id UUID REFERENCES repair_candidates(id),
  patch_diff TEXT NOT NULL,
  score FLOAT NOT NULL,
  validation_results JSONB,
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  evaluated_at TIMESTAMPTZ
);

-- repair_costs table
CREATE TABLE repair_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id),
  model TEXT NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd FLOAT NOT NULL,
  usage_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_repair_jobs_project ON repair_jobs(project_id);
CREATE INDEX idx_repair_jobs_run ON repair_jobs(run_id);
CREATE INDEX idx_repair_jobs_status ON repair_jobs(status);
CREATE INDEX idx_repair_candidates_job ON repair_candidates(repair_job_id);
CREATE INDEX idx_repair_costs_job ON repair_costs(repair_job_id);

-- RLS
CREATE POLICY "users_can_view_repair_jobs"
  ON repair_jobs FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

ALTER TABLE repair_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_costs ENABLE ROW LEVEL SECURITY;
```

**Exit:** `supabase db push` succeeds, schema in prod

#### 3.1.4: FastAPI App Skeleton
File: `apps/repair-service/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Penny Repair Service")

# CORS for worker + dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
)

# Routes
@app.post("/jobs")
async def create_repair_job(request: RepairJobRequest) -> RepairJobResponse:
    """Submit a repair job."""
    pass

@app.get("/jobs/{repair_job_id}")
async def get_repair_job(repair_job_id: UUID) -> RepairJobStatus:
    """Get repair job status and candidates."""
    pass

@app.get("/jobs")
async def list_repair_jobs(run_id: Optional[UUID], status: Optional[str]) -> dict:
    """List repair jobs."""
    pass

@app.get("/health")
async def health() -> dict:
    """Health check."""
    return {"status": "healthy"}
```

**Exit:** All endpoints return 200, even if not implemented

#### 3.1.5: Supabase Client
File: `apps/repair-service/db/supabase_client.py`

```python
from supabase import create_client, Client

def get_supabase_client() -> Client:
    """Initialize Supabase client."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)

async def create_repair_job(
    client: Client,
    run_id: UUID,
    finding_id: str,
    **kwargs
) -> UUID:
    """Create repair_jobs row."""
    result = client.table("repair_jobs").insert({
        "run_id": str(run_id),
        "finding_id": finding_id,
        ...
    }).execute()
    return UUID(result.data[0]["id"])

async def get_repair_job(client: Client, job_id: UUID) -> dict:
    """Fetch repair job with candidates."""
    pass

async def update_repair_job(client: Client, job_id: UUID, **updates) -> None:
    """Update repair job status."""
    pass
```

**Exit:** CRUD operations work, data persisted to Supabase

#### 3.1.6: Job Submission Endpoint
File: `apps/repair-service/routes/jobs.py`

```python
@app.post("/jobs", response_model=RepairJobResponse)
async def create_repair_job(request: RepairJobRequest):
    client = get_supabase_client()
    
    job_id = await create_repair_job(
        client=client,
        run_id=request.run_id,
        finding_id=request.finding_id,
        project_id=request.project_id,
        file_path=request.file_path,
        beam_width=request.repair_config.beam_width,
        max_depth=request.repair_config.max_depth,
        timeout_seconds=request.repair_config.timeout_seconds,
        validation_commands=request.repair_config.validation_commands,
    )
    
    # Queue for processing (placeholder for now)
    # TODO: Add to BullMQ / Celery queue
    
    return RepairJobResponse(
        repair_job_id=job_id,
        status="queued",
        created_at=datetime.now(),
        estimated_completion_ms=180000,
    )
```

**Exit:** POST /jobs creates Supabase rows, returns 201

#### 3.1.7: Dockerfile & Railway Config
File: `apps/repair-service/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3001"]
```

File: `apps/repair-service/railway.toml`

```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
```

**Exit:** Service deploys to Railway, listens on port 3001

### Testing Checklist
- [ ] `curl -X POST http://localhost:3001/jobs` → creates row in Supabase
- [ ] `curl http://localhost:3001/health` → 200 OK
- [ ] Service handles CORS requests from dashboard
- [ ] Supabase RLS prevents unauthorized access

### Exit Criteria
- FastAPI app running on Railway
- POST /jobs endpoint creates repair_jobs in Supabase
- GET /jobs/{id} returns job with candidates (initially empty)
- Worker can submit repair jobs and receive job_id
- All Pydantic models validated
- Supabase schema applied to production

### Effort Estimate
- 3-4 days with Python/FastAPI experience
- 5-6 days without

---

## Phase 3.2: Beam Search + Evaluation (Weeks 2-3)

### Goal
Implement core repair logic: generate patches, evaluate in Docker, refine iteratively.

### Tasks

#### 3.2.1: Docker Evaluator
Port from v2.0's `repair_engine/evaluator/docker_runner.py`

**Functionality:**
- Accept patch_diff, project_path, validation_commands
- Apply patch to temporary directory
- Run validation commands in Docker container
- Return score (0-100%) and results

**Exit:** Can evaluate any patch safely in 30-120 seconds

#### 3.2.2: Patch Generator (LLM)
File: `apps/repair-service/services/patch_generator.py`

```python
class PatchGenerator:
    def __init__(self):
        self.client = Anthropic()
        self.model = "claude-3-5-sonnet-latest"
    
    def generate_roots(
        self,
        finding: dict,
        code_context: str,
        count: int = 6
    ) -> List[str]:
        """Generate initial patch candidates."""
        prompt = f"""
        Finding: {finding['title']}
        Description: {finding['description']}
        
        File: {finding['file_path']}
        Code:
        {code_context}
        
        Generate {count} distinct patch diffs to fix this issue.
        Return ONLY valid unified diffs, one per line separated by ===.
        """
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        return parse_patches(response.content[0].text)
    
    def generate_refinements(
        self,
        finding: dict,
        parent_patch: str,
        validation_results: dict,
        code_context: str,
        count: int = 2
    ) -> List[str]:
        """Refine patches based on validation feedback."""
        errors = "\n".join([
            f"{k}: {v}" for k, v in validation_results.items() if v != "pass"
        ])
        
        prompt = f"""
        Previous attempt scored {validation_results.get('score', 0)}%.
        
        Errors:
        {errors}
        
        Previous patch:
        {parent_patch}
        
        Generate {count} refined patches that address these errors.
        """
        # Similar implementation
```

**Exit:** LLM generates valid patch diffs consistently

#### 3.2.3: Beam Search Orchestration
File: `apps/repair-service/services/beam_search.py`

```python
class BeamSearchRepair:
    def __init__(self, config: RepairConfig):
        self.config = config
        self.generator = PatchGenerator()
        self.evaluator = DockerEvaluator()
        self.client = get_supabase_client()
    
    async def execute(self, repair_job_id: UUID, project_path: str):
        """Execute beam search."""
        job = await self.client.table("repair_jobs").select("*").eq("id", str(repair_job_id)).single().execute()
        
        # Layer 0: Generate roots
        roots = self.generator.generate_roots(
            finding={"title": job["finding_id"]},
            code_context=job["code_context"],
            count=self.config.beam_width * 2
        )
        
        candidates = [
            RepairNode(patch=patch, depth=0)
            for patch in roots
        ]
        
        best_node = None
        
        for depth in range(self.config.max_depth):
            # Evaluate all candidates
            for node in candidates:
                result = self.evaluator.evaluate_patch(
                    project_path=project_path,
                    patch_diff=node.patch,
                    commands=job["validation_commands"]
                )
                node.score = result["score"]
                node.results = result["results"]
                
                # Save to DB
                await self.save_candidate(repair_job_id, node)
            
            # Prune to top K
            candidates.sort(key=lambda x: x.score, reverse=True)
            best_node = candidates[0]
            
            if best_node.score >= 95:
                break  # Good enough
            
            # Refine for next layer
            if depth < self.config.max_depth - 1:
                next_layer = []
                for parent in candidates[:self.config.beam_width]:
                    refinements = self.generator.generate_refinements(
                        finding={},
                        parent_patch=parent.patch,
                        validation_results=parent.results,
                        count=2
                    )
                    next_layer.extend([
                        RepairNode(patch=p, depth=depth+1, parent_id=parent.id)
                        for p in refinements
                    ])
                candidates = next_layer
        
        # Update job with best
        await self.client.table("repair_jobs").update({
            "best_candidate_id": best_node.id,
            "best_score": best_node.score,
            "status": "completed",
            "completed_at": datetime.now()
        }).eq("id", str(repair_job_id)).execute()
```

**Exit:** Beam search completes with best candidate, all candidates saved to DB

#### 3.2.4: Cost Tracking
File: `apps/repair-service/services/cost_tracking.py`

```python
async def log_repair_cost(
    client: Client,
    repair_job_id: UUID,
    model: str,
    input_tokens: int,
    output_tokens: int,
    usage_type: str  # "root_generation" | "refinement" | "evaluation"
):
    """Log LLM cost to repair_costs."""
    cost_usd = calculate_cost(model, input_tokens, output_tokens)
    
    await client.table("repair_costs").insert({
        "repair_job_id": str(repair_job_id),
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd,
        "usage_type": usage_type,
    }).execute()

# Integrate into patch_generator and beam_search
# Call log_repair_cost after each LLM call
```

**Exit:** repair_costs table populated during repair execution

#### 3.2.5: Queue Management
Use BullMQ (same as worker) for async repair jobs

```python
from bull_queue import Queue

repair_queue = Queue("penny-repairs", connection=redis_connection)

@app.post("/jobs")
async def create_repair_job(request: RepairJobRequest):
    job_id = await create_repair_job_db(...)
    
    # Queue for processing
    await repair_queue.add({
        "repair_job_id": str(job_id),
        "project_path": request.project_path,
    })
    
    return RepairJobResponse(repair_job_id=job_id, status="queued")

# Worker
@repair_queue.process()
async def process_repair_job(job):
    repair_job_id = UUID(job.data["repair_job_id"])
    project_path = job.data["project_path"]
    
    search = BeamSearchRepair(config)
    await search.execute(repair_job_id, project_path)
```

**Exit:** Repair jobs queue, execute async, update DB

### Testing Checklist
- [ ] Docker evaluator scores patches 0-100%
- [ ] Patch generator produces valid diffs
- [ ] Beam search converges on best candidate
- [ ] Cost tracking records all LLM calls
- [ ] Queue processes jobs in order
- [ ] Candidates visible in GET /jobs/{id}

### Exit Criteria
- Repair jobs execute end-to-end in Docker sandbox
- Beam search converges in < 3 minutes average
- Cost tracking is accurate within 5%
- Dashboard can display repair progress
- All repair_candidates rows saved with scores

### Effort Estimate
- 4-5 days (bulk of Phase 3)

---

## Phase 3.3: GitHub Integration (Week 3)

### Goal
Convert best repair candidates to GitHub PRs.

### Tasks

#### 3.3.1: GitHub API Client
File: `apps/repair-service/services/github_client.py`

```python
from github import Github

class GitHubClient:
    def __init__(self):
        self.gh = Github(os.getenv("GITHUB_TOKEN"))
        self.org = os.getenv("GITHUB_ORG")
        self.repo_name = os.getenv("GITHUB_REPO")
    
    @property
    def repo(self):
        return self.gh.get_user(self.org).get_repo(self.repo_name)
    
    async def create_branch(self, branch_name: str, base_branch: str = "main"):
        """Create feature branch."""
        base = self.repo.get_branch(base_branch)
        self.repo.create_git_ref(f"refs/heads/{branch_name}", base.commit.sha)
    
    async def commit_patch(
        self,
        branch_name: str,
        file_path: str,
        patch_diff: str,
        message: str
    ):
        """Apply patch and commit."""
        file_content = self.repo.get_contents(file_path, ref=branch_name)
        new_content = apply_patch(file_content.decoded_content, patch_diff)
        self.repo.update_file(
            path=file_path,
            message=message,
            content=new_content,
            sha=file_content.sha,
            branch=branch_name
        )
    
    async def create_pr(
        self,
        branch_name: str,
        title: str,
        body: str,
        draft: bool = True,
        labels: List[str] = None
    ) -> dict:
        """Create pull request."""
        pr = self.repo.create_pull(
            title=title,
            body=body,
            head=branch_name,
            base="main",
            draft=draft
        )
        
        if labels:
            pr.add_to_labels(*labels)
        
        return {
            "pr_id": pr.id,
            "pr_number": pr.number,
            "url": pr.html_url,
            "branch": branch_name
        }
```

**Exit:** Can create draft PRs from code

#### 3.3.2: PR Creation Endpoint
File: `apps/repair-service/routes/pr.py`

```python
@app.post("/jobs/{repair_job_id}/create-pr")
async def create_pr_from_repair(
    repair_job_id: UUID,
    candidate_id: UUID,
    branch_name: str,
    create_draft: bool = True
):
    """Create GitHub PR from repair candidate."""
    
    client = get_supabase_client()
    job = await get_repair_job(client, repair_job_id)
    candidate = await get_candidate(client, candidate_id)
    
    gh = GitHubClient()
    
    # Create branch
    await gh.create_branch(branch_name)
    
    # Commit patch
    await gh.commit_patch(
        branch_name=branch_name,
        file_path=job["file_path"],
        patch_diff=candidate["patch_diff"],
        message=f"fix: {job['finding_title']} (finding {job['finding_id']})"
    )
    
    # Create PR
    pr_result = await gh.create_pr(
        branch_name=branch_name,
        title=f"Fix: {job['finding_title']}",
        body=f"""
        AI-generated repair for finding **{job['finding_id']}**
        
        **Score:** {candidate['score']}%
        
        From audit run: {job['run_id']}
        Finding: {job['description']}
        
        **Validation Results:**
        {json.dumps(candidate['validation_results'], indent=2)}
        
        ---
        Generated by Penny AI · Review before merging
        """,
        draft=create_draft,
        labels=["ai-generated-patch", "penny-repair"]
    )
    
    # Update DB
    await client.table("repair_jobs").update({
        "pr_id": pr_result["pr_id"],
        "pr_number": pr_result["pr_number"],
        "pr_url": pr_result["url"]
    }).eq("id", str(repair_job_id)).execute()
    
    return pr_result
```

**Exit:** POST /jobs/{id}/create-pr creates GitHub PR

#### 3.3.3: PR Status Tracking
```python
@app.get("/jobs/{repair_job_id}/pr-status")
async def get_pr_status(repair_job_id: UUID):
    """Get PR review/merge status."""
    client = get_supabase_client()
    job = await get_repair_job(client, repair_job_id)
    
    if not job["pr_number"]:
        return {"status": "no_pr"}
    
    gh = GitHubClient()
    pr = gh.repo.get_pull(job["pr_number"])
    
    return {
        "pr_number": pr.number,
        "status": pr.state,  # open, closed, merged
        "draft": pr.draft,
        "url": pr.html_url,
        "reviews": len(pr.get_reviews()),
        "merge_status": pr.mergeable_state
    }
```

**Exit:** Can track PR status in dashboard

### Testing Checklist
- [ ] create_branch works
- [ ] commit_patch applies diffs correctly
- [ ] create_pr makes draft PR on GitHub
- [ ] PR has description with finding details
- [ ] PR has correct labels
- [ ] PR status endpoint returns current state

### Exit Criteria
- POST /create-pr generates GitHub PR with candidate patch
- PR is created as draft (requires manual merge)
- PR description includes finding details and validation results
- PR has "ai-generated-patch" + "penny-repair" labels
- Repair job updated with pr_id, pr_number, pr_url

### Effort Estimate
- 2-3 days

---

## Phase 3.4: Dashboard UI Components (Week 4)

### Goal
Create 7 components for repair control, monitoring, and cost tracking.

### Tasks (Parallel)

#### 3.4.1: Repair Job Monitor
**File:** `apps/dashboard/src/components/repair/RepairJobMonitor.tsx`

**Features:**
- Real-time progress (depth, candidates, best score)
- Candidate tree visualization
- Status badge
- ETA countdown

```tsx
export function RepairJobMonitor({ repairJobId }: Props) {
  const [job, setJob] = useState<RepairJobStatus | null>(null);
  
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/repair-jobs/${repairJobId}`);
      setJob(await res.json());
    }, 2000);
    return () => clearInterval(interval);
  }, [repairJobId]);
  
  return (
    <div className="repair-monitor">
      <ProgressBar value={job?.progress.depth} max={job?.max_depth} />
      {/* Candidate tree */}
      {/* Score gauge */}
    </div>
  );
}
```

#### 3.4.2: Repair Config Tuner
**File:** `apps/dashboard/src/components/repair/RepairConfigTuner.tsx`

**Features:**
- Sliders: beam_width (1-10), max_depth (1-5), timeout (30-300s)
- Checkboxes: validation commands
- Cost estimation

#### 3.4.3: Candidate Comparison
**File:** `apps/dashboard/src/components/repair/CandidateComparison.tsx`

**Features:**
- Side-by-side diffs
- Validation result matrix
- Score breakdown
- Select for PR creation

#### 3.4.4: Repair Cost Estimator
**File:** `apps/dashboard/src/components/repair/RepairCostEstimator.tsx`

**Formula:**
```
Cost = (beam_width * 2) * cost_root_gen
      + sum(depth=1..max_depth) [beam_width * 2 * cost_refinement]
```

**Display:**
- Estimated cost
- Cost breakdown by layer
- Actual cost (post-repair)

#### 3.4.5: PR Manager
**File:** `apps/dashboard/src/components/repair/PRManager.tsx`

**Features:**
- Create PR form
- PR preview (title, description)
- GitHub link
- PR status (draft, open, merged)
- Merge button (if approved)

#### 3.4.6: Repair History
**File:** `apps/dashboard/src/components/repair/RepairHistory.tsx`

**Features:**
- Table of repair_jobs
- Columns: finding, status, score, PR created, cost, time
- Filtering: by project, run, status
- Sorting: by cost, score, time

#### 3.4.7: Project Repair Configuration
**File:** `apps/dashboard/src/components/settings/ProjectRepairConfig.tsx`

**Settings:**
- Enable/disable repairs
- Default beam_width, max_depth, timeout
- Eligible finding types
- Auto-repair threshold

```tsx
export interface ProjectRepairConfig {
  enabled: boolean;
  default_beam_width: number;      // 1-10
  default_max_depth: number;       // 1-5
  default_timeout_seconds: number; // 30-300
  eligible_types: string[];        // "bug" | "logic" | "data" | "security"
  auto_repair_threshold: number;   // 0-100%
}
```

### Testing Checklist
- [ ] RepairJobMonitor updates every 2 seconds
- [ ] RepairConfigTuner validates input ranges
- [ ] CandidateComparison renders diffs correctly
- [ ] RepairCostEstimator matches backend calculation
- [ ] PRManager creates PRs on GitHub
- [ ] RepairHistory filters/sorts correctly
- [ ] ProjectRepairConfig saves to Supabase

### Exit Criteria
- All 7 components render without errors
- Real-time updates from repair service
- Cost estimation matches actual cost ±20%
- PR creation flows end-to-end
- Responsive design (mobile, tablet, desktop)

### Effort Estimate
- 3-4 days (React experience)

---

## Integration Testing (Day 5 of Week 4)

### End-to-End Flows

#### Flow 1: Submit Repair → Complete → Create PR
1. Dashboard: User clicks "Repair" on finding
2. RepairConfigTuner: User adjusts beam_width=5, max_depth=3
3. API: POST /jobs → repair service queues
4. Repair Service: Executes beam search (3-5 min)
5. Dashboard: RepairJobMonitor shows progress in real-time
6. Dashboard: When complete, display best candidate
7. Dashboard: User clicks "Create PR"
8. API: POST /create-pr → GitHub PR created
9. GitHub: Draft PR appears in repo
10. Dashboard: PR link shown, status synced

**Test:** Complete this flow, verify PR merged successfully

#### Flow 2: Cost Estimation Accuracy
1. Use RepairCostEstimator with known config
2. Start repair job
3. Compare estimated vs actual cost
4. Should be within ±20%

**Test:** 10 repairs, all within ±20%

#### Flow 3: Concurrent Repairs
1. Submit 5 repair jobs simultaneously
2. All should queue and execute
3. Dashboard should show all in history

**Test:** 5 concurrent repairs complete, no race conditions

---

## Deployment Checklist

### Pre-Deploy
- [ ] All tests passing locally
- [ ] Code reviewed
- [ ] Database migrations tested on staging
- [ ] Environment variables documented
- [ ] GitHub token valid and scoped correctly
- [ ] Docker sandbox tested on Railway

### Deploy Repair Service
```bash
cd apps/repair-service
git add .
git commit -m "feat: Phase 3 - Repair service (FastAPI)"
git push origin main

# Railway detects, builds Dockerfile, deploys
# Verify: https://repair.railway.app/health → 200
```

### Deploy Worker Update
```bash
cd apps/worker
# Add repair-client.ts integration
npm run build
git commit -m "feat: Worker submits repair jobs"
git push

# Railway redeploys worker
```

### Deploy Dashboard Update
```bash
cd apps/dashboard
# Add 7 new components
npm run build
git commit -m "feat: Dashboard repair UI (7 components)"
git push

# Netlify detects, builds, deploys
```

### Post-Deploy Validation
1. Health check: GET /health → 200
2. Create repair job: POST /jobs → 201
3. Monitor: GET /jobs/{id} → 200 with progress
4. Create PR: POST /create-pr → 202
5. Dashboard: View repair history, monitor progress

---

## Success Metrics

| Metric | Target | Method |
|--------|--------|--------|
| Repair Execution Time | < 3 min avg | Measure completed_at - started_at |
| Cost per Repair | < $0.50 avg | Sum repair_costs.cost_usd per job |
| Cost Estimation Accuracy | ±20% | Compare estimated vs actual |
| PR Merge Rate | > 70% | Track merged PRs in GitHub |
| Uptime | 99.5% | Monitor service health endpoint |
| Concurrent Repairs | 10+ | Load test with 10 simultaneous jobs |
| Security (Docker) | 0 escapes | Sandbox containers with resource limits |

---

## Timeline Summary

| Week | Phase | Focus | Deliverable |
|------|-------|-------|-------------|
| 1-2 | 3.1 | Core service | FastAPI on Railway, Supabase schema |
| 2-3 | 3.2 | Beam search | Patch generation, Docker evaluation, cost tracking |
| 3 | 3.3 | GitHub | Draft PR creation, status tracking |
| 4 | 3.4 | Dashboard | 7 components, real-time monitoring |
| 4 | Test | Integration | End-to-end flows, cost validation |
| — | Deploy | Production | All services live, monitoring active |

**Total: 6 weeks**

---

## Approval Checklist

Before starting Phase 3, confirm:

- [ ] Design document reviewed and approved
- [ ] Tech spike validates Docker in Railway
- [ ] GitHub token obtained and scoped correctly
- [ ] Team availability for 6-week commitment
- [ ] Success metrics defined and tracked
- [ ] Monitoring/alerting plan established (Sentry, Datadog, etc.)

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Docker escape | Low | Critical | Strict resource limits, non-root user |
| LLM prompt injection | Low | High | Input sanitization, system prompt constraints |
| GitHub API rate limits | Medium | Medium | Implement queue, backoff strategy |
| Repair cost overruns | Medium | Medium | Hard timeout, cost estimation warnings |
| Concurrent repair conflicts | Low | Medium | File-level locking, transaction support |
| DB schema migration issues | Low | High | Staging environment testing, rollback plan |

---

## Next Steps

1. **Share this roadmap** with team
2. **Schedule approval meeting** to confirm design
3. **Create tech spike** for Docker in Railway validation
4. **Begin Phase 3.1** when approved

---

**Ready to begin Phase 3? Confirm and I'll start Phase 3.1 implementation.**
