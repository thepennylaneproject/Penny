/**
 * Shared Redis connection shape for BullMQ Queue/Worker alignment with `worker/src/index.ts`
 * (dashboard uses host/port object; worker uses ioredis URL — same Redis instance).
 */

import { Queue } from "bullmq";

export type BullmqRedisConnection = {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
};

/** Resolve REDIS_URL / penny_REDIS_URL for BullMQ, or null if unset / invalid. */
export function bullmqConnectionFromEnv(): BullmqRedisConnection | null {
  const raw =
    process.env.REDIS_URL?.trim() || process.env.penny_REDIS_URL?.trim();
  if (!raw) return null;
  try {
    const parsedUrl = new URL(raw);
    if (!parsedUrl.hostname?.trim()) return null;
    return {
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 6379),
      password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
      username:
        parsedUrl.username && parsedUrl.username !== "default"
          ? decodeURIComponent(parsedUrl.username)
          : parsedUrl.username === "default" && parsedUrl.password
            ? "default"
            : undefined,
      tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
}

let pennyAuditQueue: Queue | null = null;

export function getpennyAuditQueue(): Queue | null {
  if (pennyAuditQueue) return pennyAuditQueue;
  const connection = bullmqConnectionFromEnv();
  if (!connection) return null;
  pennyAuditQueue = new Queue("penny-audit", { connection });
  return pennyAuditQueue;
}

export function requirepennyAuditQueue(): Queue {
  const queue = getpennyAuditQueue();
  if (!queue) {
    throw new Error("BullMQ queue is unavailable despite Redis being configured");
  }
  return queue;
}
