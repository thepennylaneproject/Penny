/**
 * Supabase Client for Penny v3.0
 * Replaces direct pg.Pool connection with Supabase JS client
 * Uses service role key on the server side for unrestricted access
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
}

/**
 * Reads Supabase configuration from environment variables
 */
export function readSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return {
    url,
    serviceRoleKey,
    anonKey,
  };
}

/**
 * Create a server-side Supabase client with service role key
 * Use this in API routes and server components
 */
export function createSupabaseServerClient(): SupabaseClient | null {
  const config = readSupabaseConfig();

  const missing: string[] = [];
  if (!config.url) missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.warn('Supabase server client not configured. Missing:', missing.join(', '));
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Create a client-side Supabase client with anon key
 * Use this in browser code
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const config = readSupabaseConfig();

  const missing: string[] = [];
  if (!config.url) missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!config.anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    console.warn('Supabase browser client not configured. Missing:', missing.join(', '));
    return null;
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Singleton server client instance
 */
let serverClientInstance: SupabaseClient | null = null;
let browserClientInstance: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (!serverClientInstance) {
    serverClientInstance = createSupabaseServerClient();
  }
  return serverClientInstance;
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!browserClientInstance) {
    browserClientInstance = createSupabaseBrowserClient();
  }
  return browserClientInstance;
}

/**
 * Type-safe query builder helpers
 */

/** Default cap for unbounded list queries (findings scale with audit volume). */
const DEFAULT_LIST_LIMIT = 500;

const PROJECT_COLUMNS =
  'id, name, repository_url, branch, stack_info, expectations_content, last_audit_at, created_at, updated_at, owner_id, github_repo_url, github_app_installation_id, default_llm_tier';

const AUDIT_RUN_COLUMNS =
  'id, project_id, kind, status, trigger_type, trigger_payload, summary_stats, started_at, completed_at, total_cost_usd, created_at';

/** List rows: omits heavy JSON blobs used for detail/history views. */
const FINDING_LIST_COLUMNS =
  'id, project_id, run_id, agent_name, severity, priority, type, status, confidence, title, description, file_path, line_range, created_at, updated_at';

const FINDING_FULL_COLUMNS = `${FINDING_LIST_COLUMNS}, proof_hooks, suggested_fix, history, metadata`;

const MODEL_USAGE_COLUMNS =
  'id, run_id, agent_name, model_name, input_tokens, output_tokens, cost_usd, latency_ms, timestamp';

const AUDIT_SUITE_CONFIG_COLUMNS =
  'id, project_id, suite_id, enabled, llm_tier, agent_overrides, created_at, updated_at';

const WEBHOOK_COLUMNS =
  'id, project_id, github_repo_url, secret_token, events, active, created_at, updated_at';

const SCHEDULE_COLUMNS =
  'id, project_id, cron_expression, audit_kind, llm_tier, enabled, last_run_at, next_run_at, created_at, updated_at';

export type FindingsSelectMode = 'list' | 'full';

/**
 * Query projects table
 */
export async function getProjects(client: SupabaseClient | null) {
  if (!client) return null;

  const { data, error } = await client
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('name', { ascending: true })
    .limit(2_000);

  if (error) {
    console.error('Error fetching projects:', error);
    return null;
  }

  return data;
}

/**
 * Query audit_runs for a project
 */
export async function getAuditRuns(client: SupabaseClient | null, projectId: string) {
  if (!client) return null;

  const { data, error } = await client
    .from('audit_runs')
    .select(AUDIT_RUN_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1_000);

  if (error) {
    console.error('Error fetching audit runs:', error);
    return null;
  }

  return data;
}

/**
 * Query findings for a project
 */
export async function getFindings(
  client: SupabaseClient | null,
  projectId: string,
  options?: { limit?: number; select?: FindingsSelectMode }
) {
  if (!client) return null;

  const limit = options?.limit ?? DEFAULT_LIST_LIMIT;
  const cols = options?.select === 'full' ? FINDING_FULL_COLUMNS : FINDING_LIST_COLUMNS;

  const { data, error } = await client
    .from('findings')
    .select(cols)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching findings:', error);
    return null;
  }

  return data;
}

/**
 * Query findings by status
 */
export async function getFindingsByStatus(
  client: SupabaseClient | null,
  projectId: string,
  status: string,
  options?: { limit?: number; select?: FindingsSelectMode }
) {
  if (!client) return null;

  const limit = options?.limit ?? DEFAULT_LIST_LIMIT;
  const cols = options?.select === 'full' ? FINDING_FULL_COLUMNS : FINDING_LIST_COLUMNS;

  const { data, error } = await client
    .from('findings')
    .select(cols)
    .eq('project_id', projectId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching findings by status:', error);
    return null;
  }

  return data;
}

/**
 * Update a finding's status
 */
export async function updateFindingStatus(
  client: SupabaseClient | null,
  findingId: string,
  status: string,
  metadata?: Record<string, unknown>
) {
  if (!client) return null;

  const { data, error } = await client
    .from('findings')
    .update({
      status,
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', findingId)
    .select();

  if (error) {
    console.error('Error updating finding status:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Insert an audit run
 */
export async function insertAuditRun(
  client: SupabaseClient | null,
  data: {
    project_id: string;
    kind: string;
    status: string;
    trigger_type: string;
    trigger_payload?: Record<string, unknown>;
  }
) {
  if (!client) return null;

  const { data: result, error } = await client
    .from('audit_runs')
    .insert([data])
    .select();

  if (error) {
    console.error('Error inserting audit run:', error);
    return null;
  }

  return result?.[0] || null;
}

/**
 * Query model_usage for cost tracking
 */
export async function getModelUsage(client: SupabaseClient | null, runId: string) {
  if (!client) return null;

  const { data, error } = await client
    .from('model_usage')
    .select(MODEL_USAGE_COLUMNS)
    .eq('run_id', runId)
    .limit(10_000);

  if (error) {
    console.error('Error fetching model usage:', error);
    return null;
  }

  return data;
}

/**
 * Query audit_suite_configs for a project
 */
export async function getAuditSuiteConfigs(
  client: SupabaseClient | null,
  projectId: string
) {
  if (!client) return null;

  const { data, error } = await client
    .from('audit_suite_configs')
    .select(AUDIT_SUITE_CONFIG_COLUMNS)
    .eq('project_id', projectId);

  if (error) {
    console.error('Error fetching audit suite configs:', error);
    return null;
  }

  return data;
}

/**
 * Update audit_suite_configs
 */
export async function updateAuditSuiteConfig(
  client: SupabaseClient | null,
  projectId: string,
  suiteId: string,
  updates: {
    enabled?: boolean;
    llm_tier?: string;
    agent_overrides?: Record<string, boolean>;
  }
) {
  if (!client) return null;

  const { data, error } = await client
    .from('audit_suite_configs')
    .update(updates)
    .eq('project_id', projectId)
    .eq('suite_id', suiteId)
    .select();

  if (error) {
    console.error('Error updating audit suite config:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Query webhooks for a project
 */
export async function getWebhooks(client: SupabaseClient | null, projectId: string) {
  if (!client) return null;

  const { data, error } = await client
    .from('webhooks')
    .select(WEBHOOK_COLUMNS)
    .eq('project_id', projectId);

  if (error) {
    console.error('Error fetching webhooks:', error);
    return null;
  }

  return data;
}

/**
 * Query schedules for a project
 */
export async function getSchedules(client: SupabaseClient | null, projectId: string) {
  if (!client) return null;

  const { data, error } = await client
    .from('schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('project_id', projectId);

  if (error) {
    console.error('Error fetching schedules:', error);
    return null;
  }

  return data;
}

/**
 * Insert a repair job
 */
export async function insertRepairJob(
  client: SupabaseClient | null,
  data: {
    finding_id: string;
    run_id: string;
    status: string;
    branch_name?: string;
  }
) {
  if (!client) return null;

  const { data: result, error } = await client
    .from('repair_jobs')
    .insert([data])
    .select();

  if (error) {
    console.error('Error inserting repair job:', error);
    return null;
  }

  return result?.[0] || null;
}
