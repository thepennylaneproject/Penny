import { NextResponse } from "next/server";
import { createPostgresPool } from "@/lib/postgres";
import { getRepository } from "@/lib/repository-instance";
import { jobsStoreConfigured } from "@/lib/orchestration-jobs";
import { apiErrorMessage } from "@/lib/api-error";

/**
 * POST /api/engine/dequeue
 *
 * Called by the Python repair engine to atomically claim the next queued repair
 * job and mark it as running. Returns the job record together with the full
 * finding payload so the engine can begin work immediately without needing
 * access to the local findings JSON file.
 *
 * Response (job available):
 * {
 *   job: RepairJob,
 *   finding: { ... full finding object ... } | null
 * }
 *
 * Response (nothing queued):
 * { job: null, finding: null }
 */
export async function POST() {
  try {
    if (!jobsStoreConfigured()) {
      return NextResponse.json(
        { error: "Postgres job store is not configured; dequeue requires DATABASE_URL" },
        { status: 503 }
      );
    }

    // Pick the oldest queued job atomically using a CTE so only one worker
    // claims it even under concurrent load.
    const pool = createPostgresPool();
    const claimRows = await pool.query(
      `WITH next AS (
         SELECT id
           FROM penny_repair_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE penny_repair_jobs j
          SET status = 'running',
              payload = j.payload || jsonb_build_object('started_at', now()::text)
         FROM next
        WHERE j.id = next.id
        RETURNING j.*`
    );

    if (!claimRows[0]) {
      return NextResponse.json({ job: null, finding: null });
    }

    const row = claimRows[0];
    const findingId = String(row.finding_id ?? "");
    const projectName = String(row.project_name ?? "");

    // Build the RepairJob shape expected by the engine client
    const job = {
      id: row.id != null ? String(row.id) : undefined,
      finding_id: findingId,
      project_name: projectName,
      queued_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      status: "running" as const,
      targeted_files: Array.isArray(row.targeted_files)
        ? (row.targeted_files as string[])
        : [],
      verification_commands: Array.isArray(row.verification_commands)
        ? (row.verification_commands as string[])
        : [],
      rollback_notes:
        row.rollback_notes != null ? String(row.rollback_notes) : undefined,
      repair_policy:
        typeof row.repair_policy === "object" && row.repair_policy != null
          ? (row.repair_policy as Record<string, unknown>)
          : {},
      maintenance_task_id:
        row.maintenance_task_id != null
          ? String(row.maintenance_task_id)
          : undefined,
      backlog_id: row.backlog_id != null ? String(row.backlog_id) : undefined,
      provenance:
        typeof row.provenance === "object" && row.provenance != null
          ? (row.provenance as Record<string, unknown>)
          : {},
    };

    // Fetch full finding data from the repository so the engine has everything
    // it needs (proof_hooks, suggested_fix, history, repair_policy, etc.)
    let finding: Record<string, unknown> | null = null;
    try {
      const repo = getRepository();
      const project = await repo.getByName(projectName);
      if (project) {
        const found = project.findings.find((f) => f.finding_id === findingId);
        if (found) {
          finding = found as unknown as Record<string, unknown>;
        }
      }
    } catch {
      // Non-fatal: engine can still attempt repair with whatever it has locally
    }

    return NextResponse.json({ job, finding });
  } catch (error) {
    console.error("POST /api/engine/dequeue", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
