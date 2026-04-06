import { NextResponse } from "next/server";
import { jobsStoreConfigured } from "@/lib/orchestration-jobs";

const STALE_RUNNING_THRESHOLD_MINUTES = 15;

/** Public liveness for load balancers / deploy checks (no auth). */
export async function GET() {
  const checks: Record<string, unknown> = {
    ok: true,
    service: "penny-dashboard",
  };

  // If the jobs DB is configured, run a stale-job watchdog.
  // Jobs stuck in "running" for >15 minutes are likely orphaned (worker crashed).
  // Mark them failed so the UI doesn't show indefinite in-progress states.
  if (jobsStoreConfigured()) {
    try {
      const { createPostgresPool } = await import("@/lib/postgres");
      const pool = createPostgresPool();
      const recovered = await pool.query(
        `UPDATE penny_audit_jobs
            SET status      = 'failed',
                error       = 'Job timed out — worker did not report completion within ${STALE_RUNNING_THRESHOLD_MINUTES} minutes.',
                finished_at = now()
          WHERE status = 'running'
            AND started_at < now() - interval '${STALE_RUNNING_THRESHOLD_MINUTES} minutes'
          RETURNING id`
      );
      checks.stale_jobs_recovered = recovered.length;
    } catch {
      // Non-fatal — health check still passes; watchdog failure is logged separately.
      checks.stale_jobs_recovered = null;
    }
  }

  return NextResponse.json(checks, { status: 200 });
}
