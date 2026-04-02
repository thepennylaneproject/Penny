/**
 * Load env from repo + dashboard + worker (same places Next.js uses).
 * `dotenv/config` only reads `./.env` from cwd, so `npm run dev` in `worker/`
 * misses root `/.env.local` and `/dashboard/.env.local`.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(__dirname, "..");
const repoRoot = join(workerRoot, "..");

/** Later paths override earlier (worker-local wins). */
const ENV_FILES = [
  join(repoRoot, ".env"),
  join(repoRoot, ".env.local"),
  join(repoRoot, "dashboard", ".env"),
  join(repoRoot, "dashboard", ".env.local"),
  join(workerRoot, ".env"),
  join(workerRoot, ".env.local"),
];

for (const path of ENV_FILES) {
  if (existsSync(path)) {
    config({ path, override: true });
  }
}
