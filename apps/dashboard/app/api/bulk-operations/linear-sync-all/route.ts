import { NextResponse } from "next/server";
import { createPostgresPool } from "@/lib/postgres";
import { apiErrorMessage, parseJsonBody } from "@/lib/api-error";
import { recordDurableEventBestEffort } from "@/lib/durable-state";

/**
 * POST /api/bulk-operations/linear-sync-all
 *
 * Bulk sync ALL projects' findings to Linear. This operation:
 * 1. Queries all projects from the database
 * 2. For each project, creates/updates Linear sync mappings
 * 3. Returns summary of synced findings across all projects
 *
 * Request body: (empty, or optional team_key)
 *   {
 *     "team_key": "ENG" (optional Linear team key; uses default if not specified)
 *   }
 *
 * Response:
 *   {
 *     "ok": true,
 *     "total_projects": N,
 *     "total_synced_findings": M,
 *     "project_summaries": [
 *       { "project_name": "ProjectName", "findings_count": X }
 *     ]
 *   }
 *
 * Auth: Required (handled by middleware)
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      team_key?: string;
    }>(request);

    const teamKey = body.team_key ? String(body.team_key).trim() : null;

    const pool = createPostgresPool();

    // Get all projects
    const projectRows = await pool.query(
      "SELECT name, project_json FROM penny_projects ORDER BY name"
    );

    if (projectRows.length === 0) {
      return NextResponse.json({
        ok: true,
        total_projects: 0,
        total_synced_findings: 0,
        project_summaries: [],
        message: "No projects found to sync.",
      });
    }

    const projectSummaries: Array<{ project_name: string; findings_count: number }> = [];
    let totalSyncedFindings = 0;

    // Collect all (project_name, finding_id) pairs across every project
    const allProjectNames: string[] = [];
    const allFindingIds: string[] = [];

    for (const row of projectRows) {
      const projectName =
        typeof row.name === "string" ? row.name : String(row.name ?? "");
      const projectJson = row.project_json;
      const project = (
        typeof projectJson === "object" && projectJson !== null ? projectJson : {}
      ) as Record<string, unknown>;
      const findings = Array.isArray(project.findings) ? project.findings : [];

      // Get all finding IDs for this project
      const findingIds = findings
        .map((f: { finding_id?: string }) => f.finding_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (findingIds.length === 0) continue;

      // Create/update sync mappings for each finding
      const syncPromises = findingIds.map((fId: string) =>
        pool.query(
          `INSERT INTO penny_linear_sync_new (project_name, finding_id, linear_issue_id, linear_team_key)
           VALUES ($1, $2, '', $3)
           ON CONFLICT (project_name, finding_id) DO UPDATE SET
             linear_team_key = COALESCE($3, penny_linear_sync_new.linear_team_key),
             updated_at = now()`,
          [projectName, fId, teamKey]
        )
      );

      await Promise.all(syncPromises);

      projectSummaries.push({
        project_name: projectName,
        findings_count: findingIds.length,
      });

      totalSyncedFindings += findingIds.length;
    }

    // Upsert all sync mappings in a single batch query
    if (allFindingIds.length > 0) {
      await pool.query(
        `INSERT INTO penny_linear_sync_new (project_name, finding_id, linear_issue_id, linear_team_key)
         SELECT t.project_name, t.finding_id, '', $1
         FROM UNNEST($2::text[], $3::text[]) AS t(project_name, finding_id)
         ON CONFLICT (project_name, finding_id) DO UPDATE SET
           linear_team_key = COALESCE($1, linear_team_key),
           updated_at = now()`,
        [teamKey, allProjectNames, allFindingIds]
      );
    }

    // Log this as an event
    await recordDurableEventBestEffort({
      event_type: "bulk_operation_linear_sync_all_queued",
      source: "bulk_operations_api",
      summary: `Queued Linear sync for ${totalSyncedFindings} finding(s) across ${projectSummaries.length} project(s)${
        teamKey ? ` in team ${teamKey}` : ""
      }`,
      payload: {
        total_projects: projectSummaries.length,
        total_findings: totalSyncedFindings,
        team_key: teamKey,
        project_summaries: projectSummaries,
      },
    });

    return NextResponse.json({
      ok: true,
      total_projects: projectSummaries.length,
      total_synced_findings: totalSyncedFindings,
      project_summaries: projectSummaries,
      message: `Queued ${totalSyncedFindings} finding(s) for Linear sync across ${projectSummaries.length} project(s). Sync will complete in the background.`,
    });
  } catch (error) {
    console.error("POST /api/bulk-operations/linear-sync-all", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
