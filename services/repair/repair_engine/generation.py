from __future__ import annotations

from typing import Any
import json

from .localization import FaultSlice
from .models import Finding, PatchCandidate, PatchOperation


ROOT_SCHEMA_HINT = """{
  "finding_id": "f-xxxxxx",
  "patches": [
    {"file":"path","description":"change reason","search":"exact old","replace":"exact new"}
  ],
  "tests_to_add": [{"file":"path","description":"what","content":"test content"}],
  "notes":"optional"
}"""


def _is_narrow_high_confidence_finding(finding: Finding) -> bool:
    confidence = finding.confidence.strip().lower()
    affected_files = [str(path).strip() for path in finding.affected_files if str(path).strip()]
    hook_files = {
        str(hook.file).strip()
        for hook in finding.proof_hooks
        if hook.file and str(hook.file).strip()
    }
    narrow_scope = len(affected_files) <= 1 and len(hook_files) <= 1
    return narrow_scope and confidence in {"evidence", "confirmed", "high"}


def recommended_root_candidate_count(finding: Finding, requested: int) -> int:
    if requested <= 1:
        return max(1, requested)
    if _is_narrow_high_confidence_finding(finding):
        return min(requested, 2)
    if len(finding.affected_files) <= 2 and len(finding.proof_hooks) >= 2:
        return min(requested, 3)
    return requested


def recommended_refinements_per_parent(finding: Finding, requested: int) -> int:
    if requested <= 1:
        return max(1, requested)
    if _is_narrow_high_confidence_finding(finding):
        return 1
    return requested


def _extract_json(text: str) -> dict[str, Any] | None:
    if not text.strip():
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("\n")
        if parts and parts[0].startswith("```"):
            parts = parts[1:]
        if parts and parts[-1].strip() == "```":
            parts = parts[:-1]
        cleaned = "\n".join(parts).strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


def _to_candidate(payload: dict[str, Any], finding_id: str, source: str, parent: str | None = None) -> PatchCandidate | None:
    raw_patches = payload.get("patches", [])
    if not isinstance(raw_patches, list) or not raw_patches:
        return None
    operations: list[PatchOperation] = []
    for op in raw_patches:
        if not isinstance(op, dict):
            continue
        parsed = PatchOperation.from_dict(op)
        if not parsed.file or not parsed.search:
            continue
        operations.append(parsed)
    if not operations:
        return None
    tests = payload.get("tests_to_add", [])
    if not isinstance(tests, list):
        tests = []
    return PatchCandidate(
        finding_id=finding_id,
        operations=operations,
        tests_to_add=tests,
        notes=str(payload.get("notes", "")),
        source=source,
        parent_node_id=parent,
    )


def _complete_texts(
    router: Any,
    prompts: list[str],
    task_type: str,
    temperature: float,
    max_tokens: int,
    concurrency: int,
) -> list[str]:
    if hasattr(router, "texts"):
        return router.texts(
            prompts,
            task_type=task_type,
            temperature=temperature,
            max_tokens=max_tokens,
            expect_json=True,
            concurrency=concurrency,
        )
    return router.complete_many(
        prompts,
        temperature=temperature,
        max_tokens=max_tokens,
        concurrency=concurrency,
    )


def _build_root_prompt(finding: Finding, slice_: FaultSlice, variant_idx: int) -> str:
    return (
        "You are generating one candidate bug fix patch.\n"
        f"Variant #{variant_idx + 1}. Make this approach meaningfully distinct from other variants.\n\n"
        f"Finding ID: {finding.finding_id}\n"
        f"Type: {finding.type}\nCategory: {finding.category}\nPriority: {finding.priority}\nSeverity: {finding.severity}\n"
        f"Title: {finding.title}\nDescription: {finding.description}\nImpact: {finding.impact}\n\n"
        f"Likely files: {', '.join(slice_.files) if slice_.files else 'unknown'}\n"
        f"Proof hooks:\n- " + "\n- ".join(slice_.hook_summaries[:10]) + "\n\n"
        f"Stack signals:\n- " + ("\n- ".join(slice_.stack_signals[:8]) if slice_.stack_signals else "none") + "\n\n"
        "Constraints:\n"
        "- Minimal diff.\n"
        "- Do not touch expectations/ or .github/ files.\n"
        "- Keep each search unique and exact.\n"
        "- Prefer correctness over refactor.\n\n"
        f"Return JSON only using this schema:\n{ROOT_SCHEMA_HINT}\n"
    )


def _build_refine_prompt(finding: Finding, candidate: PatchCandidate, eval_feedback: str) -> str:
    serialized = json.dumps(candidate.to_dict(), indent=2)
    return (
        "Refine this patch candidate to improve correctness and test pass probability.\n"
        f"Finding: {finding.finding_id} - {finding.title}\n\n"
        "Current candidate:\n"
        f"{serialized}\n\n"
        f"Evaluation feedback:\n{eval_feedback}\n\n"
        "Rules:\n"
        "- Keep edits small.\n"
        "- Preserve intent but fix likely failure points.\n"
        "- Output JSON only using the same schema.\n"
        f"{ROOT_SCHEMA_HINT}\n"
    )


def generate_root_candidates(
    finding: Finding,
    slice_: FaultSlice,
    router: Any,
    count: int,
) -> list[PatchCandidate]:
    effective_count = recommended_root_candidate_count(finding, count)
    prompts = [_build_root_prompt(finding, slice_, idx) for idx in range(effective_count)]
    texts = _complete_texts(
        router,
        prompts,
        task_type="patch_generation",
        temperature=0.7,
        max_tokens=2000,
        concurrency=min(8, effective_count),
    )
    candidates: list[PatchCandidate] = []
    seen = set()
    for text in texts:
        payload = _extract_json(text)
        if not payload:
            continue
        candidate = _to_candidate(payload, finding.finding_id, source="root")
        if not candidate:
            continue
        fp = candidate.patch_fingerprint()
        if fp in seen:
            continue
        seen.add(fp)
        candidates.append(candidate)
    return candidates


def refine_candidates(
    finding: Finding,
    parent_nodes: list[tuple[PatchCandidate, str]],
    router: Any,
    refinements_per_parent: int = 2,
) -> list[PatchCandidate]:
    effective_refinements = recommended_refinements_per_parent(
        finding,
        refinements_per_parent,
    )
    prompts: list[str] = []
    owners: list[str] = []
    for candidate, feedback in parent_nodes:
        for _ in range(effective_refinements):
            prompts.append(_build_refine_prompt(finding, candidate, feedback))
            owners.append(candidate.parent_node_id or candidate.candidate_id)

    if not prompts:
        return []

    texts = _complete_texts(
        router,
        prompts,
        task_type="patch_generation",
        temperature=0.45,
        max_tokens=1800,
        concurrency=min(8, len(prompts) or 1),
    )
    refined: list[PatchCandidate] = []
    seen = set()
    for idx, text in enumerate(texts):
        payload = _extract_json(text)
        if not payload:
            continue
        candidate = _to_candidate(payload, finding.finding_id, source="refine", parent=owners[idx])
        if not candidate:
            continue
        fp = candidate.patch_fingerprint()
        if fp in seen:
            continue
        seen.add(fp)
        refined.append(candidate)
    return refined
