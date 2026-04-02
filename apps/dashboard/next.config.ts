import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Next only auto-loads `.env*` from the dashboard directory. Many monorepo setups
 * keep secrets in the repo root — merge those first so LINEAR_* / DATABASE_URL work.
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

const repoRoot = path.join(__dirname, "../..");
mergeEnvLocal(path.join(repoRoot, ".env.local"), false);
mergeEnvLocal(path.join(__dirname, ".env.local"), true);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
