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
  configured: boolean;
  missing: string[];
}

/**
 * Reads Supabase configuration from environment variables
 */
export function readSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return {
    url,
    serviceRoleKey,
    anonKey,
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Create a server-side Supabase client with service role key
 * Use this in API routes and server components
 */
export function createSupabaseServerClient(): SupabaseClient | null {
  const config = readSupabaseConfig();

  if (!config.configured) {
    console.warn('Supabase not configured. Available tables:', config.missing.join(', '));
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

  if (!config.configured) {
    console.warn('Supabase not configured. Available tables:', config.missing.join(', '));
    return null;
  }

  return createClient(config.url, config.anonKey);
}

/**
 * Singleton server client instance
 */
let serverClientInstance: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (!serverClientInstance) {
    serverClientInstance = createSupabaseServerClient();
  }
  return serverClientInstance;
}

/**
 * Type-safe query builder helpers
 */

/**
 * Query projects table
 */
export async function getProjects(client: SupabaseClient | null) {
  if (!client) return null;

  const { data, error } = await client
    .from('projects')
    .select('*');

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
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching audit runs:', error);
    return null;
  }

  return data;
}

/**
 * Query findings for a project
 */
export async function getFindings(client: SupabaseClient | null, projectId: string) {
  if (!client) return null;

  const { data, error } = await client
    .from('findings')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

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
  status: string
) {
  if (!client) return null;

  const { data, error } = await client
    .from('findings')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', status)
    .order('created_at', { ascending: false });

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
    .select('*')
    .eq('run_id', runId);

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
    .select('*')
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
    .select('*')
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
    .select('*')
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
