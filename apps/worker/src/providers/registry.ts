import { LLMProvider, LLMRequest, LLMResponse } from "./base.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { DeepSeekProvider } from "./deepseek.js";
import { GeminiProvider } from "./gemini.js";
import { HuggingFaceProvider } from "./huggingface.js";
import { AimlapiProvider } from "./aimlapi.js";
import { OllamaProvider } from "./ollama.js";

export type ModelTier = "free" | "cheap" | "standard" | "premium";

export interface ModelMetadata {
  tier: ModelTier;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
  experimental?: boolean;
}

export interface RoutingPolicy {
  allowPremium?: boolean;
  allowExperimental?: boolean;
  maxEstimatedCostUsd?: number;
  contextLabel?: string;
}

const DEFAULT_MAX_ESTIMATED_LLM_CALL_USD = 0.25;

const MODEL_METADATA: Record<string, ModelMetadata> = {
  "openai:mini": { tier: "cheap", inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  "openai:balanced": { tier: "premium", inputCostPer1M: 3.0, outputCostPer1M: 12.0 },

  "anthropic:haiku": { tier: "standard", inputCostPer1M: 0.8, outputCostPer1M: 4.0 },
  "anthropic:sonnet": { tier: "premium", inputCostPer1M: 3.0, outputCostPer1M: 15.0 },
  "anthropic:opus": { tier: "premium", inputCostPer1M: 15.0, outputCostPer1M: 75.0 },

  "deepseek:chat": { tier: "cheap", inputCostPer1M: 0.27, outputCostPer1M: 1.1 },
  "deepseek:reasoner": { tier: "standard", inputCostPer1M: 0.55, outputCostPer1M: 2.19 },

  "gemini:flash": { tier: "cheap", inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  "gemini:flash-2": { tier: "cheap", inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  "gemini:2.0-flash": { tier: "cheap", inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  "gemini:flash8b": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  "gemini:pro": { tier: "premium", inputCostPer1M: 1.25, outputCostPer1M: 5.0 },

  "ollama:qwen14b": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  "ollama:qwen7b": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  "ollama:qwen32b": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  "ollama:coder": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },

  "aimlapi:nano": { tier: "cheap", inputCostPer1M: 0.1, outputCostPer1M: 0.1, experimental: true },
  "aimlapi:cheap": { tier: "cheap", inputCostPer1M: 0.1, outputCostPer1M: 0.1, experimental: true },
  "aimlapi:mid": { tier: "standard", inputCostPer1M: 0.65, outputCostPer1M: 0.65, experimental: true },
  "aimlapi:expensive": { tier: "premium", inputCostPer1M: 5.0, outputCostPer1M: 5.0, experimental: true },

  "huggingface:nano": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0, experimental: true },
  "huggingface:small": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0, experimental: true },
  "huggingface:code-nano": { tier: "free", inputCostPer1M: 0, outputCostPer1M: 0, experimental: true },
};

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function premiumAllowedByDefault(): boolean {
  return parseBooleanEnv(process.env.penny_ALLOW_PREMIUM_MODELS);
}

export function experimentalProvidersAllowed(): boolean {
  const raw = process.env.penny_ENABLE_EXPERIMENTAL_PROVIDERS;
  if (typeof raw === "undefined") return true;
  return parseBooleanEnv(raw);
}

export function resolveMaxEstimatedCostUsd(): number {
  const raw = process.env.penny_MAX_ESTIMATED_LLM_CALL_USD?.trim();
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ESTIMATED_LLM_CALL_USD;
  return parsed;
}

export function getModelMetadata(modelRef: string): ModelMetadata {
  return MODEL_METADATA[modelRef] ?? { tier: "standard" };
}

export function estimateModelCostUsd(
  modelRef: string,
  request: LLMRequest
): number | undefined {
  const meta = getModelMetadata(modelRef);
  if (
    typeof meta.inputCostPer1M !== "number" ||
    typeof meta.outputCostPer1M !== "number"
  ) {
    return undefined;
  }

  const inputTokens = estimateTokens(`${request.systemPrompt}\n\n${request.userPrompt}`);
  const outputTokens = Math.max(1, request.maxTokens ?? 4096);
  const inputCost = (inputTokens / 1_000_000) * meta.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * meta.outputCostPer1M;
  return inputCost + outputCost;
}

/**
 * Registry for LLM providers with ordered fallback chain support.
 *
 * Supports 6 providers: openai, anthropic, deepseek, gemini, huggingface, aimlapi
 * Model references use "provider:modelId" format, e.g. "anthropic:sonnet"
 */
export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private logger: (msg: string) => void;

  constructor(logger?: (msg: string) => void) {
    this.logger = logger || console.log;
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new AnthropicProvider());
    this.registerProvider(new DeepSeekProvider());
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new HuggingFaceProvider());
    this.registerProvider(new AimlapiProvider());
    this.registerProvider(new OllamaProvider());
  }

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): LLMProvider | null {
    return this.providers.get(name) || null;
  }

  private parseModelRef(modelRef: string): { provider: string; modelId: string } {
    const colon = modelRef.indexOf(":");
    if (colon === -1) {
      throw new Error(`Invalid model reference: "${modelRef}". Expected format: provider:modelId`);
    }
    return {
      provider: modelRef.slice(0, colon),
      modelId:  modelRef.slice(colon + 1),
    };
  }

  /**
   * Call an LLM using an ordered chain of model references.
   * Skips unconfigured providers and retries down the chain on failure.
   * Throws only when every model in the chain has been exhausted.
   */
  async call(
    models: string[],
    request: LLMRequest,
    policy: RoutingPolicy = {}
  ): Promise<LLMResponse> {
    const errors: string[] = [];
    let attempts = 0;
    const allowPremium = policy.allowPremium ?? premiumAllowedByDefault();
    const allowExperimental = policy.allowExperimental ?? experimentalProvidersAllowed();
    const maxEstimatedCostUsd = policy.maxEstimatedCostUsd ?? resolveMaxEstimatedCostUsd();
    const contextLabel = policy.contextLabel?.trim() || "default";

    for (const modelRef of models) {
      const { provider: providerName, modelId } = this.parseModelRef(modelRef);
      const provider = this.getProvider(providerName);
      const metadata = getModelMetadata(modelRef);
      const estimatedCostUsd = estimateModelCostUsd(modelRef, request);

      if (!provider) {
        errors.push(`${modelRef}: provider not registered`);
        continue;
      }
      if (!provider.isConfigured()) {
        // Silent skip — unconfigured providers are not an error
        continue;
      }
      if (metadata.experimental && !allowExperimental) {
        const reason = `${modelRef}: experimental provider disabled`;
        this.logger(`[routing] skipping ${modelRef} for ${contextLabel} (experimental provider disabled)`);
        errors.push(reason);
        continue;
      }
      if (metadata.tier === "premium" && !allowPremium) {
        const reason = `${modelRef}: premium model blocked (set penny_ALLOW_PREMIUM_MODELS=true and pass allowPremium: true)`;
        this.logger(`[routing] blocking premium model ${modelRef} for ${contextLabel}`);
        errors.push(reason);
        continue;
      }
      if (
        typeof estimatedCostUsd === "number" &&
        estimatedCostUsd > maxEstimatedCostUsd
      ) {
        const reason =
          `${modelRef}: estimated call cost $${estimatedCostUsd.toFixed(4)} exceeds limit $${maxEstimatedCostUsd.toFixed(4)}`;
        this.logger(`[routing] skipping ${modelRef} for ${contextLabel} (${reason})`);
        errors.push(reason);
        continue;
      }

      try {
        this.logger(
          `[routing] calling ${modelRef} tier=${metadata.tier} context=${contextLabel}` +
            (typeof estimatedCostUsd === "number" ? ` est=$${estimatedCostUsd.toFixed(4)}` : "")
        );
        attempts += 1;
        const response = await provider.call(modelId, request);
        this.logger(
          `[routing] success ${modelRef}` +
            (typeof response.costUsd === "number" ? ` actual=$${response.costUsd.toFixed(4)}` : "")
        );
        return {
          ...response,
          attemptCount: attempts,
          fallbackCount: Math.max(0, attempts - 1),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger(`[routing] ${modelRef} failed (${msg.slice(0, 120)}), trying next`);
        errors.push(`${modelRef}: ${msg.slice(0, 200)}`);
      }
    }

    throw new Error(
      `All models exhausted. Attempted:\n${errors.map((e) => `  • ${e}`).join("\n")}`
    );
  }

  /**
   * Infer a provider:modelId pair from a bare model name or explicit reference.
   *
   * Supports:
   *   "openai:mini"               → explicit pass-through
   *   "gpt-4o-mini"               → openai:mini
   *   "claude-sonnet-4-6"         → anthropic:sonnet
   *   "gemini-2.0-flash"          → gemini:flash
   *   "deepseek-chat"             → deepseek:chat
   *   "llama" / "qwen" / "mistral"→ aimlapi:mid
   */
  inferProvider(modelName: string): { provider: string; modelId: string } {
    if (modelName.includes(":")) return this.parseModelRef(modelName);

    if (modelName.includes("gpt") || modelName.includes("o1") || modelName.includes("o3")) {
      if (modelName.includes("mini")) return { provider: "openai", modelId: "mini" };
      if (modelName.includes("nano")) return { provider: "openai", modelId: "mini" };
      return { provider: "openai", modelId: "balanced" };
    }

    if (modelName.includes("claude")) {
      if (modelName.includes("haiku")) return { provider: "anthropic", modelId: "haiku" };
      if (modelName.includes("opus"))  return { provider: "anthropic", modelId: "opus" };
      return { provider: "anthropic", modelId: "sonnet" };
    }

    if (modelName.includes("gemini")) {
      if (modelName.includes("pro"))  return { provider: "gemini", modelId: "pro" };
      if (modelName.includes("8b"))   return { provider: "gemini", modelId: "flash8b" };
      return { provider: "gemini", modelId: "flash" };
    }

    if (modelName.includes("ollama") || modelName.includes("qwen2.5-coder")) {
      if (modelName.includes("32b")) return { provider: "ollama", modelId: "qwen32b" };
      if (modelName.includes("7b")) return { provider: "ollama", modelId: "qwen7b" };
      return { provider: "ollama", modelId: "qwen14b" };
    }

    if (modelName.includes("deepseek")) {
      if (modelName.includes("reason")) return { provider: "deepseek", modelId: "reasoner" };
      return { provider: "deepseek", modelId: "chat" };
    }

    if (
      modelName.includes("llama") ||
      modelName.includes("qwen") ||
      modelName.includes("mistral") ||
      modelName.includes("mixtral")
    ) {
      if (modelName.includes("405")) return { provider: "aimlapi", modelId: "expensive" };
      if (modelName.includes("70"))  return { provider: "aimlapi", modelId: "mid" };
      return { provider: "aimlapi", modelId: "cheap" };
    }

    // Default
    return { provider: "openai", modelId: "mini" };
  }
}

// Global registry singleton
let globalRegistry: ProviderRegistry | null = null;

export function getRegistry(): ProviderRegistry {
  if (!globalRegistry) globalRegistry = new ProviderRegistry();
  return globalRegistry;
}
