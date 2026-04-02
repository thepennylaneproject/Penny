/**
 * Portfolio Orchestrator
 * Manages constraint audits across all 13 projects
 */

import * as fs from "fs";
import * as path from "path";
import {
  PortfolioProject,
  PortfolioSLA,
  PortfolioAuditResult,
  PortfolioAuditSummary,
  EscalationAction,
  PortfolioHealthMetrics,
  PortfolioAuditHistoryEntry
} from "./portfolio-types";
import type { ConstraintCheck } from "./constraint-types";
import { ConstraintValidator } from "./constraint-validator";
import { ConstraintAuditRepository } from "./constraint-audit-repository";

export class PortfolioOrchestrator {
  private projects: Map<string, PortfolioProject>;
  private sla: PortfolioSLA;
  private validator: ConstraintValidator;
  private repository: ConstraintAuditRepository;

  constructor(sla: PortfolioSLA, repository: ConstraintAuditRepository) {
    this.projects = new Map();
    this.sla = sla;
    this.validator = new ConstraintValidator();
    this.repository = repository;
    this.loadProjects();
  }

  /**
   * Load all projects from portfolio config
   */
  private loadProjects(): void {
    try {
      const configPath = path.join(process.cwd(), "portfolio.config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        config.projects.forEach((project: PortfolioProject) => {
          this.projects.set(project.id, project);
        });
      }
    } catch (error) {
      console.warn("Failed to load portfolio config:", error);
    }
  }

  /**
   * Register a project in the portfolio
   */
  registerProject(project: PortfolioProject): void {
    this.projects.set(project.id, project);
  }

  /**
   * Get all projects
   */
  getProjects(): PortfolioProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * Audit a single project
   */
  async auditProject(
    projectId: string,
    difficulty: "easy" | "moderate" | "complex" | "all" = "all"
  ): Promise<PortfolioAuditResult> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const startTime = Date.now();
    const projectPath = path.join(process.cwd(), project.path);

    // Run audit for this project
    const auditResult = await this.validator.runConstraintAudit(
      projectPath,
      difficulty,
      projectId
    );

    const duration = Date.now() - startTime;

    // Get previous compliance for trending
    const previousAudit = await this.repository.getLatestConstraintAudit(projectId);
    const trend =
      previousAudit && previousAudit.coverage_percentage
        ? {
            previous: previousAudit.coverage_percentage,
            change:
              auditResult.coverage_percentage -
              previousAudit.coverage_percentage,
            direction:
              auditResult.coverage_percentage >
              previousAudit.coverage_percentage
                ? ("up" as const)
                : auditResult.coverage_percentage <
                    previousAudit.coverage_percentage
                  ? ("down" as const)
                  : ("stable" as const)
          }
        : undefined;

    const portfolioResult: PortfolioAuditResult = {
      ...auditResult,
      projectId,
      projectName: project.name,
      runId: `${projectId}-${Date.now()}`,
      timestamp: new Date(),
      auditedBy: "portfolio-orchestrator",
      duration,
      compliancePercentage: auditResult.coverage_percentage,
      trend
    };

    await this.repository.saveConstraintAudit({
      project: projectId,
      run_id: auditResult.run_id,
      timestamp: auditResult.timestamp,
      total_constraints: auditResult.total_constraints,
      passed: auditResult.passed,
      failed: auditResult.failed,
      warnings: auditResult.warnings,
      coverage_percentage: auditResult.coverage_percentage,
      summary: auditResult.summary,
      violations: auditResult.violations,
      metadata: {
        ...auditResult.metadata,
        projectName: project.name,
        stack: project.stack
      }
    });

    return portfolioResult;
  }

  /**
   * Audit all projects
   */
  async auditAll(
    difficulty: "easy" | "moderate" | "complex" | "all" = "all"
  ): Promise<PortfolioAuditSummary> {
    const projectIds = Array.from(this.projects.keys());
    const results: PortfolioAuditResult[] = [];

    console.log(
      `\n📊 Starting portfolio audit for ${projectIds.length} projects (${difficulty} difficulty)`
    );

    for (const projectId of projectIds) {
      try {
        console.log(`  Auditing ${projectId}...`);
        const result = await this.auditProject(projectId, difficulty);
        results.push(result);
        console.log(
          `  ✅ ${projectId}: ${result.compliancePercentage}% compliant (${result.passed}/${result.total_constraints})`
        );
      } catch (error) {
        console.error(`  ❌ ${projectId}: ${error}`);
      }
    }

    return this.generateSummary(results);
  }

  /**
   * Audit only critical constraints across all projects
   */
  async auditCriticalConstraints(): Promise<PortfolioAuditSummary> {
    return this.auditAll("easy"); // Easy checks are often critical
  }

  /**
   * Generate portfolio audit summary
   */
  private generateSummary(results: PortfolioAuditResult[]): PortfolioAuditSummary {
    const projectResults = results.map((r) => {
      const status: "pass" | "warning" | "fail" =
        r.compliancePercentage >= 90
          ? "pass"
          : r.compliancePercentage >= 75
            ? "warning"
            : "fail";
      return {
        projectId: r.projectId,
        projectName: r.projectName,
        totalConstraints: r.total_constraints,
        passed: r.passed,
        failed: r.failed,
        warnings: r.warnings,
        compliancePercentage: r.compliancePercentage,
        status
      };
    });

    const portfolioCompliance =
      projectResults.length > 0
        ? projectResults.reduce((sum, p) => sum + p.compliancePercentage, 0) /
          projectResults.length
        : 0;
    const aggregatedSlaStatus: "pass" | "warning" | "fail" =
      portfolioCompliance >= this.sla.minimumCompliance.portfolio * 100
        ? "pass"
        : "fail";

    const aggregated = {
      totalConstraints: projectResults.reduce((sum, p) => sum + p.totalConstraints, 0),
      totalPassed: projectResults.reduce((sum, p) => sum + p.passed, 0),
      totalFailed: projectResults.reduce((sum, p) => sum + p.failed, 0),
      totalWarnings: projectResults.reduce((sum, p) => sum + p.warnings, 0),
      portfolioCompliance,
      slaStatus: aggregatedSlaStatus
    };

    const criticalViolations: PortfolioAuditSummary["criticalViolations"] =
      [];
    results.forEach((r) => {
      r.violations?.forEach((v) => {
        if (v.severity === "critical") {
          criticalViolations.push({
            projectId: r.projectId,
            constraint: { id: v.constraint_id } as ConstraintCheck,
            violation: v
          });
        }
      });
    });

    // Sort by compliance for trending
    const complianceTrend = projectResults
      .sort((a, b) => a.compliancePercentage - b.compliancePercentage)
      .map(p => ({
        date: new Date(),
        compliance: p.compliancePercentage
      }));

    // Find common failures
    const failureMap = new Map<string, { count: number; projects: Set<string> }>();
    results.forEach(r => {
      r.violations?.forEach(v => {
        const key = v.constraint_id;
        if (!failureMap.has(key)) {
          failureMap.set(key, { count: 0, projects: new Set() });
        }
        const entry = failureMap.get(key)!;
        entry.count++;
        entry.projects.add(r.projectId);
      });
    });

    const commonFailures = Array.from(failureMap.entries())
      .map(([constraintId, data]) => ({
        constraintId,
        failureCount: data.count,
        affectedProjects: data.projects.size
      }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 10);

    return {
      timestamp: new Date(),
      totalProjects: projectResults.length,
      projectResults,
      aggregatedStats: aggregated,
      criticalViolations,
      trending: {
        complianceTrend,
        commonFailures
      }
    };
  }

  /**
   * Check SLA compliance
   */
  checkSLACompliance(summary: PortfolioAuditSummary): {
    overallStatus: "pass" | "fail";
    issues: string[];
  } {
    const issues: string[] = [];

    // Check per-project compliance
    summary.projectResults.forEach(p => {
      if (p.compliancePercentage < this.sla.minimumCompliance.perProject * 100) {
        issues.push(
          `${p.projectName}: ${p.compliancePercentage}% < ${this.sla.minimumCompliance.perProject * 100}% SLA`
        );
      }
    });

    // Check portfolio compliance
    if (summary.aggregatedStats.portfolioCompliance < this.sla.minimumCompliance.portfolio * 100) {
      issues.push(
        `Portfolio: ${summary.aggregatedStats.portfolioCompliance}% < ${this.sla.minimumCompliance.portfolio * 100}% SLA`
      );
    }

    // Check critical violations
    if (
      summary.criticalViolations.length > 0 &&
      this.sla.minimumCompliance.critical === 1.0
    ) {
      issues.push(`${summary.criticalViolations.length} critical violations found`);
    }

    return {
      overallStatus: issues.length === 0 ? "pass" : "fail",
      issues
    };
  }

  /**
   * Generate escalation actions for violations
   */
  generateEscalations(summary: PortfolioAuditSummary): EscalationAction[] {
    const escalations: EscalationAction[] = [];

    summary.criticalViolations.forEach((v, index) => {
      escalations.push({
        id: `esc-${Date.now()}-${index}`,
        violationId: `${v.violation.constraint_id}`,
        projectId: v.projectId,
        severity: "critical",
        level: 3,
        status: "open",
        createdAt: new Date(),
        action: `Block ${v.projectId} deployment until resolved`,
        notes: v.violation.remediation
      });
    });

    summary.projectResults
      .filter(p => p.compliancePercentage < this.sla.minimumCompliance.perProject * 100)
      .forEach((p, index) => {
        escalations.push({
          id: `esc-sla-${Date.now()}-${index}`,
          violationId: `sla-breach-${p.projectId}`,
          projectId: p.projectId,
          severity: "major",
          level: 2,
          status: "open",
          createdAt: new Date(),
          action: `Alert team: ${p.projectName} below SLA (${p.compliancePercentage}%)`,
          notes: `Project needs ${p.failed} constraint fixes to reach ${this.sla.minimumCompliance.perProject * 100}%`
        });
      });

    return escalations;
  }

  /**
   * Get portfolio health metrics
   */
  async getHealthMetrics(): Promise<PortfolioHealthMetrics> {
    const latestSummary = await this.repository.getPortfolioAuditHistory(1);
    const summary = latestSummary[0]?.summary;

    if (!summary) {
      return {
        timestamp: new Date(),
        overallCompliance: 0,
        complianceTrend: 0,
        projectsCompliant: 0,
        projectsWarning: 0,
        projectsFailing: 0,
        criticalViolations: 0,
        majorViolations: 0,
        minorViolations: 0,
        slaBreaches: 0,
        averageTimeToRemediate: 0,
        autoRepairSuccessRate: 0
      };
    }

    const compliant = summary.projectResults.filter(
      p => p.compliancePercentage >= this.sla.minimumCompliance.perProject * 100
    ).length;
    const warning = summary.projectResults.filter(
      p =>
        p.compliancePercentage < this.sla.minimumCompliance.perProject * 100 &&
        p.compliancePercentage >= 75
    ).length;
    const failing = summary.projectResults.filter(
      p => p.compliancePercentage < 75
    ).length;

    return {
      timestamp: new Date(),
      overallCompliance: summary.aggregatedStats.portfolioCompliance,
      complianceTrend: 0, // Would need historical data
      projectsCompliant: compliant,
      projectsWarning: warning,
      projectsFailing: failing,
      criticalViolations: summary.criticalViolations.length,
      majorViolations: 0, // Would need detailed tracking
      minorViolations: 0,
      slaBreaches: failing > 0 ? 1 : 0,
      averageTimeToRemediate: 0,
      autoRepairSuccessRate: 0
    };
  }

  /**
   * Save portfolio audit history
   */
  async saveAuditHistory(summary: PortfolioAuditSummary): Promise<void> {
    const entry: PortfolioAuditHistoryEntry = {
      auditId: `audit-${Date.now()}`,
      runId: `run-${Date.now()}`,
      timestamp: new Date(),
      auditType: "full",
      triggerSource: "scheduled",
      projectsAudited: summary.totalProjects,
      totalDuration: 0,
      summary,
      createdAt: new Date(),
      createdBy: "portfolio-orchestrator"
    };

    // Save to database would happen here
    // await this.repository.savePortfolioAuditHistory(entry);
  }
}

/**
 * Get default portfolio SLA
 */
export function getDefaultPortfolioSLA(): PortfolioSLA {
  return {
    minimumCompliance: {
      perProject: 0.9, // 90% per project
      portfolio: 0.95, // 95% overall
      critical: 1.0 // 100% (zero critical violations)
    },
    responseTime: {
      critical: "1 hour",
      major: "4 hours",
      minor: "24 hours"
    },
    escalation: {
      level1: "Auto-fix via repair engine",
      level2: "Alert engineering lead + Slack",
      level3: "Block PR/deployment if critical",
      level4: "Executive report if SLA breached"
    }
  };
}
