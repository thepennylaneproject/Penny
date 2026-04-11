/**
 * Worker startup env checks. Skip with SKIP_ENV_VALIDATION=1|true.
 * Keeps error text aligned with createPool() in db.ts.
 */

function isSkipEnvValidation(): boolean {
  const v = process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function validateWorkerEnv(): void {
  if (isSkipEnvValidation()) return;

  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.penny_DATABASE_URL?.trim() ||
    "";

  if (url) return;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (supabaseUrl && serviceRoleKey) return;

  throw new Error(
    "Database connection required. Set DATABASE_URL (or penny_DATABASE_URL), or set SUPABASE_URL + " +
      "SUPABASE_SERVICE_ROLE_KEY. penny-worker loads .env/.env.local from the repo root, apps/dashboard, " +
      "then apps/worker."
  );
}
