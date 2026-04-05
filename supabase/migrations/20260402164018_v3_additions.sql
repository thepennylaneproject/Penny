-- PENNY v3.0 ADDITIONS
-- Extends the schema from 001 & 002 with v3.0-specific features:
-- - GitHub webhook management per project
-- - Cron-based audit scheduling
-- - Per-project audit suite configuration (17 agents)

-- 1. Add GitHub metadata columns to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_app_installation_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_llm_tier TEXT DEFAULT 'balanced'; -- 'aggressive', 'balanced', 'precision'

-- 2. WEBHOOKS (GitHub webhook management per project)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    github_repo_url TEXT NOT NULL,
    secret_token TEXT NOT NULL, -- HMAC secret for webhook verification
    events JSONB DEFAULT '["push", "pull_request"]', -- Array of GitHub events to listen for
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, github_repo_url)
);

-- 3. SCHEDULES (Cron-based audit scheduling)
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cron_expression TEXT NOT NULL, -- Standard 5-field cron (minute hour day month weekday)
    audit_kind TEXT NOT NULL, -- '01_care_safety', '02_visual_cohesion', '03_strategic_opportunity'
    llm_tier TEXT DEFAULT 'balanced', -- 'aggressive', 'balanced', 'precision'
    enabled BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AUDIT_SUITE_CONFIGS (Per-project agent selection for granular UI controls)
CREATE TABLE IF NOT EXISTS audit_suite_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    suite_id TEXT NOT NULL, -- '01_care_safety', '02_visual_cohesion', '03_strategic_opportunity', '04_synthesis'
    enabled BOOLEAN DEFAULT TRUE,
    llm_tier TEXT, -- If set, overrides default_llm_tier for this suite
    agent_overrides JSONB DEFAULT '{}', -- { "agent_name": true/false, ... }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, suite_id)
);

-- 5. INTELLIGENCE_REPORTS (Per-project intelligence extracts)
CREATE TABLE IF NOT EXISTS intelligence_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id UUID REFERENCES audit_runs(id),
    content TEXT NOT NULL, -- Markdown report
    kind TEXT DEFAULT 'full', -- 'onboarding', 'full', 'strategic'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create indexes for webhook & schedule queries
CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_repo ON webhooks(github_repo_url);
CREATE INDEX IF NOT EXISTS idx_schedules_project ON schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_suite_config_project ON audit_suite_configs(project_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_reports_project ON intelligence_reports(project_id);

-- 7. RLS for webhooks (cascading from projects)
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access webhooks for their projects"
ON webhooks FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = webhooks.project_id
        AND projects.owner_id = auth.uid()
    )
);

-- 8. RLS for schedules (cascading from projects)
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access schedules for their projects"
ON schedules FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = schedules.project_id
        AND projects.owner_id = auth.uid()
    )
);

-- 9. RLS for audit_suite_configs (cascading from projects)
ALTER TABLE audit_suite_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access audit_suite_configs for their projects"
ON audit_suite_configs FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = audit_suite_configs.project_id
        AND projects.owner_id = auth.uid()
    )
);

-- 10. RLS for intelligence_reports (cascading from projects)
ALTER TABLE intelligence_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access intelligence_reports for their projects"
ON intelligence_reports FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = intelligence_reports.project_id
        AND projects.owner_id = auth.uid()
    )
);
