import { NextResponse } from "next/server";
import { createPostgresPool } from "@/lib/postgres";
import { apiErrorMessage, isValidProjectName, parseJsonBody } from "@/lib/api-error";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import { normalizeProjectName } from "@/lib/project-identity";

/**
 * POST /api/bulk-operations/clear-jobs
 *
 * Delete pending (queued/running) or completed audit jobs for a specific project.
 *
 * Request body:
 *   {
 *     "project_name": "ProjectName" (optional; if omitted, clears all projects),
 *     "status_filter": "queued" | "running" | "completed" | "failed" (optional; default: all)
 *   }
 *
 * Response:
 *   {
 *     "ok": true,
 *     "jobs_deleted": N,
 *     "project_name": "ProjectName" or null,
 *     "status_filter": "queued" or null
 *   }
 *
 * Auth: Required (handled by middleware)
 * Safety: Deleting running jobs is allowed but not recommended (use with caution)
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      project_name?: string;
      status_filter?: string;
    }>(request);

    const projectName = body.project_name
      ? String(body.project_name).trim()
      : null;
    const statusFilter = body.status_filter
      ? String(body.status_filter).toLowerCase().trim()
      : null;

    // Validate inputs.
    if (projectName && !isValidProjectName(projectName)) {
      return NextResponse.json(
        { error: "Invalid project name format" },
        { status: 400 }
      );
    }

    const validStatuses = ["queued", "running", "completed", "failed"];
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      return NextResponse.json(
        {
          error: `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const pool = createPostgresPool();
    let query = "DELETE FROM penny_audit_jobs WHERE 1=1";
    const params: unknown[] = [];
    let paramCount = 0;

    if (projectName) {
      paramCount++;
      query += ` AND LOWER(TRIM(project_name)) = $${paramCount}`;
      params.push(normalizeProjectName(projectName));
    }

    if (statusFilter) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(statusFilter);
    }

    query += " RETURNING id";

    const result = await pool.query(query, params);
    const jobsDeleted = result.length;

    await recordDurableEventBestEffort({
      event_type: "bulk_operation_clear_jobs",
      project_name: projectName,
      source: "bulk_operations_api",
      summary: `Cleared ${jobsDeleted} jobs${
        statusFilter ? ` with status=${statusFilter}` : ""
      }${projectName ? ` for project ${projectName}` : " across all projects"}`,
      payload: {
        jobs_deleted: jobsDeleted,
        project_name: projectName,
        status_filter: statusFilter,
      },
    });

    return NextResponse.json({
      ok: true,
      jobs_deleted: jobsDeleted,
      project_name: projectName,
      status_filter: statusFilter,
    });
  } catch (error) {
    console.error("POST /api/bulk-operations/clear-jobs", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
