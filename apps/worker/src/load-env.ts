/**
 * Load env from repo + dashboard + worker (same places Next.js uses).
 * `dotenv/config` only reads `./.env` from cwd, so `npm run dev` in `worker/`
 * misses root `/.env.local` and `/dashboard/.env.local`.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, "..");
const repoRoot = resolve(workerRoot, "../..");
const dashboardRoot = resolve(repoRoot, "apps/dashboard");

/** Later paths override earlier (worker-local wins). */
const ENV_FILES = [
  resolve(repoRoot, ".env"),
  resolve(repoRoot, ".env.local"),
  resolve(dashboardRoot, ".env"),
  resolve(dashboardRoot, ".env.local"),
  resolve(workerRoot, ".env"),
  resolve(workerRoot, ".env.local"),
];

for (const path of ENV_FILES) {
  if (existsSync(path)) {
    config({ path, override: true });
  }
}
