/**
 * Constraint-based audit types
 * Defines the data models for constraint validation framework
 */

export type ConstraintCategory =
  | "architecture"
  | "infrastructure"
  | "business-logic"
  | "operational-policy"
  | "security"
  | "product-strategy";

export type ConstraintSeverity = "critical" | "warning";
export type CheckDifficulty = "easy" | "moderate" | "complex";
export type ViolationType =
  | "not_found"
  | "incorrect_value"
  | "missing"
  | "unauthorized"
  | "ordering_violation"
  | "policy_violation";

/**
 * Constraint definition - what must be true about the codebase
 */
export interface ConstraintCheck {
  /** Unique identifier: "{project}-{number}" e.g., "embr-001" */
  id: string;

  /** Human-readable name */
  name: string;

  /** Category for grouping */
  category: ConstraintCategory;

  /** CRITICAL = blocks production; WARNING = should fix */
  severity: ConstraintSeverity;

  /** What the constraint is */
  description: string;

  /** Why it matters (business/technical reason) */
  why_required: string;

  /** How to verify it (high-level approach) */
  how_to_verify: string;

  /** Execution complexity */
  check_type: CheckDifficulty;

  /** Implementation details */
  implementation?: {
    /** File/directory to scan */
    code_path?: string;

    /** Bash command to run */
    bash_command?: string;

    /** Function that implements check */
    function_name?: string;

    /** Needs human review */
    requires_manual_review?: boolean;

    /** Expected output/value */
    expected_value?: string;

    /** Additional context */
    notes?: string;
  };
}

/**
 * A specific violation of a constraint
 */
export interface ConstraintViolation {
  /** Which constraint was violated */
  constraint_id: string;

  /** Type of violation */
  violation_type: ViolationType;

  /** CRITICAL or WARNING */
  severity: ConstraintSeverity;

  /** What we found / current state */
  current_state: string;

  /** What should be true / expected state */
  expected_state: string;

  /** How to fix it */
  remediation: string;

  /** Project being audited */
  project: string;

  /** Additional details */
  details?: Record<string, unknown>;

  /** File/line if applicable */
  location?: {
    file: string;
    line?: number;
    context?: string;
  };
}

/**
 * Result of running constraint validation
 */
export interface ConstraintAuditResult {
  /** Project audited (e.g., "embr", "codra") */
  project: string;

  /** Unique run ID */
  run_id: string;

  /** When audit was run */
  timestamp: string;

  /** Total constraints checked */
  total_constraints: number;

  /** How many passed */
  passed: number;

  /** How many failed critically */
  failed: number;

  /** How many failed with warnings */
  warnings: number;

  /** All violations found */
  violations: ConstraintViolation[];

  /** Percentage of constraints passing */
  coverage_percentage: number;

  /** Summary message */
  summary: string;

  /** Audit metadata */
  metadata?: {
    easy_passed?: number;
    easy_failed?: number;
    moderate_passed?: number;
    moderate_failed?: number;
    complex_passed?: number;
    complex_failed?: number;
    duration_ms?: number;
    auditor?: string;
    critical_violations?: number;
    projectName?: string;
    stack?: string[];
  };
}

/**
 * Summary for dashboard display
 */
export interface ConstraintAuditSummary {
  project: string;
  last_run?: string;
  coverage: number;
  passed: number;
  failed: number;
  warnings: number;
  critical_violations: ConstraintViolation[];
  ready_for_deployment: boolean;
}

/**
 * Result of checking a single constraint
 */
export interface CheckResult {
  constraint_id: string;
  passed: boolean;
  violations: ConstraintViolation[];
  execution_time_ms?: number;
}

/**
 * Legacy template entries in constraint-templates (severity/difficulty strings vary).
 */
export interface ConstraintDefinition {
  id: string;
  name: string;
  category: string;
  severity: string;
  difficulty: string;
  description: string;
  pattern?: string;
  checks?: string[];
  sla?: string;
}
