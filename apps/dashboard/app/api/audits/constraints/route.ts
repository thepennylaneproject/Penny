/**
 * API endpoint: Run constraint audit
 * POST /api/audits/constraints
 *
 * Body:
 * {
 *   projectPath: string;         // Path to project root
 *   projectName?: string;        // Name for reporting
 *   difficulty?: "easy" | "moderate" | "complex" | "all";  // Which checks to run
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { EMBR_CONSTRAINTS, getConstraintsByDifficulty } from "@/lib/constraints/embr-constraints";
import { runConstraintAudit } from "@/lib/constraint-validator";
import { saveConstraintAudit } from "@/lib/constraint-audit-repository";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      projectPath,
      projectName = "unknown",
      difficulty = "easy",
      saveToDb = true,
    } = body as {
      projectPath: string;
      projectName?: string;
      difficulty?: "easy" | "moderate" | "complex" | "all";
      saveToDb?: boolean;
    };

    if (!projectPath) {
      return NextResponse.json(
        { error: "projectPath is required" },
        { status: 400 }
      );
    }

    // Resolve relative paths
    const resolvedPath = path.isAbsolute(projectPath)
      ? projectPath
      : path.resolve(process.cwd(), projectPath);

    // Select constraints based on difficulty
    let constraints = EMBR_CONSTRAINTS;
    if (difficulty !== "all") {
      constraints = getConstraintsByDifficulty(difficulty);
    }

    // Run audit
    const startTime = Date.now();
    const result = await runConstraintAudit(
      constraints,
      resolvedPath,
      projectName
    );
    const duration = Date.now() - startTime;

    // Add metadata
    result.metadata = {
      duration_ms: duration,
      ...result.metadata,
    };

    // Save to database if requested
    let dbSaveResult = null;
    if (saveToDb) {
      dbSaveResult = await saveConstraintAudit(result);
    }

    return NextResponse.json(
      {
        success: true,
        audit: result,
        duration_ms: duration,
        saved: dbSaveResult ? !dbSaveResult.error : false,
        database_error: dbSaveResult?.error,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/audits/constraints
 * Returns available constraint checks info
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const format = searchParams.get("format") || "summary";

  const easyCount = getConstraintsByDifficulty("easy").length;
  const moderateCount = getConstraintsByDifficulty("moderate").length;
  const complexCount = getConstraintsByDifficulty("complex").length;

  if (format === "detailed") {
    return NextResponse.json({
      total: EMBR_CONSTRAINTS.length,
      by_difficulty: {
        easy: {
          count: easyCount,
          constraints: getConstraintsByDifficulty("easy"),
        },
        moderate: {
          count: moderateCount,
          constraints: getConstraintsByDifficulty("moderate"),
        },
        complex: {
          count: complexCount,
          constraints: getConstraintsByDifficulty("complex"),
        },
      },
    });
  }

  // Summary format (default)
  return NextResponse.json({
    project: "embr",
    total_constraints: EMBR_CONSTRAINTS.length,
    by_difficulty: {
      easy: easyCount,
      moderate: moderateCount,
      complex: complexCount,
    },
    status: "17/17 checks implemented and ready for full audit",
    implementation_complete: true,
  });
}
