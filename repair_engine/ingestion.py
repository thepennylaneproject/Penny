from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import json
import os

from .models import Finding


SEVERITY_ORDER = {"blocker": 0, "major": 1, "minor": 2, "nit": 3}
PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}


@dataclass
class IngestionFilters:
    statuses: tuple[str, ...] = ("open", "accepted")
    types: tuple[str, ...] = ("bug", "debt")
    max_findings: int | None = None
    min_priority: str | None = None
    min_severity: str | None = None


def load_findings(path: str) -> tuple[list[Finding], dict[str, Any]]:
    if not os.path.exists(path):
        return [], {"open_findings": []}
    with open(path) as f:
        data = json.load(f)
    raw = data.get("open_findings", data.get("findings", []))
    findings = [Finding.from_dict(item) for item in raw if isinstance(item, dict)]
    return findings, data


def filter_findings(findings: list[Finding], filt: IngestionFilters) -> list[Finding]:
    out: list[Finding] = []
    for finding in findings:
        if finding.status not in filt.statuses:
            continue
        if finding.type not in filt.types:
            continue
        if filt.min_priority:
            threshold = PRIORITY_ORDER.get(filt.min_priority, 9)
            if PRIORITY_ORDER.get(finding.priority, 9) > threshold:
                continue
        if filt.min_severity:
            threshold = SEVERITY_ORDER.get(filt.min_severity, 9)
            if SEVERITY_ORDER.get(finding.severity, 9) > threshold:
                continue
        out.append(finding)

    out.sort(
        key=lambda f: (
            PRIORITY_ORDER.get(f.priority, 9),
            SEVERITY_ORDER.get(f.severity, 9),
            f.finding_id,
        )
    )
    if filt.max_findings is not None:
        out = out[: filt.max_findings]
    return out

