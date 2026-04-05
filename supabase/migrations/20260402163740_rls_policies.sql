-- PENNY DATABASE: RLS & Security Policies
-- Secures the schema created in 001_penny_schema.sql

-- 1. Add Ownership to Projects (if not added in base schema)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Enable Row Level Security on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration_events ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies for Projects
-- Users can only see and modify their own projects
CREATE POLICY "Users can view own projects" 
ON projects FOR SELECT 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own projects" 
ON projects FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own projects" 
ON projects FOR UPDATE 
USING (auth.uid() = owner_id);

-- 4. Create Cascading Policies for Child Tables
-- Audit Runs (Inherits access from Projects)
CREATE POLICY "Users can access runs for their projects" 
ON audit_runs FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = audit_runs.project_id 
        AND projects.owner_id = auth.uid()
    )
);

-- Findings (Inherits access from Projects)
CREATE POLICY "Users can access findings for their projects" 
ON findings FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = findings.project_id 
        AND projects.owner_id = auth.uid()
    )
);

-- Repair Jobs (Inherits access from Findings -> Projects)
CREATE POLICY "Users can access repair jobs for their projects" 
ON repair_jobs FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM findings 
        JOIN projects ON projects.id = findings.project_id
        WHERE findings.id = repair_jobs.finding_id 
        AND projects.owner_id = auth.uid()
    )
);

-- 5. Service Role Bypass
-- Allows Edge Functions (which use the Service Role Key) to bypass RLS for ingestion.
-- (Supabase automatically allows service_role to bypass RLS, but it's good to document).