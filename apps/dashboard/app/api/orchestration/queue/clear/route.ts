import { NextResponse } from "next/server";
import { bullmqConnectionFromEnv, requirepennyAuditQueue } from "@/lib/redis-bullmq";
import { failAllQueuedJobs, jobsStoreConfigured } from "@/lib/orchestration-jobs";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import { apiErrorMessage } from "@/lib/api-error";
import { invalidateRuntimeCache } from "@/lib/runtime-cache";

const CANCEL_MSG =
  "Cancelled: queue cleared from dashboard (BullMQ + DB queued rows).";
const STATUS_CACHE_KEYS = [
  "api:orchestration",
  "api:engine-status",
  "api:orchestration-jobs",
];

/**
 * POST — obliterate BullMQ `penny-audit` (if Redis configured) and mark all DB
 * `queued` jobs as failed. Auth is handled centrally by middleware.
 */
export async function POST(request: Request) {
  if (!jobsStoreConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL required for orchestration jobs" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const skipRedis = body.skip_redis === true;

    let bullmqCleared = false;
    let bullmqError: string | null = null;

    const connection = bullmqConnectionFromEnv();
    if (connection && !skipRedis) {
      const queue = requirepennyAuditQueue();
      try {
        await queue.obliterate({ force: true });
        bullmqCleared = true;
      } catch (error) {
        bullmqError =
          error instanceof Error ? error.message : String(error);
        console.warn("[orchestration/queue/clear] BullMQ obliterate failed:", bullmqError);
      }
    }

    const dbCancelled = await failAllQueuedJobs(CANCEL_MSG);

    await recordDurableEventBestEffort({
      event_type: "orchestration_queue_cleared",
      project_name: null,
      source: "orchestration_api",
      summary: `Cleared orchestration queue (${dbCancelled} DB jobs cancelled${bullmqCleared ? ", BullMQ obliterated" : ""})`,
      payload: {
        db_queued_marked_failed: dbCancelled,
        bullmq_obliterated: bullmqCleared,
        bullmq_error: bullmqError,
      },
    });

    invalidateRuntimeCache(...STATUS_CACHE_KEYS);

    return NextResponse.json({
      ok: true,
      db_queued_marked_failed: dbCancelled,
      bullmq_obliterated: bullmqCleared,
      bullmq_error: bullmqError,
    });
  } catch (error) {
    console.error("POST /api/orchestration/queue/clear", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
