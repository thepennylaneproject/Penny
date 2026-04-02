from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import Finding


@dataclass
class FaultSlice:
    finding_id: str
    score: float
    files: list[str]
    hook_summaries: list[str]
    stack_signals: list[str]
    context: dict[str, Any]


def localize_fault(finding: Finding) -> FaultSlice:
    files = list(dict.fromkeys([f for f in finding.affected_files if isinstance(f, str)]))
    hook_summaries: list[str] = []
    stack_signals: list[str] = []

    for hook in finding.proof_hooks:
        if hook.summary:
            hook_summaries.append(hook.summary)
        if hook.error_text:
            stack_signals.append(hook.error_text)
        if hook.command and "test" in hook.command.lower():
            stack_signals.append(hook.command)

        if hook.file and hook.file not in files:
            files.append(hook.file)

    score = 0.35
    if finding.severity in {"blocker", "major"}:
        score += 0.25
    if finding.confidence == "evidence":
        score += 0.20
    if files:
        score += min(0.2, len(files) * 0.05)
    score = min(1.0, score)

    context = {
        "category": finding.category,
        "priority": finding.priority,
        "severity": finding.severity,
        "confidence": finding.confidence,
        "impact": finding.impact,
    }
    return FaultSlice(
        finding_id=finding.finding_id,
        score=score,
        files=files,
        hook_summaries=hook_summaries[:12],
        stack_signals=stack_signals[:8],
        context=context,
    )

