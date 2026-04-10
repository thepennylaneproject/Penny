/**
 * Preload with: node -r ./scripts/register-monorepo-env.cjs …
 * Merges repo-root `.env.local` then `apps/dashboard/.env.local` into process.env
 * before Next reads config (same rules as the former next.config.ts merge).
 */

const fs = require("fs");
const path = require("path");

function applyDotenvText(text, overrideDefinedKeys) {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (overrideDefinedKeys) {
      process.env[key] = val;
    } else if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

const dashboardDir = path.join(__dirname, "..");
const repoRoot = path.join(dashboardDir, "..", "..");
const repoRootEnvLocal = path.join(repoRoot, ".env.local");
if (fs.existsSync(repoRootEnvLocal)) {
  applyDotenvText(fs.readFileSync(repoRootEnvLocal, "utf8"), false);
}
const dashboardEnvLocal = path.join(dashboardDir, ".env.local");
if (fs.existsSync(dashboardEnvLocal)) {
  applyDotenvText(fs.readFileSync(dashboardEnvLocal, "utf8"), true);
}
