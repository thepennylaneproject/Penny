-- Phase 3: Repair Service Tables
-- Enables autonomous patch generation, evaluation, and GitHub PR creation

-- repair_jobs: Main table for repair job lifecycle
CREATE TABLE repair_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Job metadata
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'blocked')),
  file_path TEXT,
  language TEXT DEFAULT 'typescript',
  finding_type TEXT DEFAULT 'bug',
  finding_severity TEXT DEFAULT 'high',

  -- Repair configuration (from governance locked values)
  beam_width INT NOT NULL DEFAULT 4 CHECK (beam_width >= 1 AND beam_width <= 10),
  max_depth INT NOT NULL DEFAULT 4 CHECK (max_depth >= 1 AND max_depth <= 5),
  timeout_seconds INT NOT NULL DEFAULT 180 CHECK (timeout_seconds >= 30 AND timeout_seconds <= 900),
  validation_commands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Results
  best_candidate_id UUID,
  best_score FLOAT CHECK (best_score >= 0 AND best_score <= 100),
  total_candidates_evaluated INT DEFAULT 0,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 100),
  confidence_breakdown JSONB, -- {validation, locality, risk, uncertainty_penalty}
  action TEXT, -- fast_lane_ready_pr, ready_pr, draft_pr, candidate_only, do_not_repair

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

-- repair_candidates: Candidate patches with scores
CREATE TABLE repair_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,

  -- Metadata
  depth INT NOT NULL CHECK (depth >= 0),
  sequence_number INT NOT NULL,
  parent_candidate_id UUID REFERENCES repair_candidates(id),

  -- Content
  patch_diff TEXT NOT NULL,

  -- Evaluation
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 100),
  validation_results JSONB, -- {lint: pass/fail, typecheck: pass/fail, tests: pass/fail, coverage: +/-}
  error_log TEXT,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_at TIMESTAMPTZ,

  CONSTRAINT repair_candidates_unique_per_job UNIQUE (repair_job_id, depth, sequence_number)
);

-- repair_costs: Cost tracking per LLM call
CREATE TABLE repair_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,

  -- Cost breakdown
  model TEXT NOT NULL,
  input_tokens INT NOT NULL CHECK (input_tokens >= 0),
  output_tokens INT NOT NULL CHECK (output_tokens >= 0),
  cost_usd FLOAT NOT NULL CHECK (cost_usd >= 0),

  -- Metadata
  usage_type TEXT NOT NULL, -- root_generation, refinement, evaluation
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_repair_jobs_project_id ON repair_jobs(project_id);
CREATE INDEX idx_repair_jobs_run_id ON repair_jobs(run_id);
CREATE INDEX idx_repair_jobs_status ON repair_jobs(status);
CREATE INDEX idx_repair_jobs_created_at ON repair_jobs(created_at DESC);
CREATE INDEX idx_repair_candidates_job_id ON repair_candidates(repair_job_id);
CREATE INDEX idx_repair_candidates_depth ON repair_candidates(repair_job_id, depth);
CREATE INDEX idx_repair_costs_job_id ON repair_costs(repair_job_id);
CREATE INDEX idx_repair_costs_created_at ON repair_costs(created_at DESC);

-- RLS: repair_jobs (users can view repairs for own projects)
ALTER TABLE repair_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_view_repair_jobs"
  ON repair_jobs
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "users_can_create_repair_jobs"
  ON repair_jobs
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = auth.uid()
    )
  );

-- RLS: repair_candidates
ALTER TABLE repair_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_view_repair_candidates"
  ON repair_candidates
  FOR SELECT
  USING (
    repair_job_id IN (
      SELECT id FROM repair_jobs
      WHERE project_id IN (
        SELECT id FROM projects
        WHERE owner_id = auth.uid()
      )
    )
  );

-- RLS: repair_costs
ALTER TABLE repair_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_view_repair_costs"
  ON repair_costs
  FOR SELECT
  USING (
    repair_job_id IN (
      SELECT id FROM repair_jobs
      WHERE project_id IN (
        SELECT id FROM projects
        WHERE owner_id = auth.uid()
      )
    )
  );

-- orchestration_events: Track repair lifecycle events
CREATE TABLE orchestration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL, -- completion, failure, pr_created, pr_merged, etc.
  action TEXT, -- fast_lane_ready_pr, ready_pr, draft_pr, candidate_only, do_not_repair
  confidence_score FLOAT,
  pr_number INT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for event queries
CREATE INDEX idx_orchestration_events_job_id ON orchestration_events(repair_job_id);
CREATE INDEX idx_orchestration_events_created_at ON orchestration_events(created_at DESC);

-- RLS: orchestration_events
ALTER TABLE orchestration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_view_orchestration_events"
  ON orchestration_events
  FOR SELECT
  USING (
    repair_job_id IN (
      SELECT id FROM repair_jobs
      WHERE project_id IN (
        SELECT id FROM projects
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON repair_jobs TO anon, authenticated;
GRANT SELECT ON repair_candidates TO anon, authenticated;
GRANT SELECT ON repair_costs TO anon, authenticated;
GRANT SELECT, INSERT ON orchestration_events TO anon, authenticated;
