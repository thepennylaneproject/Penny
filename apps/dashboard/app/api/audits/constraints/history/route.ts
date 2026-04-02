/**
 * API endpoint: Get constraint audit history
 * GET /api/audits/constraints/history?project=embr&limit=10
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getLatestConstraintAudit,
  getConstraintAuditHistory,
  getViolationsSummary,
} from "@/lib/constraint-audit-repository";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const project = searchParams.get("project");
    const limit = parseInt(searchParams.get("limit") || "10");
    const format = searchParams.get("format") || "summary";

    if (!project) {
      return NextResponse.json(
        { error: "project parameter is required" },
        { status: 400 }
      );
    }

    if (format === "latest") {
      // Get single latest audit
      const audit = await getLatestConstraintAudit(project);
      return NextResponse.json(
        {
          project,
          audit,
        },
        { status: 200 }
      );
    }

    if (format === "summary") {
      // Get summary statistics
      const latest = await getLatestConstraintAudit(project);
      const summary = await getViolationsSummary(project);

      return NextResponse.json(
        {
          project,
          latest_audit: latest
            ? {
                run_id: latest.run_id,
                timestamp: latest.timestamp,
                coverage: latest.coverage_percentage,
                passed: latest.passed,
                failed: latest.failed,
                warnings: latest.warnings,
              }
            : null,
          violations_summary: summary,
        },
        { status: 200 }
      );
    }

    // Default: get history
    const history = await getConstraintAuditHistory(project, limit);

    return NextResponse.json(
      {
        project,
        count: history.length,
        audits: history,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
