/**
 * Base LLM provider interface for multi-provider routing.
 */

const DEFAULT_LLM_TIMEOUT_MS = 45_000;

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: "json_object" | "text";
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  attemptCount?: number;
  fallbackCount?: number;
}

export function resolveLlmTimeoutMs(): number {
  const raw = process.env.penny_LLM_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1_000) return DEFAULT_LLM_TIMEOUT_MS;
  return parsed;
}

export async function fetchWithTimeout(
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs = resolveLlmTimeoutMs()
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${provider} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export abstract class LLMProvider {
  abstract name: string;
  abstract models: Record<string, string>;

  /**
   * Send a request to the LLM provider.
   * @param modelId The model identifier
   * @param request The LLM request
   * @returns The LLM response
   */
  abstract call(modelId: string, request: LLMRequest): Promise<LLMResponse>;

  /**
   * Verify the provider is configured (has necessary API keys, etc).
   */
  abstract isConfigured(): boolean;

  /**
   * Get descriptive error message if provider is not configured.
   */
  abstract configurationError(): string;
}
