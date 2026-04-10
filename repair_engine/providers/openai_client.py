"""
OpenAI provider — direct API access.

Uses the standard OpenAI endpoint at api.openai.com. Since this is the reference
OpenAI-compatible interface, VLLMClient works without modification.

Tiers:
  mini       → gpt-4o-mini         (fast, cheap, good structured output)
  balanced   → gpt-4o              (general purpose; reliable tool calling + JSON)
  high       → o1-mini             (enhanced reasoning; slower)
  reasoning  → o1                  (full reasoning; use surgically)

Use OpenAI direct when:
  - You need predictable JSON / tool-calling behavior
  - You're orchestrating multi-step agent workflows
  - aimlapi isn't meeting reliability requirements for a specific task type
"""

from __future__ import annotations

from .vllm_client import VLLMClient, build_vllm_tier_client

OPENAI_BASE_URL = "https://api.openai.com/v1"

OPENAI_MODELS: dict[str, str] = {
    "mini": "gpt-4o-mini",
    "balanced": "gpt-4o",
    "high": "o1-mini",
    "reasoning": "o1",
}


def build_openai_client(
    tier: str,
    api_key: str,
    model_overrides: dict[str, str] | None = None,
) -> VLLMClient:
    """Return a VLLMClient configured for the given tier on OpenAI.

    Args:
        tier: One of 'mini', 'balanced', 'high', 'reasoning'.
        api_key: OPENAI_API_KEY value.
        model_overrides: Optional per-tier model name overrides.

    Returns:
        A VLLMClient pointed at api.openai.com with the selected model.
    """
    return build_vllm_tier_client(
        tier=tier,
        api_key=api_key,
        models=OPENAI_MODELS,
        base_url=OPENAI_BASE_URL,
        provider_name="OpenAI",
        model_overrides=model_overrides,
    )
