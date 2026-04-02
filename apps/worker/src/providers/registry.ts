import { LLMProvider, LLMRequest, LLMResponse } from "./base.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { DeepSeekProvider } from "./deepseek.js";
import { GeminiProvider } from "./gemini.js";
import { HuggingFaceProvider } from "./huggingface.js";
import { AimlapiProvider } from "./aimlapi.js";

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
  async call(models: string[], request: LLMRequest): Promise<LLMResponse> {
    const errors: string[] = [];
    let attempts = 0;

    for (const modelRef of models) {
      const { provider: providerName, modelId } = this.parseModelRef(modelRef);
      const provider = this.getProvider(providerName);

      if (!provider) {
        errors.push(`${modelRef}: provider not registered`);
        continue;
      }
      if (!provider.isConfigured()) {
        // Silent skip — unconfigured providers are not an error
        continue;
      }

      try {
        this.logger(`[routing] calling ${modelRef}`);
        attempts += 1;
        const response = await provider.call(modelId, request);
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
