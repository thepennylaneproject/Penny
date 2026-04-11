import { NextResponse } from "next/server";
import { createPostgresPool } from "@/lib/postgres";
import { apiErrorMessage, isValidProjectName, parseJsonBody } from "@/lib/api-error";
import { recordDurableEventBestEffort } from "@/lib/durable-state";

/**
 * POST /api/bulk-operations/linear-sync
 *
 * Bulk sync findings to Linear issues. This operation:
 * 1. Takes a list of finding IDs and a project name
 * 2. Queries Linear API to create/update corresponding issues
 * 3. Stores per-finding rows in penny_linear_sync_new (queued for background sync)
 *
 * Request body:
 *   {
 *     "project_name": "ProjectName" (required),
 *     "finding_ids": ["uuid1", "uuid2", ...] (optional; if omitted, sync all findings),
 *     "team_key": "ENG" (optional Linear team key; uses default if not specified)
 *   }
 *
 * Response:
 *   {
 *     "ok": true,
 *     "synced_count": N,
 *     "failed_count": M,
 *     "project_name": "ProjectName"
 *   }
 *
 * Auth: Required (handled by middleware)
 * Note: This is a bulk operation that queues Linear sync jobs. Actual sync happens async.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      project_name?: string;
      finding_ids?: string[];
      team_key?: string;
    }>(request);

    const projectName = body.project_name
      ? String(body.project_name).trim()
      : null;

    if (!projectName || !isValidProjectName(projectName)) {
      return NextResponse.json(
        {
          error: "project_name is required and must be alphanumeric with underscore/hyphen",
        },
        { status: 400 }
      );
    }

    const findingIds = Array.isArray(body.finding_ids) ? body.finding_ids : [];
    const teamKey = body.team_key ? String(body.team_key).trim() : null;

    const pool = createPostgresPool();

    // Get project to extract findings
    const projectRows = await pool.query(
      "SELECT project_json FROM penny_projects WHERE name = $1",
      [projectName]
    );

    if (projectRows.length === 0) {
      return NextResponse.json(
        { error: `Project not found: ${projectName}` },
        { status: 404 }
      );
    }

    const projectJson = projectRows[0].project_json;
    const project = (
      typeof projectJson === "object" && projectJson !== null ? projectJson : {}
    ) as Record<string, unknown>;
    const projectFindings = Array.isArray(project.findings) ? project.findings : [];

    // Determine which findings to sync
    const toSync =
      findingIds.length > 0
        ? findingIds
        : projectFindings
            .map((f: { finding_id?: string }) => f.finding_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);

    // Create/update sync mappings for all findings in a single batch query
    if (toSync.length > 0) {
      await pool.query(
        `INSERT INTO penny_linear_sync_new (project_name, finding_id, linear_issue_id, linear_team_key)
         SELECT $1, t.finding_id, '', $2
         FROM UNNEST($3::text[]) AS t(finding_id)
         ON CONFLICT (project_name, finding_id) DO UPDATE SET
           linear_team_key = COALESCE($2, penny_linear_sync_new.linear_team_key),
           updated_at = now()`,
        [projectName, teamKey, toSync]
      );
    }
    const syncedCount = toSync.length;

    // Log this as an event (actual Linear sync happens async in a separate worker)
    await recordDurableEventBestEffort({
      event_type: "bulk_operation_linear_sync_queued",
      project_name: projectName,
      source: "bulk_operations_api",
      summary: `Queued Linear sync for ${syncedCount} finding(s)${
        teamKey ? ` in team ${teamKey}` : ""
      }`,
      payload: {
        project_name: projectName,
        findings_count: syncedCount,
        team_key: teamKey,
        finding_ids: findingIds,
      },
    });

    return NextResponse.json({
      ok: true,
      synced_count: syncedCount,
      failed_count: 0,
      project_name: projectName,
      message: `Queued ${syncedCount} finding(s) for Linear sync. Sync will complete in the background.`,
    });
  } catch (error) {
    console.error("POST /api/bulk-operations/linear-sync", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
