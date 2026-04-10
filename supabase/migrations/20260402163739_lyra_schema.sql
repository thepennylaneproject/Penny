-- PENNY DATABASE SCHEMA v1.1.0
-- Target: Supabase / PostgreSQL
-- Purpose: Persistent memory for multi-agent audits, repair orchestration, and portfolio intelligence.

-- 1. ENUMS (Aligned with synthesizer.md)
CREATE TYPE penny_severity AS ENUM ('blocker', 'major', 'minor', 'nit');
CREATE TYPE penny_priority AS ENUM ('P0', 'P1', 'P2', 'P3');
CREATE TYPE penny_finding_type AS ENUM ('bug', 'enhancement', 'debt', 'question');
CREATE TYPE penny_finding_status AS ENUM (
    'open', 'accepted', 'assigned', 'in_progress', 
    'fixed_pending_verify', 'fixed_verified', 
    'wont_fix', 'deferred', 'duplicate', 'converted_to_enhancement'
);
CREATE TYPE penny_run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE penny_repair_status AS ENUM ('queued', 'generating', 'evaluating', 'applied', 'failed');

-- 2. PROJECTS (Portfolio Layer)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    repository_url TEXT,
    branch TEXT DEFAULT 'main',
    stack_info JSONB DEFAULT '{}', -- Framework, build tool, etc.
    expectations_content TEXT,    -- Raw content of audits/expectations.md
    last_audit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. AUDIT RUNS (Orchestration Layer)
CREATE TABLE audit_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT DEFAULT 'deep_audit', -- 'fast_lane' | 'deep_audit' | 'visual'
    status penny_run_status DEFAULT 'queued',
    trigger_type TEXT DEFAULT 'manual', -- 'webhook' | 'manual' | 'scheduled'
    trigger_payload JSONB DEFAULT '{}',
    summary_stats JSONB DEFAULT '{ "blocker": 0, "major": 0, "minor": 0, "nit": 0 }',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    total_cost_usd NUMERIC(10, 5) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FINDINGS (Canonical State)
CREATE TABLE findings (
    id TEXT PRIMARY KEY, -- The f-xxx canonical ID
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    run_id UUID REFERENCES audit_runs(id),
    agent_name TEXT NOT NULL, -- 'logic', 'security', 'ux', etc.
    severity penny_severity DEFAULT 'minor',
    priority penny_priority DEFAULT 'P2',
    type penny_finding_type DEFAULT 'bug',
    status penny_finding_status DEFAULT 'open',
    confidence TEXT, -- 'evidence', 'inference', 'speculation'
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    line_range JSONB, -- { "start": 10, "end": 15 }
    proof_hooks JSONB DEFAULT '[]', -- Array of typed hooks
    suggested_fix JSONB DEFAULT '{}', -- { "approach": "...", "steps": [] }
    history JSONB DEFAULT '[]', -- Audit trail of status changes/notes
    metadata JSONB DEFAULT '{}', -- Extra agent-specific context
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. REPAIR JOBS (Patch-Tree Orchestration)
CREATE TABLE repair_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id TEXT REFERENCES findings(id) ON DELETE CASCADE,
    run_id UUID REFERENCES audit_runs(id),
    status penny_repair_status DEFAULT 'queued',
    branch_name TEXT, -- The git branch created for this fix
    error_log TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. REPAIR CANDIDATES (The Search Tree)
CREATE TABLE repair_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_job_id UUID REFERENCES repair_jobs(id) ON DELETE CASCADE,
    parent_candidate_id UUID REFERENCES repair_candidates(id), -- For tree depth
    patch_diff TEXT,
    score NUMERIC(5, 2), -- Weighted score from validation
    validation_results JSONB DEFAULT '{ "lint": null, "test": null, "build": null }',
    is_winner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MODEL USAGE (Cost & Performance Observability)
CREATE TABLE model_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES audit_runs(id),
    agent_name TEXT,
    model_name TEXT NOT NULL, -- e.g. 'gpt-4o', 'claude-3-5-sonnet'
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 5) DEFAULT 0,
    latency_ms INTEGER,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ORCHESTRATION EVENTS (The "Nervous System" Log)
CREATE TABLE orchestration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES audit_runs(id),
    entity_type TEXT NOT NULL, -- 'finding', 'run', 'repair_job', 'candidate'
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'status_changed', 'patch_generated', 'validation_failed'
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for Dashboard Performance
-- Single-column indexes: status-only filters still use idx_findings_status.
-- Typical list queries filter project_id + status and order by created_at; see
-- idx_findings_project_status_created_at in 20260407210000_findings_index_repair_jobs_grants.sql.
CREATE INDEX idx_findings_project ON findings(project_id);
CREATE INDEX idx_findings_status ON findings(status);
CREATE INDEX idx_audit_runs_project ON audit_runs(project_id);
CREATE INDEX idx_events_run ON orchestration_events(run_id);
CREATE INDEX idx_usage_run ON model_usage(run_id);