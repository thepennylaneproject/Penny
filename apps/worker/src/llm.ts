export interface FindingOut {
  finding_id: string;
  title: string;
  description?: string;
  type: string;
  severity: string;
  priority: string;
  status: string;
  category?: string;
  proof_hooks?: Array<{
    file?: string;
    start_line?: number;
    summary?: string;
  }>;
  duplicate_of?: string;
}

export interface CoverageOut {
  coverage_complete?: boolean;
  confidence?: "low" | "medium" | "high";
  checklist_id?: string;
  known_findings_referenced?: string[];
  files_reviewed?: string[];
  modules_reviewed?: string[];
  checklist_passed?: number;
  checklist_total?: number;
  incomplete_reason?: string;
}

import { createHash } from "node:crypto";
import {
  experimentalProvidersAllowed,
  getRegistry,
  resolveMaxEstimatedCostUsd,
  type RoutingPolicy,
} from "./providers/registry.js";

export interface AuditLlmResult {
  findings: FindingOut[];
  coverage: CoverageOut;
  model: string;
  provider: string;
  raw_response: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  attemptCount?: number;
  fallbackCount?: number;
  cacheHit?: boolean;
  latency_ms?: number;
}

const auditResponseCache = new Map<string, AuditLlmResult>();
const DEFAULT_AUDIT_CACHE_MAX = Math.max(
  1,
  Number.parseInt(process.env.penny_AUDIT_CACHE_MAX?.trim() || "128", 10) || 128
);
const DEFAULT_SCOPE_FILE_LIST_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.penny_SCOPE_FILE_LIST_LIMIT?.trim() || "80", 10) || 80
);
const DEFAULT_KNOWN_FINDING_LIST_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.penny_KNOWN_FINDING_LIST_LIMIT?.trim() || "120", 10) || 120
);

/**
 * Build a priority-ordered model chain for a given audit kind and routing strategy.
 *
 * The registry tries each model left-to-right, silently skipping unconfigured
 * providers and moving to the next on API failure. The chain always ends with
 * free-tier fallbacks so there is always something to try.
 *
 * penny_ROUTING_STRATEGY controls the quality/cost trade-off:
 *   precision  — best available regardless of cost (Opus → Sonnet → DeepSeek R1 → …)
 *   balanced   — best value: DeepSeek V3 leads (10× cheaper than Sonnet, top code quality)
 *   aggressive — minimize cost (Haiku, Gemini Flash, open-source models)
 *   economy    — free / near-free only (HuggingFace, Gemini free tier)
 *
 * audit_kind fine-tunes within the chosen strategy:
 *   security / logic / data / code_debt / investor_readiness / intelligence
 *     → anchor with at least one strong model even in balanced/aggressive mode
 *   visual / domain_manifest / domain_pass / portfolio_synthesize
 *     → prefer Gemini Flash (1M-token context window eliminates chunking)
 *   synthesize* / meta_synthesize / cluster_synthesize
 *     → prefer Opus / DeepSeek Reasoner for cross-domain synthesis
 */
export function resolveModelChain(auditKind?: string): string[] {
  const configuredModel = process.env.penny_AUDIT_MODEL?.trim();
  const strategy = process.env.penny_ROUTING_STRATEGY?.trim().toLowerCase() || "balanced";
  const registry = getRegistry();
  const experimentalOk = experimentalProvidersAllowed();

  // Explicit override — honour it, add safe tail fallbacks
  if (configuredModel) {
    const ref = configuredModel.includes(":")
      ? configuredModel
      : (() => {
          const { provider, modelId } = registry.inferProvider(configuredModel);
          return `${provider}:${modelId}`;
        })();
    return dedupe([
      ref,
      "deepseek:chat",
      "gemini:flash",
      "openai:mini",
      ...(experimentalOk ? ["aimlapi:cheap", "huggingface:small"] : []),
    ]);
  }

  const ok = (name: string) => registry.getProvider(name)?.isConfigured() ?? false;
  const anthropicOk = ok("anthropic");
  const deepseekOk  = ok("deepseek");
  const geminiOk    = ok("gemini");
  const aimlapiOk   = experimentalOk && ok("aimlapi");
  const ollamaOk    = ok("ollama");
  const openaiOk    = ok("openai");
  const huggingfaceOk = experimentalOk;

  const HIGH_STAKES   = new Set(["security", "logic", "data", "code_debt", "investor_readiness", "intelligence"]);
  const LARGE_CONTEXT = new Set(["visual", "domain_manifest", "domain_pass", "portfolio_synthesize"]);
  const SYNTHESIS     = new Set(["synthesize", "cluster_synthesize", "meta_synthesize", "portfolio_synthesize", "synthesize_project"]);

  const isHighStakes   = HIGH_STAKES.has(auditKind ?? "");
  const isLargeContext = LARGE_CONTEXT.has(auditKind ?? "");
  const isSynthesis    = SYNTHESIS.has(auditKind ?? "");

  const chain: string[] = [];

  switch (strategy) {
    case "local-training":
      if (ollamaOk)                      chain.push("ollama:qwen14b");
      if (isLargeContext && geminiOk)    chain.push("gemini:flash");
      if (deepseekOk)                    chain.push("deepseek:chat");
      if (openaiOk)                      chain.push("openai:mini");
      if (anthropicOk)                   chain.push("anthropic:haiku");
      if (aimlapiOk)                     chain.push("aimlapi:cheap");
      if (huggingfaceOk)                 chain.push("huggingface:small");
      break;

    case "precision":
      // Best available; cost is secondary
      if (isSynthesis && anthropicOk)    chain.push("anthropic:opus");
      if (isSynthesis && deepseekOk)     chain.push("deepseek:reasoner");
      if (anthropicOk)                   chain.push("anthropic:sonnet");
      if (isHighStakes && deepseekOk)    chain.push("deepseek:reasoner");
      if (deepseekOk)                    chain.push("deepseek:chat");
      if (openaiOk)                      chain.push("openai:balanced");
      if (isLargeContext && geminiOk)    chain.push("gemini:flash");
      if (geminiOk)                      chain.push("gemini:flash");
      if (anthropicOk)                   chain.push("anthropic:haiku");
      if (aimlapiOk)                     chain.push("aimlapi:expensive");
      if (openaiOk)                      chain.push("openai:mini");
      if (aimlapiOk)                     chain.push("aimlapi:mid");
      if (huggingfaceOk)                 chain.push("huggingface:small");
      break;

    case "aggressive":
      // Minimize cost while keeping audit-viable quality
      if (anthropicOk)                   chain.push("anthropic:haiku");
      if (isHighStakes && deepseekOk)    chain.push("deepseek:chat");
      if (isLargeContext && geminiOk)    chain.push("gemini:flash");
      if (deepseekOk)                    chain.push("deepseek:chat");
      if (geminiOk)                      chain.push("gemini:flash");
      if (aimlapiOk)                     chain.push("aimlapi:mid");
      if (openaiOk)                      chain.push("openai:mini");
      if (aimlapiOk)                     chain.push("aimlapi:cheap");
      if (huggingfaceOk)                 chain.push("huggingface:small");
      break;

    case "economy":
      // Free / near-free only
      if (geminiOk)                      chain.push("gemini:flash8b");
      if (aimlapiOk)                     chain.push("aimlapi:cheap");
      if (huggingfaceOk)                 chain.push("huggingface:small", "huggingface:nano");
      if (openaiOk)                      chain.push("openai:mini");
      if (anthropicOk)                   chain.push("anthropic:haiku");
      break;

    case "balanced":
    default:
      // Best value: DeepSeek V3 ~10× cheaper than Sonnet, top-tier for code
      // High-stakes audits get a precision anchor regardless of strategy
      if (isHighStakes && anthropicOk)   chain.push("anthropic:sonnet");
      if (isHighStakes && deepseekOk)    chain.push("deepseek:reasoner");
      // Large-context passes lead with Gemini (1M token window)
      if (isLargeContext && geminiOk)    chain.push("gemini:flash");
      if (deepseekOk)                    chain.push("deepseek:chat");
      if (anthropicOk)                   chain.push("anthropic:sonnet");
      if (geminiOk)                      chain.push("gemini:flash");
      if (openaiOk)                      chain.push("openai:balanced");
      if (anthropicOk)                   chain.push("anthropic:haiku");
      if (aimlapiOk)                     chain.push("aimlapi:mid");
      if (openaiOk)                      chain.push("openai:mini");
      if (aimlapiOk)                     chain.push("aimlapi:cheap");
      if (huggingfaceOk)                 chain.push("huggingface:small");
      break;
  }

  return dedupe(chain);
}

export function resolveRoutingPolicy(input?: {
  contextLabel?: string;
  allowPremium?: boolean;
}): RoutingPolicy {
  return {
    contextLabel: input?.contextLabel,
    allowPremium: input?.allowPremium ?? false,
    allowExperimental: experimentalProvidersAllowed(),
    maxEstimatedCostUsd: resolveMaxEstimatedCostUsd(),
  };
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((x) => { if (seen.has(x)) return false; seen.add(x); return true; });
}

function formatBoundedList(
  items: string[],
  limit: number,
  emptyMessage: string
): string {
  if (items.length === 0) return emptyMessage;
  const bounded = items.slice(0, limit);
  const omitted = items.length - bounded.length;
  return omitted > 0
    ? `${bounded.join("\n")}\n... (+${omitted} more omitted for token budget)`
    : bounded.join("\n");
}

function computeAuditCacheKey(input: {
  chain: string[];
  systemPrompt: string;
  userPrompt: string;
  auditKind?: string;
  appName: string;
  visualOnly: boolean;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function cloneAuditResult(result: AuditLlmResult): AuditLlmResult {
  return JSON.parse(JSON.stringify(result)) as AuditLlmResult;
}

function storeAuditCacheEntry(key: string, value: AuditLlmResult): void {
  auditResponseCache.set(key, cloneAuditResult(value));
  if (auditResponseCache.size <= DEFAULT_AUDIT_CACHE_MAX) return;
  const oldestKey = auditResponseCache.keys().next().value;
  if (typeof oldestKey === "string") {
    auditResponseCache.delete(oldestKey);
  }
}

function stripMarkdownCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseStructuredJsonResponse<T>(raw: string): T {
  const candidates: string[] = [];
  const trimmed = raw.trim();
  candidates.push(trimmed);

  const unfenced = stripMarkdownCodeFence(trimmed);
  if (unfenced !== trimmed) candidates.push(unfenced);

  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = unfenced.slice(firstBrace, lastBrace + 1).trim();
    if (!candidates.includes(sliced)) candidates.push(sliced);
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to parse JSON response");
}

/** @deprecated Use resolveModelChain() */
export function resolveModel(): { primary: string; fallback: string | undefined } {
  const chain = resolveModelChain();
  return { primary: chain[0] ?? "openai:mini", fallback: chain[1] };
}

export async function auditWithLlm(
  corePrompt: string,
  auditAgentPrompt: string,
  expectations: string,
  codeContext: string,
  appName: string,
  visualOnly: boolean,
  auditKind?: string,
  extras?: {
    scopeLabel?: string;
    filesInScope?: string[];
    knownFindingIds?: string[];
    checklistId?: string;
    manifestRevision?: string;
  }
): Promise<AuditLlmResult> {
  const registry = getRegistry();
  const chain = resolveModelChain(auditKind);
  const systemPrompt = `${corePrompt}\n\n---\n\n${auditAgentPrompt}`;
  const scopeFileList = formatBoundedList(
    extras?.filesInScope ?? [],
    DEFAULT_SCOPE_FILE_LIST_LIMIT,
    "(scope file list unavailable)"
  );
  const knownFindingList = formatBoundedList(
    extras?.knownFindingIds ?? [],
    DEFAULT_KNOWN_FINDING_LIST_LIMIT,
    "(none provided)"
  );

  // Check that at least one provider in the chain is configured
  const anyConfigured = chain.some((ref) => {
    const provName = ref.split(":")[0];
    return registry.getProvider(provName)?.isConfigured() ?? false;
  });

  if (!anyConfigured) {
    console.warn(`[penny-worker] No LLM provider configured. Set one of: ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, AIMLAPI_API_KEY`);
    return {
      coverage: {
        coverage_complete: false,
        confidence: "low",
        checklist_id: extras?.checklistId,
        incomplete_reason: "No LLM provider configured",
      },
      model: "none",
      provider: "none",
      raw_response: "No LLM provider configured",
      cacheHit: false,
      findings: [
        {
          finding_id: `${appName}-no-llm-provider`,
          title: "No LLM provider configured",
          description: "Set ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or AIMLAPI_API_KEY.",
          type: "question",
          severity: "minor",
          priority: "P2",
          status: "open",
          category: "config",
        },
      ],
    };
  }

  const user = `App name: ${appName}
${visualOnly ? "Focus on visual/UI/UX expectations only.\n" : ""}
${auditKind ? `Primary audit kind: ${auditKind}\n` : ""}
${extras?.manifestRevision ? `Manifest revision: ${extras.manifestRevision}\n` : ""}
${extras?.scopeLabel ? `Audit scope: ${extras.scopeLabel}\n` : ""}
${extras?.checklistId ? `Checklist: ${extras.checklistId}\n` : ""}

## Scope files
${scopeFileList}

## Already-known findings (do NOT re-report these IDs unless you have new evidence)
${knownFindingList}

## Expectations document
${expectations}

## Repository context
${codeContext}

## Output rules
- Each finding_id MUST be unique within this response. Never emit duplicate IDs.
- Cover a DIVERSE mix of finding types (bug, security, performance, ux, debt, config, etc.) — do not cluster all findings under one type.
- Do NOT repeat findings whose IDs appear in the "already-known findings" list above, unless you have new evidence that meaningfully changes the description or severity.
- Emit findings only for issues you can substantiate with specific file or line references in the code context above.

Return JSON: { "coverage": { ... }, "findings": [ ... ] } per audit-agent output contract.`;

  const cacheKey = computeAuditCacheKey({
    chain,
    systemPrompt,
    userPrompt: user,
    auditKind,
    appName,
    visualOnly,
  });
  const cached = auditResponseCache.get(cacheKey);
  if (cached) {
    const cloned = cloneAuditResult(cached);
    cloned.costUsd = 0;
    cloned.inputTokens = 0;
    cloned.outputTokens = 0;
    cloned.attemptCount = 0;
    cloned.fallbackCount = 0;
    cloned.cacheHit = true;
    console.log(`[penny-worker] audit cache hit for ${appName} (${auditKind ?? "full"})`);
    return cloned;
  }

  let llmResponse;
  try {
    llmResponse = await registry.call(chain, {
      systemPrompt,
      userPrompt: user,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 12288,
    }, resolveRoutingPolicy({
      contextLabel: auditKind ?? "full-audit",
      allowPremium: false,
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[penny-worker] LLM call failed:", error);
    throw new Error(`LLM call failed: ${msg}`);
  }

  const raw = llmResponse.content;
  let parsed: { findings?: FindingOut[]; coverage?: CoverageOut };
  try {
    parsed = parseStructuredJsonResponse<{ findings?: FindingOut[]; coverage?: CoverageOut }>(raw);
  } catch {
    throw new Error(
      `LLM returned non-JSON from ${llmResponse.provider}:${llmResponse.model}: ${raw.slice(0, 500)}`
    );
  }
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const coverage = parsed.coverage ?? {};
  const result: AuditLlmResult = {
    model: llmResponse.model,
    provider: llmResponse.provider,
    costUsd: llmResponse.costUsd,
    inputTokens: llmResponse.inputTokens,
    outputTokens: llmResponse.outputTokens,
    attemptCount: llmResponse.attemptCount,
    fallbackCount: llmResponse.fallbackCount,
    cacheHit: false,
    raw_response: raw,
    coverage: {
      coverage_complete: Boolean(coverage.coverage_complete),
      confidence: coverage.confidence ?? "medium",
      checklist_id: coverage.checklist_id ?? extras?.checklistId,
      known_findings_referenced: Array.isArray(coverage.known_findings_referenced)
        ? coverage.known_findings_referenced
        : [],
      files_reviewed: Array.isArray(coverage.files_reviewed)
        ? coverage.files_reviewed
        : [],
      modules_reviewed: Array.isArray(coverage.modules_reviewed)
        ? coverage.modules_reviewed
        : [],
      checklist_passed:
        typeof coverage.checklist_passed === "number"
          ? coverage.checklist_passed
          : undefined,
      checklist_total:
        typeof coverage.checklist_total === "number"
          ? coverage.checklist_total
          : undefined,
      incomplete_reason:
        typeof coverage.incomplete_reason === "string"
          ? coverage.incomplete_reason
          : undefined,
    },
    findings: findings.map((f, i) => ({
      finding_id: f.finding_id || `${appName}-finding-${i}`,
      title: f.title || "Untitled",
      description: f.description,
      type: (f.type as FindingOut["type"]) || "debt",
      severity: normalizeSeverity(f.severity),
      priority: normalizePriority(f.priority),
      status: "open",
      category: f.category,
      proof_hooks: f.proof_hooks,
      duplicate_of: f.duplicate_of,
    })),
  };
  storeAuditCacheEntry(cacheKey, result);
  return result;
}

function normalizeSeverity(s: string): FindingOut["severity"] {
  const v = (s || "").toLowerCase();
  if (["blocker", "major", "minor", "nit"].includes(v)) return v as FindingOut["severity"];
  if (v === "critical") return "blocker";
  if (v === "warning") return "major";
  if (v === "suggestion") return "minor";
  return "minor";
}

function normalizePriority(s: string): string {
  const v = (s || "").toUpperCase();
  if (["P0", "P1", "P2", "P3"].includes(v)) return v;
  return "P2";
}
