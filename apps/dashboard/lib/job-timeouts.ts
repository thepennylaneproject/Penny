const DEFAULT_REPAIR_STALE_MS = 30 * 60 * 1000;

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Wall-clock timeout before a repair still marked `running` is recovered as failed (server-side). */
export function getRepairJobStaleTimeoutMs(): number {
  return (
    parsePositiveInt(process.env.penny_REPAIR_JOB_STALE_TIMEOUT_MS) ??
    DEFAULT_REPAIR_STALE_MS
  );
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const remMin = min % 60;
  if (h < 24) return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  if (remH > 0) return `${d}d ${remH}h`;
  return `${d}d`;
}

/** Error text stored on `penny_repair_jobs.error` when a run is recovered after exceeding the stale timeout. */
export function buildStaleRepairError(timeoutMs: number): string {
  const label = formatDurationMs(timeoutMs);
  return `Recovered stale running repair job after ${label} without completion. Queue the repair again to retry.`;
}

/** True when the ledger error is from stale-timeout recovery (retryable), not an engine failure. */
export function isStaleRecoveryError(error: string | null | undefined): boolean {
  if (error == null || typeof error !== "string") return false;
  return error.includes("Recovered stale running repair job");
}
