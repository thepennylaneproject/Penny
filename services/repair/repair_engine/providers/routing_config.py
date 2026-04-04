"""
Routing configuration — JSON-based routing table with rules.

Defines which provider alias to use for each task type, plus global rules
(budget caps, confidence thresholds, escalation behavior).

The default configuration routes tasks to the cheapest appropriate provider:

  lint_fix          → hf-nano (free)           fallback: aimlapi-cheap
  audit_scan        → aimlapi-cheap             fallback: aimlapi-mid
  patch_generation  → aimlapi-mid               fallback: aimlapi-expensive
  refactor          → aimlapi-mid               fallback: aimlapi-expensive
  security_analysis → aimlapi-mid               fallback: claude-sonnet
  complex_reasoning → claude-sonnet             fallback: claude-opus

This configuration is overridable at runtime via a JSON file. The file path
is set with penny_ROUTING_CONFIG. If the file does not exist, defaults are used.

Example JSON (audits/routing_config.json):
{
  "routes": {
    "audit_scan": { "primary": "gemini-flash", "fallback": "aimlapi-mid" },
    "complex_reasoning": { "primary": "claude-opus", "fallback": "gpt-balanced" }
  },
  "rules": {
    "max_cost_per_task": 0.02,
    "confidence_threshold": 0.75,
    "auto_escalate": true,
    "max_retries": 2
  }
}
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
import os


@dataclass
class RouteEntry:
    """Routing entry for a single task type."""
    primary: str                  # Provider alias (e.g., "aimlapi-mid", "claude-sonnet")
    fallback: str | None = None   # Fallback alias used when confidence < threshold


@dataclass
class RoutingRules:
    """Global routing rules applied to all tasks."""
    max_cost_per_task: float = 0.02    # Max USD per single task completion; skips to fallback if exceeded
    confidence_threshold: float = 0.75  # Output confidence below this triggers escalation
    auto_escalate: bool = True          # Whether to automatically try the fallback on low confidence
    max_retries: int = 2                # Max retry attempts before giving up on a provider


def default_routes_for_strategy(strategy: str) -> dict[str, RouteEntry]:
    normalized = (strategy or "balanced").strip().lower()
    if normalized == "local-training":
        return {
            "lint_fix": RouteEntry(primary="local-qwen", fallback="hf-nano"),
            "audit_scan": RouteEntry(primary="local-qwen", fallback="hf-nano"),
            "patch_generation": RouteEntry(primary="claude-sonnet", fallback="gpt-balanced"),
            "refactor": RouteEntry(primary="claude-sonnet", fallback="gpt-balanced"),
            "security_analysis": RouteEntry(primary="claude-sonnet", fallback="claude-opus"),
            "complex_reasoning": RouteEntry(primary="claude-sonnet", fallback="claude-opus"),
        }

    # Default routes implementing the "cheapest model that can do the job" principle.
    # ~70-80% of tasks (lint, audit, basic patch) route to nano/cheap tiers.
    return {
        "lint_fix": RouteEntry(primary="hf-nano", fallback="aimlapi-cheap"),
        "audit_scan": RouteEntry(primary="aimlapi-cheap", fallback="aimlapi-mid"),
        "patch_generation": RouteEntry(primary="aimlapi-mid", fallback="aimlapi-expensive"),
        "refactor": RouteEntry(primary="aimlapi-mid", fallback="aimlapi-expensive"),
        "security_analysis": RouteEntry(primary="aimlapi-mid", fallback="claude-sonnet"),
        "complex_reasoning": RouteEntry(primary="claude-sonnet", fallback="claude-opus"),
    }


@dataclass
class RoutingConfig:
    strategy: str = field(default_factory=lambda: os.getenv("penny_REPAIR_ROUTING_STRATEGY", os.getenv("penny_ROUTING_STRATEGY", "balanced")))
    routes: dict[str, RouteEntry] = field(default_factory=dict)
    rules: RoutingRules = field(default_factory=RoutingRules)

    def __post_init__(self) -> None:
        if not self.routes:
            self.routes = default_routes_for_strategy(self.strategy)

    def get_route(self, task_key: str) -> RouteEntry:
        """Return the RouteEntry for a task key, falling back to a generic mid-tier route."""
        if task_key in self.routes:
            return self.routes[task_key]
        if self.strategy.strip().lower() == "local-training":
            return RouteEntry(primary="local-qwen", fallback="claude-sonnet")
        return RouteEntry(primary="aimlapi-mid")

    @classmethod
    def from_json(cls, path: str | Path) -> "RoutingConfig":
        """Load a RoutingConfig from a JSON file.

        Unknown keys in the JSON are ignored. Missing keys fall back to defaults.
        """
        data = json.loads(Path(path).read_text())

        # Merge user routes on top of defaults (user overrides win)
        strategy = str(data.get("strategy", os.getenv("penny_REPAIR_ROUTING_STRATEGY", os.getenv("penny_ROUTING_STRATEGY", "balanced"))))
        routes = default_routes_for_strategy(strategy)
        for task, entry in data.get("routes", {}).items():
            routes[task] = RouteEntry(
                primary=entry["primary"],
                fallback=entry.get("fallback"),
            )

        rules_data = data.get("rules", {})
        rules = RoutingRules(
            max_cost_per_task=rules_data.get("max_cost_per_task", 0.02),
            confidence_threshold=rules_data.get("confidence_threshold", 0.75),
            auto_escalate=rules_data.get("auto_escalate", True),
            max_retries=rules_data.get("max_retries", 2),
        )
        return cls(
            strategy=strategy,
            routes=routes,
            rules=rules,
        )

    @classmethod
    def load(cls, path: str | None = None) -> "RoutingConfig":
        """Load from path if it exists; otherwise return defaults."""
        if path and Path(path).exists():
            return cls.from_json(path)
        return cls()

    def to_json(self, path: str | Path) -> None:
        """Serialize this config to a JSON file."""
        Path(path).write_text(
            json.dumps(
                {
                    "strategy": self.strategy,
                    "routes": {
                        task: {
                            "primary": r.primary,
                            **({"fallback": r.fallback} if r.fallback else {}),
                        }
                        for task, r in self.routes.items()
                    },
                    "rules": {
                        "max_cost_per_task": self.rules.max_cost_per_task,
                        "confidence_threshold": self.rules.confidence_threshold,
                        "auto_escalate": self.rules.auto_escalate,
                        "max_retries": self.rules.max_retries,
                    },
                },
                indent=2,
            )
        )
