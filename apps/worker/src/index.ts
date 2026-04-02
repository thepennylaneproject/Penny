import "./load-env.js";
import { createRequire } from "node:module";
import { Worker } from "bullmq";
import { completeJob, createPool } from "./db.js";
import { processJob } from "./process-job.js";

const require = createRequire(import.meta.url);
// CJS default export — avoids ESM construct signature issues
const IoRedis = require("ioredis") as new (
  url: string,
  opts?: { maxRetriesPerRequest?: null }
) => import("ioredis").Redis;

const redisUrl =
  process.env.REDIS_URL?.trim() || process.env.penny_REDIS_URL?.trim();
const pollMs = Number(process.env.penny_JOB_POLL_MS?.trim() || "3000");
const pollIdleMs = Number(process.env.penny_JOB_POLL_IDLE_MS?.trim() || "5000");
const pollBatchSize = Math.max(
  1,
  Number.parseInt(process.env.penny_JOB_POLL_BATCH_SIZE?.trim() || "10", 10) || 10
);

async function main() {
  const pool = createPool();
  console.log("[penny-worker] started, repo root:", process.env.penny_REPO_ROOT || "(auto)");

  const runOne = async (dbJobId: string) => {
    try {
      await processJob(pool, dbJobId);
    } catch (e) {
      console.error("[penny-worker] processJob error", e);
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const r = await pool.query(
          `SELECT job_type, project_name, status FROM penny_audit_jobs WHERE id = $1`,
          [dbJobId]
        );
        const row = r.rows[0] as
          | { job_type: string; project_name: string | null; status: string }
          | undefined;
        if (row?.status === "running") {
          await completeJob(pool, dbJobId, msg, {
            job_type: row.job_type,
            project_name: row.project_name,
            summary: `Failed (worker): ${msg.slice(0, 200)}`,
            findings_added: 0,
            payload: { worker_fallback: true },
          });
        }
      } catch (ce) {
        console.error("[penny-worker] could not mark job failed", ce);
      }
    }
  };

  if (redisUrl) {
    const connection = new IoRedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    const worker = new Worker(
      "penny-audit",
      async (job) => {
        const id = (job.data as { dbJobId?: string }).dbJobId;
        if (!id) {
          console.warn("[penny-worker] job missing dbJobId");
          return;
        }
        await runOne(id);
      },
      // bullmq bundles ioredis; avoid duplicate-package ConnectionOptions clash
      { connection: connection as never, concurrency: 1 }
    );
    worker.on("failed", (j, err) => {
      console.error("[penny-worker] bullmq failed", j?.id, err);
    });
    console.log("[penny-worker] BullMQ listening on queue penny-audit");
  } else {
    console.log(
      "[penny-worker] REDIS_URL not set; polling penny_audit_jobs (interval:",
      pollMs,
      "ms, idle backoff:",
      pollIdleMs,
      "ms, batch size:",
      pollBatchSize,
      ")"
    );
    const scheduleNext = (afterMs: number) => {
      setTimeout(() => void poll(), afterMs);
    };
    const poll = async () => {
      try {
        const r = await pool.query(
          `SELECT id FROM penny_audit_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT $1`,
          [pollBatchSize]
        );
        const queuedIds = r.rows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        if (queuedIds.length > 0) {
          for (const queuedId of queuedIds) {
            await runOne(queuedId);
          }
          scheduleNext(pollMs);
        } else {
          scheduleNext(pollIdleMs);
        }
      } catch (e) {
        console.error("[penny-worker] poll error", e);
        scheduleNext(pollMs);
      }
    };
    await poll();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
