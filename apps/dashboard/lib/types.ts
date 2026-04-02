/**
 * Shared data models for penny dashboard.
 * Aligned with open_findings.json schema and project.json.template.
 */

export type Severity = "blocker" | "major" | "minor" | "nit";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type FindingType = "bug" | "enhancement" | "debt" | "question";
export type AuditExhaustiveness = "sampled" | "exhaustive";
export type ManifestComplexity = "low" | "medium" | "high";
export type ManifestNodeType =
  | "component"
  | "hook"
  | "service"
  | "util"
  | "route"
  | "schema"
  | "migration"
  | "config"
  | "script"
  | "doc"
  | "test"
  | "unknown";
export type RepairAutofixEligibility =
  | "manual_only"
  | "suggest_only"
  | "eligible";
export type RepairRiskClass = "low" | "medium" | "high" | "critical";
export type VerificationProfile =
  | "none"
  | "targeted"
  | "project"
  | "manual";
export type MaintenanceSourceType =
  | "finding"
  | "scanner_import"
  | "historical_receipt"
  | "todo_import"
  | "manual";
export type MaintenanceBacklogStatus =
  | "open"
  | "planned"
  | "in_progress"
  | "blocked"
  | "deferred"
  | "done";
export type NextActionRecommendation =
  | "review"
  | "plan_task"
  | "queue_repair"
  | "verify"
  | "re_audit"
  | "defer";
export type MaintenanceTaskStatus =
  | "draft"
  | "ready"
  | "approved"
  | "running"
  | "blocked"
  | "verified"
  | "done";

export type FindingStatus =
  | "open"
  | "accepted"
  | "in_progress"
  | "fixed_pending_verify"
  | "fixed_verified"
  | "wont_fix"
  | "deferred"
  | "duplicate"
  | "converted_to_enhancement";

export interface ProofHook {
  hook_type?: string;
  type?: string;
  summary?: string;
  value?: string;
  file?: string;
  start_line?: number;
}

export interface RepairPolicy {
  autofix_eligibility?: RepairAutofixEligibility;
  risk_class?: RepairRiskClass;
  verification_profile?: VerificationProfile;
  verification_commands?: string[];
  rollback_notes?: string;
  approval_required?: boolean;
}

export interface SuggestedFix {
  approach?: string;
  affected_files?: string[];
  estimated_effort?: string;
  risk_notes?: string;
  tests_needed?: string[];
  rollback_notes?: string;
  verification_commands?: string[];
}

export interface RepairProofArtifacts {
  summary_path: string;
  tree_path: string;
}

export interface RepairProofEvaluation {
  candidate_passed: boolean;
  apply_ok: boolean;
  compile_ok: boolean;
  lint_ok: boolean;
  tests_ok: boolean;
  warnings?: number;
  exit_code?: number;
  reasons?: string[];
}

export interface RepairProofVerification {
  status: "passed" | "failed" | "not_run";
  summary: string;
  commands_declared?: string[];
}

export interface RepairProof {
  source: "repair_engine";
  generated_at: string;
  selected_node_id: string;
  artifacts: RepairProofArtifacts;
  evaluation: RepairProofEvaluation;
  verification: RepairProofVerification;
}

export interface HistoryEvent {
  timestamp: string;
  actor: string;
  event: string;
  notes?: string;
}

export interface ProvenanceRef {
  manifest_revision?: string;
  audit_run_id?: string;
  finding_id?: string;
  backlog_id?: string;
  task_id?: string;
  repair_job_id?: string;
  verification_run_id?: string;
  source_type?: MaintenanceSourceType;
}

export type ProjectStatus = "draft" | "active";
export type ProjectSourceType =
  | "portfolio_mirror"
  | "git_url"
  | "local_path"
  | "import";
export type ArtifactStatus = "draft" | "active";
export type OnboardingStage =
  | "collect_repo_context"
  | "generate_project_profile"
  | "generate_expectations"
  | "operator_review"
  | "activate_project"
  | "completed";
export type AuditCluster =
  | "standard"   // 6 specialist agents: logic, security, performance, ux, data, deploy
  | "investor"   // investor-readiness, code-debt, intelligence extraction
  | "domain"     // exhaustive domain-by-domain audit with module manifest
  | "visual";    // UI consistency, color, typography, components, layout, polish

export type AuditKind =
  // Standard cluster — individual agent passes
  | "logic"
  | "security"
  | "performance"
  | "ux"
  | "visual"
  | "data"
  | "deploy"
  | "full"                    // all 6 standard agents in sequence
  // Investor cluster
  | "investor_readiness"      // investor-readiness.md
  | "code_debt"               // code-debt.md
  | "intelligence"            // intelligence_extraction_prompt.md
  // Domain cluster
  | "domain_manifest"         // generate module manifest (domain_audits.md Strategy 1)
  | "domain_pass"             // audit one domain against manifest
  // Synthesizers
  | "synthesize"              // standard cluster synthesis (synthesizer.md)
  | "visual_synthesize"       // visual cluster synthesis (visual-synthesizer.md)
  | "cluster_synthesize"      // per-cluster synthesizer
  | "meta_synthesize"         // per-project: reads all cluster summaries
  | "portfolio_synthesize";   // portfolio: reads all project meta summaries

export type ClusterOnboardingStage =
  // Standard (already exists)
  | "generate_intelligence_report"
  | "generate_expectations"
  // Investor cluster prerequisites
  | "collect_git_history"         // last 100 commits, contributors, commit quality
  | "collect_dependency_manifest" // npm audit output, major version gaps
  | "generate_investor_profile"   // investor-readiness pre-scan
  // Domain cluster prerequisites
  | "generate_module_manifest"    // Strategy 1 from domain_audits.md
  | "assign_domain_audit_order"   // complexity + impact ranked order
  // Visual cluster prerequisites
  | "collect_screenshot_set"      // screenshots of all main routes
  | "generate_css_token_map";     // design token extraction
export type ScopeType =
  | "project"
  | "domain"
  | "directory"
  | "file"
  | "diff"
  | "selection";

export interface ProjectArtifactVersion {
  version: number;
  status: ArtifactStatus;
  content: string;
  generatedAt: string;
  source: "generated" | "manual";
}

export interface ProjectArtifact {
  draft?: ProjectArtifactVersion;
  active?: ProjectArtifactVersion;
}

export interface DecisionEvent {
  id: string;
  timestamp: string;
  actor: string;
  event_type: string;
  target_type: "project" | "profile" | "expectations" | "finding" | "audit";
  target_id?: string;
  notes?: string;
  audit_kind?: AuditKind;
  scope_type?: ScopeType;
  scope_paths?: string[];
  model?: string;
  provider?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AuditScopeConfig {
  auditKind?: AuditKind;
  scopeType?: ScopeType;
  scopePaths?: string[];
  baseRef?: string;
  headRef?: string;
  maxFiles?: number;
  maxCharsPerFile?: number;
}

export interface ProjectCommands {
  test?: string;
  lint?: string;
  build?: string;
  typecheck?: string;
}

export interface ProjectRepoAccess {
  localPath?: string;
  cloneRef?: string;
  mirrorPath?: string;
}

export interface ProjectAuditConfig {
  defaultBranch?: string;
  scanRoots?: string[];
  configFiles?: string[];
  commands?: ProjectCommands;
  entrypoints?: string[];
  checklistId?: string;
  preferredScopeType?: ScopeType;
}

export interface ProjectProfileSummary {
  status?: string;
  languages?: string[];
  frameworks?: string[];
  deployment?: string;
  liveUrls?: string[];
}

export interface OnboardingState {
  stage: OnboardingStage;
  reviewRequired: boolean;
  profileApprovedAt?: string;
  expectationsApprovedAt?: string;
  activatedAt?: string;
  lastError?: string;
  updatedAt: string;
  events?: DecisionEvent[];
}

export interface ManifestModule {
  path: string;
  domain: string;
  type: ManifestNodeType;
  description: string;
  complexity: ManifestComplexity;
  entrypoint?: boolean;
}

export interface DomainCoverageSummary {
  domain: string;
  total_modules: number;
  reviewed_modules: number;
  finding_count: number;
  last_audited_at?: string;
}

export interface ProjectManifest {
  revision: string;
  generated_at: string;
  source_root: string;
  exhaustiveness: AuditExhaustiveness;
  modules: ManifestModule[];
  domains: DomainCoverageSummary[];
  checklist_id?: string;
  entrypoints?: string[];
}

export interface AuditCoverage {
  manifest_revision?: string;
  checklist_id?: string;
  exhaustiveness?: AuditExhaustiveness;
  confidence?: "low" | "medium" | "high";
  coverage_complete?: boolean;
  incomplete_reason?: string;
  files_in_scope?: string[];
  files_reviewed?: string[];
  modules_in_scope?: string[];
  modules_reviewed?: string[];
  known_finding_ids?: string[];
  known_findings_referenced?: string[];
  checklist_passed?: number;
  checklist_total?: number;
  net_new_findings?: number;
}

export interface Finding {
  finding_id: string;
  title: string;
  description?: string;
  type: FindingType;
  severity: Severity;
  priority: Priority;
  status: FindingStatus;
  confidence?: string;
  category?: string;
  cluster?: AuditCluster;
  /** Extra fields from import payloads (audit agents, scanners) */
  metadata?: Record<string, unknown>;
  proof_hooks?: ProofHook[];
  suggested_fix?: SuggestedFix;
  history?: HistoryEvent[];
  duplicate_of?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  last_seen_revision?: string;
  repair_policy?: RepairPolicy;
  /** Set when a repair-engine patch is applied and awaits verification */
  verified_at?: string;
  /** Per-finding decision trail (e.g. engine patch events) */
  decision_history?: Array<{
    timestamp: string;
    decision: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface ClusterSummary {
  cluster: AuditCluster;
  project: string;
  generatedAt: string;
  findingCount: number;
  topFindings: string[];
  synthesisText: string;
  score?: number;
  clusterSpecific?: Record<string, unknown>;
}

export interface ProjectMetaSummary {
  project: string;
  generatedAt: string;
  clustersRun: AuditCluster[];
  crossClusterP0s: string[];
  todaysTop5: string[];
  narrativeSummary: string;
}

export interface Project {
  name: string;
  findings: Finding[];
  lastUpdated?: string;
  repositoryUrl?: string;
  status?: ProjectStatus;
  sourceType?: ProjectSourceType;
  sourceRef?: string;
  repoAccess?: ProjectRepoAccess;
  /** Optional: stack/hosting from project.json.template */
  stack?: {
    language?: string;
    framework?: string;
    build?: string;
    hosting?: string;
    database?: string;
    css?: string;
  };
  auditConfig?: ProjectAuditConfig;
  profile?: ProjectArtifact;
  expectations?: ProjectArtifact;
  onboardingState?: OnboardingState;
  decisionHistory?: DecisionEvent[];
  profileSummary?: ProjectProfileSummary;
  manifest?: ProjectManifest;
  maintenanceBacklog?: MaintenanceBacklogItem[];
  maintenanceTasks?: MaintenanceTask[];
  clusterSummaries?: Partial<Record<AuditCluster, ClusterSummary>>;
  metaSummary?: ProjectMetaSummary;
}

export interface SyncMapping {
  linear_id: string;
  identifier?: string;
  url?: string;
  penny_status: FindingStatus;
  created_at?: string;
  last_synced?: string;
}

export interface SyncState {
  mappings: Record<string, SyncMapping>;
  last_sync: string | null;
}

/** Open findings file schema (import/export) */
export interface OpenFindingsSchema {
  schema_version?: string;
  open_findings: Finding[];
  findings?: Finding[];
}

/** A finding queued to the repair engine from the dashboard. */
export interface RepairJob {
  id?: string;
  finding_id: string;
  project_name: string;
  queued_at: string;
  started_at?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  reported_status?: "completed" | "failed" | "applied";
  patch_applied?: boolean;
  cost_usd?: number;
  provider_used?: string;
  completed_at?: string;
  error?: string;
  targeted_files?: string[];
  applied_files?: string[];
  verification_commands?: string[];
  rollback_notes?: string;
  repair_policy?: RepairPolicy;
  repair_proof?: RepairProof;
  maintenance_task_id?: string;
  backlog_id?: string;
  provenance?: ProvenanceRef;
}

export interface MaintenanceBacklogItem {
  id: string;
  project_name: string;
  title: string;
  summary?: string;
  canonical_status: MaintenanceBacklogStatus;
  source_type: MaintenanceSourceType;
  priority: Priority;
  severity: Severity;
  risk_class: RepairRiskClass;
  next_action: NextActionRecommendation;
  finding_ids: string[];
  dedupe_keys?: string[];
  duplicate_of?: string;
  blocked_reason?: string;
  provenance?: ProvenanceRef;
  created_at?: string;
  updated_at?: string;
}

export interface MaintenanceTask {
  id: string;
  project_name: string;
  backlog_id: string;
  title: string;
  intended_outcome: string;
  status: MaintenanceTaskStatus;
  target_domains: string[];
  target_files: string[];
  risk_class: RepairRiskClass;
  verification_profile?: VerificationProfile;
  verification_commands?: string[];
  rollback_notes?: string;
  notes?: string;
  provenance?: ProvenanceRef;
  created_at?: string;
  updated_at?: string;
}
