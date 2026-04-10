import { NextResponse } from "next/server";
import {
  jobsStoreConfigured,
  resolveEngineStatus,
} from "@/lib/orchestration-jobs";
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
        const base = await resolveEngineStatus();
        if (jobsStoreConfigured()) {
          const oldest_queued_job_age_ms = base.queued_findings
            .filter((job) => job.status === "queued")
            .map((job) => {
              const queuedAt = Date.parse(job.queued_at);
              return Number.isFinite(queuedAt) ? Math.max(0, Date.now() - queuedAt) : 0;
            })
            .reduce((max, age) => Math.max(max, age), 0);
          return {
            ...base,
            oldest_queued_job_age_ms,
            runtime_cache: getRuntimeCacheStats(),
          };
        }
        return {
          ...base,
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
