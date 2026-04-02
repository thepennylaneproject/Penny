"""Patch generation for repairs."""

import json
from dataclasses import dataclass
from typing import Optional

from anthropic import Anthropic


@dataclass
class PatchRequest:
    """Request for patch generation."""

    file_path: str
    code_context: str
    finding_title: str
    finding_description: str
    language: str
    is_root_generation: bool = True


@dataclass
class PatchCandidate:
    """A generated patch candidate."""

    patch_diff: str
    reasoning: str
    confidence: float  # 0-100 based on generation confidence


class PatchGenerator:
    """Generates patch candidates using Claude."""

    def __init__(self, model: str = "claude-3-5-sonnet-latest", api_key: Optional[str] = None):
        """Initialize patch generator.

        Args:
            model: Claude model to use
            api_key: Anthropic API key (uses env var if not provided)
        """
        self.model = model
        self.client = Anthropic(api_key=api_key)

    async def generate_root_patch(
        self,
        request: PatchRequest,
    ) -> tuple[PatchCandidate, dict]:
        """
        Generate initial patch candidate.

        Args:
            request: Patch request details

        Returns:
            (PatchCandidate, usage_dict) tuple with usage info for cost tracking
        """
        prompt = self._build_root_generation_prompt(request)

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        # Extract patch from response
        response_text = message.content[0].text if message.content else ""

        try:
            # Try to parse as JSON with patch_diff and reasoning
            parsed = self._parse_response(response_text)
            patch_diff = parsed.get("patch_diff", "")
            reasoning = parsed.get("reasoning", response_text)
            confidence = parsed.get("confidence", 70.0)
        except Exception:
            # Fallback: treat entire response as patch diff
            patch_diff = response_text
            reasoning = "Generated patch"
            confidence = 60.0

        usage = {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        }

        return (
            PatchCandidate(patch_diff=patch_diff, reasoning=reasoning, confidence=confidence),
            usage,
        )

    async def refine_patch(
        self,
        request: PatchRequest,
        parent_patch: str,
        feedback: str,
    ) -> tuple[PatchCandidate, dict]:
        """
        Refine existing patch based on feedback.

        Args:
            request: Original patch request
            parent_patch: The parent patch to refine
            feedback: Feedback on why the parent patch didn't work

        Returns:
            (PatchCandidate, usage_dict) tuple with usage info for cost tracking
        """
        prompt = self._build_refinement_prompt(request, parent_patch, feedback)

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        response_text = message.content[0].text if message.content else ""

        try:
            parsed = self._parse_response(response_text)
            patch_diff = parsed.get("patch_diff", "")
            reasoning = parsed.get("reasoning", response_text)
            confidence = parsed.get("confidence", 65.0)
        except Exception:
            patch_diff = response_text
            reasoning = "Refined patch"
            confidence = 55.0

        usage = {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        }

        return (
            PatchCandidate(patch_diff=patch_diff, reasoning=reasoning, confidence=confidence),
            usage,
        )

    def _build_root_generation_prompt(self, request: PatchRequest) -> str:
        """Build prompt for root patch generation."""
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

    def _build_refinement_prompt(
        self,
        request: PatchRequest,
        parent_patch: str,
        feedback: str,
    ) -> str:
        """Build prompt for patch refinement."""
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
        """Parse LLM response to extract patch and reasoning.

        Args:
            response_text: Raw response from Claude

        Returns:
            Dictionary with patch_diff, reasoning, confidence
        """
        # Try to extract JSON
        try:
            # Look for JSON block in response
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = response_text[start:end]
                return json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # If no JSON found, return empty dict (caller will use defaults)
        return {}

    async def validate_patch_syntax(
        self,
        patch_diff: str,
        language: str,
    ) -> bool:
        """
        Validate patch syntax without evaluation.

        Basic check that patch looks like unified diff.

        Args:
            patch_diff: The patch diff
            language: Programming language

        Returns:
            True if patch appears valid, False otherwise
        """
        if not patch_diff or not patch_diff.strip():
            return False

        # Check for unified diff markers (---, +++, @@)
        has_diff_markers = "---" in patch_diff or "+++" in patch_diff or "@@" in patch_diff

        # Accept if it has markers or if it's just code (assume it's a replacement)
        return has_diff_markers or len(patch_diff.strip()) > 10
