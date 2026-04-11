import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, resolve } from "node:path";

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
]);

const DEFAULT_MAX_FILE_CHARS = 12000;
const DEFAULT_MAX_FILES = 24;
/** Bounded excerpt from the app’s intelligence report (`*_report.md` in the mirror tree). */
const MAX_REPORT_CHARS = 12000;

export interface AuditScope {
  scopeType?: string;
  scopePaths?: string[];
  files?: string[];
  baseRef?: string;
  headRef?: string;
  maxFiles?: number;
  maxCharsPerFile?: number;
  includeReportExcerpt?: boolean;
}

function findIntelligenceReportPath(scanRoot: string): string | null {
  if (!existsSync(scanRoot)) return null;
  let entries: string[];
  try {
    entries = readdirSync(scanRoot);
  } catch {
    return null;
  }
  const candidates = entries
    .filter((n) => {
      const lower = n.toLowerCase();
      return lower.endsWith(".md") && lower.includes("report");
    })
    .sort();
  const direct = candidates[0];
  if (direct) return join(scanRoot, direct);
  for (const name of entries) {
    const sub = join(scanRoot, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(sub);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    let subEntries: string[];
    try {
      subEntries = readdirSync(sub);
    } catch {
      continue;
    }
    const subCand = subEntries
      .filter((n) => {
        const lower = n.toLowerCase();
        return lower.endsWith(".md") && lower.includes("report");
      })
      .sort()[0];
    if (subCand) return join(sub, subCand);
  }
  return null;
}

export function readIntelligenceReportExcerpt(
  repoRoot: string,
  scanDir: string
): string | null {
  const root = join(repoRoot, scanDir);
  const reportPath = findIntelligenceReportPath(root);
  if (!reportPath) return null;
  try {
    let text = readFileSync(reportPath, "utf-8");
    if (text.length > MAX_REPORT_CHARS) {
      text =
        text.slice(0, MAX_REPORT_CHARS) +
        "\n\n/* report truncated for token budget */";
    }
    const rel = reportPath.replace(repoRoot + "/", "");
    return `--- ${rel} (intelligence report) ---\n${text}`;
  } catch {
    return null;
  }
}

/**
 * Report excerpt (if any) plus explicitly selected source files for the audit LLM user message.
 */
export function buildCodeContextForAudit(
  repoRoot: string,
  scanRoots: string[],
  scope: AuditScope = {}
): string {
  const maxFiles = scope.maxFiles ?? DEFAULT_MAX_FILES;
  const maxCharsPerFile = scope.maxCharsPerFile ?? DEFAULT_MAX_FILE_CHARS;
  const report = scope.includeReportExcerpt === false
    ? null
    : scanRoots
        .map((dir) => readIntelligenceReportExcerpt(repoRoot, dir))
        .find(Boolean);
  const sampled = gatherCodeContext(repoRoot, scanRoots, scope);
  const declaredCount =
    Array.isArray(scope.files) && scope.files.length > 0
      ? scope.files.length
      : undefined;
  const sampleBlock = `## Repository files (${scope.scopeType ?? "project"} scope${declaredCount ? ` — ${declaredCount} files selected` : ` — up to ${maxFiles} text files`}, ${maxCharsPerFile} chars each)\n\n${sampled}`;
  if (report) {
    return `${report}\n\n${sampleBlock}`;
  }
  return sampleBlock;
}

function collectFiles(
  dir: string,
  out: string[],
  depth: number,
  maxFiles: number
): void {
  if (out.length >= maxFiles || depth > 5 || !existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "build") continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectFiles(full, out, depth + 1, maxFiles);
    } else if (st.isFile() && st.size < 500_000) {
      const ext = extname(name).toLowerCase();
      if (TEXT_EXT.has(ext)) out.push(full);
    }
    if (out.length >= maxFiles * 3) return;
  }
}

export function gatherCodeContext(
  repoRoot: string,
  scanRoots: string[],
  scope: AuditScope = {}
): string {
  const maxFiles = scope.maxFiles ?? DEFAULT_MAX_FILES;
  const maxCharsPerFile = scope.maxCharsPerFile ?? DEFAULT_MAX_FILE_CHARS;
  const files = resolveScopeFiles(repoRoot, scanRoots, scope, maxFiles);
  if (files.length === 0) {
    return "(no readable source files in selected scope)";
  }
  const parts: string[] = [];
  for (const f of files.slice(0, maxFiles)) {
    const rel = f.replace(repoRoot + "/", "");
    try {
      let text = readFileSync(f, "utf-8");
      if (text.length > maxCharsPerFile) {
        text = text.slice(0, maxCharsPerFile) + "\n/* truncated */";
      }
      parts.push(`--- ${rel} ---\n${text}`);
    } catch {
      /* skip */
    }
  }
  return parts.join("\n\n") || "(no readable source files)";
}

export function resolveScopeFiles(
  repoRoot: string,
  scanRoots: string[],
  scope: AuditScope,
  maxFiles: number
): string[] {
  if (Array.isArray(scope.files) && scope.files.length > 0) {
    return uniqueSorted(
      scope.files
        .map((rel) => resolve(repoRoot, rel))
        .filter((full) => existsSync(full) && statSync(full).isFile())
    ).slice(0, maxFiles);
  }
  const scopeType = scope.scopeType ?? "project";
  const candidates: string[] = [];
  const inputPaths =
    Array.isArray(scope.scopePaths) && scope.scopePaths.length > 0
      ? scope.scopePaths
      : scanRoots;

  if (scopeType === "file" || scopeType === "selection") {
    for (const rel of inputPaths) {
      const full = resolve(repoRoot, rel);
      if (existsSync(full) && statSync(full).isFile()) candidates.push(full);
    }
    return uniqueSorted(candidates);
  }

  if (scopeType === "diff") {
    const diffFiles = gitDiffFiles(repoRoot, scope.baseRef, scope.headRef);
    for (const rel of diffFiles) {
      const full = resolve(repoRoot, rel);
      if (existsSync(full) && statSync(full).isFile() && TEXT_EXT.has(extname(full).toLowerCase())) {
        candidates.push(full);
      }
    }
    return uniqueSorted(candidates).slice(0, maxFiles);
  }

  const roots = scopeType === "directory" ? inputPaths : scanRoots;
  for (const rel of roots) {
    const full = resolve(repoRoot, rel);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (st.isFile()) {
      candidates.push(full);
      continue;
    }
    if (st.isDirectory()) {
      collectFiles(full, candidates, 0, maxFiles);
    }
  }
  return uniqueSorted(candidates).slice(0, maxFiles);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function gitDiffFiles(
  repoRoot: string,
  baseRef?: string,
  headRef?: string
): string[] {
  if (!baseRef || !headRef) return [];
  try {
    const out = execFileSync(
      "git",
      ["-C", repoRoot, "diff", "--name-only", `${baseRef}...${headRef}`],
      { encoding: "utf8", stdio: "pipe" }
    );
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\.?\//, ""));
  } catch {
    return [];
  }
}

/**
 * Build a curated "architecture anchor" context for intelligence extraction.
 *
 * Instead of domain-chunked passes (8 files at a time), this collects the
 * files that best reveal a project's overall architecture:
 *   - package.json (dependencies, name, scripts) — up to 3 levels
 *   - README.md, MISSION.md, CHANGELOG.md at root
 *   - Prisma schema and first few migrations
 *   - Main entry points (main.ts, index.ts, app.ts) at key depths
 *   - .env.example (environment variable inventory)
 *   - Dockerfiles and docker-compose files
 *   - CI workflow files
 *   - tsconfig.json, turbo.json at root
 *   - Architecture / design docs (docs/*.md)
 *   - Any existing intelligence report excerpt
 */
export function buildIntelligenceContext(
  repoRoot: string,
  scanRoots: string[]
): string {
  const MAX_CHARS = 10_000;
  const collected: Array<{ path: string; priority: number }> = [];

  function tryAdd(relPath: string, priority: number): void {
    const full = join(repoRoot, relPath);
    if (existsSync(full) && statSync(full).isFile()) {
      collected.push({ path: full, priority });
    }
  }

  function scanForPattern(
    dir: string,
    depth: number,
    maxDepth: number,
    test: (name: string, rel: string) => number | false
  ): void {
    if (depth > maxDepth || !existsSync(dir)) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (["node_modules", ".git", "dist", "build", ".next", "coverage", "playwright-report", "test-results"].includes(name)) continue;
      const full = join(dir, name);
      let st: ReturnType<typeof statSync>;
      try { st = statSync(full); } catch { continue; }
      const rel = full.replace(repoRoot + "/", "");
      if (st.isFile()) {
        const pri = test(name, rel);
        if (pri !== false) collected.push({ path: full, priority: pri });
      } else if (st.isDirectory() && depth < maxDepth) {
        scanForPattern(full, depth + 1, maxDepth, test);
      }
    }
  }

  // Anchor files by explicit path
  tryAdd("README.md", 100);
  tryAdd("MISSION.md", 95);
  tryAdd("CHANGELOG.md", 60);
  tryAdd(".env.example", 90);
  tryAdd("tsconfig.json", 70);
  tryAdd("turbo.json", 70);
  tryAdd("docker-compose.yml", 65);
  tryAdd("docker-compose.yaml", 65);
  tryAdd("docker/docker-compose.prod.yml", 65);

  // package.json files (root + app-level)
  scanForPattern(repoRoot, 0, 2, (name) =>
    name === "package.json" ? 85 : false
  );

  // Prisma schema
  scanForPattern(repoRoot, 0, 4, (name, _rel) =>
    name.endsWith(".prisma") ? 80 : false
  );

  // First 3 SQL migrations (chronological)
  const migrations: string[] = [];
  scanForPattern(repoRoot, 0, 6, (name, rel) => {
    if (name === "migration.sql" && migrations.length < 3) {
      migrations.push(rel);
      return 50;
    }
    return false;
  });

  // Main entry points
  scanForPattern(repoRoot, 0, 4, (name) =>
    name === "main.ts" || name === "index.ts" || name === "app.ts" ? 75 : false
  );

  // CI workflows
  scanForPattern(join(repoRoot, ".github", "workflows"), 0, 1, (name) =>
    name.endsWith(".yml") || name.endsWith(".yaml") ? 55 : false
  );

  // Dockerfiles
  scanForPattern(repoRoot, 0, 3, (name) =>
    name === "Dockerfile" || name.startsWith("Dockerfile.") ? 60 : false
  );

  // Architecture docs
  scanForPattern(join(repoRoot, "docs"), 0, 2, (name) =>
    name.endsWith(".md") ? 45 : false
  );

  // Also scan scan roots for any top-level README / docs
  for (const scanRoot of scanRoots) {
    tryAdd(join(scanRoot, "README.md").replace(repoRoot + "/", ""), 70);
  }

  // Dedupe, sort by priority desc, limit to 50 files
  const seen = new Set<string>();
  const ordered = collected
    .filter(({ path }) => { if (seen.has(path)) return false; seen.add(path); return true; })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 50);

  const parts: string[] = [];
  for (const { path } of ordered) {
    const rel = path.replace(repoRoot + "/", "");
    try {
      let text = readFileSync(path, "utf-8");
      if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + "\n/* truncated */";
      parts.push(`--- ${rel} ---\n${text}`);
    } catch { /* skip */ }
  }

  // Also add existing intelligence report if present
  for (const scanRoot of scanRoots) {
    const excerpt = readIntelligenceReportExcerpt(repoRoot, scanRoot);
    if (excerpt) { parts.unshift(excerpt); break; }
  }

  return parts.join("\n\n") || "(no architecture anchor files found)";
}

export function readExpectations(repoRoot: string, expectationsPath: string): string {
  const full = join(repoRoot, expectationsPath);
  if (!existsSync(full)) {
    const fallback = resolveExpectationsFromProjectRoot(repoRoot);
    if (fallback) {
      return readFileSync(fallback, "utf-8");
    }
    return `(missing file: ${expectationsPath})`;
  }
  try {
    return readFileSync(full, "utf-8");
  } catch {
    return `(unreadable: ${expectationsPath})`;
  }
}

function resolveExpectationsFromProjectRoot(repoRoot: string): string | null {
  const direct = join(repoRoot, "audits", "expectations.md");
  if (existsSync(direct)) return direct;
  const profile = join(repoRoot, "expectations.md");
  if (existsSync(profile)) return profile;
  return null;
}
