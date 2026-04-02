"""
Base classes and mixins shared across all completion provider implementations.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed


class CompletionMixin:
    """Mixin that provides a concurrent ``complete_many`` implementation.

    Any class that inherits this mixin must implement:
        complete(self, prompt: str, temperature: float, max_tokens: int) -> str
    """

    def complete_many(
        self,
        prompts: list[str],
        temperature: float = 0.4,
        max_tokens: int = 1500,
        concurrency: int = 8,
    ) -> list[str]:
        """Run ``complete`` over *prompts* concurrently and return results in order.

        Failed individual completions are silently replaced with an empty string
        so one bad prompt never aborts the entire batch.
        """
        if not prompts:
            return []
        results: list[str] = [""] * len(prompts)
        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as executor:
            futures = {
                executor.submit(self.complete, prompt, temperature, max_tokens): idx  # type: ignore[attr-defined]
                for idx, prompt in enumerate(prompts)
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    results[idx] = fut.result()
                except Exception:
                    results[idx] = ""
        return results
