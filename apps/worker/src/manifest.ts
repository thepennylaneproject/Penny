import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, relative, resolve } from "node:path";
import type { AuditScope } from "./context.js";

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".css",
  ".html",
  ".py",
  ".sql",
  ".sh",
]);

export interface ManifestModule {
  path: string;
  domain: string;
  type: string;
  description: string;
  complexity: "low" | "medium" | "high";
  entrypoint?: boolean;
}

export interface DomainCoverageSummary {
  domain: string;
  total_modules: number;
  reviewed_modules: number;
  finding_count: number;
  last_audited_at?: string;
}

export interface ProjectManifest {
  revision: string;
  generated_at: string;
  source_root: string;
  exhaustiveness: "exhaustive";
  modules: ManifestModule[];
  domains: DomainCoverageSummary[];
  checklist_id: string;
  entrypoints: string[];
}

function shouldSkipPath(name: string): boolean {
  return [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    "__pycache__",
  ].includes(name);
}

function collectFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (shouldSkipPath(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (!st.isFile() || st.size > 750_000) continue;
    if (!TEXT_EXT.has(extname(name).toLowerCase())) continue;
    out.push(full);
  }
}

export function resolveRepoRevision(repoRoot: string): string {
  try {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "workspace";
  }
}

function classifyDomain(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.includes("/api/") || lower.includes("route.ts")) return "API";
  if (lower.includes("auth")) return "Auth";
  if (lower.includes("security")) return "Security";
  if (lower.includes("data") || lower.includes("db") || lower.includes("sql")) return "Data";
  if (lower.includes("queue") || lower.includes("worker") || lower.includes("job")) return "Background Jobs";
  if (lower.includes("component") || lower.includes("/app/") || lower.includes("/pages/")) return "UI";
  if (lower.includes("migration")) return "Migrations";
  if (lower.includes("config") || lower.endsWith(".toml") || lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return "Config";
  }
  if (lower.includes("test")) return "Tests";
  const [first] = relPath.split("/");
  return first || "General";
}

function classifyType(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".md")) return "doc";
  if (lower.endsWith(".sql")) return "migration";
  if (lower.includes("config") || lower.endsWith(".json") || lower.endsWith(".toml") || lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return "config";
  }
  if (lower.includes("/api/") || lower.includes("route.ts")) return "route";
  if (lower.includes("hook")) return "hook";
  if (lower.includes("service") || lower.includes("client") || lower.includes("provider")) return "service";
  if (lower.includes("component") || lower.endsWith(".tsx") || lower.endsWith(".jsx")) return "component";
  if (lower.includes("schema") || lower.includes("types")) return "schema";
  if (lower.includes("test")) return "test";
  if (lower.endsWith(".sh") || lower.endsWith(".py")) return "script";
  if (lower.includes("util") || lower.includes("lib/")) return "util";
  return "unknown";
}

function classifyComplexity(fullPath: string): "low" | "medium" | "high" {
  try {
    const lines = readFileSync(fullPath, "utf8").split(/\r?\n/).length;
    if (lines >= 350) return "high";
    if (lines >= 120) return "medium";
    return "low";
  } catch {
    return "low";
  }
}

function isEntrypoint(relPath: string, configuredEntrypoints: string[]): boolean {
  if (configuredEntrypoints.includes(relPath)) return true;
  const lower = relPath.toLowerCase();
  return (
    lower === "package.json" ||
    lower.endsWith("/package.json") ||
    lower.endsWith("/app/page.tsx") ||
    lower.endsWith("/app/layout.tsx") ||
    lower.endsWith("/src/index.ts") ||
    lower.endsWith("/src/main.ts") ||
    lower.endsWith("/main.py") ||
    lower.includes("/api/")
  );
}

function describeModule(domain: string, type: string, relPath: string): string {
  const parts = relPath.split("/");
  const label = parts[parts.length - 1] || relPath;
  return `${domain} ${type} at ${label}`;
}

function summarizeDomains(modules: ManifestModule[]): DomainCoverageSummary[] {
  const byDomain = new Map<string, DomainCoverageSummary>();
  for (const mod of modules) {
    const current =
      byDomain.get(mod.domain) ??
      {
        domain: mod.domain,
        total_modules: 0,
        reviewed_modules: 0,
        finding_count: 0,
      };
    current.total_modules += 1;
    byDomain.set(mod.domain, current);
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

export function buildProjectManifest(
  repoRoot: string,
  scanRoots: string[],
  entrypoints: string[] = [],
  checklistId = "penny-bounded-audit-v1"
): ProjectManifest {
  const files: string[] = [];
  const effectiveRoots = scanRoots.length > 0 ? scanRoots : ["."];
  for (const root of effectiveRoots) {
    const full = resolve(repoRoot, root);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, files);
    } else if (st.isFile()) {
      files.push(full);
    }
  }
  const modules = [...new Set(files)]
    .sort()
    .map((fullPath) => {
      const relPath = relative(repoRoot, fullPath).replace(/\\/g, "/");
      const domain = classifyDomain(relPath);
      const type = classifyType(relPath);
      return {
        path: relPath,
        domain,
        type,
        description: describeModule(domain, type, relPath),
        complexity: classifyComplexity(fullPath),
        entrypoint: isEntrypoint(relPath, entrypoints),
      } satisfies ManifestModule;
    });
  const resolvedEntrypoints = modules.filter((mod) => mod.entrypoint).map((mod) => mod.path);
  return {
    revision: resolveRepoRevision(repoRoot),
    generated_at: new Date().toISOString(),
    source_root: repoRoot,
    exhaustiveness: "exhaustive",
    modules,
    domains: summarizeDomains(modules),
    checklist_id: checklistId,
    entrypoints: resolvedEntrypoints,
  };
}

export function resolveScopePathsFromManifest(
  manifest: ProjectManifest,
  scope: AuditScope
): string[] {
  const scopeType = scope.scopeType ?? "project";
  const input = Array.isArray(scope.scopePaths) ? scope.scopePaths : [];
  if (scopeType === "file" || scopeType === "selection" || scopeType === "directory") {
    return input;
  }
  if (scopeType === "domain") {
    const requestedDomains = new Set(input.map((value) => value.trim()).filter(Boolean));
    return manifest.modules
      .filter((mod) => requestedDomains.has(mod.domain) || requestedDomains.has(mod.path))
      .map((mod) => mod.path);
  }
  if (scopeType === "diff") {
    return input;
  }
  return manifest.modules.map((mod) => mod.path);
}

export function summarizeCoverageFromManifest(
  manifest: ProjectManifest,
  reviewedPaths: string[],
  findingPaths: string[],
  lastAuditedAt: string
): DomainCoverageSummary[] {
  const reviewed = new Set(reviewedPaths);
  const findingCounts = new Map<string, number>();
  for (const path of findingPaths) {
    const mod = manifest.modules.find((candidate) => candidate.path === path);
    if (!mod) continue;
    findingCounts.set(mod.domain, (findingCounts.get(mod.domain) ?? 0) + 1);
  }
  const byDomain = new Map<string, DomainCoverageSummary>();
  for (const mod of manifest.modules) {
    const current =
      byDomain.get(mod.domain) ??
      {
        domain: mod.domain,
        total_modules: 0,
        reviewed_modules: 0,
        finding_count: 0,
        last_audited_at: lastAuditedAt,
      };
    current.total_modules += 1;
    if (reviewed.has(mod.path)) current.reviewed_modules += 1;
    current.finding_count = findingCounts.get(mod.domain) ?? current.finding_count;
    byDomain.set(mod.domain, current);
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}
