"""
Token and cost tracking across all GatewayRouter calls.

Tracks usage per model and accumulates totals for a session or repair run.
Costs are estimated from a pricing table; actual invoiced amounts may vary.

Usage:
    tracker = CostTracker()
    cost = tracker.record("meta-llama/Llama-3.1-70B-Instruct", input_tokens=800, output_tokens=400)
    print(tracker.summary())
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Approximate pricing per 1M tokens (input $/1M, output $/1M).
# Sources: provider pricing pages + aimlapi.com published rates (early 2025).
# Update this table as prices change.
MODEL_PRICING: dict[str, tuple[float, float]] = {
    # ── HuggingFace serverless (free tier) ──────────────────────────────────
    "Qwen/Qwen2.5-0.5B-Instruct":          (0.00, 0.00),
    "Qwen/Qwen2.5-1.5B-Instruct":          (0.00, 0.00),
    "Qwen/Qwen2.5-Coder-1.5B-Instruct":    (0.00, 0.00),
    "meta-llama/Llama-3.2-1B-Instruct":    (0.00, 0.00),

    # ── aimlapi.com — open-source models ────────────────────────────────────
    "Qwen/Qwen2.5-7B-Instruct":            (0.07,  0.07),
    "meta-llama/Llama-3.1-8B-Instruct":    (0.10,  0.10),
    "meta-llama/Llama-3.1-70B-Instruct":   (0.52,  0.75),
    "meta-llama/Llama-3.1-405B-Instruct":  (5.00, 15.00),

    # ── OpenAI ──────────────────────────────────────────────────────────────
    "gpt-4o-mini":  (0.15,   0.60),
    "gpt-4o":       (2.50,  10.00),
    "o1-mini":      (3.00,  12.00),
    "o1":          (15.00,  60.00),

    # ── Anthropic ───────────────────────────────────────────────────────────
    "claude-haiku-4-5":   (0.80,   4.00),
    "claude-sonnet-4-5":  (3.00,  15.00),
    "claude-opus-4-5":   (15.00,  75.00),

    # ── Google Gemini ────────────────────────────────────────────────────────
    "gemini-2.0-flash":               (0.10,  0.40),
    "gemini-2.0-flash-lite":          (0.075, 0.30),
    "gemini-2.5-pro-preview-03-25":   (1.25, 10.00),
}


@dataclass
class UsageRecord:
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


@dataclass
class CostTracker:
    """Accumulates token usage and cost data across multiple LLM calls."""

    records: list[UsageRecord] = field(default_factory=list)

    def record(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Record usage and return the computed cost in USD."""
        cost = self._compute_cost(model, input_tokens, output_tokens)
        self.records.append(UsageRecord(model, input_tokens, output_tokens, cost))
        return cost

    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost without recording (for pre-call budget checks)."""
        return self._compute_cost(model, input_tokens, output_tokens)

    def _compute_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        price_in, price_out = MODEL_PRICING.get(model, (0.0, 0.0))
        return (input_tokens / 1_000_000) * price_in + (output_tokens / 1_000_000) * price_out

    @property
    def total_cost(self) -> float:
        return sum(r.cost_usd for r in self.records)

    @property
    def total_input_tokens(self) -> int:
        return sum(r.input_tokens for r in self.records)

    @property
    def total_output_tokens(self) -> int:
        return sum(r.output_tokens for r in self.records)

    def summary(self) -> dict:
        """Return a structured summary of all usage, grouped by model."""
        by_model: dict[str, dict] = {}
        for r in self.records:
            if r.model not in by_model:
                by_model[r.model] = {
                    "calls": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cost_usd": 0.0,
                }
            by_model[r.model]["calls"] += 1
            by_model[r.model]["input_tokens"] += r.input_tokens
            by_model[r.model]["output_tokens"] += r.output_tokens
            by_model[r.model]["cost_usd"] = round(
                by_model[r.model]["cost_usd"] + r.cost_usd, 8
            )
        return {
            "total_cost_usd": round(self.total_cost, 6),
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "by_model": by_model,
        }

    def reset(self) -> None:
        """Clear all records (e.g., between repair runs)."""
        self.records.clear()
