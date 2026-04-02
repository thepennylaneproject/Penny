import { NextResponse } from "next/server";
import { getEngineStatus } from "@/lib/audit-reader";
import {
  countActiveAuditJobs,
  jobsStoreConfigured,
  listRecentAuditRuns,
} from "@/lib/orchestration-jobs";
import { listRecentRepairJobs } from "@/lib/maintenance-store";
import { apiErrorMessage } from "@/lib/api-error";
import { getOrSetRuntimeCache, getRuntimeCacheStats } from "@/lib/runtime-cache";

const ENGINE_STATUS_CACHE_KEY = "api:engine-status";
const ENGINE_STATUS_CACHE_TTL_MS = 10_000;

/**
 * GET /api/engine/status — return current engine status.
 *
 * Reads from:
 *   - audits/index.json (audit run history)
 *   - audits/runs/*.json (audit run detail files)
 *   - audits/repair_queue.json (pending repair jobs)
 *   - audits/repair_runs/{run_id}/cost_summary.json (repair cost data)
 */
export async function GET() {
  try {
    const payload = await getOrSetRuntimeCache(
      ENGINE_STATUS_CACHE_KEY,
      ENGINE_STATUS_CACHE_TTL_MS,
      async () => {
        if (jobsStoreConfigured()) {
          const [runs, repairJobs, activeAuditJobs] = await Promise.all([
            listRecentAuditRuns(100),
            listRecentRepairJobs(100),
            countActiveAuditJobs(),
          ]);
          return {
            last_audit_date: runs[0]?.created_at ?? null,
            audit_run_count: runs.length,
            repair_run_count: repairJobs.filter((job) => job.status === "completed").length,
            total_cost_usd: repairJobs.reduce((sum, job) => sum + (job.cost_usd ?? 0), 0),
            queue_size: repairJobs.filter((job) => job.status === "queued").length,
            oldest_queued_job_age_ms: repairJobs
              .filter((job) => job.status === "queued")
              .map((job) => {
                const queuedAt = Date.parse(job.queued_at);
                return Number.isFinite(queuedAt) ? Math.max(0, Date.now() - queuedAt) : 0;
              })
              .reduce((max, age) => Math.max(max, age), 0),
            queued_findings: repairJobs,
            recent_repair_runs: repairJobs.filter((job) => job.status === "completed").slice(0, 5),
            active_audit_jobs: activeAuditJobs,
            runtime_cache: getRuntimeCacheStats(),
          };
        }
        return {
          ...getEngineStatus(),
          runtime_cache: getRuntimeCacheStats(),
        };
      }
    );
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/engine/status", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
