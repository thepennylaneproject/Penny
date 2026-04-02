"""
HuggingFace Serverless Inference provider.

HuggingFace hosts thousands of models on its Inference API. For models that support
the Messages API (chat completions), the endpoint follows the pattern:

    https://api-inference.huggingface.co/models/{model_id}/v1

This is OpenAI-compatible, so VLLMClient works unchanged.

Use cases in penny:
- Free/nano tier for trivial structural checks that don't need business-logic reasoning
- Gate on very small, fast models to avoid burning aimlapi credits on simple work

Note: The HF free tier has rate limits (~300 requests/hour per model). For production
workloads, use a paid HF Inference Endpoint or prefer aimlapi for quota headroom.
"""

from __future__ import annotations

from .vllm_client import VLLMClient

HF_BASE_URL_TEMPLATE = "https://api-inference.huggingface.co/models/{model_id}/v1"

# Recommended HF models for penny's use cases.
# These are small, fast, and available on the free serverless tier.
HF_MODELS: dict[str, str] = {
    # Nano: smallest capable chat model for structural / format checks.
    "nano": "Qwen/Qwen2.5-0.5B-Instruct",
    # Small: slightly larger, better at following structured output constraints.
    "small": "Qwen/Qwen2.5-1.5B-Instruct",
    # Code-nano: tiny code-focused model for trivial lint/formatting decisions.
    "code-nano": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
}


def build_huggingface_client(
    model_id: str,
    api_key: str | None = None,
) -> VLLMClient:
    """Return a VLLMClient configured for a specific HuggingFace model.

    The model_id can be any HF model that supports the Messages API, e.g.:
      - 'Qwen/Qwen2.5-0.5B-Instruct'
      - 'meta-llama/Llama-3.2-1B-Instruct'

    Args:
        model_id: Full HuggingFace model repo ID (org/model-name).
        api_key: HF_TOKEN. Required for gated models; optional for public ones.

    Returns:
        A VLLMClient pointed at the HF serverless inference endpoint for that model.
    """
    base_url = HF_BASE_URL_TEMPLATE.format(model_id=model_id)
    return VLLMClient(base_url=base_url, model=model_id, api_key=api_key)


def build_huggingface_nano_client(api_key: str | None = None) -> VLLMClient:
    """Convenience factory for the default HF nano-tier model."""
    return build_huggingface_client(HF_MODELS["nano"], api_key=api_key)
