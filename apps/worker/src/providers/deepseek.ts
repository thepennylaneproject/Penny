import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  fetchWithTimeout,
} from "./base.js";

/**
 * DeepSeek LLM provider (DeepSeek V3 / R1).
 * Uses the OpenAI-compatible API endpoint.
 *
 * Cost (approximate, 2025):
 *   chat      (DeepSeek V3):  $0.27/M input,  $1.10/M output
 *   reasoner  (DeepSeek R1):  $0.55/M input,  $2.19/M output
 *
 * Set DEEPSEEK_API_KEY to enable this provider.
 */
export class DeepSeekProvider extends LLMProvider {
  name = "deepseek";
  models: Record<string, string> = {
    chat: "deepseek-chat",
    reasoner: "deepseek-reasoner",
  };

  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.DEEPSEEK_API_KEY?.trim() || "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  configurationError(): string {
    return "DEEPSEEK_API_KEY not set";
  }

  async call(modelId: string, request: LLMRequest): Promise<LLMResponse> {
    const model = this.models[modelId] ?? modelId;

    const res = await fetchWithTimeout(this.name, "https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        response_format:
          request.responseFormat === "json_object"
            ? { type: "json_object" }
            : undefined,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek error ${res.status}: ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens;
    const outputTokens = data.usage?.completion_tokens;

    let costUsd = 0;
    if (inputTokens && outputTokens) {
      if (model === "deepseek-reasoner") {
        costUsd = inputTokens * 0.00000055 + outputTokens * 0.00000219;
      } else {
        // deepseek-chat (V3)
        costUsd = inputTokens * 0.00000027 + outputTokens * 0.0000011;
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
