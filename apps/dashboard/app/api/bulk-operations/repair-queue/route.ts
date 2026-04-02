import { NextResponse } from "next/server";
import { createPostgresPool } from "@/lib/postgres";
import { apiErrorMessage, isValidProjectName, parseJsonBody } from "@/lib/api-error";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import { insertAuditJob, updateAuditJobStatus } from "@/lib/orchestration-jobs";
import { normalizeProjectName } from "@/lib/project-identity";
import { bullmqConnectionFromEnv, requirepennyAuditQueue } from "@/lib/redis-bullmq";
import { invalidateRuntimeCache } from "@/lib/runtime-cache";

const STATUS_CACHE_KEYS = [
  "api:orchestration",
  "api:engine-status",
  "api:orchestration-jobs",
];

/**
 * POST /api/bulk-operations/repair-queue
 *
 * Bulk move findings to the repair queue. This operation:
 * 1. Takes a list of finding IDs and a project name
 * 2. Upserts them into penny_maintenance_backlog with next_action='queue_repair'
 * 3. Returns count of successfully queued items
 *
 * Finding metadata (title, severity, etc.) is loaded via a direct JSONB query
 * against penny_projects so the result is consistent with what is actually in the
 * database, regardless of which repository store (Postgres vs JSON file) is active.
 * Findings not found in the project are still queued with placeholder data — the
 * worker's next audit run will enrich them via upsertMaintenanceBacklogFromFindings.
 *
 * Request body:
 *   {
 *     "project_name": "ProjectName" (required),
 *     "finding_ids": ["id1", "id2", ...] (required),
 *     "priority": "normal" | "high" | "low" (optional; mapped to P2/P1/P3)
 *   }
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      project_name?: string;
      finding_ids?: string[];
      priority?: string;
    }>(request);

    const projectName = body.project_name
      ? String(body.project_name).trim()
      : null;
    const findingIds = Array.isArray(body.finding_ids)
      ? body.finding_ids.map(String).filter(Boolean)
      : [];
    const priorityInput = body.priority
      ? String(body.priority).toLowerCase().trim()
      : "normal";

    if (!projectName || !isValidProjectName(projectName)) {
      return NextResponse.json(
        { error: "project_name is required and must be alphanumeric with underscore/hyphen" },
        { status: 400 }
      );
    }

    if (findingIds.length === 0) {
      return NextResponse.json(
        { error: "finding_ids array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (!["normal", "high", "low"].includes(priorityInput)) {
      return NextResponse.json(
        { error: "priority must be one of: normal, high, low" },
        { status: 400 }
      );
    }

    const priorityMap: Record<string, string> = { high: "P1", normal: "P2", low: "P3" };
    const dbPriority = priorityMap[priorityInput] ?? "P2";
    const projectNameKey = normalizeProjectName(projectName);

    const pool = createPostgresPool();

    // Fetch metadata for the requested finding IDs directly from the project JSONB.
    // This is always consistent with the DB regardless of which repository layer is active.
    const metaRows = await pool.query(
      `SELECT
         f->>'finding_id'  AS finding_id,
         f->>'title'       AS title,
         f->>'description' AS description,
         f->>'severity'    AS severity,
         f->'repair_policy' AS repair_policy
        FROM penny_projects,
             jsonb_array_elements(COALESCE(project_json->'findings', '[]'::jsonb)) AS f
       WHERE lower(trim(name)) = $1
          AND f->>'finding_id' = ANY($2::text[])`,
      [projectNameKey, findingIds]
    );

    // Index the enrichment data by finding_id
    const metaMap = new Map<string, Record<string, unknown>>();
    for (const row of metaRows) {
      const fid = String(row.finding_id ?? "").trim();
      if (fid) metaMap.set(fid, row as Record<string, unknown>);
    }



    // Upsert one backlog item per requested finding. If metadata isn't available
    // (project not yet in DB, or finding was recently added), use placeholder values —
    // the next audit run will update them via upsertMaintenanceBacklogFromFindings.
    let queuedCount = 0;
    const failedIds: string[] = [];
    const connection = bullmqConnectionFromEnv();
    const queue = connection ? requirepennyAuditQueue() : null;

    for (const fid of findingIds) {
      const meta = metaMap.get(fid);
      const title = meta ? String(meta.title ?? fid).trim() : fid;

      try {
        const payload = {
          finding_id: fid,
          finding_title: title,
          repair_policy: meta && typeof meta.repair_policy === "object" ? meta.repair_policy : {},
          provenance: {
            finding_id: fid,
            source_type: "finding",
          },
        };

        const row = await insertAuditJob("repair_finding", {
          project_name: projectName,
          payload,
        });

        if (queue) {
          try {
            await queue.add(
              "process",
              { dbJobId: row.id },
              { jobId: row.id, removeOnComplete: true, removeOnFail: false }
            );
          } catch (redisErr) {
            const msg = redisErr instanceof Error ? redisErr.message : String(redisErr);
            console.error(`[bulk-repair] Redis enqueue failed for ${row.id}:`, msg);
            await updateAuditJobStatus(row.id, "failed", `Redis enqueue error: ${msg}`);
            // Count as failure if Redis fails.
            throw new Error(`Redis enqueue failed: ${msg}`);
          }
        }
        queuedCount++;
      } catch (err) {
        console.error(`[bulk-repair-queue] Failed to enqueue job for ${fid}:`, err);
        failedIds.push(fid);
      }
    }

    const skippedCount = failedIds.length;
    const enrichedCount = metaMap.size;

    await recordDurableEventBestEffort({
      event_type: "bulk_operation_repair_queue",
      project_name: projectName,
      source: "bulk_operations_api",
      summary: `Queued ${queuedCount} finding(s) for repair (${skippedCount} failed)`,
      payload: {
        project_name: projectName,
        queued_count: queuedCount,
        skipped_count: skippedCount,
        enriched_count: enrichedCount,
        priority: dbPriority,
        total_requested: findingIds.length,
        failed_ids: failedIds,
      },
    });

    invalidateRuntimeCache(...STATUS_CACHE_KEYS);

    const enrichmentNote =
      enrichedCount < queuedCount
        ? ` ${queuedCount - enrichedCount} queued with placeholder data (finding metadata not yet in DB).`
        : "";

    return NextResponse.json({
      ok: true,
      queued_count: queuedCount,
      skipped_count: skippedCount,
      project_name: projectName,
      message:
        queuedCount > 0
          ? `Queued ${queuedCount} finding(s) for repair.${enrichmentNote}${skippedCount > 0 ? ` ${skippedCount} failed to write.` : ""}`
          : `No findings queued — all ${findingIds.length} insert(s) failed. Check server logs.`,
    });
  } catch (error) {
    console.error("POST /api/bulk-operations/repair-queue", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
