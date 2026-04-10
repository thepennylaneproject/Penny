#!/usr/bin/env node
/**
 * Loads monorepo + dashboard `.env.local` (see register-monorepo-env.cjs), then runs
 * the Next CLI in a child process so NODE_OPTIONS is not polluted with `-r` flags.
 */

require("./register-monorepo-env.cjs");

const { spawnSync } = require("child_process");
const path = require("path");

const nextCli = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(
  process.execPath,
  [nextCli, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
);
process.exit(result.status === null ? 1 : result.status);
