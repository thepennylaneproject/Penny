import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  fetchWithTimeout,
} from "./base.js";

/**
 * AIMLAPI provider — unified multi-model gateway (OpenAI-compatible).
 *
 * aimlapi.com aggregates models from Meta, Mistral, Anthropic, OpenAI, and others
 * under a single OpenAI-compatible endpoint. Useful for cost-tier routing with
 * open-source models when you want alternatives to proprietary APIs.
 *
 * Supported model IDs:
 *   "nano"      → Qwen2.5-7B-Instruct     (trivial structural tasks)
 *   "cheap"     → Llama-3.1-8B-Instruct   (audit scanning, simple patch gen)
 *   "mid"       → Llama-3.1-70B-Instruct  (patch generation, refactoring)
 *   "expensive" → Llama-3.1-405B-Instruct (complex reasoning, security analysis)
 *
 * Required env var: AIMLAPI_API_KEY
 */
export class AimlapiProvider extends LLMProvider {
  name = "aimlapi";

  models: Record<string, string> = {
    nano:      "Qwen/Qwen2.5-7B-Instruct",
    cheap:     "meta-llama/Llama-3.1-8B-Instruct",
    mid:       "meta-llama/Llama-3.1-70B-Instruct",
    expensive: "meta-llama/Llama-3.1-405B-Instruct",
  };

  private apiKey: string;
  private baseUrl = "https://api.aimlapi.com/v1";

  constructor() {
    super();
    this.apiKey = process.env.AIMLAPI_API_KEY?.trim() || "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  configurationError(): string {
    return "AIMLAPI_API_KEY not set";
  }

  async call(modelId: string, request: LLMRequest): Promise<LLMResponse> {
    const model = this.models[modelId] ?? modelId;

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.userPrompt });

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const res = await fetchWithTimeout(this.name, `${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AIMLAPI error ${res.status}: ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens;
    const outputTokens = data.usage?.completion_tokens;

    // Approximate cost (AIMLAPI Llama pricing)
    let costUsd = 0;
    if (inputTokens && outputTokens) {
      if (model.includes("8B")) {
        costUsd = inputTokens * 0.0000001  + outputTokens * 0.0000001;  // ~$0.10/1M
      } else if (model.includes("70B")) {
        costUsd = inputTokens * 0.00000065 + outputTokens * 0.00000065; // ~$0.65/1M
      } else if (model.includes("405B")) {
        costUsd = inputTokens * 0.000005   + outputTokens * 0.000005;   // ~$5.00/1M
      } else {
        costUsd = inputTokens * 0.0000001  + outputTokens * 0.0000001;
      }
    }

    return {
      content,
      model,
      provider: this.name,
      inputTokens,
      outputTokens,
      costUsd,
    };
  }
}
