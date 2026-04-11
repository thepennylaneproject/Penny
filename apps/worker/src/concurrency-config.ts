/** Shared worker concurrency limits (pass parallelism, portfolio jobs, pg pool sizing). */

export const DEFAULT_PASS_CONCURRENCY = 2;
export const DEFAULT_PORTFOLIO_PROJECT_CONCURRENCY = 1;

const PASS_CONCURRENCY_CAP = 10;
const PORTFOLIO_PROJECT_CONCURRENCY_CAP = 8;
const POOL_SLACK = 2;
const PG_POOL_MAX_CAP = 100;

export function resolvePassConcurrency(): number {
  const raw = process.env.penny_PASS_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PASS_CONCURRENCY;
  return Math.min(parsed, PASS_CONCURRENCY_CAP);
}

/** When a job audits multiple projects, run up to N in parallel (bounded LLM/IO). Default 1 preserves prior ordering and global metrics. */
export function resolvePortfolioProjectConcurrency(): number {
  const raw = process.env.penny_PORTFOLIO_PROJECT_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PORTFOLIO_PROJECT_CONCURRENCY;
  return Math.min(parsed, PORTFOLIO_PROJECT_CONCURRENCY_CAP);
}

/**
 * Postgres pool size: explicit penny_PG_POOL_MAX, or derived from pass + portfolio concurrency + slack.
 */
export function resolvePgPoolMax(): number {
  const raw = process.env.penny_PG_POOL_MAX?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.min(parsed, PG_POOL_MAX_CAP);
  }
  const pass = resolvePassConcurrency();
  const portfolio = resolvePortfolioProjectConcurrency();
  return Math.max(5, pass + portfolio + POOL_SLACK);
}
