import { NextResponse } from "next/server";
import { createPostgresPool } from "@/lib/postgres";
import { apiErrorMessage, isValidProjectName, parseJsonBody } from "@/lib/api-error";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import { normalizeProjectName } from "@/lib/project-identity";

/**
 * POST /api/bulk-operations/clear-runs
 *
 * Delete all completed audit runs for a specific project (or all projects if not specified).
 * This is useful for clearing out old audit history to start fresh.
 *
 * Request body:
 *   {
 *     "project_name": "ProjectName" (optional; if omitted, clears all projects)
 *   }
 *
 * Response:
 *   {
 *     "ok": true,
 *     "runs_deleted": N,
 *     "project_name": "ProjectName" or null
 *   }
 *
 * Auth: Required (handled by middleware)
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      project_name?: string;
    }>(request);

    const projectName = body.project_name
      ? String(body.project_name).trim()
      : null;

    if (projectName && !isValidProjectName(projectName)) {
      return NextResponse.json(
        { error: "Invalid project name format" },
        { status: 400 }
      );
    }

    const pool = createPostgresPool();
    let query = "DELETE FROM penny_audit_runs";
    const params: unknown[] = [];

    if (projectName) {
      query += " WHERE LOWER(TRIM(project_name)) = $1";
      params.push(normalizeProjectName(projectName));
    }

    query += " RETURNING id";

    const result = await pool.query(query, params);
    const runsDeleted = result.length;

    await recordDurableEventBestEffort({
      event_type: "bulk_operation_clear_runs",
      project_name: projectName,
      source: "bulk_operations_api",
      summary: `Cleared ${runsDeleted} audit runs${
        projectName ? ` for project ${projectName}` : " across all projects"
      }`,
      payload: {
        runs_deleted: runsDeleted,
        project_name: projectName,
      },
    });

    return NextResponse.json({
      ok: true,
      runs_deleted: runsDeleted,
      project_name: projectName,
    });
  } catch (error) {
    console.error("POST /api/bulk-operations/clear-runs", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
