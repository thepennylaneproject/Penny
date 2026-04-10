"""
Anthropic Claude provider — native Messages API adapter.

Anthropic's API uses a different request/response format from OpenAI:
  - Endpoint: POST /v1/messages (not /v1/chat/completions)
  - Auth header: x-api-key (not Authorization: Bearer)
  - Requires anthropic-version header
  - Response structure: content[].text (not choices[].message.content)

This module adapts the Anthropic Messages API to the CompletionProvider protocol
so it's interchangeable with all other providers in the GatewayRouter.

Tiers:
  haiku   → claude-haiku-4-5    (fast, cheap; good for structured extraction)
  sonnet  → claude-sonnet-4-5   (balanced; strong code reasoning and long context)
  opus    → claude-opus-4-5     (frontier; deep logic, architecture analysis)

Use Anthropic when:
  - A task requires complex multi-step code reasoning
  - The Logic agent has low confidence on a finding
  - Security analysis needs deep nuanced judgment
  - Long context (>100K tokens) is required
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import CompletionMixin

ANTHROPIC_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_API_VERSION = "2023-06-01"

ANTHROPIC_MODELS: dict[str, str] = {
    "haiku": "claude-haiku-4-5",
    "sonnet": "claude-sonnet-4-5",
    "opus": "claude-opus-4-5",
}


class AnthropicClient(CompletionMixin):
    """Anthropic Messages API client implementing the CompletionProvider protocol."""

    def __init__(self, model: str, api_key: str, timeout: int = 120) -> None:
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    def _request(self, prompt: str, temperature: float, max_tokens: int) -> dict:
        url = f"{ANTHROPIC_BASE_URL}/v1/messages"
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "content-type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_API_VERSION,
        }
        http_request = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(http_request, timeout=self.timeout) as http_response:
                return json.loads(http_response.read())
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Anthropic request failed ({exc.code}): {text[:500]}"
            ) from exc

    def complete(self, prompt: str, temperature: float = 0.4, max_tokens: int = 1500) -> str:
        result = self._request(prompt, temperature, max_tokens)
        content = result.get("content", [])
        if not content:
            return ""
        return content[0].get("text", "")

    def complete_many(
        self,
        prompts: list[str],
        temperature: float = 0.4,
        max_tokens: int = 1500,
        concurrency: int = 8,
    ) -> list[str]:
        if not prompts:
            return []
        results: list[str] = [""] * len(prompts)
        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as executor:
            futures = {
                executor.submit(self.complete, prompt_text, temperature, max_tokens): prompt_index
                for prompt_index, prompt_text in enumerate(prompts)
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    results[idx] = fut.result()
                except Exception:
                    results[idx] = ""
        return results


def build_anthropic_client(
    tier: str,
    api_key: str,
    model_overrides: dict[str, str] | None = None,
) -> AnthropicClient:
    """Return an AnthropicClient configured for the given tier.

    Args:
        tier: One of 'haiku', 'sonnet', 'opus'.
        api_key: ANTHROPIC_API_KEY value.
        model_overrides: Optional per-tier model name overrides.

    Returns:
        An AnthropicClient for the selected model.
    """
    merged = {**ANTHROPIC_MODELS, **(model_overrides or {})}
    if tier not in merged:
        raise ValueError(
            f"Unknown Anthropic tier '{tier}'. Valid tiers: {list(merged.keys())}"
        )
    return AnthropicClient(model=merged[tier], api_key=api_key)
