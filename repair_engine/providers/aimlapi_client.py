"""
aimlapi.com provider — unified multi-model gateway.

aimlapi aggregates models from many providers (Meta, Mistral, Anthropic, OpenAI, etc.)
under a single OpenAI-compatible endpoint. This makes it ideal for cost-tier routing:
cheap open-source models handle bulk work; expensive frontier models are reserved for
complex reasoning that smaller models cannot handle reliably.

Endpoint: https://api.aimlapi.com/v1/chat/completions
Auth:      Bearer <AIMLAPI_API_KEY>
"""

from __future__ import annotations

from .vllm_client import VLLMClient, build_vllm_tier_client

AIMLAPI_BASE_URL = "https://api.aimlapi.com/v1"

# Model tier table — maps cost tiers to specific model IDs available on aimlapi.com.
# Override individual tiers via environment variables (see config.py / ProviderConfig).
AIMLAPI_MODELS: dict[str, str] = {
    # Nano: very small models for structural/trivial tasks (lint checks, format fixes).
    # Fast + nearly free. Not suitable for complex reasoning.
    "nano": "Qwen/Qwen2.5-7B-Instruct",
    # Cheap: capable open-source models for audit scanning and simple patch generation.
    "cheap": "meta-llama/Llama-3.1-8B-Instruct",
    # Mid: strong open-source models for patch generation and refactoring.
    "mid": "meta-llama/Llama-3.1-70B-Instruct",
    # Expensive: frontier models for security analysis and complex reasoning.
    # Used surgically — only when lower tiers fail or the task explicitly requires it.
    "expensive": "meta-llama/Llama-3.1-405B-Instruct",
}


def build_aimlapi_client(
    tier: str,
    api_key: str,
    model_overrides: dict[str, str] | None = None,
) -> VLLMClient:
    """Return a VLLMClient configured for the given cost tier on aimlapi.com.

    Args:
        tier: One of 'nano', 'cheap', 'mid', 'expensive'.
        api_key: AIMLAPI_API_KEY value.
        model_overrides: Optional per-tier model name overrides (from env/config).

    Returns:
        A VLLMClient pointed at api.aimlapi.com with the selected model.
    """
    return build_vllm_tier_client(
        tier=tier,
        api_key=api_key,
        models=AIMLAPI_MODELS,
        base_url=AIMLAPI_BASE_URL,
        provider_name="aimlapi",
        model_overrides=model_overrides,
    )
