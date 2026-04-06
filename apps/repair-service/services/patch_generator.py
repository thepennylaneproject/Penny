"""Patch generation for repairs — powered by the GitHub Copilot API.

Falls back to Anthropic if GITHUB_TOKEN lacks models:read or is absent and
ANTHROPIC_API_KEY is available (legacy support).
"""

import json
import os
from dataclasses import dataclass, field
from typing import Optional


# ─── Model selection ──────────────────────────────────────────────────────────

_COPILOT_MODELS = {
    "cheap":    "gpt-4o-mini",
    "standard": "claude-3-5-haiku-20241022",
    "advanced": "gpt-4.1",
    "premium":  "claude-3-5-sonnet-20241022",
}

_HIGH_RISK_CATEGORIES = {
    "auth", "authentication", "authorization", "security", "billing",
    "payment", "privacy", "migration", "queue", "data",
}
_HIGH_RISK_SEVERITIES = {"blocker", "critical"}
_STANDARD_SEVERITIES  = {"major", "high"}
_CHEAP_SEVERITIES     = {"nit", "low"}
_CHEAP_CATEGORIES     = {"style", "docs", "documentation", "format", "lint", "whitespace"}


def select_copilot_model(severity: str = "", category: str = "") -> str:
    """Pick the cheapest Copilot model appropriate for this finding."""
    override = (os.getenv("REPAIR_MODEL_OVERRIDE") or "").strip()
    if override:
        return override

    sev = severity.lower().strip()
    cat = category.lower().strip()

    if sev in _HIGH_RISK_SEVERITIES or cat in _HIGH_RISK_CATEGORIES:
        return _COPILOT_MODELS["premium"]
    if sev in _STANDARD_SEVERITIES:
        return _COPILOT_MODELS["advanced"]
    if sev in _CHEAP_SEVERITIES or cat in _CHEAP_CATEGORIES:
        return _COPILOT_MODELS["cheap"]
    return _COPILOT_MODELS["standard"]


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class PatchRequest:
    file_path: str
    code_context: str
    finding_title: str
    finding_description: str
    language: str
    severity: str = ""
    category: str = ""
    is_root_generation: bool = True


@dataclass
class PatchCandidate:
    patch_diff: str
    reasoning: str
    confidence: float
    model: str = ""


# ─── Generator ────────────────────────────────────────────────────────────────

class PatchGenerator:
    """Generates patch candidates via GitHub Copilot API (OpenAI-compatible).

    Falls back to Anthropic when GITHUB_TOKEN is absent or lacks models:read.
    """

    MODELS_BASE_URL = "https://models.inference.ai.azure.com"

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None):
        self._model_override = model
        self._api_key_override = api_key
        self._backend = self._detect_backend()

    def _detect_backend(self) -> str:
        if (self._api_key_override or os.getenv("GITHUB_TOKEN", "")):
            return "copilot"
        if os.getenv("ANTHROPIC_API_KEY", ""):
            return "anthropic"
        raise RuntimeError(
            "PatchGenerator: ensure GITHUB_TOKEN has models:read permission (preferred) or set ANTHROPIC_API_KEY"
        )

    def _resolve_model(self, request: PatchRequest) -> str:
        if self._model_override:
            return self._model_override
        if self._backend == "anthropic":
            return os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-latest")
        return select_copilot_model(request.severity, request.category)

    async def _call_copilot(self, model: str, prompt: str) -> tuple[str, dict]:
        from openai import OpenAI
        token = self._api_key_override or os.getenv("GITHUB_TOKEN", "")
        client = OpenAI(api_key=token, base_url=self.MODELS_BASE_URL)
        response = client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content or ""
        usage = {
            "input_tokens":  response.usage.prompt_tokens if response.usage else 0,
            "output_tokens": response.usage.completion_tokens if response.usage else 0,
        }
        return text, usage

    async def _call_anthropic(self, model: str, prompt: str) -> tuple[str, dict]:
        from anthropic import Anthropic
        key = self._api_key_override or os.getenv("ANTHROPIC_API_KEY", "")
        client = Anthropic(api_key=key)
        message = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text if message.content else ""
        return text, {
            "input_tokens":  message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        }

    async def _call_llm(self, model: str, prompt: str) -> tuple[str, dict]:
        if self._backend == "copilot":
            return await self._call_copilot(model, prompt)
        return await self._call_anthropic(model, prompt)

    async def generate_root_patch(self, request: PatchRequest) -> tuple[PatchCandidate, dict]:
        model = self._resolve_model(request)
        response_text, usage = await self._call_llm(model, self._build_root_generation_prompt(request))
        patch_diff, reasoning, confidence = self._extract(response_text, 70.0, 60.0)
        usage["model"] = model
        return PatchCandidate(patch_diff=patch_diff, reasoning=reasoning, confidence=confidence, model=model), usage

    async def refine_patch(self, request: PatchRequest, parent_patch: str, feedback: str) -> tuple[PatchCandidate, dict]:
        model = self._resolve_model(request)
        response_text, usage = await self._call_llm(model, self._build_refinement_prompt(request, parent_patch, feedback))
        patch_diff, reasoning, confidence = self._extract(response_text, 65.0, 55.0)
        usage["model"] = model
        return PatchCandidate(patch_diff=patch_diff, reasoning=reasoning, confidence=confidence, model=model), usage

    def _extract(self, text: str, default_conf: float, fallback_conf: float) -> tuple[str, str, float]:
        try:
            parsed = self._parse_response(text)
            return (
                parsed.get("patch_diff", ""),
                parsed.get("reasoning", text),
                float(parsed.get("confidence", default_conf)),
            )
        except Exception:
            return text, "Generated patch", fallback_conf

    def _build_root_generation_prompt(self, request: PatchRequest) -> str:
        return f"""You are an expert code repair system. Your task is to generate a patch to fix a finding in code.

FINDING:
Title: {request.finding_title}
Description: {request.finding_description}

FILE: {request.file_path}
LANGUAGE: {request.language}

CURRENT CODE:
```{request.language}
{request.code_context}
```

Please generate a patch (in unified diff format) that fixes this finding.

Return your response as JSON with this structure:
{{
  "patch_diff": "the unified diff patch here",
  "reasoning": "explanation of the fix",
  "confidence": 75.0
}}

The patch_diff should be a valid unified diff that can be applied to the file."""

    def _build_refinement_prompt(self, request: PatchRequest, parent_patch: str, feedback: str) -> str:
        return f"""You are an expert code repair system. Your previous patch attempt failed. Please refine it.

FINDING:
Title: {request.finding_title}
Description: {request.finding_description}

FILE: {request.file_path}
LANGUAGE: {request.language}

CURRENT CODE:
```{request.language}
{request.code_context}
```

PREVIOUS PATCH (that failed):
```diff
{parent_patch}
```

FAILURE FEEDBACK:
{feedback}

Please generate a refined patch that addresses the feedback. Return your response as JSON:
{{
  "patch_diff": "the refined unified diff patch",
  "reasoning": "explanation of the refinement",
  "confidence": 70.0
}}"""

    def _parse_response(self, response_text: str) -> dict:
        try:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(response_text[start:end])
        except json.JSONDecodeError:
            pass
        return {}

    async def validate_patch_syntax(self, patch_diff: str, language: str) -> bool:
        if not patch_diff or not patch_diff.strip():
            return False
        has_diff_markers = "---" in patch_diff or "+++" in patch_diff or "@@" in patch_diff
        return has_diff_markers or len(patch_diff.strip()) > 10
