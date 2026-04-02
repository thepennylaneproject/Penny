import { NextResponse } from "next/server";
import { bullmqConnectionFromEnv, requirepennyAuditQueue } from "@/lib/redis-bullmq";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import { readRepairQueue, writeRepairQueue } from "@/lib/audit-reader";
import {
  listRecentRepairJobs,
} from "@/lib/maintenance-store";
import { 
  jobsStoreConfigured, 
  insertAuditJob, 
  listRecentAuditJobs,
  updateAuditJobStatus 
} from "@/lib/orchestration-jobs";
import { getRepository } from "@/lib/repository-instance";
import type { RepairJob } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";
import { normalizeProjectName } from "@/lib/project-identity";
import { invalidateRuntimeCache } from "@/lib/runtime-cache";

const STATUS_CACHE_KEYS = [
  "api:orchestration",
  "api:engine-status",
  "api:orchestration-jobs",
];

/**
 * GET    /api/engine/queue — return all jobs in the repair queue.
 * POST   /api/engine/queue — add a finding to the queue.
 * DELETE /api/engine/queue — remove a job from the queue by finding_id.
 */

export async function GET() {
  try {
    if (jobsStoreConfigured()) {
      const dbQueue = await listRecentRepairJobs(100);
      const auditJobs = await listRecentAuditJobs(100);
      const mappedAuditJobs = auditJobs
        .filter((j) => j.job_type === "repair_finding" && (j.status === "queued" || j.status === "running"))
        .map((j) => ({
          finding_id: j.payload?.finding_id as string | undefined ?? "",
          project_name: j.project_name ?? "",
        }));
      const combined = [...dbQueue, ...mappedAuditJobs];
      return NextResponse.json({ queue: combined, size: combined.length });
    }
    const queue = readRepairQueue();
    return NextResponse.json({ queue, size: queue.length });
  } catch (error) {
    console.error("GET /api/engine/queue", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const findingId =
      typeof body.finding_id === "string" ? body.finding_id.trim() : "";
    const projectName =
      typeof body.project_name === "string" ? body.project_name.trim() : "";
    const backlogId =
      typeof body.backlog_id === "string" ? body.backlog_id.trim() : undefined;
    const maintenanceTaskId =
      typeof body.maintenance_task_id === "string"
        ? body.maintenance_task_id.trim()
        : undefined;

    if (!findingId || !projectName) {
      return NextResponse.json(
        { error: "finding_id and project_name are required" },
        { status: 400 }
      );
    }

    if (jobsStoreConfigured()) {
      const repo = getRepository();
      const project = await repo.getByName(projectName);
      const finding = project?.findings.find((item) => item.finding_id === findingId);
      const payload = {
        finding_id: findingId,
        finding_title: finding?.title,
        repair_policy: finding?.repair_policy ?? {},
        targeted_files: finding?.suggested_fix?.affected_files ?? [],
        verification_commands:
          finding?.repair_policy?.verification_commands ??
          finding?.suggested_fix?.verification_commands ??
          [],
        rollback_notes:
          finding?.repair_policy?.rollback_notes ??
          finding?.suggested_fix?.rollback_notes,
        maintenance_task_id: maintenanceTaskId,
        backlog_id: backlogId,
        provenance: {
          finding_id: findingId,
          backlog_id: backlogId,
          task_id: maintenanceTaskId,
          manifest_revision: finding?.last_seen_revision,
          source_type: "finding",
        },
      };

      const row = await insertAuditJob("repair_finding", {
        project_name: projectName,
        payload,
      });

      const connection = bullmqConnectionFromEnv();
      if (connection) {
        const queue = requirepennyAuditQueue();
        try {
          await queue.add(
            "process",
            { dbJobId: row.id },
            { jobId: row.id, removeOnComplete: true, removeOnFail: false }
          );
        } catch (redisErr) {
          const msg = redisErr instanceof Error ? redisErr.message : String(redisErr);
          try {
            await updateAuditJobStatus(row.id, "failed", `Redis enqueue error: ${msg}`);
          } catch {}
          return NextResponse.json(
            { error: `Redis enqueue failed: ${msg}` },
            { status: 502 }
          );
        }
      }

      await recordDurableEventBestEffort({
        event_type: "repair_job_enqueued",
        project_name: projectName,
        source: "engine_api",
        summary: `Enqueued repair_finding job ${row.id} for finding ${findingId}`,
        payload: { job_id: row.id, finding_id: findingId, bullmq: connection != null },
      });

      invalidateRuntimeCache(...STATUS_CACHE_KEYS);

      return NextResponse.json({ job: row, added: true });
    }

    const queue = readRepairQueue();
    const existing = queue.find(
      (j) => j.finding_id === findingId && j.project_name === projectName
    );
    if (existing) {
      return NextResponse.json({ job: existing, added: false });
    }
    const job: RepairJob = {
      finding_id: findingId,
      project_name: projectName,
      queued_at: new Date().toISOString(),
      status: "queued",
      maintenance_task_id: maintenanceTaskId,
      backlog_id: backlogId,
    };
    queue.push(job);
    writeRepairQueue(queue);

    return NextResponse.json({ job, added: true });
  } catch (error) {
    console.error("POST /api/engine/queue", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const findingId =
      typeof body.finding_id === "string" ? body.finding_id.trim() : "";
    const projectName =
      typeof body.project_name === "string" ? body.project_name.trim() : "";
    const jobId =
      typeof body.id === "string" ? body.id.trim() : "";

    if (!findingId && !jobId) {
      return NextResponse.json(
        { error: "finding_id or id is required" },
        { status: 400 }
      );
    }

    if (jobsStoreConfigured()) {
      const { createPostgresPool } = await import("@/lib/postgres");
      const pool = createPostgresPool();

      // Cancel jobs that are queued or running (stuck). Completed/failed jobs
      // are left as-is to preserve the audit trail — they are already terminal.
      let rows: Record<string, unknown>[];
      if (jobId) {
        rows = await pool.query(
          `UPDATE penny_repair_jobs
              SET status      = 'cancelled',
                  error       = 'Cancelled by user',
                  finished_at = now()
            WHERE id = $1
              AND status IN ('queued', 'running')
            RETURNING id, finding_id, project_name, status`,
          [jobId]
        );
      } else if (projectName) {
        const projectNameKey = normalizeProjectName(projectName);
        rows = await pool.query(
          `UPDATE penny_repair_jobs
              SET status      = 'cancelled',
                  error       = 'Cancelled by user',
                  finished_at = now()
             WHERE finding_id   = $1
               AND lower(trim(project_name)) = $2
               AND status IN ('queued', 'running')
             RETURNING id, finding_id, project_name, status`,
          [findingId, projectNameKey]
        );
      } else {
        rows = await pool.query(
          `UPDATE penny_repair_jobs
              SET status      = 'cancelled',
                  error       = 'Cancelled by user',
                  finished_at = now()
            WHERE finding_id = $1
              AND status IN ('queued', 'running')
            RETURNING id, finding_id, project_name, status`,
          [findingId]
        );
      }

      invalidateRuntimeCache(...STATUS_CACHE_KEYS);
      return NextResponse.json({ removed: rows.length, cancelled: rows });
    }

    // JSON file store path
    const queue = readRepairQueue();
    let next: typeof queue;
    if (projectName) {
      next = queue.filter(
        (j) => !(j.finding_id === findingId && j.project_name === projectName)
      );
    } else {
      console.warn(
        `DELETE /api/engine/queue called without project_name for finding_id=${findingId}. ` +
          "Provide project_name to scope the removal correctly."
      );
      next = queue.filter((j) => j.finding_id !== findingId);
    }
    writeRepairQueue(next);

    invalidateRuntimeCache(...STATUS_CACHE_KEYS);
    return NextResponse.json({ removed: queue.length - next.length });
  } catch (error) {
    console.error("DELETE /api/engine/queue", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
