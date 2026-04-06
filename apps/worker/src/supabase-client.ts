/**
 * Supabase Client for Penny v3.0 Worker
 * Replaces direct pg.Pool connection with Supabase service role client
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LlmTier = 'aggressive' | 'balanced' | 'precision';

export interface ProjectConfigRow {
  id: string;
  name: string;
  repository_url?: string;
  default_llm_tier?: LlmTier;
}

export interface AuditSuiteConfigRow {
  suite_id: string;
  enabled: boolean;
  llm_tier?: LlmTier;
  agent_overrides?: Record<string, boolean>;
}

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  configured: boolean;
  missing: string[];
}

/**
 * Reads Supabase configuration from environment variables
 */
export function readSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  return {
    url,
    serviceRoleKey,
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Create a Supabase client with service role key
 */
export function createSupabaseClient(): SupabaseClient | null {
  const config = readSupabaseConfig();

  if (!config.configured) {
    console.error('Supabase not configured. Missing:', config.missing.join(', '));
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Singleton client instance
 */
let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!clientInstance) {
    clientInstance = createSupabaseClient();
  }
  return clientInstance;
}

/**
 * Job-related queries
 */

export interface AuditRunRow {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  trigger_type: string;
  trigger_payload?: Record<string, unknown>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * Get a queued audit run to process
 */
export async function getQueuedAuditRun(client: SupabaseClient | null): Promise<AuditRunRow | null> {
  if (!client) return null;

  const { data, error } = await client
    .from('audit_runs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found (expected for empty queue)
    console.error('Error getting queued audit run:', error);
    return null;
  }

  return data as AuditRunRow | null;
}

/**
 * Mark an audit run as running
 */
export async function startAuditRun(client: SupabaseClient | null, runId: string): Promise<boolean> {
  if (!client) return false;

  const { error } = await client
    .from('audit_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    console.error('Error starting audit run:', error);
    return false;
  }

  return true;
}

/**
 * Mark an audit run as completed
 */
export async function completeAuditRun(
  client: SupabaseClient | null,
  runId: string,
  totalCostUsd: number = 0,
  summaryStats?: Record<string, unknown>
): Promise<boolean> {
  if (!client) return false;

  const { error } = await client
    .from('audit_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_cost_usd: totalCostUsd,
      summary_stats: summaryStats || {},
    })
    .eq('id', runId);

  if (error) {
    console.error('Error completing audit run:', error);
    return false;
  }

  return true;
}

/**
 * Mark an audit run as failed
 */
export async function failAuditRun(
  client: SupabaseClient | null,
  runId: string,
  errorLog: string
): Promise<boolean> {
  if (!client) return false;

  const { error } = await client
    .from('audit_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    console.error('Error marking audit run as failed:', error);
    return false;
  }

  // Also log the error to orchestration_events
  await logOrchestrationEvent(client, runId, 'audit_run', runId, 'failed', {
    error_log: errorLog,
  });

  return true;
}

/**
 * Insert findings from an audit run
 */
export async function insertFindings(
  client: SupabaseClient | null,
  findings: Array<{
    id: string;
    project_id: string;
    run_id: string;
    agent_name: string;
    severity: string;
    priority: string;
    type: string;
    status: string;
    confidence: string;
    title: string;
    description: string;
    file_path?: string;
    line_range?: Record<string, unknown>;
    proof_hooks?: unknown[];
    suggested_fix?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>
): Promise<boolean> {
  if (!client || findings.length === 0) return true;

  const { error } = await client
    .from('findings')
    .upsert(findings, {
      onConflict: 'id',
    });

  if (error) {
    console.error('Error inserting findings:', error);
    return false;
  }

  return true;
}

/**
 * Get project details by name or ID
 */
export async function getProject(
  client: SupabaseClient | null,
  projectId: string
): Promise<ProjectConfigRow | null> {
  if (!client) return null;

  const { data, error } = await client
    .from('projects')
    .select('id, name, repository_url, default_llm_tier')
    .eq('id', projectId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error getting project:', error);
    return null;
  }

  return (data as ProjectConfigRow | null) || null;
}

/**
 * Resolve a project row by canonical name or repository URL.
 */
export async function resolveProjectConfig(
  client: SupabaseClient | null,
  input: { projectName?: string | null; repositoryUrl?: string | null }
): Promise<ProjectConfigRow | null> {
  if (!client) return null;

  const projectName = input.projectName?.trim();
  const repositoryUrl = input.repositoryUrl?.trim();

  if (projectName) {
    const { data, error } = await client
      .from('projects')
      .select('id, name, repository_url, default_llm_tier')
      .eq('name', projectName)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error resolving project by name:', error);
    } else if (data) {
      return data as ProjectConfigRow;
    }
  }

  if (repositoryUrl) {
    const { data, error } = await client
      .from('projects')
      .select('id, name, repository_url, default_llm_tier')
      .eq('repository_url', repositoryUrl)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error resolving project by repository URL:', error);
    } else if (data) {
      return data as ProjectConfigRow;
    }
  }

  if (projectName) {
    const { data, error } = await client
      .from('projects')
      .select('id, name, repository_url, default_llm_tier')
      .ilike('name', projectName)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error resolving project by case-insensitive name:', error);
      return null;
    }

    return (data as ProjectConfigRow | null) || null;
  }

  return null;
}

/**
 * Get audit suite configs for a project
 */
export async function getAuditSuiteConfigs(
  client: SupabaseClient | null,
  projectId: string
): Promise<AuditSuiteConfigRow[] | null> {
  if (!client) return null;

  const { data, error } = await client
    .from('audit_suite_configs')
    .select('suite_id, enabled, llm_tier, agent_overrides')
    .eq('project_id', projectId);

  if (error) {
    console.error('Error getting audit suite configs:', error);
    return null;
  }

  return (data as AuditSuiteConfigRow[] | null) || null;
}

/**
 * Insert model usage record
 */
export async function insertModelUsage(
  client: SupabaseClient | null,
  runId: string,
  agentName: string,
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  latencyMs: number
): Promise<boolean> {
  if (!client) return false;

  const { error } = await client
    .from('model_usage')
    .insert([
      {
        run_id: runId,
        agent_name: agentName,
        model_name: modelName,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        latency_ms: latencyMs,
      },
    ]);

  if (error) {
    console.error('Error inserting model usage:', error);
    return false;
  }

  return true;
}

/**
 * Log an orchestration event
 */
export async function logOrchestrationEvent(
  client: SupabaseClient | null,
  runId: string,
  entityType: string,
  entityId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<boolean> {
  if (!client) return false;

  const { error } = await client
    .from('orchestration_events')
    .insert([
      {
        run_id: runId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        payload,
      },
    ]);

  if (error) {
    console.error('Error logging orchestration event:', error);
    return false;
  }

  return true;
}

/**
 * Get repair configuration for a finding (auto_apply, params, etc.)
 */
export async function getRepairPolicy(
  client: SupabaseClient | null,
  findingId: string
): Promise<Record<string, unknown> | null> {
  if (!client) return null;

  const { data, error } = await client
    .from('findings')
    .select('metadata')
    .eq('id', findingId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error getting repair policy:', error);
    return null;
  }

  return data?.metadata?.repair_policy || null;
}
