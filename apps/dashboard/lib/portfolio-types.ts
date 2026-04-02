/**
 * Portfolio-wide constraint and audit types
 * Used across all 13 projects
 */

import { ConstraintCheck, ConstraintViolation, ConstraintAuditResult } from "./constraint-types";

/**
 * Portfolio project configuration
 */
export interface PortfolioProject {
  id: string;
  name: string;
  type: "app" | "website" | "service" | "library";
  stack: string[]; // tech stack: "node", "react", "postgres", etc
  path: string; // relative path in monorepo
  description?: string;
  team?: string;
  slackChannel?: string;
  owner?: string;
}

/**
 * Portfolio-wide SLA definition
 */
export interface PortfolioSLA {
  minimumCompliance: {
    perProject: number; // e.g., 0.90 (90%)
    portfolio: number; // e.g., 0.95 (95%)
    critical: number; // 1.0 = zero violations allowed
  };
  responseTime: {
    critical: string; // e.g., "1 hour"
    major: string; // e.g., "4 hours"
    minor: string; // e.g., "24 hours"
  };
  escalation: {
    level1: string; // Auto-fix
    level2: string; // Alert
    level3: string; // Block
    level4: string; // Executive
  };
}

/**
 * Constraint audit result with portfolio context
 */
export interface PortfolioAuditResult
  extends Omit<ConstraintAuditResult, "timestamp"> {
  projectId: string;
  projectName: string;
  runId: string;
  timestamp: Date;
  auditedBy: string;
  duration: number; // milliseconds
  compliancePercentage: number;
  trend?: {
    previous: number;
    change: number;
    direction: "up" | "down" | "stable";
  };
}

/**
 * Portfolio audit summary for dashboard
 */
export interface PortfolioAuditSummary {
  timestamp: Date;
  totalProjects: number;
  projectResults: Array<{
    projectId: string;
    projectName: string;
    totalConstraints: number;
    passed: number;
    failed: number;
    warnings: number;
    compliancePercentage: number;
    status: "pass" | "warning" | "fail";
  }>;
  aggregatedStats: {
    totalConstraints: number;
    totalPassed: number;
    totalFailed: number;
    totalWarnings: number;
    portfolioCompliance: number;
    slaStatus: "pass" | "warning" | "fail";
  };
  criticalViolations: Array<{
    projectId: string;
    constraint: ConstraintCheck;
    violation: ConstraintViolation;
  }>;
  trending: {
    complianceTrend: Array<{ date: Date; compliance: number }>;
    commonFailures: Array<{
      constraintId: string;
      failureCount: number;
      affectedProjects: number;
    }>;
  };
}

/**
 * Escalation action for portfolio monitoring
 */
export interface EscalationAction {
  id: string;
  violationId: string;
  projectId: string;
  severity: "critical" | "major" | "minor";
  level: 1 | 2 | 3 | 4;
  status: "open" | "in-progress" | "resolved" | "dismissed";
  createdAt: Date;
  resolvedAt?: Date;
  assignedTo?: string;
  action: string;
  autoRepair?: {
    available: boolean;
    suggested: string;
  };
  notes?: string;
}

/**
 * Portfolio-wide audit history entry
 */
export interface PortfolioAuditHistoryEntry {
  auditId: string;
  runId: string;
  timestamp: Date;
  auditType: "full" | "quick" | "critical-only";
  triggerSource: "scheduled" | "manual" | "pr" | "push" | "deployment";
  projectsAudited: number;
  totalDuration: number;
  summary: PortfolioAuditSummary;
  createdAt: Date;
  createdBy: string;
}

/**
 * Portfolio health metrics
 */
export interface PortfolioHealthMetrics {
  timestamp: Date;
  overallCompliance: number;
  complianceTrend: number; // percentage points change from previous
  projectsCompliant: number;
  projectsWarning: number;
  projectsFailing: number;
  criticalViolations: number;
  majorViolations: number;
  minorViolations: number;
  slaBreaches: number;
  averageTimeToRemediate: number; // minutes
  autoRepairSuccessRate: number;
}

/**
 * Per-project constraint configuration
 */
export interface ProjectConstraintConfig {
  projectId: string;
  projectName: string;
  constraintIds: string[];
  difficulty: "easy" | "moderate" | "complex" | "all";
  enabled: boolean;
  scheduleOverride?: {
    frequency: "hourly" | "daily" | "weekly" | "monthly";
    time?: string; // HH:MM UTC
  };
  slackNotifications?: {
    enabled: boolean;
    channel: string;
    notifyOn: ("critical" | "major" | "minor")[];
  };
  excludedConstraints?: string[];
  customRules?: Record<string, unknown>;
}

/**
 * Portfolio violation triage entry
 */
export interface ViolationTriage {
  violationId: string;
  projectId: string;
  constraintId: string;
  status: "new" | "acknowledged" | "in-progress" | "resolved" | "wont-fix" | "false-positive";
  severity: "critical" | "major" | "minor";
  triagedBy?: string;
  triageNotes?: string;
  estimatedResolution?: Date;
  autoRepairAttempted?: boolean;
  autoRepairSucceeded?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Constraint performance metrics
 */
export interface ConstraintPerformanceMetrics {
  constraintId: string;
  projectId: string;
  passRate: number; // percentage
  failurePattern?: {
    frequency: number;
    lastFailure: Date;
    consecutiveFailures: number;
  };
  autoRepairRate?: number;
  averageRemediationTime?: number; // minutes
  trend: "improving" | "stable" | "degrading";
}

/**
 * Portfolio auto-repair suggestion
 */
export interface AutoRepairSuggestion {
  id: string;
  violationId: string;
  constraintId: string;
  projectId: string;
  severity: "critical" | "major" | "minor";
  status: "pending" | "approved" | "rejected" | "applied";
  repairType: "automatic" | "semi-automatic" | "requires-review";
  suggestedChanges: Array<{
    file: string;
    lineNumber: number;
    currentCode: string;
    suggestedCode: string;
  }>;
  estimatedImpact?: string;
  confidence: number; // 0-1
  createdAt: Date;
  appliedAt?: Date;
  approvedBy?: string;
}

/**
 * Portfolio reporting
 */
export interface PortfolioReport {
  id: string;
  period: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate: Date;
  generatedAt: Date;
  summary: {
    averageCompliance: number;
    improvingProjects: number;
    decliningProjects: number;
    criticalIssues: number;
    resolvedIssues: number;
  };
  projectBreakdown: Array<{
    projectId: string;
    compliance: number;
    trend: "up" | "down" | "stable";
    topIssues: Array<{
      constraintId: string;
      violationCount: number;
    }>;
  }>;
  recommendations: string[];
}
