"""
Google Gemini provider — OpenAI-compatible endpoint.

Google exposes Gemini models via an OpenAI-compatible REST API at:
  https://generativelanguage.googleapis.com/v1beta/openai/

This means VLLMClient works unchanged — just point it at the right base URL
and authenticate with a Gemini API key.

Tiers:
  flash       → gemini-2.0-flash       (fast, cheap, high volume — ideal for batch audit)
  flash-lite  → gemini-2.0-flash-lite  (even cheaper; good for classification tasks)
  pro         → gemini-2.5-pro-preview (deep reasoning; comparable to frontier models)

Use Gemini when:
  - You need high-volume, low-latency processing (batch audit scanning)
  - You're doing fast classification or tagging
  - Cost sensitivity is highest and accuracy requirements are moderate
"""

from __future__ import annotations

from .vllm_client import VLLMClient, build_vllm_tier_client

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

GEMINI_MODELS: dict[str, str] = {
    "flash": "gemini-2.0-flash",
    "flash-lite": "gemini-2.0-flash-lite",
    "pro": "gemini-2.5-pro-preview-03-25",
}


def build_gemini_client(
    tier: str,
    api_key: str,
    model_overrides: dict[str, str] | None = None,
) -> VLLMClient:
    """Return a VLLMClient configured for the given tier on Google Gemini.

    Args:
        tier: One of 'flash', 'flash-lite', 'pro'.
        api_key: GEMINI_API_KEY value.
        model_overrides: Optional per-tier model name overrides.

    Returns:
        A VLLMClient pointed at the Gemini OpenAI-compatible endpoint.
    """
    return build_vllm_tier_client(
        tier=tier,
        api_key=api_key,
        models=GEMINI_MODELS,
        base_url=GEMINI_BASE_URL,
        provider_name="Gemini",
        model_overrides=model_overrides,
    )
