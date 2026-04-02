import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  fetchWithTimeout,
} from "./base.js";

/**
 * OpenAI LLM provider (GPT-4o, GPT-4o-mini, etc).
 */
export class OpenAIProvider extends LLMProvider {
  name = "openai";
  models = {
    mini: "gpt-4o-mini",
    balanced: "gpt-4o",
  };

  private apiKey: string;

  constructor() {
    super();
    this.apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  configurationError(): string {
    return "OPENAI_API_KEY not set";
  }

  async call(modelId: string, request: LLMRequest): Promise<LLMResponse> {
    const model =
      (this.models as Record<string, string>)[modelId] ?? modelId;

    const res = await fetchWithTimeout(this.name, "https://api.openai.com/v1/chat/completions", {
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
        response_format: request.responseFormat
          ? { type: request.responseFormat }
          : undefined,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens;
    const outputTokens = data.usage?.completion_tokens;

    // Approximate cost estimation (GPT-4o pricing)
    let costUsd = 0;
    if (inputTokens && outputTokens) {
      if (model.includes("gpt-4o-mini")) {
        costUsd = (inputTokens * 0.00000015 + outputTokens * 0.0000006);
      } else {
        costUsd = (inputTokens * 0.000003 + outputTokens * 0.000012);
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
