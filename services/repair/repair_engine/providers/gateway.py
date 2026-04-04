"""
Gateway layer — the unified LLM entry point for all penny calls.

The GatewayRouter is the decision engine that controls cost, intelligence, speed,
and reliability simultaneously. Every LLM call in penny goes through this layer.

Responsibilities:
  1. Route tasks to the cheapest appropriate provider using RoutingConfig
  2. Score output confidence (heuristic) and auto-escalate to fallback if below threshold
  3. Track token usage and cost via CostTracker
  4. Retry on provider failure before escalating
  5. Enforce per-task budget caps

Provider aliases used in routing config map to registered CompletionProvider instances:
  hf-nano          → HuggingFace free tier (nano model)
  aimlapi-cheap    → aimlapi.com Llama-3.1-8B
  aimlapi-mid      → aimlapi.com Llama-3.1-70B
  aimlapi-expensive → aimlapi.com Llama-3.1-405B
  gpt-mini         → OpenAI gpt-4o-mini
  gpt-balanced     → OpenAI gpt-4o
  claude-haiku     → Anthropic claude-haiku
  claude-sonnet    → Anthropic claude-sonnet
  claude-opus      → Anthropic claude-opus
  gemini-flash     → Google Gemini 2.0 Flash
  gemini-pro       → Google Gemini 2.5 Pro

Usage:
    from repair_engine.providers.gateway import GatewayRouter
    from repair_engine.providers.router import TaskType

    gateway = GatewayRouter.from_keys(
        aimlapi_key="...",
        anthropic_api_key="...",
    )
    result = gateway.complete(prompt, task_type=TaskType.AUDIT_SCAN)
    print(f"Provider: {result.provider_alias} | Cost: ${result.cost_usd:.6f} | Confidence: {result.confidence:.2f}")
    print(gateway.cost_tracker.summary())
"""

from __future__ import annotations

from collections import Counter
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Protocol

from .cost_tracker import CostTracker
from .routing_config import RoutingConfig

# ── Confidence scoring ────────────────────────────────────────────────────────

_REFUSAL_RE = re.compile(
    r"\b(i cannot|i'm unable|i am unable|i can't|as an ai|i don't have the ability"
    r"|i apologize, but i|this request|i must decline)\b",
    re.IGNORECASE,
)


def _score_confidence(text: str, expect_json: bool = False) -> float:
    """Heuristic confidence score (0.0–1.0) for an LLM output.

    Rules (in priority order):
      - Empty → 0.0
      - Refusal phrases → 0.1
      - expect_json + malformed JSON → 0.3
      - expect_json + JSON in code fence → 0.7
      - expect_json + valid top-level object/array → 0.9
      - Short non-JSON (< 10 words) → 0.4
      - Medium non-JSON (10–30 words) → 0.65
      - Long non-JSON → 0.85
    """
    stripped = text.strip()
    if not stripped:
        return 0.0
    if _REFUSAL_RE.search(stripped):
        return 0.1
    if expect_json:
        open_braces = stripped.count("{") - stripped.count("}")
        open_brackets = stripped.count("[") - stripped.count("]")
        if open_braces != 0 or open_brackets != 0:
            return 0.3
        if stripped.startswith(("{", "[")):
            return 0.9
        if "```json" in stripped or "```" in stripped:
            return 0.7
        return 0.5
    word_count = len(stripped.split())
    if word_count < 10:
        return 0.4
    if word_count < 30:
        return 0.65
    return 0.85


# ── Protocol ──────────────────────────────────────────────────────────────────

class CompletionProvider(Protocol):
    def complete(self, prompt: str, temperature: float = 0.4, max_tokens: int = 1500) -> str: ...
    def complete_many(self, prompts: list[str], temperature: float = 0.4, max_tokens: int = 1500, concurrency: int = 8) -> list[str]: ...


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class GatewayResult:
    text: str
    provider_alias: str
    model: str
    confidence: float
    cost_usd: float
    escalated: bool = False  # True if a higher-cost provider was used
    retries: int = 0         # Number of retries before a response was accepted


@dataclass
class GatewayCall:
    task_type: str
    provider_alias: str
    model: str
    cost_usd: float
    confidence: float
    escalated: bool = False
    retries: int = 0


# ── GatewayRouter ─────────────────────────────────────────────────────────────

@dataclass
class GatewayRouter:
    """Unified multi-provider LLM gateway for penny.

    Build with GatewayRouter.from_keys(...) rather than constructing directly.
    """

    # alias → CompletionProvider instance
    provider_registry: dict[str, CompletionProvider]
    # alias → model name (for cost accounting)
    model_registry: dict[str, str]
    config: RoutingConfig = field(default_factory=RoutingConfig)
    cost_tracker: CostTracker = field(default_factory=CostTracker)
    call_history: list[GatewayCall] = field(default_factory=list)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _provider(self, alias: str) -> CompletionProvider | None:
        return self.provider_registry.get(alias)

    def _model(self, alias: str) -> str:
        return self.model_registry.get(alias, alias)

    def _record_call(self, task_type: str, result: GatewayResult) -> None:
        self.call_history.append(
            GatewayCall(
                task_type=task_type,
                provider_alias=result.provider_alias,
                model=result.model,
                cost_usd=result.cost_usd,
                confidence=result.confidence,
                escalated=result.escalated,
                retries=result.retries,
            )
        )

    @staticmethod
    def _routing_lane(alias: str) -> str:
        if alias.startswith("local-"):
            return "local"
        if alias.startswith("claude-") or alias in {"gpt-balanced", "gpt-high", "gpt-reasoning", "claude-sonnet", "claude-opus", "gemini-pro"}:
            return "premium"
        if alias == "none" or alias == "error":
            return "unknown"
        return "cloud"

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    # ── Public API ────────────────────────────────────────────────────────────

    def complete(
        self,
        prompt: str,
        task_type: str = "patch_generation",
        temperature: float = 0.4,
        max_tokens: int = 1500,
        expect_json: bool = False,
    ) -> GatewayResult:
        """Complete a prompt, routing by task type with confidence-based escalation.

        Args:
            prompt: The prompt to send.
            task_type: TaskType string key (e.g., "audit_scan", "patch_generation").
            temperature: Sampling temperature.
            max_tokens: Max output tokens.
            expect_json: If True, applies stricter JSON confidence scoring.

        Returns:
            GatewayResult with text, provider metadata, cost, and confidence.
        """
        route = self.config.get_route(task_type)
        rules = self.config.rules

        # Build ordered list of aliases to attempt (primary, then fallback)
        aliases: list[str] = []
        if self._provider(route.primary):
            aliases.append(route.primary)
        if rules.auto_escalate and route.fallback and self._provider(route.fallback):
            if route.fallback not in aliases:
                aliases.append(route.fallback)

        if not aliases:
            return GatewayResult(
                text="", provider_alias="none", model="none",
                confidence=0.0, cost_usd=0.0,
            )

        last: GatewayResult | None = None

        for attempt_idx, alias in enumerate(aliases):
            provider = self._provider(alias)
            if provider is None:
                continue
            model = self._model(alias)

            # Pre-call budget check: skip expensive fallbacks that exceed the cap
            input_tokens = self._estimate_tokens(prompt)
            if attempt_idx > 0:
                estimated = self.cost_tracker.estimate_cost(model, input_tokens, max_tokens)
                if estimated > rules.max_cost_per_task:
                    continue

            text = ""
            retries_used = 0
            for retry_num in range(rules.max_retries + 1):
                retries_used = retry_num
                try:
                    text = provider.complete(
                        prompt, temperature=temperature, max_tokens=max_tokens
                    )
                    if text.strip():
                        break
                except Exception:
                    if retry_num == rules.max_retries:
                        break

            output_tokens = self._estimate_tokens(text)
            actual_cost = self.cost_tracker.record(model, input_tokens, output_tokens)
            confidence = _score_confidence(text, expect_json=expect_json)

            last = GatewayResult(
                text=text,
                provider_alias=alias,
                model=model,
                confidence=confidence,
                cost_usd=actual_cost,
                escalated=attempt_idx > 0,
                retries=retries_used,
            )
            self._record_call(task_type, last)

            if confidence >= rules.confidence_threshold:
                return last

            if not rules.auto_escalate:
                return last

        return last or GatewayResult(
            text="", provider_alias="none", model="none",
            confidence=0.0, cost_usd=0.0,
        )

    def complete_many(
        self,
        prompts: list[str],
        task_type: str = "patch_generation",
        temperature: float = 0.4,
        max_tokens: int = 1500,
        expect_json: bool = False,
        concurrency: int = 8,
    ) -> list[GatewayResult]:
        """Batch completion with per-item routing and confidence scoring."""
        if not prompts:
            return []
        results: list[GatewayResult | None] = [None] * len(prompts)
        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as executor:
            futures = {
                executor.submit(
                    self.complete, p, task_type, temperature, max_tokens, expect_json
                ): i
                for i, p in enumerate(prompts)
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    results[idx] = fut.result()
                except Exception:
                    results[idx] = GatewayResult(
                        text="", provider_alias="error", model="unknown",
                        confidence=0.0, cost_usd=0.0,
                    )
        return results  # type: ignore[return-value]

    def texts(
        self,
        prompts: list[str],
        task_type: str = "patch_generation",
        temperature: float = 0.4,
        max_tokens: int = 1500,
        expect_json: bool = False,
        concurrency: int = 8,
    ) -> list[str]:
        """Convenience wrapper — returns just the text strings from complete_many."""
        return [r.text for r in self.complete_many(
            prompts, task_type, temperature, max_tokens, expect_json, concurrency
        )]

    def reset_usage(self) -> None:
        self.cost_tracker.reset()
        self.call_history.clear()

    def usage_summary(self, task_type: str | None = None) -> dict[str, object]:
        calls = [
            call for call in self.call_history
            if task_type is None or call.task_type == task_type
        ]
        if not calls:
            return {
                "strategy": self.config.strategy,
                "routing_lane": "unknown",
                "primary_provider": None,
                "primary_model": None,
                "total_cost_usd": 0.0,
                "calls": 0,
                "providers": [],
                "models": [],
                "task_type": task_type,
            }

        provider_counts = Counter(call.provider_alias for call in calls)
        model_counts = Counter(call.model for call in calls)
        primary_provider = provider_counts.most_common(1)[0][0]
        primary_model = model_counts.most_common(1)[0][0]

        return {
            "strategy": self.config.strategy,
            "routing_lane": self._routing_lane(primary_provider),
            "primary_provider": primary_provider,
            "primary_model": primary_model,
            "total_cost_usd": round(sum(call.cost_usd for call in calls), 6),
            "calls": len(calls),
            "providers": sorted(provider_counts.keys()),
            "models": sorted(model_counts.keys()),
            "task_type": task_type,
        }

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_keys(
        cls,
        aimlapi_key: str = "",
        hf_api_key: str = "",
        openai_api_key: str = "",
        anthropic_api_key: str = "",
        gemini_api_key: str = "",
        local_llm_base_url: str = "",
        local_llm_model: str = "",
        local_llm_api_key: str = "",
        aimlapi_model_overrides: dict[str, str] | None = None,
        openai_model_overrides: dict[str, str] | None = None,
        anthropic_model_overrides: dict[str, str] | None = None,
        gemini_model_overrides: dict[str, str] | None = None,
        hf_nano_model: str = "",
        routing_config: RoutingConfig | None = None,
    ) -> "GatewayRouter":
        """Build a GatewayRouter from API keys and optional overrides.

        Only providers with non-empty API keys are registered. Providers not
        configured are skipped; the router will fall through to the next alias
        in the route if a primary isn't available.

        Args:
            aimlapi_key:   AIMLAPI_API_KEY. Registers aimlapi-{nano,cheap,mid,expensive}.
            hf_api_key:    HF_TOKEN. Registers hf-nano. Empty string uses public endpoint.
            openai_api_key:   OPENAI_API_KEY. Registers gpt-{mini,balanced,high,reasoning}.
            anthropic_api_key: ANTHROPIC_API_KEY. Registers claude-{haiku,sonnet,opus}.
            gemini_api_key:   GEMINI_API_KEY. Registers gemini-{flash,flash-lite,pro}.
            *_model_overrides: Per-tier model name overrides for each provider.
            hf_nano_model: Override the default HF nano model ID.
            routing_config: Custom routing config; defaults to RoutingConfig() if None.
        """
        from .aimlapi_client import build_aimlapi_client, AIMLAPI_MODELS
        from .anthropic_client import build_anthropic_client, ANTHROPIC_MODELS
        from .gemini_client import build_gemini_client, GEMINI_MODELS
        from .huggingface_client import build_huggingface_client, HF_MODELS
        from .openai_client import build_openai_client, OPENAI_MODELS
        from .vllm_client import VLLMClient

        registry: dict[str, CompletionProvider] = {}
        model_reg: dict[str, str] = {}

        if local_llm_base_url and local_llm_model:
            registry["local-qwen"] = VLLMClient(
                base_url=local_llm_base_url,
                model=local_llm_model,
                api_key=local_llm_api_key or None,
            )
            model_reg["local-qwen"] = local_llm_model

        # HuggingFace — hf_api_key="" still works for public models
        nano_model = hf_nano_model or HF_MODELS["nano"]
        registry["hf-nano"] = build_huggingface_client(
            nano_model, api_key=hf_api_key or None
        )
        model_reg["hf-nano"] = nano_model

        # aimlapi — four tiers
        if aimlapi_key:
            merged_aml = {**AIMLAPI_MODELS, **(aimlapi_model_overrides or {})}
            for tier in ("nano", "cheap", "mid", "expensive"):
                alias = f"aimlapi-{tier}"
                registry[alias] = build_aimlapi_client(
                    tier, aimlapi_key, model_overrides=aimlapi_model_overrides
                )
                model_reg[alias] = merged_aml[tier]

        # OpenAI — four tiers
        if openai_api_key:
            merged_oai = {**OPENAI_MODELS, **(openai_model_overrides or {})}
            for tier, alias in [("mini", "gpt-mini"), ("balanced", "gpt-balanced"),
                                 ("high", "gpt-high"), ("reasoning", "gpt-reasoning")]:
                try:
                    registry[alias] = build_openai_client(
                        tier, openai_api_key, model_overrides=openai_model_overrides
                    )
                    model_reg[alias] = merged_oai[tier]
                except ValueError:
                    pass

        # Anthropic — three tiers
        if anthropic_api_key:
            merged_ant = {**ANTHROPIC_MODELS, **(anthropic_model_overrides or {})}
            for tier, alias in [("haiku", "claude-haiku"), ("sonnet", "claude-sonnet"),
                                 ("opus", "claude-opus")]:
                try:
                    registry[alias] = build_anthropic_client(
                        tier, anthropic_api_key, model_overrides=anthropic_model_overrides
                    )
                    model_reg[alias] = merged_ant[tier]
                except ValueError:
                    pass

        # Google Gemini — three tiers
        if gemini_api_key:
            merged_gem = {**GEMINI_MODELS, **(gemini_model_overrides or {})}
            for tier, alias in [("flash", "gemini-flash"), ("flash-lite", "gemini-flash-lite"),
                                 ("pro", "gemini-pro")]:
                try:
                    registry[alias] = build_gemini_client(
                        tier, gemini_api_key, model_overrides=gemini_model_overrides
                    )
                    model_reg[alias] = merged_gem[tier]
                except ValueError:
                    pass

        return cls(
            provider_registry=registry,
            model_registry=model_reg,
            config=routing_config or RoutingConfig(),
        )
