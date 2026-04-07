import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Next only auto-loads `.env*` from the dashboard directory. Many monorepo setups
 * keep secrets in the repo root — merge those first so LINEAR_* / DATABASE_URL work.
 *
 * This is a build-time-only operation: next.config.ts is never included in the
 * server bundle. The explicit NEXT_PHASE check signals to NFT that fs reads here
 * are not needed at runtime.
 */
function mergeEnvLocal(filePath: string, overrideDefinedKeys: boolean) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
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

// Guard: next.config.ts is executed at build / dev startup only.
// NEXT_PHASE is set by Next.js before evaluating the config module; its absence
// (e.g. when Jest imports the file) is also safe because we are not in a server
// runtime context.
if (
  typeof process.env.NEXT_PHASE === "undefined" ||
  process.env.NEXT_PHASE !== "phase-production-server"
) {
  const repoRoot = path.join(__dirname, "../..");
  mergeEnvLocal(path.join(repoRoot, ".env.local"), false);
  mergeEnvLocal(path.join(__dirname, ".env.local"), true);
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Prevent non-app monorepo directories from being pulled into the server
  // bundle trace when outputFileTracingRoot is set to the workspace root.
  outputFileTracingExcludes: {
    "*": [
      "../../apps/worker/**",
      "../../backend/**",
      "../../docs/**",
      "../../services/**",
      "../../audits/**",
      "../../auditsv2/**",
      "../../infra/**",
      "../../supabase/**",
      "../../.git/**",
      "../../**/.env.local",
    ],
  },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

const sentryWrapped = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? "",
  project: process.env.SENTRY_PROJECT ?? "",
  silent: !process.env.CI,
}) as NextConfig;

// @sentry/nextjs merges `ioredis` into serverExternalPackages for instrumentation.
// BullMQ imports `ioredis/built/utils`; when ioredis is external, Turbopack warns
// because Node cannot resolve that subpath from bullmq's dependency layout.
// Bundling ioredis avoids the "Package ioredis can't be external" warning.
const config: NextConfig = { ...sentryWrapped };
if (Array.isArray(config.serverExternalPackages)) {
  config.serverExternalPackages = config.serverExternalPackages.filter(
    (pkg) => pkg !== "ioredis",
  );
}

export default config;
