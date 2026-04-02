/**
 * Penny v3.0 Shared Types
 * Common types used across dashboard, worker, and repair service
 */

// ─── Enums (from v2.0 schema) ───────────────────────────────────────

export enum Severity {
  BLOCKER = 'blocker',
  MAJOR = 'major',
  MINOR = 'minor',
  NIT = 'nit',
}

export enum Priority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

export enum FindingType {
  BUG = 'bug',
  ENHANCEMENT = 'enhancement',
  DEBT = 'debt',
  QUESTION = 'question',
}

export enum FindingStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  FIXED_PENDING_VERIFY = 'fixed_pending_verify',
  FIXED_VERIFIED = 'fixed_verified',
  WONT_FIX = 'wont_fix',
  DEFERRED = 'deferred',
  DUPLICATE = 'duplicate',
  CONVERTED_TO_ENHANCEMENT = 'converted_to_enhancement',
}

export enum RunStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum RepairStatus {
  QUEUED = 'queued',
  GENERATING = 'generating',
  EVALUATING = 'evaluating',
  APPLIED = 'applied',
  FAILED = 'failed',
}

// ─── Proof Hooks ───────────────────────────────────────────────────

export type ProofHookType =
  | 'code_ref'
  | 'error_text'
  | 'command'
  | 'repro_steps'
  | 'ui_path'
  | 'data_shape'
  | 'log_line'
  | 'config_key'
  | 'query'
  | 'artifact_ref';

export interface ProofHook {
  type: ProofHookType;
  file?: string;
  symbol?: string;
  line?: number;
  content?: string;
  description?: string;
}

// ─── Finding ───────────────────────────────────────────────────────

export interface Finding {
  id: string; // Format: f-xxx (deterministic SHA-256 based)
  project_id: string;
  run_id: string;
  agent_name: string;
  severity: Severity;
  priority: Priority;
  type: FindingType;
  status: FindingStatus;
  confidence: number; // 0.0-1.0
  title: string;
  description: string;
  file_path?: string;
  line_range?: {
    start: number;
    end: number;
  };
  proof_hooks: ProofHook[];
  suggested_fix?: {
    approach: string;
    files_affected: string[];
    effort_estimate: string;
  };
  history: Array<{
    timestamp: string;
    event: string;
    actor?: string;
  }>;
  metadata?: Record<string, unknown>;
}

// ─── Audit Run ─────────────────────────────────────────────────────

export interface AuditRun {
  id: string;
  project_id: string;
  kind: 'fast_lane' | 'deep_audit' | 'visual' | '01_care_safety' | '02_visual_cohesion' | '03_strategic_opportunity';
  status: RunStatus;
  trigger_type: 'webhook' | 'manual' | 'scheduled' | 'cron';
  trigger_payload?: Record<string, unknown>;
  summary_stats?: {
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
    total_findings: number;
  };
  total_cost_usd?: number;
  started_at?: string;
  completed_at?: string;
  error_log?: string;
}

// ─── Repair Job ────────────────────────────────────────────────────

export interface RepairJob {
  id: string;
  finding_id: string;
  run_id: string;
  status: RepairStatus;
  branch_name?: string;
  error_log?: string;
  started_at?: string;
  finished_at?: string;
}

export interface RepairCandidate {
  id: string;
  repair_job_id: string;
  parent_candidate_id?: string;
  patch_diff: string;
  score: number; // 0.0-100.0
  validation_results?: {
    [command: string]: {
      passed: boolean;
      logs: string;
      exit_code: number;
    };
  };
  is_winner: boolean;
}

// ─── Project ───────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  repository_url: string;
  github_repo_url?: string;
  github_app_installation_id?: string;
  branch: string;
  stack_info?: Record<string, unknown>;
  expectations_content?: string;
  default_llm_tier?: 'aggressive' | 'balanced' | 'precision';
  last_audit_at?: string;
}

// ─── Audit Suite Config ────────────────────────────────────────────

export interface AuditSuiteConfig {
  id: string;
  project_id: string;
  suite_id: string; // '01_care_safety', '02_visual_cohesion', '03_strategic_opportunity'
  enabled: boolean;
  llm_tier?: 'aggressive' | 'balanced' | 'precision';
  agent_overrides?: {
    [agentName: string]: boolean;
  };
}

// ─── Webhook ───────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  project_id: string;
  github_repo_url: string;
  secret_token: string;
  events: string[];
  active: boolean;
  created_at: string;
}

// ─── Schedule ──────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  project_id: string;
  cron_expression: string;
  audit_kind: string;
  llm_tier: 'aggressive' | 'balanced' | 'precision';
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
}

// ─── Model Usage (Observability) ────────────────────────────────────

export interface ModelUsage {
  id: string;
  run_id: string;
  agent_name: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
}

// ─── Orchestration Events (Nervous System) ──────────────────────────

export interface OrchestrationEvent {
  id: string;
  run_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// ─── Repair Engine Config ──────────────────────────────────────────

export interface EngineConfig {
  search: SearchConfig;
  evaluation: EvaluationConfig;
  apply: ApplyConfig;
}

export interface SearchConfig {
  root_branching_factor: number;
  beam_width: number;
  max_depth: number;
  max_evals_per_finding: number;
}

export interface EvaluationConfig {
  use_docker: boolean;
  docker_image: string;
  timeout_seconds: number;
  strong_pass_score: number;
  auto_apply: boolean;
}

export interface ApplyConfig {
  protected_prefixes: string[];
  max_files_changed: number;
}

// ─── LLM Providers ─────────────────────────────────────────────────

export enum RoutingStrategy {
  AGGRESSIVE = 'aggressive',
  BALANCED = 'balanced',
  PRECISION = 'precision',
}

export interface ProviderConfig {
  name: string;
  model: string;
  cost_per_1m_input: number;
  cost_per_1m_output: number;
}

export const PROVIDER_CONFIGS: Record<RoutingStrategy, { primary: ProviderConfig; fallback: ProviderConfig }> = {
  [RoutingStrategy.AGGRESSIVE]: {
    primary: { name: 'claude-3-5-haiku-latest', model: 'claude-3-5-haiku-latest', cost_per_1m_input: 0.8, cost_per_1m_output: 4.0 },
    fallback: { name: 'gpt-4o-mini', model: 'gpt-4o-mini', cost_per_1m_input: 0.15, cost_per_1m_output: 0.6 },
  },
  [RoutingStrategy.BALANCED]: {
    primary: { name: 'claude-3-5-sonnet-latest', model: 'claude-3-5-sonnet-latest', cost_per_1m_input: 3.0, cost_per_1m_output: 15.0 },
    fallback: { name: 'gpt-4o', model: 'gpt-4o', cost_per_1m_input: 5.0, cost_per_1m_output: 15.0 },
  },
  [RoutingStrategy.PRECISION]: {
    primary: { name: 'claude-3-opus-latest', model: 'claude-3-opus-latest', cost_per_1m_input: 15.0, cost_per_1m_output: 75.0 },
    fallback: { name: 'claude-3-5-sonnet-latest', model: 'claude-3-5-sonnet-latest', cost_per_1m_input: 3.0, cost_per_1m_output: 15.0 },
  },
};
