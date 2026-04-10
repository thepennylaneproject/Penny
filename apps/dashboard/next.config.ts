import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Monorepo env merge runs via `node -r ./scripts/register-monorepo-env.cjs` in npm
 * scripts so this file stays free of `fs` (avoids Turbopack “whole repo” NFT hints).
 * Symlinking `apps/dashboard/.env.local` → `../../.env.local` also works without the preload.
 */

/** Monorepo root; `turbopackIgnore` on `process.cwd()` per Next NFT guidance (f-203ecae0). */
const monorepoRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "..", "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
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
