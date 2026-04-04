import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  fetchWithTimeout,
} from "./base.js";

/**
 * Ollama local provider.
 *
 * Defaults to a local Ollama instance on localhost so Penny can use
 * qwen2.5-coder:14b as a cheap first-pass coding model during training.
 */
export class OllamaProvider extends LLMProvider {
  name = "ollama";

  models: Record<string, string> = {
    qwen14b: "qwen2.5-coder:14b",
    qwen7b: "qwen2.5-coder:7b",
    qwen32b: "qwen2.5-coder:32b",
    coder: "qwen2.5-coder:14b",
  };

  private baseUrl: string;

  constructor() {
    super();
    this.baseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  }

  isConfigured(): boolean {
    return process.env.penny_ENABLE_OLLAMA?.trim()?.toLowerCase() === "true";
  }

  configurationError(): string {
    return "Set penny_ENABLE_OLLAMA=true and ensure Ollama is reachable";
  }

  async call(modelId: string, request: LLMRequest): Promise<LLMResponse> {
    const model = this.models[modelId] ?? modelId;
    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n---\n\n${request.userPrompt}`
      : request.userPrompt;

    const res = await fetchWithTimeout(this.name, `${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: request.responseFormat === "json_object" ? "json" : undefined,
        options: {
          temperature: request.temperature ?? 0.2,
          num_predict: request.maxTokens ?? 4096,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error ${res.status}: ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      response?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.response ?? "",
      model,
      provider: this.name,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      costUsd: 0,
    };
  }
}
