from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import hashlib
import json
import uuid


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def short_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


@dataclass
class ProofHook:
    hook_type: str
    summary: str
    file: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    symbol: str | None = None
    route: str | None = None
    command: str | None = None
    error_text: str | None = None
    expected: str | None = None
    actual: str | None = None
    artifact_path: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProofHook":
        return cls(
            hook_type=str(data.get("hook_type", data.get("type", "unknown"))),
            summary=str(data.get("summary", data.get("value", ""))),
            file=data.get("file"),
            start_line=data.get("start_line"),
            end_line=data.get("end_line"),
            symbol=data.get("symbol"),
            route=data.get("route"),
            command=data.get("command"),
            error_text=data.get("error_text"),
            expected=data.get("expected"),
            actual=data.get("actual"),
            artifact_path=data.get("artifact_path"),
            raw=data,
        )


@dataclass
class Finding:
    finding_id: str
    type: str
    category: str
    severity: str
    priority: str
    confidence: str
    title: str
    description: str
    impact: str
    status: str
    suggested_fix: dict[str, Any] = field(default_factory=dict)
    proof_hooks: list[ProofHook] = field(default_factory=list)
    history: list[dict[str, Any]] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Finding":
        hooks = [ProofHook.from_dict(h) for h in data.get("proof_hooks", [])]
        return cls(
            finding_id=str(data.get("finding_id", "")),
            type=str(data.get("type", "bug")),
            category=str(data.get("category", "unknown")),
            severity=str(data.get("severity", "minor")),
            priority=str(data.get("priority", "P2")),
            confidence=str(data.get("confidence", "inference")),
            title=str(data.get("title", "")),
            description=str(data.get("description", "")),
            impact=str(data.get("impact", "")),
            status=str(data.get("status", "open")),
            suggested_fix=data.get("suggested_fix", {}) if isinstance(data.get("suggested_fix"), dict) else {},
            proof_hooks=hooks,
            history=data.get("history", []) if isinstance(data.get("history"), list) else [],
            raw=data,
        )

    @property
    def affected_files(self) -> list[str]:
        files = self.suggested_fix.get("affected_files", [])
        return files if isinstance(files, list) else []

    @property
    def tests_needed(self) -> list[str]:
        tests = self.suggested_fix.get("tests_needed", [])
        return tests if isinstance(tests, list) else []

    def signature(self) -> str:
        payload = {
            "category": self.category,
            "title": self.title,
            "type": self.type,
            "severity": self.severity,
            "files": sorted(self.affected_files),
        }
        return short_hash(json.dumps(payload, sort_keys=True))


@dataclass
class PatchOperation:
    file: str
    description: str
    search: str
    replace: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PatchOperation":
        return cls(
            file=str(data.get("file", "")),
            description=str(data.get("description", "")),
            search=str(data.get("search", "")),
            replace=str(data.get("replace", "")),
        )

    def to_dict(self) -> dict[str, str]:
        return {
            "file": self.file,
            "description": self.description,
            "search": self.search,
            "replace": self.replace,
        }


@dataclass
class PatchCandidate:
    finding_id: str
    operations: list[PatchOperation]
    notes: str = ""
    tests_to_add: list[dict[str, Any]] = field(default_factory=list)
    source: str = "llm"
    parent_node_id: str | None = None
    candidate_id: str = field(default_factory=lambda: f"cand-{uuid.uuid4().hex[:10]}")

    def patch_fingerprint(self) -> str:
        parts = [f"{o.file}|{o.search}|{o.replace}" for o in self.operations]
        return short_hash("\n".join(parts))

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "finding_id": self.finding_id,
            "source": self.source,
            "parent_node_id": self.parent_node_id,
            "operations": [op.to_dict() for op in self.operations],
            "tests_to_add": self.tests_to_add,
            "notes": self.notes,
        }


@dataclass
class EvalResult:
    candidate_id: str
    apply_ok: bool
    compile_ok: bool
    lint_ok: bool
    tests_ok: bool
    warnings: int
    failed_step: str | None = None
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    duration_seconds: float = 0.0
    artifacts: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.apply_ok and self.compile_ok and self.lint_ok and self.tests_ok


@dataclass
class ScoreCard:
    candidate_id: str
    score: float
    passed: bool
    metrics: dict[str, float]
    reasons: list[str]


@dataclass
class EvalSummary:
    result: EvalResult
    score: ScoreCard


@dataclass
class PatchNode:
    node_id: str
    finding_id: str
    depth: int
    candidate: PatchCandidate
    parent_id: str | None
    eval_summary: EvalSummary | None = None
    pruned: bool = False
    children: list[str] = field(default_factory=list)

    @property
    def score(self) -> float:
        if not self.eval_summary:
            return 0.0
        return self.eval_summary.score.score


@dataclass
class RepairRun:
    run_id: str
    finding_id: str
    started_at: str = field(default_factory=utc_now)
    status: str = "queued"
    selected_node_id: str | None = None
    max_depth_reached: int = 0
    total_candidates: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

