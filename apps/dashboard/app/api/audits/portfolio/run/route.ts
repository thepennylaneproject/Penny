/**
 * Portfolio Constraint Audit Run Endpoint
 * POST /api/audits/portfolio/run
 *
 * Runs constraint audits across all projects in the portfolio
 */

import { NextRequest, NextResponse } from "next/server";
import type { ConstraintCheck } from "@/lib/constraint-types";
import { ConstraintAuditRepository } from "@/lib/constraint-audit-repository";
import { PortfolioOrchestrator, getDefaultPortfolioSLA } from "@/lib/portfolio-orchestrator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const difficulty = body.difficulty || "all";
    const projectId = body.projectId; // Optional: audit specific project only

    // Initialize repository
    const repository = new ConstraintAuditRepository();

    // Initialize orchestrator with SLA
    const sla = getDefaultPortfolioSLA();
    const orchestrator = new PortfolioOrchestrator(sla, repository);

    // Run audits
    let summary;

    if (projectId) {
      // Audit single project
      const result = await orchestrator.auditProject(projectId, difficulty);
      const projectStatus: "pass" | "warning" | "fail" =
        result.compliancePercentage >= 90
          ? "pass"
          : result.compliancePercentage >= 75
            ? "warning"
            : "fail";
      const portfolioSlaStatus: "pass" | "warning" | "fail" =
        result.compliancePercentage >= 90 ? "pass" : "fail";
      summary = {
        timestamp: new Date(),
        totalProjects: 1,
        projectResults: [
          {
            projectId: result.projectId,
            projectName: result.projectName,
            totalConstraints: result.total_constraints,
            passed: result.passed,
            failed: result.failed,
            warnings: result.warnings,
            compliancePercentage: result.compliancePercentage,
            status: projectStatus
          }
        ],
        aggregatedStats: {
          totalConstraints: result.total_constraints,
          totalPassed: result.passed,
          totalFailed: result.failed,
          totalWarnings: result.warnings,
          portfolioCompliance: result.compliancePercentage,
          slaStatus: portfolioSlaStatus
        },
        criticalViolations: (
          result.violations?.filter((v) => v.severity === "critical") ?? []
        ).map((v) => ({
          projectId: result.projectId,
          constraint: { id: v.constraint_id } as unknown as ConstraintCheck,
          violation: v
        })),
        trending: {
          complianceTrend: [],
          commonFailures: []
        }
      };
    } else {
      // Audit all projects
      summary = await orchestrator.auditAll(difficulty);
    }

    // Check SLA compliance
    const slaCheck = orchestrator.checkSLACompliance(summary);

    // Generate escalations if needed
    const escalations = orchestrator.generateEscalations(summary);

    // Save audit history
    await orchestrator.saveAuditHistory(summary);

    return NextResponse.json(
      {
        success: true,
        summary,
        slaCheck,
        escalations,
        audit: {
          projectsAudited: summary.totalProjects,
          totalConstraints: summary.aggregatedStats.totalConstraints,
          passed: summary.aggregatedStats.totalPassed,
          failed: summary.aggregatedStats.totalFailed,
          compliancePercentage: summary.aggregatedStats.portfolioCompliance,
          duration: Date.now()
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Portfolio audit error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to run portfolio audit"
      },
      { status: 500 }
    );
  }
}
