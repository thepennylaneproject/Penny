/**
 * Central startup validation for the dashboard (Node server runtime).
 *
 * Skip with SKIP_ENV_VALIDATION=1|true (CI, experiments). Skipped automatically
 * during `next build` (NEXT_PHASE=phase-production-build) so builds do not
 * require production secrets in the build environment.
 */

function isSkipEnvValidation(): boolean {
  const v = process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase();
  return v === "1" || v === "true";
}

function assertOptionalAbsoluteUrl(envKey: string, raw: string | undefined): void {
  const trimmed = raw?.trim();
  if (!trimmed) return;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`must be http(s) URL`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[penny] Invalid ${envKey}: ${msg}`);
  }
}

/**
 * Throws with a deterministic message if required production configuration is missing.
 * Call from Node instrumentation only (not Edge).
 */
export function validateDashboardEnv(): void {
  if (isSkipEnvValidation()) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  assertOptionalAbsoluteUrl(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  assertOptionalAbsoluteUrl(
    "NEXT_PUBLIC_LANE_API_BASE_URL",
    process.env.NEXT_PUBLIC_LANE_API_BASE_URL
  );

  if (process.env.NODE_ENV !== "production") return;

  const allowOpenApi =
    process.env.penny_ALLOW_OPEN_API?.trim().toLowerCase() === "1" ||
    process.env.penny_ALLOW_OPEN_API?.trim().toLowerCase() === "true";

  if (!allowOpenApi) {
    const hasApiAuth =
      process.env.DASHBOARD_API_SECRET?.trim() ||
      process.env.ORCHESTRATION_ENQUEUE_SECRET?.trim() ||
      process.env.SUPABASE_JWT_SECRET?.trim();
    if (!hasApiAuth) {
      throw new Error(
        "[penny] Missing API auth in production: set DASHBOARD_API_SECRET, ORCHESTRATION_ENQUEUE_SECRET, " +
          "or SUPABASE_JWT_SECRET (or penny_ALLOW_OPEN_API only for non-production-style open API)."
      );
    }
  }

  const dbUrl =
    process.env.DATABASE_URL?.trim() || process.env.penny_DATABASE_URL?.trim();
  if (!dbUrl) {
    throw new Error(
      "[penny] DATABASE_URL (or penny_DATABASE_URL) is required in production for dashboard data features."
    );
  }
}
