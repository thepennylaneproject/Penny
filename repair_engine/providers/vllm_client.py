from __future__ import annotations

from typing import Any
import json
import urllib.error
import urllib.request

from .base import CompletionMixin


class VLLMClient(CompletionMixin):
    def __init__(self, base_url: str, model: str, api_key: str | None = None, timeout: int = 120) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    def _request(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/v1/chat/completions"
        body = json.dumps(payload).encode("utf-8")
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        http_request = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(http_request, timeout=self.timeout) as http_response:
                return json.loads(http_response.read())
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"vLLM request failed ({exc.code}): {text[:500]}") from exc

    def complete(self, prompt: str, temperature: float = 0.4, max_tokens: int = 1500) -> str:
        payload = {
            "model": self.model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        result = self._request(payload)
        choices = result.get("choices", [])
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "")



def build_vllm_tier_client(
    tier: str,
    api_key: str,
    models: dict[str, str],
    base_url: str,
    provider_name: str,
    model_overrides: dict[str, str] | None = None,
) -> VLLMClient:
    """Generic factory that constructs a :class:`VLLMClient` for a named tier.

    All OpenAI-compatible provider factories (OpenAI, Gemini, aimlapi, …) share
    the same tier-lookup-then-construct pattern.  This helper centralises that
    logic so each provider module only needs to supply its own *models* dict and
    *base_url*.

    Args:
        tier: The requested cost/capability tier (e.g. ``'mini'``, ``'flash'``).
        api_key: Provider API key forwarded to :class:`VLLMClient`.
        models: Canonical tier → model-name mapping for this provider.
        base_url: Provider OpenAI-compatible base URL.
        provider_name: Human-readable name used in error messages.
        model_overrides: Optional per-tier overrides merged over *models*.

    Returns:
        A :class:`VLLMClient` pointed at *base_url* with the resolved model.

    Raises:
        ValueError: If *tier* is not present in the merged models dict.
    """
    merged = {**models, **(model_overrides or {})}
    if tier not in merged:
        raise ValueError(
            f"Unknown {provider_name} tier '{tier}'. Valid tiers: {list(merged.keys())}"
        )
    return VLLMClient(base_url=base_url, model=merged[tier], api_key=api_key)
