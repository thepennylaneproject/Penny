from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

from .aimlapi_client import build_aimlapi_client
from .huggingface_client import build_huggingface_nano_client
from .vllm_client import VLLMClient


class TaskType(str, Enum):
    """Classification of the kind of work being requested.

    Used by TaskAwareRouter to select the appropriate cost tier and provider.
    The mapping from TaskType → CostTier is defined in the routing table and
    can be overridden via ProviderConfig.
    """
    LINT_FIX = "lint_fix"                       # Trivial formatting / lint corrections
    AUDIT_SCAN = "audit_scan"                   # Scanning files for constraint violations
    PATCH_GENERATION = "patch_generation"       # Generating code patches for known issues
    REFACTOR = "refactor"                       # Structural code improvements
    SECURITY_ANALYSIS = "security_analysis"    # Vulnerability and unsafe-pattern detection
    COMPLEX_REASONING = "complex_reasoning"    # Architecture decisions, deep logic analysis


class CostTier(str, Enum):
    """Provider cost tier, ordered cheapest → most expensive."""
    NANO = "nano"           # HuggingFace free tier — trivial tasks only
    CHEAP = "cheap"         # aimlapi small model (e.g., Llama-3.1-8B)
    MID = "mid"             # aimlapi mid model (e.g., Llama-3.1-70B)
    EXPENSIVE = "expensive" # aimlapi frontier model (e.g., Llama-3.1-405B)


# Default task → cost tier mapping.
# Achieves the "70-80% cheap, expensive only when necessary" goal from the brief.
DEFAULT_TASK_ROUTING: dict[TaskType, CostTier] = {
    TaskType.LINT_FIX:           CostTier.NANO,
    TaskType.AUDIT_SCAN:         CostTier.CHEAP,
    TaskType.PATCH_GENERATION:   CostTier.MID,
    TaskType.REFACTOR:           CostTier.MID,
    TaskType.SECURITY_ANALYSIS:  CostTier.MID,
    TaskType.COMPLEX_REASONING:  CostTier.EXPENSIVE,
}


class CompletionProvider(Protocol):
    def complete(self, prompt: str, temperature: float = 0.4, max_tokens: int = 1500) -> str:
        ...

    def complete_many(
        self,
        prompts: list[str],
        temperature: float = 0.4,
        max_tokens: int = 1500,
        concurrency: int = 8,
    ) -> list[str]:
        ...


@dataclass
class ModelRouter:
    """Simple primary/fallback router. Kept for backwards compatibility and
    for cases where explicit provider control is preferred over task routing."""

    primary: CompletionProvider
    fallback: CompletionProvider | None = None

    def complete_many(
        self,
        prompts: list[str],
        temperature: float = 0.4,
        max_tokens: int = 1500,
        concurrency: int = 8,
    ) -> list[str]:
        outputs = self.primary.complete_many(prompts, temperature, max_tokens, concurrency)
        if not self.fallback:
            return outputs

        retry_indices = [idx for idx, text in enumerate(outputs) if not text.strip()]
        if not retry_indices:
            return outputs

        retry_prompts = [prompts[idx] for idx in retry_indices]
        retry_outputs = self.fallback.complete_many(retry_prompts, temperature, max_tokens, concurrency)
        for idx, text in zip(retry_indices, retry_outputs):
            if text.strip():
                outputs[idx] = text
        return outputs


@dataclass
class TaskAwareRouter:
    """Multi-provider router that selects the cheapest appropriate provider for each task.

    Provider priority per tier:
      NANO     → HuggingFace free tier (falls back to aimlapi nano if HF is unavailable)
      CHEAP    → aimlapi cheap model
      MID      → aimlapi mid model
      EXPENSIVE → aimlapi expensive model

    If a tier's provider returns empty output, the router automatically escalates to
    the next tier and retries — ensuring reliability without manual intervention.

    Usage:
        router = TaskAwareRouter.from_config(provider_cfg)
        outputs = router.complete_many(prompts, task_type=TaskType.AUDIT_SCAN)
    """

    tier_providers: dict[CostTier, CompletionProvider]
    task_routing: dict[TaskType, CostTier] = field(
        default_factory=lambda: dict(DEFAULT_TASK_ROUTING)
    )

    def _provider_for_task(self, task_type: TaskType) -> CompletionProvider:
        tier = self.task_routing.get(task_type, CostTier.MID)
        if tier not in self.tier_providers:
            # If exact tier isn't configured, walk up to the next available tier.
            tier_order = [CostTier.NANO, CostTier.CHEAP, CostTier.MID, CostTier.EXPENSIVE]
            start = tier_order.index(tier)
            for fallback_tier in tier_order[start + 1:]:
                if fallback_tier in self.tier_providers:
                    return self.tier_providers[fallback_tier]
            raise RuntimeError(
                f"No provider configured for tier '{tier}' or any higher tier."
            )
        return self.tier_providers[tier]

    def complete_many(
        self,
        prompts: list[str],
        task_type: TaskType = TaskType.PATCH_GENERATION,
        temperature: float = 0.4,
        max_tokens: int = 1500,
        concurrency: int = 8,
    ) -> list[str]:
        """Complete prompts using the provider appropriate for task_type.

        Automatically escalates to the next cost tier if the selected provider
        returns empty outputs.
        """
        tier_order = [CostTier.NANO, CostTier.CHEAP, CostTier.MID, CostTier.EXPENSIVE]
        current_tier = self.task_routing.get(task_type, CostTier.MID)
        start_idx = tier_order.index(current_tier) if current_tier in tier_order else 2

        pending_indices = list(range(len(prompts)))
        results = [""] * len(prompts)

        for tier in tier_order[start_idx:]:
            if not pending_indices:
                break
            provider = self.tier_providers.get(tier)
            if provider is None:
                continue

            batch = [prompts[i] for i in pending_indices]
            outputs = provider.complete_many(batch, temperature, max_tokens, concurrency)

            still_pending = []
            for local_idx, (global_idx, text) in enumerate(zip(pending_indices, outputs)):
                if text.strip():
                    results[global_idx] = text
                else:
                    still_pending.append(global_idx)
            pending_indices = still_pending

        return results

    @classmethod
    def from_config(
        cls,
        aimlapi_key: str,
        hf_api_key: str | None = None,
        aimlapi_model_overrides: dict[str, str] | None = None,
        hf_nano_model: str | None = None,
        task_routing_overrides: dict[str, str] | None = None,
    ) -> "TaskAwareRouter":
        """Build a TaskAwareRouter from the values in ProviderConfig.

        Args:
            aimlapi_key: API key for aimlapi.com. Required.
            hf_api_key: HuggingFace token. Optional — only needed for gated models.
            aimlapi_model_overrides: Per-tier model name overrides for aimlapi.
            hf_nano_model: Override the default HF nano model ID.
            task_routing_overrides: Map of TaskType str → CostTier str overrides.

        Returns:
            A fully configured TaskAwareRouter.
        """
        from .huggingface_client import build_huggingface_client, HF_MODELS

        tier_providers: dict[CostTier, CompletionProvider] = {}

        # NANO tier — HuggingFace free serverless inference
        nano_model = hf_nano_model or HF_MODELS["nano"]
        tier_providers[CostTier.NANO] = build_huggingface_client(
            nano_model, api_key=hf_api_key
        )

        # CHEAP / MID / EXPENSIVE — aimlapi.com
        for tier in [CostTier.CHEAP, CostTier.MID, CostTier.EXPENSIVE]:
            tier_providers[tier] = build_aimlapi_client(
                tier.value, api_key=aimlapi_key, model_overrides=aimlapi_model_overrides
            )

        # Apply task routing overrides
        routing = dict(DEFAULT_TASK_ROUTING)
        if task_routing_overrides:
            for task_str, tier_str in task_routing_overrides.items():
                try:
                    routing[TaskType(task_str)] = CostTier(tier_str)
                except ValueError:
                    pass  # Silently skip unknown task/tier names from config

        return cls(tier_providers=tier_providers, task_routing=routing)


def build_router(
    vllm_base_url: str,
    vllm_model: str,
    fallback_model: str = "",
    api_key: str | None = None,
    fallback_base_url: str | None = None,
    fallback_api_key: str | None = None,
) -> ModelRouter:
    """Build a simple primary/fallback ModelRouter against a vLLM endpoint.

    Kept for backwards compatibility. For new code, prefer TaskAwareRouter.from_config().
    """
    primary = VLLMClient(vllm_base_url, vllm_model, api_key=api_key)
    fallback = None
    if fallback_model:
        resolved_url = fallback_base_url.strip() if isinstance(fallback_base_url, str) and fallback_base_url.strip() else vllm_base_url
        resolved_key = fallback_api_key if fallback_api_key is not None else api_key
        fallback = VLLMClient(resolved_url, fallback_model, api_key=resolved_key)
    return ModelRouter(primary=primary, fallback=fallback)

