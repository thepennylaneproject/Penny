/**
 * Portfolio Constraint Audit Summary Endpoint
 * GET /api/audits/portfolio/summary
 *
 * Returns the latest portfolio audit summary with all projects' constraint status
 */

import { NextResponse } from "next/server";
import { ConstraintAuditRepository } from "@/lib/constraint-audit-repository";
import { PortfolioOrchestrator, getDefaultPortfolioSLA } from "@/lib/portfolio-orchestrator";

export async function GET() {
  try {
    // Initialize repository
    const repository = new ConstraintAuditRepository();

    // Initialize orchestrator with SLA
    const sla = getDefaultPortfolioSLA();
    const orchestrator = new PortfolioOrchestrator(sla, repository);

    // Get latest audits for all projects
    const projects = orchestrator.getProjects();
    const results = [];

    for (const project of projects) {
      try {
        const latestAudit = await repository.getLatestConstraintAudit(project.id);
        if (latestAudit) {
          const rowStatus: "pass" | "warning" | "fail" =
            latestAudit.coverage_percentage >= 90
              ? "pass"
              : latestAudit.coverage_percentage >= 75
                ? "warning"
                : "fail";
          results.push({
            projectId: project.id,
            projectName: project.name,
            totalConstraints: latestAudit.total_constraints,
            passed: latestAudit.passed,
            failed: latestAudit.failed,
            warnings: latestAudit.warnings,
            compliancePercentage: latestAudit.coverage_percentage,
            status: rowStatus
          });
        }
      } catch (error) {
        console.error(`Failed to get audit for project ${project.id}:`, error);
      }
    }

    // Generate summary from results
    const portfolioCompliance =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.compliancePercentage, 0) /
          results.length
        : 0;
    const summarySlaStatus: "pass" | "warning" | "fail" =
      portfolioCompliance >= sla.minimumCompliance.portfolio * 100
        ? "pass"
        : "fail";

    const summary = {
      timestamp: new Date(),
      totalProjects: results.length,
      projectResults: results,
      aggregatedStats: {
        totalConstraints: results.reduce((sum, r) => sum + r.totalConstraints, 0),
        totalPassed: results.reduce((sum, r) => sum + r.passed, 0),
        totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
        totalWarnings: results.reduce((sum, r) => sum + r.warnings, 0),
        portfolioCompliance,
        slaStatus: summarySlaStatus
      },
      criticalViolations: [],
      trending: {
        complianceTrend: [],
        commonFailures: []
      }
    };

    // Get health metrics
    const healthMetrics = await orchestrator.getHealthMetrics();

    // Get escalation actions
    const escalations = orchestrator.generateEscalations(summary);

    return NextResponse.json(
      {
        success: true,
        summary,
        metrics: healthMetrics,
        escalations,
        sla
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Portfolio summary error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get portfolio summary"
      },
      { status: 500 }
    );
  }
}
