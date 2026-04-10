/**
 * Narrow fs-only helpers for `/api/.../onboarding/cluster` so that route does not
 * import the full onboarding pipeline (which triggers Turbopack/NFT repo-wide traces).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join as pathJoin } from "node:path";

/** Keeps NFT from treating arbitrary repo roots as trace roots (f-203ecae0). */
function joinUnderRepo(repoPath: string, ...segments: string[]) {
  return pathJoin(/* turbopackIgnore: true */ repoPath, ...segments);
}

function describeTopLevel(root: string): Array<{ path: string; note: string }> {
  const entries = readdirSync(root)
    .filter((name) => !name.startsWith("."))
    .slice(0, 20);
  return entries.map((name) => ({
    path: name,
    note: inferTopLevelPurpose(name),
  }));
}

function inferTopLevelPurpose(name: string): string {
  if (name === "src" || name === "app") return "primary application code";
  if (name === "apps") return "multi-app workspace";
  if (name === "packages") return "shared packages";
  if (name === "tests" || name === "__tests__") return "tests";
  if (name === "docs") return "documentation";
  if (name === "supabase" || name === "db") return "database and migrations";
  if (name === "scripts") return "scripts and tooling";
  if (name === "netlify") return "serverless functions and edge functions";
  if (name === "archive") return "archived / historical code (not active)";
  if (name === "audits") return "audit artifacts, reports, and agent prompts";
  if (/^eslint-plugin-/i.test(name)) return "custom ESLint plugin";
  if (/^eslint-rules?$/i.test(name)) return "custom ESLint rules";
  if (name === "index.html") return "Vite SPA entry point";
  if (/\.(lock|toml|json|yaml|yml|cjs|mjs|js|ts)$/.test(name)) return "project config file";
  if (/\.(md|mdx|txt)$/.test(name)) return "documentation";
  if (/^(LICENSE|LICENCE|AUTHORS|CONTRIBUTORS|NOTICE)/i.test(name)) return "open source license";
  if (/^[A-Z][A-Za-z0-9 ]+(Charter|Specification|Manifest|Policy|Contract)/i.test(name)) {
    return "documentation";
  }
  return "repository content";
}

export async function collectGitHistory(repoPath: string): Promise<string> {
  try {
    const log = execFileSync(
      "git",
      ["-C", repoPath, "log", "-n", "100", "--oneline", "--stat"],
      { encoding: "utf8", stdio: "pipe" }
    );
    return log.slice(0, 15000);
  } catch (e) {
    return "Git history unavailable: " + (e instanceof Error ? e.message : String(e));
  }
}

export async function collectDependencyManifest(repoPath: string): Promise<string> {
  const pkgPath = joinUnderRepo(repoPath, "package.json");
  if (!existsSync(pkgPath)) return "No package.json found.";
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return JSON.stringify(deps, null, 2);
  } catch {
    return "Failed to parse dependencies.";
  }
}

export async function generateModuleManifest(
  repoPath: string
): Promise<Record<string, unknown>> {
  const tree = describeTopLevel(repoPath);
  return {
    revision: "v1-onboarding",
    generated_at: new Date().toISOString(),
    source_root: repoPath,
    exhaustiveness: "exhaustive",
    modules: tree.map((t) => ({
      name: t.path,
      path: t.path,
      description: t.note,
      complexity: "medium",
      dependencies: [],
    })),
    domains: [],
  };
}

export async function generateCssTokenMap(repoPath: string): Promise<string> {
  const out: string[] = [];
  const candidates = [
    "tailwind.config.js",
    "tailwind.config.ts",
    "globals.css",
    "src/globals.css",
    "src/index.css",
    "styles/globals.css",
    "src/styles/globals.css",
  ];
  for (const f of candidates) {
    const p = joinUnderRepo(repoPath, f);
    if (existsSync(p)) {
      out.push(`--- ${f} ---\n` + readFileSync(p, "utf8").slice(0, 3000));
    }
  }
  return out.length > 0 ? out.join("\n\n") : "No standard CSS token maps found.";
}
