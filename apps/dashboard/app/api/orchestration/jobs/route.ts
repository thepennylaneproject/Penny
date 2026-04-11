import { NextResponse } from "next/server";
import {
  cancelAuditJob,
  insertAuditJob,
  jobsStoreConfigured,
  listRecentAuditJobs,
  listRecentAuditRuns,
  updateAuditJobStatus,
  type pennyJobType,
} from "@/lib/orchestration-jobs";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import { apiErrorMessage } from "@/lib/api-error";
import {
  bullmqConnectionFromEnv,
  redisEnqueueFailure,
  requirepennyAuditQueue,
} from "@/lib/redis-bullmq";
import { getOrSetRuntimeCache, invalidateRuntimeCache } from "@/lib/runtime-cache";

const JOB_TYPES: pennyJobType[] = [
  "weekly_audit",
  "onboard_project",
  "onboard_repository",
  "re_audit_project",
  "synthesize_project",
  "audit_project",
  "repair_finding",
];

/** True only if REDIS_URL/penny_REDIS_URL is set and parses to a non-empty host. */
function redisConfigured(): boolean {
  return bullmqConnectionFromEnv() != null;
}

const ORCHESTRATION_JOBS_CACHE_KEY = "api:orchestration-jobs";
const ORCHESTRATION_JOBS_CACHE_TTL_MS = 5_000;
const STATUS_CACHE_KEYS = [
  "api:orchestration",
  "api:engine-status",
  ORCHESTRATION_JOBS_CACHE_KEY,
];

export async function GET() {
  if (!jobsStoreConfigured()) {
    return NextResponse.json({
      configured: false,
      redis_configured: redisConfigured(),
      enqueue_auth_optional: true,
      jobs: [],
      runs: [],
    });
  }
  try {
    const payload = await getOrSetRuntimeCache(
      ORCHESTRATION_JOBS_CACHE_KEY,
      ORCHESTRATION_JOBS_CACHE_TTL_MS,
      async () => {
        const [jobs, runs] = await Promise.all([
          listRecentAuditJobs(30),
          listRecentAuditRuns(20),
        ]);
        return {
          configured: true,
          redis_configured: redisConfigured(),
          enqueue_auth_optional: true,
          jobs,
          runs,
        };
      }
    );
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/orchestration/jobs", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

// Auth is handled centrally by middleware (Bearer, x-penny-api-secret, or session cookie).
export async function POST(request: Request) {
  if (!jobsStoreConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL required for orchestration jobs" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const jobType = body.job_type as pennyJobType;
    const payload =
      typeof body.payload === "object" && body.payload !== null
        ? (body.payload as Record<string, unknown>)
        : {};
    if (!JOB_TYPES.includes(jobType)) {
      return NextResponse.json(
        {
          error: `job_type must be one of: ${JOB_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const row = await insertAuditJob(jobType, {
      project_name:
        typeof body.project_name === "string"
          ? body.project_name.trim() || null
          : null,
      repository_url:
        typeof body.repository_url === "string"
          ? body.repository_url.trim() || null
          : null,
      manifest_revision:
        typeof body.manifest_revision === "string"
          ? body.manifest_revision.trim() || null
          : typeof payload.manifest_revision === "string"
            ? payload.manifest_revision.trim() || null
          : null,
      checklist_id:
        typeof body.checklist_id === "string"
          ? body.checklist_id.trim() || null
          : typeof payload.checklist_id === "string"
            ? payload.checklist_id.trim() || null
          : null,
      repo_ref:
        typeof body.repo_ref === "string"
          ? body.repo_ref.trim() || null
          : null,
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
        // BullMQ enqueue failed — mark the DB row failed immediately so the
        // operator sees it rather than leaving it stuck in "queued" forever.
        const failure = redisEnqueueFailure(redisErr);
        console.error("[orchestration/jobs] Redis enqueue failed:", failure.detail);
        try {
          await updateAuditJobStatus(row.id, "failed", `Redis enqueue error: ${failure.detail}`);
        } catch (dbErr) {
          console.error("[orchestration/jobs] Could not mark job failed:", dbErr);
        }
        return NextResponse.json(
          {
            error: failure.error,
            message: failure.message,
            hint: failure.hint,
            detail: failure.detail,
          },
          { status: failure.status }
        );
      }
    }

    await recordDurableEventBestEffort({
      event_type: "orchestration_job_enqueued",
      project_name: row.project_name,
      source: "orchestration_api",
      summary: `Enqueued ${jobType} job ${row.id}`,
      payload: { job_id: row.id, bullmq: connection != null },
    });

    invalidateRuntimeCache(...STATUS_CACHE_KEYS);

    return NextResponse.json(
      { job: row, bullmq_queued: connection != null },
      { status: 202 }
    );
  } catch (error) {
    console.error("POST /api/orchestration/jobs", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}

/** DELETE /api/orchestration/jobs — cancel a single queued/running audit job by id. */
export async function DELETE(request: Request) {
  if (!jobsStoreConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL required" }, { status: 503 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : null;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const job = await cancelAuditJob(id);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found or already in a terminal state" },
        { status: 404 }
      );
    }
    invalidateRuntimeCache(...STATUS_CACHE_KEYS);
    return NextResponse.json({ job });
  } catch (error) {
    console.error("DELETE /api/orchestration/jobs", error);
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 500 });
  }
}
