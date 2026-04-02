import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  fetchWithTimeout,
} from "./base.js";

/**
 * Google Gemini LLM provider.
 *
 * Uses the Gemini REST API (generateContent endpoint).
 *
 * Supported model IDs:
 *   "flash"  → gemini-2.0-flash   (~$0.10/$0.40 per 1M tokens, 1M token context)
 *   "pro"    → gemini-1.5-pro     (~$1.25/$5.00 per 1M tokens, 2M token context)
 *   "flash8b"→ gemini-1.5-flash-8b (free tier eligible)
 *
 * Best use: Large-context project-scope scans where you need to see many files at once.
 * Gemini Flash's 1M token window eliminates the need to chunk files for most projects.
 *
 * Required env var: GEMINI_API_KEY
 *
 * Usage in routing:
 *   penny_AUDIT_MODEL=gemini:flash → Gemini Flash for large-context audits
 */
export class GeminiProvider extends LLMProvider {
  name = "gemini";
  models: Record<string, string> = {
    flash: "gemini-2.0-flash",
    "flash-2": "gemini-2.0-flash",
    pro: "gemini-1.5-pro",
    "flash8b": "gemini-1.5-flash-8b",
    // aliases
    "2.0-flash": "gemini-2.0-flash",
  };

  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor() {
    super();
    this.apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  configurationError(): string {
    return "GEMINI_API_KEY not set";
  }

  async call(modelId: string, request: LLMRequest): Promise<LLMResponse> {
    const model = this.models[modelId] ?? modelId;

    // Combine system prompt + user prompt since Gemini uses a single contents field
    const fullPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n---\n\n${request.userPrompt}`
      : request.userPrompt;

    const body: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: fullPrompt }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 8192,
        ...(request.responseFormat === "json_object"
          ? { responseMimeType: "application/json" }
          : {}),
      },
    };

    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const res = await fetchWithTimeout(this.name, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error ${res.status}: ${err.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const inputTokens = data.usageMetadata?.promptTokenCount;
    const outputTokens = data.usageMetadata?.candidatesTokenCount;

    // Cost estimation
    let costUsd = 0;
    if (inputTokens && outputTokens) {
      if (model.includes("2.0-flash") || model.includes("flash")) {
        // Gemini 2.0 Flash: ~$0.10/$0.40 per 1M tokens
        costUsd = inputTokens * 0.0000001 + outputTokens * 0.0000004;
      } else if (model.includes("pro")) {
        // Gemini 1.5 Pro: ~$1.25/$5.00 per 1M tokens (>128K context)
        costUsd = inputTokens * 0.00000125 + outputTokens * 0.000005;
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
