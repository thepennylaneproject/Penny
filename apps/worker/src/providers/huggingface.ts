import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  fetchWithTimeout,
} from "./base.js";

/**
 * HuggingFace Serverless Inference provider.
 *
 * HF hosts the Messages API (OpenAI-compatible) at:
 *   https://api-inference.huggingface.co/models/{model_id}/v1
 *
 * Use cases in penny:
 *   "nano"      → Qwen2.5-0.5B — free, trivial structural/format checks only
 *   "small"     → Qwen2.5-1.5B — free, better structured output compliance
 *   "code-nano" → Qwen2.5-Coder-1.5B — free, trivial lint/format decisions
 *
 * Free tier rate limits: ~300 requests/hour per model.
 * For production workload headroom, prefer aimlapi or set HF_TOKEN for paid endpoints.
 *
 * Required env var: HF_TOKEN (optional for public models, required for gated models)
 */
export class HuggingFaceProvider extends LLMProvider {
  name = "huggingface";

  models: Record<string, string> = {
    nano:       "Qwen/Qwen2.5-0.5B-Instruct",
    small:      "Qwen/Qwen2.5-1.5B-Instruct",
    "code-nano": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
  };

  private apiKey: string;

  constructor() {
    super();
    // HF_TOKEN is optional for public models but required for gated ones
    this.apiKey = process.env.HF_TOKEN?.trim() || "";
  }

  isConfigured(): boolean {
    // HF public models work without a token — treat as always available
    // but mark as "not configured" only if the user has explicitly set
    // HF_TOKEN to empty. An absent token is fine for public models.
    return true;
  }

  configurationError(): string {
    return ""; // Always usable for public models
  }

  async call(modelId: string, request: LLMRequest): Promise<LLMResponse> {
    const model = this.models[modelId] ?? modelId;
    const baseUrl = `https://router.huggingface.co/models/${encodeURIComponent(model)}/v1`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.userPrompt });

    const res = await fetchWithTimeout(this.name, `${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HuggingFace error ${res.status}: ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens;
    const outputTokens = data.usage?.completion_tokens;

    // Free tier — cost is $0
    return {
      content,
      model,
      provider: this.name,
      inputTokens,
      outputTokens,
      costUsd: 0,
    };
  }
}
