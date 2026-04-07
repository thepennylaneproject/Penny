import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import {
  buildCodeContextForAudit,
  readExpectations,
  resolveScopeFiles,
  type AuditScope,
  buildIntelligenceContext,
} from "./context.js";
import { auditWithLane, resolveModelChain, resolveRoutingPolicy } from "./llm.js";
import { isLaneConfigured, lanePatch } from "./lane-client.js";
import {
  claimJob,
  completeJob,
  insertRepairJob,
  loadProject,
  loadLatestProjectManifest,
  saveProject,
  saveProjectManifest,
  listAllProjects,
  upsertMaintenanceBacklogFromFindings,
} from "./db.js";
import { logAuditMetrics, resolveLLMTier } from "./llm-router.js";
import { PennyObservability } from "./observability.js";
import { getSupabaseClient } from "./supabase-client.js";
import { getRegistry } from "./providers/registry.js";
import {
  buildProjectManifest,
  resolveRepoRevision,
  resolveScopePathsFromManifest,
  summarizeCoverageFromManifest,
  type ProjectManifest,
} from "./manifest.js";
import { getRepairClient, type RepairJobRequest } from "./repair-client.js";
import { downloadRepoTarball, isGitHubAppConfigured } from "./github-app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptFileCache = new Map<string, string>();

function readCachedPrompt(filePath: string): string {
  const cached = promptFileCache.get(filePath);
  if (cached !== undefined) return cached;
  const text = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  promptFileCache.set(filePath, text);
  return text;
}

function repoRoot(): string {
  const env = process.env.penny_REPO_ROOT?.trim();
  if (env && existsSync(env)) return env;
  // In Docker the app lives at /app; detect by checking __dirname
  if (__dirname.startsWith("/app")) return "/app";
  // src/ → worker/ → apps/ → repo root (3 levels up)
  return join(__dirname, "..", "..", "..");
}

/** Resolve the absolute path to the git binary. */
function findGit(): string {
  const candidates = [
    "/usr/bin/git",
    "/usr/local/bin/git",
    "/opt/homebrew/bin/git",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Fall back to PATH lookup
  try {
    return execSync("which git", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("git binary not found — install git in the container or on the host");
  }
}
// Lazily resolved — only called when a git clone is actually needed
let _git: string | null = null;
function getGit(): string {
  if (!_git) _git = findGit();
  return _git;
}

/**
 * Maps audit_kind to the prompt file(s) that should be loaded for that pass.
 *
 * Standard cluster: individual per-domain agent files when they exist, fallback to audit-agent.md
 * Investor cluster: investor-readiness.md, code-debt.md, intelligence_extraction_prompt.md
 * Domain cluster:   domain_audits.md (manifest generation + domain passes)
 * Visual cluster:   visual-*.md files + visual-synthesizer.md
 * Synthesizers:     synthesizer.md (standard), visual-synthesizer.md (visual)
 */
function loadClusterPrompts(auditKind?: string): { core: string; auditAgent: string } {
  const root = repoRoot();
  const promptDirs = [
    join(root, "audits", "prompts"),
    join(root, "apps", "worker", "audits", "prompts"),
    join(root, "auditsv2", "prompts"),
  ];
  const legacyDir = join(root, "legacy");

  function resolvePromptPath(filename: string): string | null {
    for (const dir of promptDirs) {
      const candidate = join(dir, filename);
      if (existsSync(candidate)) return candidate;
    }
    const legacyCandidate = join(legacyDir, filename);
    if (existsSync(legacyCandidate)) return legacyCandidate;
    return null;
  }

  const coreResolved = resolvePromptPath("core_system_prompt.md");
  if (!coreResolved) {
    const checkedLocations = [...promptDirs, legacyDir]
      .map((dir) => join(dir, "core_system_prompt.md"))
      .join(", ");
    throw new Error(
      `core_system_prompt.md not found. Checked: ${checkedLocations}`
    );
  }
  const core = readCachedPrompt(coreResolved);

  /**
   * Resolve a prompt file: prefer audits/prompts/, then legacy/ for older layouts.
   * Returns empty string if the file exists in neither location (never throws).
   */
  function prompt(filename: string): string {
    const resolved = resolvePromptPath(filename);
    if (resolved) return readCachedPrompt(resolved);
    // Keep previous behavior: cache the first expected location as empty.
    return readCachedPrompt(join(promptDirs[0], filename));
  }

  // Map audit_kind → prompt file(s), concatenated
  // When a domain has a dedicated agent file it provides tighter scope;
  // always prepend audit-agent.md as the output contract anchor.
  const base = prompt("audit-agent.md");

  let agentBody: string;
  switch (auditKind) {
    // ── Standard cluster — individual domain agent files ─────────────────
    case "logic":       agentBody = prompt("agent-logic.md")       || base; break;
    case "security":    agentBody = prompt("agent-security.md")    || base; break;
    case "performance": agentBody = prompt("agent-performance.md") || base; break;
    case "ux":          agentBody = prompt("agent-ux.md")          || base; break;
    case "data":        agentBody = prompt("agent-data.md")        || base; break;
    case "deploy":      agentBody = prompt("agent-deploy.md")      || base; break;

    // ── Standard cluster synthesizer ─────────────────────────────────────
    case "synthesize":  agentBody = prompt("synthesizer.md")       || base; break;

    // ── Visual cluster ───────────────────────────────────────────────────
    case "visual":
      // Combine all visual sub-agents so a single pass covers the full visual suite.
      // The visual-synthesizer handles rollup in a subsequent synthesize pass.
      agentBody = [
        prompt("visual-color.md"),
        prompt("visual-typography.md"),
        prompt("visual-components.md"),
        prompt("visual-layout.md"),
        prompt("visual-polish.md"),
        prompt("visual-tokens.md"),
      ].filter(Boolean).join("\n\n---\n\n") || base;
      break;

    case "visual_synthesize":
      agentBody = prompt("visual-synthesizer.md") || prompt("synthesizer.md") || base;
      break;

    // ── Investor cluster ─────────────────────────────────────────────────
    case "investor_readiness":
      agentBody = prompt("investor-readiness.md") || base;
      break;

    case "code_debt":
      agentBody = prompt("code-debt.md") || base;
      break;

    case "intelligence": {
      // Intelligence extraction must NOT be combined with audit-agent.md —
      // audit-agent.md's "Return ONLY valid JSON: {findings}" output contract
      // directly conflicts with the intelligence prompt's prose document format.
      // We return early with a standalone prompt + JSON wrapper.
      const intelligencePrompt = prompt("intelligence_extraction_prompt.md");
      if (intelligencePrompt) {
        const jsonWrapper = `

## Output Format

You MUST return valid JSON in this exact structure. Place the complete 10-section
markdown report as a string inside the "description" field:

{
  "coverage": {
    "coverage_complete": true,
    "confidence": "high",
    "files_reviewed": [],
    "modules_reviewed": []
  },
  "findings": [{
    "finding_id": "intelligence-report",
    "title": "Codebase Intelligence Report",
    "description": "## SECTION 1: PROJECT IDENTITY\\n\\n... (full report here as a JSON string) ...",
    "type": "intelligence",
    "severity": "minor",
    "priority": "P2",
    "status": "open"
  }]
}

Use \\n for newlines inside the "description" string. Do not include any text outside the JSON.`;
        return { core, auditAgent: intelligencePrompt + jsonWrapper };
      }
      agentBody = base;
      break;
    }

    // ── Domain cluster ───────────────────────────────────────────────────
    case "domain_manifest":
    case "domain_pass":
      agentBody = prompt("domain_audits.md") || base;
      break;

    // ── Meta synthesizers ────────────────────────────────────────────────
    case "cluster_synthesize":
    case "meta_synthesize":
    case "portfolio_synthesize":
      agentBody = prompt("synthesizer.md") || base;
      break;

    // ── Full / default ───────────────────────────────────────────────────
    case "full":
    default:
      agentBody = base;
      break;
  }

  const auditAgent = [base, agentBody !== base ? agentBody : ""].filter(Boolean).join("\n\n");
  console.log(`[penny-worker] cluster prompt loaded: kind=${auditKind ?? "full"}`);
  return { core, auditAgent };
}

/** @deprecated Use loadClusterPrompts() */
function loadPrompts(): { core: string; auditAgent: string } {
  return loadClusterPrompts("full");
}


/**
 * Run an array of async tasks with a maximum concurrency limit.
 * Preserves input order in the returned results array.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let failure: unknown = null;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      if (failure) return;
      const i = next++;
      try {
        results[i] = await tasks[i]();
      } catch (error) {
        failure = error;
        return;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  if (failure) throw failure;
  return results;
}

const DEFAULT_PASS_CONCURRENCY = 2;
const DEFAULT_MAX_PROJECT_LLM_COST_USD = 0.5;
const DEFAULT_MAX_PROJECT_LLM_FALLBACK_CALLS = 24;

function resolvePassConcurrency(): number {
  const raw = process.env.penny_PASS_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PASS_CONCURRENCY;
  return Math.min(parsed, 10);
}

function resolveMaxProjectLlmCostUsd(): number {
  const raw = process.env.penny_MAX_PROJECT_LLM_COST_USD?.trim();
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_PROJECT_LLM_COST_USD;
  return parsed;
}

function resolveMaxProjectLlmFallbackCalls(): number {
  const raw = process.env.penny_MAX_PROJECT_LLM_FALLBACK_CALLS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_PROJECT_LLM_FALLBACK_CALLS;
  return parsed;
}

function resolveAuditAbortReason(input: {
  projectName: string;
  completedPasses: number;
  totalPasses: number;
  totalLlmCostUsd: number;
  totalFallbackCalls: number;
}): string | null {
  const maxCostUsd = resolveMaxProjectLlmCostUsd();
  if (input.totalLlmCostUsd > maxCostUsd) {
    return `${input.projectName}: stopped audit after ${input.completedPasses}/${input.totalPasses} passes because LLM cost $${input.totalLlmCostUsd.toFixed(4)} exceeded budget $${maxCostUsd.toFixed(4)}`;
  }

  const maxFallbackCalls = resolveMaxProjectLlmFallbackCalls();
  if (input.totalFallbackCalls > maxFallbackCalls) {
    return `${input.projectName}: stopped audit after ${input.completedPasses}/${input.totalPasses} passes because fallback calls ${input.totalFallbackCalls} exceeded limit ${maxFallbackCalls}`;
  }

  return null;
}

const ACTIVE_FINDING_STATUSES = new Set([
  "open",
  "accepted",
  "in_progress",
]);

interface StoredProject {
  name: string;
  findings: unknown[];
  status?: string;
  repositoryUrl?: string;
  github_app_installation_id?: string;
  sourceType?: string;
  sourceRef?: string;
  repoAccess?: {
    localPath?: string;
    cloneRef?: string;
    mirrorPath?: string;
  };
  auditConfig?: {
    defaultBranch?: string;
    scanRoots?: string[];
    entrypoints?: string[];
    checklistId?: string;
  };
  manifest?: Record<string, unknown>;
  expectations?: {
    active?: { content?: string };
    draft?: { content?: string };
  };
  decisionHistory?: Array<Record<string, unknown>>;
}

const PORTFOLIO_SCAN_DIRS: Record<string, string> = {
  Advocera: "the_penny_lane_project/Advocera",
  Codra: "the_penny_lane_project/Codra",
  FounderOS: "the_penny_lane_project/FounderOS",
  Mythos: "the_penny_lane_project/Mythos",
  Passagr: "the_penny_lane_project/Passagr",
  Relevnt: "the_penny_lane_project/Relevnt",
  embr: "the_penny_lane_project/embr",
  ready: "the_penny_lane_project/ready",
  Dashboard: "the_penny_lane_project/dashboard",
  "Restoration Project": "the_penny_lane_project/restoration-project",
  "sarahsahl.pro": "the_penny_lane_project/sarahsahl_pro",
};

/** Normalize a finding title for semantic deduplication (case/punctuation-insensitive). */
function normalizeTitle(title: unknown): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeFindings2(
  existing: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
  repoRevision?: string
): { merged: Array<Record<string, unknown>>; added: number } {
  const byId = new Map<string, Record<string, unknown>>();
  // Secondary indices for deduplication: normalized title + category
  // Used to catch duplicates the LLM emits under different IDs.
  const byTitle = new Map<string, string>();
  const byTitleCategory = new Map<string, string>();
  const now = new Date().toISOString();

  for (const f of existing) {
    const id = String(f.finding_id ?? "");
    if (!id) continue;
    byId.set(id, { ...f });
    const nt = normalizeTitle(f.title);
    const cat = String(f.category ?? f.rule_id ?? "");
    if (nt && !byTitle.has(nt)) byTitle.set(nt, id);
    if (nt && cat && !byTitleCategory.has(`${nt}|${cat}`)) {
      byTitleCategory.set(`${nt}|${cat}`, id);
    }
  }

  let added = 0;
  const incomingIds = new Set<string>();

  for (const f of incoming) {
    const id = String(f.finding_id ?? "");
    if (!id) continue;

    // Check for duplicates: same title+category, different ID.
    // This catches noisy findings from low-confidence rebuilds.
    const nt = normalizeTitle(f.title);
    const cat = String(f.category ?? f.rule_id ?? "");
    let canonicalId = byId.has(id) ? id : undefined;

    if (!canonicalId && nt && cat) {
      // First try title+category match (most specific)
      canonicalId = byTitleCategory.get(`${nt}|${cat}`);
    }
    if (!canonicalId && nt) {
      // Fall back to title-only match
      canonicalId = byTitle.get(nt);
    }

    if (canonicalId && canonicalId !== id) {
      // Incoming finding is a duplicate of an existing one under a different ID.
      // Register the new ID as an alias so stale-finding logic still works,
      // but don't add it as a separate finding.
      incomingIds.add(canonicalId);
      incomingIds.add(id);
      const old = byId.get(canonicalId)!;
      byId.set(canonicalId, {
        ...old,
        last_seen_at: now,
        last_seen_revision: repoRevision ?? old.last_seen_revision,
      });
      continue;
    }

    incomingIds.add(id);
    if (!byId.has(id)) {
      byId.set(id, {
        ...f,
        status: f.status ?? "open",
        first_seen_at: f.first_seen_at ?? now,
        last_seen_at: now,
        last_seen_revision: repoRevision ?? f.last_seen_revision,
      });
      if (nt && !byTitle.has(nt)) byTitle.set(nt, id);
      if (nt && cat && !byTitleCategory.has(`${nt}|${cat}`)) {
        byTitleCategory.set(`${nt}|${cat}`, id);
      }
      added++;
    } else {
      // Upsert audit content fields but preserve local workflow state
      const old = byId.get(id)!;
      byId.set(id, {
        ...old,
        ...f,
        finding_id: id,
        // Preserve workflow fields from existing record
        status: old.status ?? f.status ?? "open",
        history: old.history ?? f.history,
        first_seen_at: old.first_seen_at ?? now,
        last_seen_at: now,
        last_seen_revision: repoRevision ?? old.last_seen_revision ?? f.last_seen_revision,
      });
    }
  }
  // QA-001: Resolve stale active findings that the LLM no longer reports.
  // Only do this when the re-audit actually produced findings; an empty
  // incoming set more likely indicates an audit/LLM failure than every issue
  // being fixed, so we leave existing findings untouched in that case.
  if (existing.length > 0 && incoming.length > 0) {
    for (const [id, f] of byId) {
      if (
        !incomingIds.has(id) &&
        ACTIVE_FINDING_STATUSES.has(String(f.status ?? ""))
      ) {
        byId.set(id, { ...f, status: "fixed_verified" });
      }
    }
  }
  return { merged: [...byId.values()], added };
}

interface AuditPassResult {
  findings: Array<Record<string, unknown>>;
  coverage: {
    coverage_complete: boolean;
    confidence: string;
    checklist_id?: string;
    known_findings_referenced: string[];
    files_reviewed: string[];
    modules_reviewed: string[];
    checklist_passed?: number;
    checklist_total?: number;
    incomplete_reason?: string;
  };
  raw_response: string;
}

interface ProjectAuditExecution {
  repoRoot: string;
  cleanup?: () => void;
  manifest: ProjectManifest;
  scope: AuditScope;
  manifestRevision: string;
  checklistId: string;
  manifestReused: boolean;
}

function inferRepairPolicy(finding: Record<string, unknown>): Record<string, unknown> {
  const category = String(finding.category ?? "").toLowerCase();
  const severity = String(finding.severity ?? "minor").toLowerCase();
  const highRisk =
    severity === "blocker" ||
    category.includes("auth") ||
    category.includes("billing") ||
    category.includes("migration") ||
    category.includes("privacy") ||
    category.includes("queue") ||
    category.includes("security");
  const lowRisk =
    category.includes("dead") ||
    category.includes("config") ||
    category.includes("type") ||
    category.includes("guard") ||
    category.includes("doc");
  return {
    autofix_eligibility: highRisk ? "manual_only" : lowRisk ? "eligible" : "suggest_only",
    risk_class: highRisk ? "high" : lowRisk ? "low" : "medium",
    verification_profile: highRisk ? "manual" : "targeted",
    approval_required: highRisk,
  };
}

function findingPaths(findings: Array<Record<string, unknown>>): string[] {
  const paths = new Set<string>();
  for (const finding of findings) {
    const hooks = Array.isArray(finding.proof_hooks)
      ? (finding.proof_hooks as Array<Record<string, unknown>>)
      : [];
    for (const hook of hooks) {
      if (typeof hook.file === "string" && hook.file.trim()) {
        paths.add(hook.file.trim());
      }
    }
    const fix = finding.suggested_fix;
    if (fix && typeof fix === "object" && Array.isArray((fix as Record<string, unknown>).affected_files)) {
      for (const value of (fix as Record<string, unknown>).affected_files as unknown[]) {
        if (typeof value === "string" && value.trim()) paths.add(value.trim());
      }
    }
  }
  return [...paths];
}

function knownFindingIds(findings: Array<Record<string, unknown>>): string[] {
  return knownFindingIdsForScope(findings);
}

function knownFindingIdsForScope(
  findings: Array<Record<string, unknown>>,
  scopeFiles: string[] = []
): string[] {
  const limit = Math.max(
    1,
    Number.parseInt(process.env.penny_KNOWN_FINDING_SCOPE_LIMIT?.trim() || "120", 10) || 120
  );
  const scopedFiles = new Set(scopeFiles.map((file) => file.trim()).filter(Boolean));
  const filtered = scopedFiles.size === 0
    ? findings
    : findings.filter((finding) => {
        const paths = findingPaths([finding]);
        return paths.some((path) => scopedFiles.has(path));
      });
  return filtered
    .map((finding) => String(finding.finding_id ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function asProjectManifest(value: Record<string, unknown> | null): ProjectManifest | null {
  if (!value) return null;
  const revision = typeof value.revision === "string" ? value.revision : "";
  const generatedAt = typeof value.generated_at === "string" ? value.generated_at : "";
  const sourceRoot = typeof value.source_root === "string" ? value.source_root : "";
  const exhaustiveness =
    value.exhaustiveness === "exhaustive" ? "exhaustive" : null;
  const checklistId = typeof value.checklist_id === "string" ? value.checklist_id : "";
  if (!revision || !generatedAt || !sourceRoot || !exhaustiveness || !checklistId) {
    return null;
  }
  return value as unknown as ProjectManifest;
}

function normalizeScopePaths(
  repoRootPath: string,
  scanRoots: string[],
  scope: AuditScope,
  manifest: ProjectManifest
): string[] {
  if (scope.scopeType === "diff") {
    return resolveScopeFiles(repoRootPath, scanRoots, scope, 1000)
      .map((fullPath) => fullPath.replace(repoRootPath + "/", ""));
  }
  const resolved = resolveScopePathsFromManifest(manifest, scope);
  return resolved.length > 0 ? resolved : manifest.modules.map((mod) => mod.path);
}

/**
 * Determine optimal exhaustiveness based on finding accumulation.
 * If findings are accumulating too fast (coverage_complete=false) and we're
 * doing a full rebuild, use sampled mode to reduce noise.
 */
function selectExhaustiveness(
  manifestReused: boolean,
  existingFindingsCount: number,
  previouslyRebuilt: boolean
): "exhaustive" | "sampled" {
  // If manifest was reused, keep exhaustive
  if (manifestReused) return "exhaustive";

  // If we have many findings AND this would be a full rebuild, use sampled mode
  // to avoid duplicate noise from re-checking everything
  if (existingFindingsCount > 5 && !previouslyRebuilt) {
    return "sampled";
  }

  // Otherwise use exhaustive for complete coverage
  return "exhaustive";
}

function buildDomainPasses(
  repoRootPath: string,
  scanRoots: string[],
  manifest: ProjectManifest,
  scope: AuditScope
): Array<{ label: string; files: string[] }> {
  const chunkSize = 8;
  const scopeType = scope.scopeType ?? "project";
  const requestedFiles = normalizeScopePaths(repoRootPath, scanRoots, scope, manifest);
  if (scopeType === "project") {
    const grouped = new Map<string, string[]>();
    for (const mod of manifest.modules) {
      const current = grouped.get(mod.domain) ?? [];
      current.push(mod.path);
      grouped.set(mod.domain, current);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([domain, files]) => {
        const passes: Array<{ label: string; files: string[] }> = [];
        for (let idx = 0; idx < files.length; idx += chunkSize) {
          const chunk = files.slice(idx, idx + chunkSize);
          passes.push({
            label:
              files.length > chunkSize
                ? `domain:${domain}#${Math.floor(idx / chunkSize) + 1}`
                : `domain:${domain}`,
            files: chunk,
          });
        }
        return passes;
      });
  }
  const passes: Array<{ label: string; files: string[] }> = [];
  for (let idx = 0; idx < requestedFiles.length; idx += chunkSize) {
    passes.push({
      label:
        scopeType === "domain"
          ? `domain:${scope.scopePaths?.join(", ") ?? "selected"}#${Math.floor(idx / chunkSize) + 1}`
          : `${scopeType}:selected#${Math.floor(idx / chunkSize) + 1}`,
      files: requestedFiles.slice(idx, idx + chunkSize),
    });
  }
  return passes;
}

async function executeProjectAudit(
  project: StoredProject,
  payload: Record<string, unknown>,
  pool: pg.Pool
): Promise<ProjectAuditExecution> {
  const repoAccess = await resolveProjectRepo(
    project,
    typeof payload.repo_ref === "string" ? payload.repo_ref : undefined
  );
  const scope = scopeFromPayload(payload, project);
  const checklistId =
    typeof payload.checklist_id === "string"
      ? payload.checklist_id
      : project.auditConfig?.checklistId ?? "penny-bounded-audit-v1";
  const currentRevision = resolveRepoRevision(repoAccess.repoRoot);
  const cachedManifest =
    currentRevision !== "workspace"
      ? asProjectManifest(await loadLatestProjectManifest(pool, project.name))
      : null;
  const manifest =
    cachedManifest &&
    cachedManifest.revision === currentRevision &&
    cachedManifest.checklist_id === checklistId &&
    cachedManifest.exhaustiveness === "exhaustive"
      ? cachedManifest
      : buildProjectManifest(
          repoAccess.repoRoot,
          project.auditConfig?.scanRoots ?? ["./"],
          project.auditConfig?.entrypoints ?? [],
          checklistId
        );
  const manifestReused = manifest === cachedManifest;
  if (!manifestReused) {
    manifest.domains = summarizeCoverageFromManifest(
      manifest,
      [],
      [],
      manifest.generated_at
    );
    await saveProjectManifest(pool, {
      projectName: project.name,
      repoRevision: manifest.revision,
      sourceRoot: manifest.source_root,
      checklistId: manifest.checklist_id,
      exhaustiveness: manifest.exhaustiveness,
      manifest: manifest as unknown as Record<string, unknown>,
    });
  } else {
    console.log(
      `[penny-worker] reused manifest for ${project.name} revision ${manifest.revision}`
    );
  }
  return {
    repoRoot: repoAccess.repoRoot,
    cleanup: repoAccess.cleanup,
    manifest,
    scope,
    manifestRevision: manifest.revision,
    checklistId,
    manifestReused,
  };
}

function getClusterFromAuditKind(auditKind?: string): string {
  switch (auditKind) {
    case "investor_readiness":
    case "code_debt":
    case "intelligence":
      return "investor";
    case "domain_manifest":
    case "domain_pass":
      return "domain";
    case "visual":
    case "visual_synthesize":
      return "visual";
    case "logic":
    case "security":
    case "performance":
    case "ux":
    case "data":
    case "deploy":
    case "synthesize":
    case "full":
    default:
      return "standard";
  }
}

function buildRepairFindingPayload(
  projectId: string,
  runId: string,
  finding: Record<string, unknown>,
  filePath: string,
  codeContext: string
): RepairJobRequest["finding"] {
  const suggestedFix =
    finding.suggested_fix && typeof finding.suggested_fix === "object"
      ? { ...(finding.suggested_fix as Record<string, unknown>) }
      : {};
  const affectedFiles = Array.isArray(suggestedFix.affected_files)
    ? [...(suggestedFix.affected_files as unknown[]).map((value) => String(value).trim()).filter(Boolean)]
    : [];
  if (!affectedFiles.includes(filePath)) {
    affectedFiles.unshift(filePath);
  }
  suggestedFix.affected_files = affectedFiles;

  const proofHooks = Array.isArray(finding.proof_hooks)
    ? (finding.proof_hooks as Array<Record<string, unknown>>)
    : [];
  const history = Array.isArray(finding.history)
    ? (finding.history as Array<Record<string, unknown>>)
    : [];
  const repairPolicy = inferRepairPolicy(finding);
  const raw = {
    ...finding,
    repair_policy: repairPolicy,
    code_context: codeContext,
    repair_request: {
      source: "penny-worker",
      audit_run_id: runId,
      intended_routing_strategy:
        process.env.penny_REPAIR_ROUTING_STRATEGY?.trim() ||
        process.env.penny_ROUTING_STRATEGY?.trim() ||
        "balanced",
    },
  };

  return {
    finding_id: String(finding.finding_id ?? "").trim(),
    type: String(finding.type ?? "bug").trim() || "bug",
    category: String(finding.category ?? "unknown").trim() || "unknown",
    severity: String(finding.severity ?? "high").trim() || "high",
    priority: String(finding.priority ?? "P2").trim() || "P2",
    confidence: String(finding.confidence ?? "inference").trim() || "inference",
    title: String(finding.title ?? "Finding").trim() || "Finding",
    description: String(finding.description ?? "").trim(),
    impact: String(finding.impact ?? "").trim(),
    status: String(finding.status ?? "open").trim() || "open",
    suggested_fix: suggestedFix,
    proof_hooks: proofHooks,
    history,
    raw,
    project_name: projectId,
  };
}

/**
 * Trigger repair jobs for high-priority findings.
 * Called after audit completes to submit eligible findings for automated repair.
 *
 * Eligibility criteria:
 * - autofix_eligibility is not "manual_only"
 * - Severity is high or blocker (high-risk findings)
 * - Not a duplicate
 * - File path available for context
 */
async function triggerRepairsForFindings(
  pool: pg.Pool,
  projectId: string,
  runId: string,
  findings: Array<Record<string, unknown>>,
  repoRoot: string,
  repositoryUrl?: string,
): Promise<void> {
  const repairClient = getRepairClient();

  // Check if repair service is available
  try {
    await repairClient.health();
  } catch (error) {
    console.warn(
      `[penny-worker] Repair service unavailable, skipping repairs: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }

  // Filter for eligible findings
  const eligible = findings.filter((finding) => {
    // Skip if already has a repair job
    if (finding.repair_job_id) {
      return false;
    }

    // Check autofix eligibility
    const autofix = String(finding.autofix_eligibility ?? "").toLowerCase();
    if (autofix === "manual_only") {
      return false;
    }

    // Only repair high-priority findings
    const severity = String(finding.severity ?? "").toLowerCase();
    if (severity !== "blocker" && severity !== "high") {
      return false;
    }

    // Skip duplicates
    if (finding.duplicate_of) {
      return false;
    }

    // Need a file path for context
    const filePath = String(finding.file_path ?? "").trim();
    if (!filePath) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) {
    console.log(`[penny-worker] No eligible findings for repair in run ${runId}`);
    return;
  }

  console.log(`[penny-worker] Submitting ${eligible.length} findings to repair service`);

  // Submit each eligible finding for repair
  for (const finding of eligible) {
    try {
      const filePath = String(finding.file_path ?? "").trim();
      const findingId = String(finding.finding_id ?? "").trim();
      const repairPolicy = inferRepairPolicy(finding);
      const suggestedFix =
        finding.suggested_fix && typeof finding.suggested_fix === "object"
          ? (finding.suggested_fix as Record<string, unknown>)
          : {};
      const verificationCommands = Array.isArray(suggestedFix.verification_commands)
        ? (suggestedFix.verification_commands as unknown[])
            .map((value) => String(value).trim())
            .filter(Boolean)
        : [];

      // Build code context (simplified - in production would load actual file content)
      let codeContext = "";
      try {
        const fullPath = join(repoRoot, filePath);
        if (existsSync(fullPath)) {
          codeContext = readFileSync(fullPath, "utf-8").slice(0, 10000); // First 10KB
        }
      } catch (error) {
        console.warn(`[penny-worker] Failed to read file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`);
      }

      // Try Lane patch first; fall through to paid repair service if confidence is
      // too low (< 0.70) or if Lane is unavailable / returns an error.
      const LANE_PATCH_MIN_CONFIDENCE = 0.70;
      if (isLaneConfigured() && repositoryUrl) {
        try {
          const laneResult = await lanePatch({
            project_id: projectId,
            repository: repositoryUrl,
            finding: {
              id: findingId,
              type: String(finding.type ?? "bug"),
              severity: String(finding.severity ?? "minor"),
              file: filePath,
              message: String(finding.description ?? finding.title ?? ""),
            },
            metadata: { audit_run_id: runId },
          });

          if (laneResult.status === "completed" && laneResult.confidence >= LANE_PATCH_MIN_CONFIDENCE) {
            finding.repair_job_id = laneResult.patch_id;
            finding.repair_status = "lane_patched";
            finding.lane_patch_diff = laneResult.diff;
            finding.lane_patch_confidence = laneResult.confidence;
            console.log(
              `[penny-worker] Lane patched finding ${findingId} ` +
              `(confidence ${laneResult.confidence.toFixed(2)}), skipping paid repair`
            );
            continue; // skip paid repair service for this finding
          }

          console.log(
            `[penny-worker] Lane patch for ${findingId} below threshold ` +
            `(${laneResult.confidence.toFixed(2)} < ${LANE_PATCH_MIN_CONFIDENCE}), ` +
            `elevating to paid repair service`
          );
        } catch (laneErr) {
          console.warn(
            `[penny-worker] Lane patch failed for ${findingId}, ` +
            `elevating to paid repair service: ${
              laneErr instanceof Error ? laneErr.message : String(laneErr)
            }`
          );
        }
      }

      await insertRepairJob(pool, {
        projectName: projectId,
        findingId,
        repairPolicy,
        targetedFiles: [filePath],
        verificationCommands,
        payload: {
          source: "penny-worker",
          audit_run_id: runId,
          routing_strategy:
            process.env.penny_REPAIR_ROUTING_STRATEGY?.trim() ||
            process.env.penny_ROUTING_STRATEGY?.trim() ||
            "balanced",
        },
      });

      const repairRequest: RepairJobRequest = {
        project_id: projectId,
        repo_root: repoRoot,
        finding: buildRepairFindingPayload(projectId, runId, finding, filePath, codeContext),
      };

      // Submit job (non-blocking)
      const jobResponse = await repairClient.submitJob(repairRequest);

      // Update finding with repair job ID
      finding.repair_job_id = jobResponse.repair_job_id;
      finding.repair_status = "submitted";

      console.log(
        `[penny-worker] Submitted repair job ${jobResponse.repair_job_id} for finding ${findingId}`
      );
    } catch (error) {
      const findingId = String(finding.finding_id ?? "").trim();
      try {
        await pool.query(
          `DELETE FROM penny_repair_jobs
            WHERE finding_id = $1
              AND lower(trim(project_name)) = $2
              AND status = 'queued'`,
          [findingId, projectId.trim().toLowerCase()]
        );
      } catch (cleanupError) {
        console.warn(
          `[penny-worker] Failed to clean queued repair ledger row for ${findingId}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`
        );
      }
      console.error(
        `[penny-worker] Failed to submit repair for finding ${finding.finding_id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Continue with next finding on error
    }
  }
}

export async function processJob(pool: pg.Pool, dbJobId: string): Promise<void> {
  const job = await claimJob(pool, dbJobId);
  if (!job) {
    console.log(`[penny-worker] skip job ${dbJobId} (not queued or done)`);
    return;
  }

  let core: string;
  let auditAgent: string;
  const jobStartedAt = Date.now();
  const payload = job.payload || {};
  const visualOnly = Boolean(payload.visual_only);
  const queueWaitMs = (() => {
    if (!job.created_at) return null;
    const createdAt = Date.parse(job.created_at);
    return Number.isFinite(createdAt) ? Math.max(0, jobStartedAt - createdAt) : null;
  })();

  try {
    ({ core, auditAgent } = loadClusterPrompts(
      typeof payload.audit_kind === "string" ? payload.audit_kind : undefined
    ));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[penny-worker] job ${dbJobId} prep failed`, e);
    PennyObservability.captureError(e instanceof Error ? e : new Error(msg), {
      jobId: dbJobId,
      stage: "prompt_load",
      jobType: job?.job_type,
    });
    try {
      await completeJob(pool, dbJobId, msg, {
        job_type: job.job_type,
        project_name: job.project_name,
        summary: `Failed (setup): ${msg.slice(0, 200)}`,
        findings_added: 0,
      });
    } catch (ce) {
      console.error(`[penny-worker] completeJob after prep failure`, ce);
    }
    return;
  }

  try {
    if (job.job_type === "cluster_synthesize") {
      const cluster = getClusterFromAuditKind(typeof payload.audit_kind === "string" ? payload.audit_kind : undefined);
      await runClusterSynthesize(pool, job, core, auditAgent, cluster);
      return;
    }
    if (job.job_type === "meta_synthesize") {
      await runMetaSynthesize(pool, job, core, auditAgent);
      return;
    }
    if (job.job_type === "portfolio_synthesize") {
      await runPortfolioSynthesize(pool, job, core, auditAgent);
      return;
    }
    if (job.job_type === "synthesize_project") {
      await runSynthesize(pool, job, core, auditAgent);
      return;
    }
    let totalAdded = 0;
    const summaries: string[] = [];
    const projectAuditDetails: Array<Record<string, unknown>> = [];
    let auditModel = "unknown";
    let jobCoverageComplete = true;
    let jobConfidence: string | null = "high";
    let jobManifestRevision: string | null = job.manifest_revision ?? null;
    let jobChecklistId: string | null = job.checklist_id ?? null;
    const jobMetrics = {
      queue_wait_ms: queueWaitMs,
      total_llm_cost_usd: 0,
      total_llm_input_tokens: 0,
      total_llm_output_tokens: 0,
      llm_cache_hits: 0,
      llm_fallback_calls: 0,
      llm_attempts: 0,
      manifest_reuse_count: 0,
      manifest_rebuild_count: 0,
      prompt_context_chars: 0,
      prompt_scope_file_count: 0,
      pass_count: 0,
    };
    const projects = await resolveProjectsForJob(pool, job.project_name);

    for (const project of projects) {
      const projectStatus = project.status ?? "active";
      // Allow auditing of both active and draft projects
      if (!["active", "draft"].includes(projectStatus)) {
        throw new Error(`Project "${project.name}" has status "${projectStatus}" and cannot be audited`);
      }
      if (!isLaneConfigured()) {
        throw new Error("Lane must be configured to run Penny audits.");
      }
      const execution = await executeProjectAudit(project, payload, pool);
      try {
        jobManifestRevision = execution.manifestRevision;
        jobChecklistId = execution.checklistId;
        if (execution.manifestReused) {
          jobMetrics.manifest_reuse_count += 1;
        } else {
          jobMetrics.manifest_rebuild_count += 1;
        }
        const expectations = readProjectExpectations(project, execution.repoRoot);
        const prev = await loadProject(pool, project.name);
        const existing = (prev?.findings ?? []) as Array<Record<string, unknown>>;
        const scanRoots = project.auditConfig?.scanRoots ?? ["./"];
        const auditKindStr = typeof payload.audit_kind === "string" ? payload.audit_kind : undefined;
        const cluster = getClusterFromAuditKind(auditKindStr);

        // ── Intelligence extraction: single wide-context pass ──────────────
        // Intelligence runs BEFORE domain chunking. It needs to see the full
        // architecture (package.json, README, schema, entry points, Dockerfiles,
        // CI config) — not 8-file domain slices. We bypass buildDomainPasses
        // entirely and run one LLM call over the curated anchor context.
        if (auditKindStr === "intelligence") {
          // execution.repoRoot is already the project-specific directory (resolved
          // from PORTFOLIO_SCAN_DIRS or localPath). scanRoots are relative to the
          // penny workspace root, so passing them to buildIntelligenceContext would
          // double-apply the path. Use ["./"] to scan within execution.repoRoot.
          const intelligenceContext = buildIntelligenceContext(
            execution.repoRoot,
            ["./"]
          );
          const llm = await auditWithLane(
            core,
            auditAgent,
            expectations,
            intelligenceContext,
            project.name,
            false,
            auditKindStr,
            {
              scopeLabel: "intelligence:full-repo-anchor",
              filesInScope: [],
              knownFindingIds: knownFindingIds(existing),
              checklistId: execution.checklistId,
              manifestRevision: execution.manifestRevision,
              repositoryUrl: project.repositoryUrl,
            }
          );
          jobMetrics.total_llm_cost_usd += llm.costUsd ?? 0;
          jobMetrics.total_llm_input_tokens += llm.inputTokens ?? 0;
          jobMetrics.total_llm_output_tokens += llm.outputTokens ?? 0;
          jobMetrics.llm_cache_hits += llm.cacheHit ? 1 : 0;
          jobMetrics.llm_fallback_calls += llm.fallbackCount ?? 0;
          jobMetrics.llm_attempts += llm.attemptCount ?? 0;
          jobMetrics.prompt_context_chars += intelligenceContext.length;
          auditModel = llm.model || auditModel;

          // Log intelligence extraction for observability
          PennyObservability.logExecution({
            run_id: job.id,
            project_id: project.name,
            agent_name: "intelligence",
            model: llm.model,
            latency_ms: llm.latency_ms ?? 0,
            cost_usd: llm.costUsd ?? 0,
            input_tokens: llm.inputTokens ?? 0,
            output_tokens: llm.outputTokens ?? 0,
            status: llm.fallbackCount && llm.fallbackCount > 0 ? "fallback_triggered" : "success",
          });

          // Log model usage to Supabase for cost tracking
          const supabaseClient = getSupabaseClient();
          if (supabaseClient) {
            await logAuditMetrics(
              supabaseClient,
              job.id,
              "intelligence",
              {
                model: llm.model,
                inputTokens: llm.inputTokens ?? 0,
                outputTokens: llm.outputTokens ?? 0,
                latency_ms: llm.latency_ms ?? 0,
              } as any // AuditLlmResult-like object for cost calculation
            );
          }

          const mappedFindings = llm.findings.map((f) => ({
            ...f,
            cluster,
            repair_policy: inferRepairPolicy(f as unknown as Record<string, unknown>),
          })) as Array<Record<string, unknown>>;
          const { merged, added } = mergeFindings2(existing, mappedFindings, execution.manifestRevision);
          totalAdded += added;
          await saveProject(pool, {
            ...(prev ?? {}),
            name: project.name,
            findings: merged,
            manifest: { ...execution.manifest },
            decisionHistory: Array.isArray(prev?.decisionHistory)
              ? [...(prev.decisionHistory as Array<Record<string, unknown>>), {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  timestamp: new Date().toISOString(),
                  actor: "worker",
                  event_type: "intelligence_extracted",
                  model: auditModel,
                  after: { findings: merged.length },
                }]
              : [],
            lastUpdated: new Date().toISOString(),
          });
          summaries.push(`${project.name}: intelligence extraction complete (+${added} findings)`);
          continue; // skip domain-pass loop for this project
        }
        // ──────────────────────────────────────────────────────────────────

        const passes = buildDomainPasses(
          execution.repoRoot,
          scanRoots,
          execution.manifest,
          execution.scope
        );
        const passResults: AuditPassResult[] = [];
        let findings: Array<Record<string, unknown>> = [];

        // Run passes in bounded batches so we can stop spending after hard failures
        // or once the project-level budget/fallback threshold is exceeded.
        const PASS_CONCURRENCY = resolvePassConcurrency();
        const passTaskResults: Array<{
          llm: Awaited<ReturnType<typeof auditWithLane>>;
          pass: { label: string; files: string[] };
          codeContextChars: number;
        }> = [];
        let auditAbortReason: string | null = null;

        for (let start = 0; start < passes.length; start += PASS_CONCURRENCY) {
          const batch = passes.slice(start, start + PASS_CONCURRENCY);
          const batchResults = await runWithConcurrency(
            batch.map((pass) => async () => {
              const passScope: AuditScope = {
                ...execution.scope,
                files: pass.files,
                scopePaths: pass.files,
                includeReportExcerpt: false,
                maxFiles:
                  typeof payload.max_files === "number"
                    ? payload.max_files
                    : Math.max(pass.files.length, 1),
              };
              const code = buildCodeContextForAudit(
                execution.repoRoot,
                scanRoots,
                passScope
              );
              const llm = await auditWithLane(
                core,
                auditAgent,
                expectations,
                code,
                project.name,
                visualOnly,
                auditKindStr,
                {
                  scopeLabel: pass.label,
                  filesInScope: pass.files,
                  knownFindingIds: knownFindingIdsForScope(existing, pass.files),
                  checklistId: execution.checklistId,
                  manifestRevision: execution.manifestRevision,
                  repositoryUrl: project.repositoryUrl,
                }
              );
              return { llm, pass, codeContextChars: code.length };
            }),
            PASS_CONCURRENCY
          );

          for (const { llm, pass, codeContextChars } of batchResults) {
            passTaskResults.push({ llm, pass, codeContextChars });
          jobMetrics.pass_count += 1;
          jobMetrics.total_llm_cost_usd += llm.costUsd ?? 0;
          jobMetrics.total_llm_input_tokens += llm.inputTokens ?? 0;
          jobMetrics.total_llm_output_tokens += llm.outputTokens ?? 0;
          jobMetrics.llm_cache_hits += llm.cacheHit ? 1 : 0;
          jobMetrics.llm_fallback_calls += llm.fallbackCount ?? 0;
          jobMetrics.llm_attempts += llm.attemptCount ?? 0;
          jobMetrics.prompt_context_chars += codeContextChars;
          jobMetrics.prompt_scope_file_count += pass.files.length;
          auditModel = llm.model || auditModel;

          // Log audit execution for observability (Sentry + Datadog)
          PennyObservability.logExecution({
            run_id: job.id,
            project_id: project.name,
            agent_name: auditKindStr || "full",
            model: llm.model,
            latency_ms: llm.latency_ms ?? 0,
            cost_usd: llm.costUsd ?? 0,
            input_tokens: llm.inputTokens ?? 0,
            output_tokens: llm.outputTokens ?? 0,
            status: llm.fallbackCount && llm.fallbackCount > 0 ? "fallback_triggered" : "success",
          });

          // Log model usage to Supabase for cost tracking
          const supabaseClient = getSupabaseClient();
          if (supabaseClient) {
            await logAuditMetrics(
              supabaseClient,
              job.id,
              auditKindStr || "full",
              {
                model: llm.model,
                inputTokens: llm.inputTokens ?? 0,
                outputTokens: llm.outputTokens ?? 0,
                latency_ms: llm.latency_ms ?? 0,
              } as any // AuditLlmResult-like object for cost calculation
            );
          }

          passResults.push({
            findings: llm.findings.map((finding) => ({
              ...finding,
              cluster,
              repair_policy: inferRepairPolicy(finding as unknown as Record<string, unknown>),
            })),
            coverage: {
              coverage_complete: Boolean(llm.coverage.coverage_complete),
              confidence: llm.coverage.confidence ?? "medium",
              checklist_id: llm.coverage.checklist_id,
              known_findings_referenced: llm.coverage.known_findings_referenced ?? [],
              files_reviewed:
                (llm.coverage.files_reviewed?.length ?? 0) > 0
                  ? llm.coverage.files_reviewed ?? []
                  : pass.files,
              modules_reviewed:
                (llm.coverage.modules_reviewed?.length ?? 0) > 0
                  ? llm.coverage.modules_reviewed ?? []
                  : pass.files,
              checklist_passed: llm.coverage.checklist_passed,
              checklist_total: llm.coverage.checklist_total,
              incomplete_reason: llm.coverage.incomplete_reason,
            },
            raw_response: llm.raw_response,
          });
          findings = findings.concat(
            llm.findings.map((finding) => ({
              ...finding,
              cluster,
              repair_policy: inferRepairPolicy(finding as unknown as Record<string, unknown>),
            })) as Array<Record<string, unknown>>
          );
          }

          const abortReason = resolveAuditAbortReason({
            projectName: project.name,
            completedPasses: passTaskResults.length,
            totalPasses: passes.length,
            totalLlmCostUsd: jobMetrics.total_llm_cost_usd,
            totalFallbackCalls: jobMetrics.llm_fallback_calls,
          });
          if (abortReason) {
            auditAbortReason = abortReason;
            break;
          }
        }

        const { merged, added } = mergeFindings2(existing, findings, execution.manifestRevision);
        totalAdded += added;
        const reviewedFiles = [...new Set(passResults.flatMap((result) => result.coverage.files_reviewed))];
        const coverageComplete = passResults.every((result) => result.coverage.coverage_complete);
        const confidence =
          passResults.some((result) => result.coverage.confidence === "low")
            ? "low"
            : passResults.some((result) => result.coverage.confidence === "medium")
              ? "medium"
              : "high";
        jobCoverageComplete = jobCoverageComplete && coverageComplete;
        jobConfidence =
          jobConfidence === "low" || confidence === "low"
            ? "low"
            : jobConfidence === "medium" || confidence === "medium"
              ? "medium"
              : "high";
        const coverageDomains = summarizeCoverageFromManifest(
          execution.manifest,
          reviewedFiles,
          findingPaths(findings),
          new Date().toISOString()
        );
        const decisionHistory = Array.isArray(prev?.decisionHistory)
          ? [...(prev?.decisionHistory as Array<Record<string, unknown>>)]
          : [];
        decisionHistory.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          actor: "worker",
          event_type: "audit_run_completed",
          target_type: "audit",
          audit_kind: String(payload.audit_kind ?? (visualOnly ? "visual" : "full")),
          scope_type: String(execution.scope.scopeType ?? "project"),
          scope_paths: execution.scope.scopePaths ?? [],
          model: auditModel,
          before: { findings: existing.length },
          after: {
            findings: merged.length,
            coverage_complete: coverageComplete,
            manifest_revision: execution.manifestRevision,
          },
        });
        // Spread prev to preserve all project fields (stack, repositoryUrl, etc.)
        await saveProject(pool, {
          ...(prev ?? {}),
          name: project.name,
          findings: merged,
          manifest: {
            ...execution.manifest,
            domains: coverageDomains,
          },
          decisionHistory,
          lastUpdated: new Date().toISOString(),
        });
        try {
          await upsertMaintenanceBacklogFromFindings(pool, project.name, merged);
        } catch (maintenanceError) {
          console.warn(
            `[penny-worker] maintenance backlog sync skipped for ${project.name}: ${
              maintenanceError instanceof Error ? maintenanceError.message : String(maintenanceError)
            }`
          );
        }

        // Trigger repairs for eligible findings (non-blocking)
        // Extract project_id from the audit run payload if available
        const projectIdFromPayload =
          typeof payload.project_id === "string" ? payload.project_id : undefined;
        if (projectIdFromPayload && added > 0) {
          try {
            await triggerRepairsForFindings(
              pool,
              projectIdFromPayload,
              job.id,
              merged,
              execution.repoRoot,
              project.repositoryUrl,
            );
            // Save findings again with repair_job_ids
            await saveProject(pool, {
              ...(prev ?? {}),
              name: project.name,
              findings: merged,
              manifest: {
                ...execution.manifest,
                domains: coverageDomains,
              },
              decisionHistory,
              lastUpdated: new Date().toISOString(),
            });
          } catch (repairError) {
            console.warn(
              `[penny-worker] repair trigger skipped for ${project.name}: ${
                repairError instanceof Error ? repairError.message : String(repairError)
              }`
            );
          }
        }

        summaries.push(
          `${project.name}: +${added} findings, ${coverageComplete ? "coverage complete" : "coverage partial"}${
            auditAbortReason ? " (stopped early)" : ""
          }`
        );
        projectAuditDetails.push({
          project: project.name,
          scope_type: execution.scope.scopeType ?? "project",
          scope_paths: execution.scope.scopePaths ?? [],
          scan_roots: scanRoots,
          findings_returned: findings.length,
          findings_added: added,
          manifest_revision: execution.manifestRevision,
          checklist_id: execution.checklistId,
          coverage_complete: coverageComplete,
          completion_confidence: confidence,
          known_finding_ids: knownFindingIds(existing),
          metrics: {
            manifest_reused: execution.manifestReused,
            llm_cost_usd: passTaskResults.reduce((sum, result) => sum + (result.llm.costUsd ?? 0), 0),
            llm_input_tokens: passTaskResults.reduce((sum, result) => sum + (result.llm.inputTokens ?? 0), 0),
            llm_output_tokens: passTaskResults.reduce((sum, result) => sum + (result.llm.outputTokens ?? 0), 0),
            llm_cache_hits: passTaskResults.filter((result) => result.llm.cacheHit).length,
            llm_fallback_calls: passTaskResults.reduce((sum, result) => sum + (result.llm.fallbackCount ?? 0), 0),
            llm_attempts: passTaskResults.reduce((sum, result) => sum + (result.llm.attemptCount ?? 0), 0),
            pass_count: passTaskResults.length,
            prompt_context_chars: passTaskResults.reduce((sum, result) => sum + result.codeContextChars, 0),
          },
          files_in_scope: normalizeScopePaths(
            execution.repoRoot,
            scanRoots,
            execution.scope,
            execution.manifest
          ),
          files_reviewed: reviewedFiles,
          known_findings_referenced: [
            ...new Set(
              passResults.flatMap((result) => result.coverage.known_findings_referenced)
            ),
          ],
          raw_llm_output: passResults.map((result) => result.raw_response).join("\n\n"),
          repo_root: execution.repoRoot,
          exhaustiveness: execution.manifest.exhaustiveness,
        });
        if (auditAbortReason) {
          throw new Error(auditAbortReason);
        }
      } finally {
        execution.cleanup?.();
      }
    }

    const jobExhaustiveness = projectAuditDetails.some(
      (d) => String((d as { exhaustiveness?: string }).exhaustiveness ?? "") === "sampled"
    )
      ? "sampled"
      : projectAuditDetails.length > 0
        ? "exhaustive"
        : "exhaustive";

    await completeJob(pool, dbJobId, null, {
      job_type: job.job_type,
      project_name: job.project_name,
      summary: summaries.join("; ") || "audit complete",
      findings_added: totalAdded,
      manifest_revision: jobManifestRevision,
      checklist_id: jobChecklistId,
      coverage_complete: jobCoverageComplete,
      completion_confidence: jobConfidence,
      exhaustiveness: jobExhaustiveness,
      payload: {
        projects: projects.map((p) => p.name),
        visual_only: visualOnly,
        audit_kind: payload.audit_kind ?? (visualOnly ? "visual" : "full"),
        audit_model: auditModel,
        audit_metrics: {
          ...jobMetrics,
          duration_ms: Date.now() - jobStartedAt,
        },
        project_audit_details: projectAuditDetails,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[penny-worker] job ${dbJobId} failed`, e);
    PennyObservability.captureError(e instanceof Error ? e : new Error(msg), {
      jobId: dbJobId,
      stage: "audit_execution",
      jobType: job?.job_type,
      projectName: job?.project_name,
    });
    try {
      await completeJob(pool, dbJobId, msg, {
        job_type: job.job_type,
        project_name: job.project_name,
        summary: `Failed: ${msg.slice(0, 200)}`,
        findings_added: 0,
      });
    } catch (ce) {
      console.error(`[penny-worker] completeJob failed after job error`, ce);
      throw ce;
    }
  }
}

async function resolveProjectsForJob(
  pool: pg.Pool,
  projectName: string | null
): Promise<StoredProject[]> {
  if (projectName?.trim()) {
    const raw = (await loadProject(pool, projectName.trim())) as StoredProject | null;
    const project = raw ? normalizeProjectConfig(raw) : null;
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }
    return [project];
  }
  const allProjects = ((await listAllProjects(pool)) as StoredProject[]).map(normalizeProjectConfig);
  return allProjects.filter((project) => (project.status ?? "active") === "active");
}

function normalizeProjectConfig(project: StoredProject): StoredProject {
  if (project.repoAccess?.localPath) {
    return {
      ...project,
      status: project.status ?? "active",
      sourceType: "local_path",
      sourceRef: project.repoAccess.localPath,
    };
  }
  if (project.sourceType && project.auditConfig?.scanRoots?.length) return project;
  const scanDir = PORTFOLIO_SCAN_DIRS[project.name];
  if (!scanDir) {
    return {
      ...project,
      status: project.status ?? "active",
      sourceType: project.sourceType ?? "import",
    };
  }
  return {
    ...project,
    status: project.status ?? "active",
    sourceType: project.sourceType ?? "portfolio_mirror",
    sourceRef: project.sourceRef ?? scanDir,
    auditConfig: {
      ...project.auditConfig,
      scanRoots:
        project.auditConfig?.scanRoots && project.auditConfig.scanRoots.length > 0
          ? project.auditConfig.scanRoots
          : [scanDir],
    },
  };
}

function scopeFromPayload(
  payload: Record<string, unknown>,
  project: StoredProject
): AuditScope {
  const scopeType =
    typeof payload.scope_type === "string" ? payload.scope_type : "project";
  const scanRoots = project.auditConfig?.scanRoots ?? ["./"];
  const scopePaths = Array.isArray(payload.scope_paths)
    ? payload.scope_paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  return {
    scopeType,
    scopePaths: scopePaths.length > 0 ? scopePaths : scanRoots,
    baseRef: typeof payload.base_ref === "string" ? payload.base_ref : undefined,
    headRef: typeof payload.head_ref === "string" ? payload.head_ref : undefined,
    maxFiles: typeof payload.max_files === "number" ? payload.max_files : undefined,
    maxCharsPerFile:
      typeof payload.max_chars_per_file === "number"
        ? payload.max_chars_per_file
        : undefined,
  };
}

function readProjectExpectations(project: StoredProject, fallbackRepoRoot: string): string {
  const content =
    project.expectations?.active?.content ??
    project.expectations?.draft?.content;
  if (typeof content === "string" && content.trim()) return content;
  return readExpectations(fallbackRepoRoot, "audits/expectations.md");
}

async function resolveProjectRepo(
  project: StoredProject,
  repoRef?: string
): Promise<{
  repoRoot: string;
  cleanup?: () => void;
}> {
  const sourceType = project.sourceType ?? "portfolio_mirror";
  const requestedRef = repoRef?.trim();
  const sourceRef =
    project.repoAccess?.localPath ??
    project.repoAccess?.cloneRef ??
    project.sourceRef ??
    project.repositoryUrl ??
    "";
  if (sourceType === "local_path" || sourceType === "portfolio_mirror") {
    const repoPath = sourceRef
      ? resolve(sourceRef.startsWith("/") ? "/" : repoRoot(), sourceRef)
      : repoRoot();
    if (!existsSync(repoPath)) {
      throw new Error(`Project source path not found: ${repoPath}`);
    }
    return { repoRoot: repoPath };
  }
  if (sourceType === "git_url") {
    if (!sourceRef) {
      throw new Error(`Project "${project.name}" is missing repository URL`);
    }
    const target = mkdtempSync(join(tmpdir(), "penny-worker-"));
    try {
      if (/github\.com[/:][^/]+\/[^/.]+/i.test(sourceRef)) {
        // Use GitHub's tarball API for GitHub-hosted repos so we avoid the
        // git HTTPS stack entirely when fetching audit sources.
        await downloadRepoTarball(
          sourceRef,
          target,
          isGitHubAppConfigured() ? project.github_app_installation_id : undefined,
          requestedRef
        );
      } else {
        // Fallback: plain git clone (requires git in PATH)
        execFileSync(getGit(), ["clone", "--depth", "1", sourceRef, target], {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 60_000,
        });
        if (requestedRef) {
          execFileSync(getGit(), ["-C", target, "checkout", requestedRef], {
            encoding: "utf8",
            stdio: "pipe",
            timeout: 60_000,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not clone ${sourceRef}: ${msg}`);
    }
    return {
      repoRoot: target,
      cleanup: () => {
        try {
          execFileSync("rm", ["-rf", target], { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      },
    };
  }
  throw new Error(
    `Project "${project.name}" does not have auditable source access configured`
  );
}

async function runClusterSynthesize(
  pool: pg.Pool,
  job: { id: string; job_type: string; project_name: string | null },
  core: string,
  auditAgent: string,
  cluster: string
): Promise<void> {
  if (!job.project_name) throw new Error("cluster_synthesize requires a project_name");
  const allProjects = await listAllProjects(pool);
  const projects = allProjects.filter((p) => p.name === job.project_name);
  if (projects.length === 0) throw new Error("Project not found");
  
  const project = projects[0];
  const findings = (project.findings as Array<{ title?: string; severity?: string; cluster?: string }>).filter(f => f.cluster === cluster);
  const lines = findings.map(f => `- ${f.severity ?? "?"}: ${f.title ?? "?"}`);
  const blob = lines.slice(0, 300).join("\n") || "No findings yet.";

  const { getRegistry } = await import("./providers/registry.js");
  const registry = getRegistry();
  const synthChain = resolveModelChain("cluster_synthesize");
  const allowPremiumSynthesis = process.env.penny_ALLOW_PREMIUM_SYNTHESIS?.trim().toLowerCase() === "true";

  let voiceStr = "";
  if (cluster === "standard") voiceStr = "Provide a technical summary of what's broken and how to fix it.";
  if (cluster === "investor") voiceStr = "Provide an investor readiness score out of 10 and the top 3 actions before a diligence call.";
  if (cluster === "domain") voiceStr = "Provide a summary of domain coverage exhaustion and remaining domains to audit. Score is percentage 0-100.";
  if (cluster === "visual") voiceStr = "Provide a summary of component consistency, UI drift, and design tokens.";

  let synthesisText = "No synthesis generated.";
  let topFindings: string[] = [];
  let score: number | undefined;

  try {
    const llmRes = await registry.call(synthChain, {
      systemPrompt: `${core}\n\nYou are the ${cluster.toUpperCase()} Cluster Synthesizer.\n${voiceStr}\nRespond with ONLY valid JSON matching this schema:\n{\n  "topFindings": ["string"],\n  "synthesisText": "2-3 paragraphs narrative",\n  "score": 8.5\n}`,
      userPrompt: blob,
      temperature: 0.2,
      maxTokens: 1000,
    }, resolveRoutingPolicy({
      contextLabel: `${cluster}-cluster-synthesis`,
      allowPremium: allowPremiumSynthesis,
    }));
    
    let content = llmRes.content?.trim() || "{}";
    if (content.startsWith("\`\`\`json")) content = content.replace(/^\`\`\`json/, "");
    if (content.endsWith("\`\`\`")) content = content.replace(/\`\`\`$/, "");
    content = content.trim();

    const parsed = JSON.parse(content);
    synthesisText = parsed.synthesisText || "Synthesis parsed incorrectly.";
    topFindings = Array.isArray(parsed.topFindings) ? parsed.topFindings : [];
    if (typeof parsed.score === "number") score = parsed.score;
    
    console.log(`[penny-worker] ${cluster} synthesize via ${llmRes.provider}:${llmRes.model} cost=$${(llmRes.costUsd ?? 0).toFixed(4)}`);
  } catch (synthErr) {
    console.warn(`[penny-worker] ${cluster} synthesize LLM failed: ${synthErr}`);
    synthesisText = `Synthesis failed: ${synthErr instanceof Error ? synthErr.message : String(synthErr)}`;
  }

  const summaries = (project as any).clusterSummaries || {};
  summaries[cluster] = {
    cluster,
    project: project.name,
    generatedAt: new Date().toISOString(),
    findingCount: findings.length,
    topFindings,
    synthesisText,
    score,
  };

  await saveProject(pool, {
    ...project,
    clusterSummaries: summaries,
  } as any);

  await completeJob(pool, job.id, null, {
    job_type: job.job_type,
    project_name: job.project_name,
    summary: `${cluster} synthesis complete. ${findings.length} findings analyzed.`,
    findings_added: 0,
    payload: { synthesized: true, cluster },
  });
}

async function runMetaSynthesize(
  pool: pg.Pool,
  job: { id: string; job_type: string; project_name: string | null },
  core: string,
  auditAgent: string
): Promise<void> {
  if (!job.project_name) throw new Error("meta_synthesize requires a project_name");
  const allProjects = await listAllProjects(pool);
  const projects = allProjects.filter((p) => p.name === job.project_name);
  if (projects.length === 0) throw new Error("Project not found");
  
  const project = projects[0];
  const summaries = (project as any).clusterSummaries || {};
  const clustersRun = Object.keys(summaries);
  
  const blobData = clustersRun.map((c) => {
    const s = summaries[c];
    return `Cluster: ${c}\nScore: ${s.score ?? "?"}\nSummary: ${s.synthesisText}\nTop Findings: ${s.topFindings.join(", ")}`;
  }).join("\n\n");
  
  const blob = blobData || "No cluster summaries available.";

  const { getRegistry } = await import("./providers/registry.js");
  const registry = getRegistry();
  const synthChain = resolveModelChain("meta_synthesize");
  const allowPremiumSynthesis = process.env.penny_ALLOW_PREMIUM_SYNTHESIS?.trim().toLowerCase() === "true";

  let narrativeSummary = "No narrative summary generated.";
  let crossClusterP0s: string[] = [];
  let todaysTop5: string[] = [];

  try {
    const llmRes = await registry.call(synthChain, {
      systemPrompt: `${core}\n\nYou are the Project Meta-Synthesizer. Your job is to read the outputs of all individual cluster synthesizers and output a single unified action plan for the project.\nCross-reference P0s across clusters to find systemic issues.\nRespond with ONLY valid JSON matching this schema:\n{\n  "crossClusterP0s": ["string"],\n  "todaysTop5": ["string"],\n  "narrativeSummary": "2-3 paragraphs narrative"\n}`,
      userPrompt: blob,
      temperature: 0.2,
      maxTokens: 1200,
    }, resolveRoutingPolicy({
      contextLabel: "meta-synthesis",
      allowPremium: allowPremiumSynthesis,
    }));
    
    let content = llmRes.content?.trim() || "{}";
    if (content.startsWith("\`\`\`json")) content = content.replace(/^\`\`\`json/, "");
    if (content.endsWith("\`\`\`")) content = content.replace(/\`\`\`$/, "");
    content = content.trim();

    const parsed = JSON.parse(content);
    narrativeSummary = parsed.narrativeSummary || "Meta synthesis parsed incorrectly.";
    crossClusterP0s = Array.isArray(parsed.crossClusterP0s) ? parsed.crossClusterP0s : [];
    todaysTop5 = Array.isArray(parsed.todaysTop5) ? parsed.todaysTop5 : [];
    
    console.log(`[penny-worker] meta synthesize via ${llmRes.provider}:${llmRes.model} cost=$${(llmRes.costUsd ?? 0).toFixed(4)}`);
  } catch (synthErr) {
    console.warn(`[penny-worker] meta synthesize LLM failed: ${synthErr}`);
    narrativeSummary = `Meta synthesis failed: ${synthErr instanceof Error ? synthErr.message : String(synthErr)}`;
  }

  const metaSummary = {
    project: project.name,
    generatedAt: new Date().toISOString(),
    clustersRun,
    crossClusterP0s,
    todaysTop5,
    narrativeSummary,
  };

  await saveProject(pool, {
    ...project,
    metaSummary,
  } as any);

  await completeJob(pool, job.id, null, {
    job_type: job.job_type,
    project_name: job.project_name,
    summary: `Meta synthesis complete. Analyzed ${clustersRun.length} clusters.`,
    findings_added: 0,
    payload: { synthesized: true, meta: true },
  });
}

async function runPortfolioSynthesize(
  pool: pg.Pool,
  job: { id: string; job_type: string; project_name: string | null },
  core: string,
  auditAgent: string
): Promise<void> {
  const allProjects = await listAllProjects(pool);
  
  const blobData = allProjects.map((p) => {
    const meta = (p as any).metaSummary;
    if (!meta) return `Project: ${p.name}\nNo meta summary available.`;
    return `Project: ${p.name}
Clusters Run: ${meta.clustersRun?.join(", ") ?? "none"}
Cross-cluster P0s: ${meta.crossClusterP0s?.join("; ") ?? "none"}
Today's Top 5: ${meta.todaysTop5?.join("; ") ?? "none"}
Narrative: ${meta.narrativeSummary}`;
  }).join("\n\n---\n\n");
  
  const blob = blobData || "No projects found.";

  const { getRegistry } = await import("./providers/registry.js");
  const registry = getRegistry();
  const synthChain = resolveModelChain("portfolio_synthesize");
  const allowPremiumSynthesis = process.env.penny_ALLOW_PREMIUM_SYNTHESIS?.trim().toLowerCase() === "true";

  let portfolioNarrative = "No narrative summary generated.";
  let portfolioTop5: string[] = [];

  try {
    const llmRes = await registry.call(synthChain, {
      systemPrompt: `${core}\n\nYou are the Portfolio Meta-Meta Synthesizer. Your job is to read the outputs of all Project Meta-Synthesizers and output a single unified action plan for the entire engineering portfolio.\nCross-reference P0s across ALL projects to find deeply systemic organizational or architectural issues.\nRespond with ONLY valid JSON matching this schema:\n{\n  "portfolioTop5": ["string (state the project name and the action)"],\n  "portfolioNarrative": "3-4 paragraphs of high-level portfolio analysis"\n}`,
      userPrompt: blob,
      temperature: 0.2,
      maxTokens: 1500,
    }, resolveRoutingPolicy({
      contextLabel: "portfolio-synthesis",
      allowPremium: allowPremiumSynthesis,
    }));
    
    let content = llmRes.content?.trim() || "{}";
    if (content.startsWith("\`\`\`json")) content = content.replace(/^\`\`\`json/, "");
    if (content.endsWith("\`\`\`")) content = content.replace(/\`\`\`$/, "");
    content = content.trim();

    const parsed = JSON.parse(content);
    portfolioNarrative = parsed.portfolioNarrative || "Portfolio synthesis parsed incorrectly.";
    portfolioTop5 = Array.isArray(parsed.portfolioTop5) ? parsed.portfolioTop5 : [];
    
    console.log(`[penny-worker] portfolio synthesize via ${llmRes.provider}:${llmRes.model} cost=$${(llmRes.costUsd ?? 0).toFixed(4)}`);
  } catch (synthErr) {
    console.warn(`[penny-worker] portfolio synthesize LLM failed: ${synthErr}`);
    portfolioNarrative = `Portfolio synthesis failed: ${synthErr instanceof Error ? synthErr.message : String(synthErr)}`;
  }

  // Save the result as an overarching run
  await completeJob(pool, job.id, null, {
    job_type: job.job_type,
    project_name: null, // Global scope
    summary: `Portfolio synthesis complete. Analyzed ${allProjects.length} projects.`,
    findings_added: 0,
    payload: { 
      synthesized: true, 
      portfolio: true,
      portfolioTop5,
      portfolioNarrative
    },
  });
}

async function runSynthesize(
  pool: pg.Pool,
  job: { id: string; job_type: string; project_name: string | null },
  core: string,
  auditAgent: string
): Promise<void> {
  const allProjects = await listAllProjects(pool);
  // When a project_name is set, scope the synthesis to that project only
  const projects = job.project_name
    ? allProjects.filter((p) => p.name === job.project_name)
    : allProjects;
  const lines = projects.flatMap((p) =>
    (p.findings as Array<{ title?: string; severity?: string }>).map(
      (f) => `- [${p.name}] ${f.severity ?? "?"}: ${f.title ?? "?"}`
    )
  );
  const blob = lines.slice(0, 200).join("\n") || "No findings yet.";
  const scopeLabel = job.project_name ? `project "${job.project_name}"` : "portfolio";
  let summary = `${scopeLabel}: ${projects.length} project(s), ${lines.length} finding lines.`;
  const registry = getRegistry();
  const synthChain = resolveModelChain("synthesize_project");
  const allowPremiumSynthesis = process.env.penny_ALLOW_PREMIUM_SYNTHESIS?.trim().toLowerCase() === "true";
  const anyConfigured = synthChain.some((ref) => {
    const [p] = ref.split(":");
    return registry.getProvider(p)?.isConfigured() ?? false;
  });
  if (anyConfigured) {
    try {
      const llmRes = await registry.call(synthChain, {
        systemPrompt: `${core}\nSummarize audit themes for ${scopeLabel} in 2 short paragraphs.`,
        userPrompt: blob,
        responseFormat: "text",
        temperature: 0.3,
        maxTokens: 500,
      }, resolveRoutingPolicy({
        contextLabel: `summary-${scopeLabel}`,
        allowPremium: allowPremiumSynthesis,
      }));
      summary = llmRes.content || summary;
      console.log(
        `[penny-worker] synthesize via ${llmRes.provider}:${llmRes.model} cost=$${(llmRes.costUsd ?? 0).toFixed(4)}`
      );
    } catch (e) {
      console.warn(
        `[penny-worker] synthesize LLM call failed, using fallback summary: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  await completeJob(pool, job.id, null, {
    job_type: job.job_type,
    project_name: job.project_name,
    summary: summary.slice(0, 2000),
    findings_added: 0,
    payload: { synthesized: true, scope: job.project_name ?? "portfolio" },
  });
}
