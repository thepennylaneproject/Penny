"""Cost tracking for LLM usage."""

from dataclasses import dataclass


@dataclass
class ModelCost:
    """Cost per token for a model."""

    model: str
    input_price_per_1k: float  # Price per 1000 input tokens
    output_price_per_1k: float  # Price per 1000 output tokens


class CostTracker:
    """Tracks and calculates LLM costs."""

    # Anthropic pricing (as of 2025-04)
    MODEL_COSTS = {
        "claude-3-5-sonnet-latest": ModelCost(
            model="claude-3-5-sonnet-latest",
            input_price_per_1k=0.003,
            output_price_per_1k=0.015,
        ),
        "claude-3-opus-latest": ModelCost(
            model="claude-3-opus-latest",
            input_price_per_1k=0.015,
            output_price_per_1k=0.075,
        ),
        "claude-3-haiku-latest": ModelCost(
            model="claude-3-haiku-latest",
            input_price_per_1k=0.00025,
            output_price_per_1k=0.00125,
        ),
        "gpt-4-turbo": ModelCost(
            model="gpt-4-turbo",
            input_price_per_1k=0.01,
            output_price_per_1k=0.03,
        ),
        "gpt-4o": ModelCost(
            model="gpt-4o",
            input_price_per_1k=0.005,
            output_price_per_1k=0.015,
        ),
    }

    def __init__(self):
        """Initialize cost tracker."""
        self.total_cost: float = 0.0
        self.calls: list[dict] = []

    def calculate_cost(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """
        Calculate cost for a single LLM call.

        Args:
            model: Model identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens

        Returns:
            Cost in USD
        """
        if model not in self.MODEL_COSTS:
            # Default to Sonnet pricing for unknown models
            model_cost = self.MODEL_COSTS["claude-3-5-sonnet-latest"]
        else:
            model_cost = self.MODEL_COSTS[model]

        input_cost = (input_tokens / 1000) * model_cost.input_price_per_1k
        output_cost = (output_tokens / 1000) * model_cost.output_price_per_1k

        return input_cost + output_cost

    def track_call(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        usage_type: str = "generation",
    ) -> float:
        """
        Track a single LLM call.

        Args:
            model: Model identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            usage_type: Type of usage (generation, refinement, evaluation)

        Returns:
            Cost of this call in USD
        """
        cost = self.calculate_cost(model, input_tokens, output_tokens)

        self.calls.append(
            {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": cost,
                "usage_type": usage_type,
            }
        )

        self.total_cost += cost
        return cost

    def get_total_cost(self) -> float:
        """Get total cost for all calls."""
        return self.total_cost

    def get_call_count(self) -> int:
        """Get number of LLM calls made."""
        return len(self.calls)

    def get_token_count(self) -> tuple[int, int]:
        """Get total input and output tokens."""
        input_total = sum(call["input_tokens"] for call in self.calls)
        output_total = sum(call["output_tokens"] for call in self.calls)
        return input_total, output_total

    def get_summary(self) -> dict:
        """Get summary of all tracked costs."""
        input_tokens, output_tokens = self.get_token_count()

        return {
            "total_cost_usd": self.total_cost,
            "total_calls": self.get_call_count(),
            "total_input_tokens": input_tokens,
            "total_output_tokens": output_tokens,
            "average_cost_per_call": (
                self.total_cost / len(self.calls) if self.calls else 0.0
            ),
            "calls": self.calls,
        }
