from __future__ import annotations

import unittest

from repair_engine.generation import (
    recommended_refinements_per_parent,
    recommended_root_candidate_count,
)
from repair_engine.models import Finding


def make_finding(**overrides: object) -> Finding:
    payload = {
        "finding_id": "f-1",
        "type": "bug",
        "category": "runtime-error",
        "severity": "major",
        "priority": "P1",
        "confidence": "evidence",
        "title": "Bug",
        "description": "Desc",
        "impact": "Impact",
        "status": "open",
        "suggested_fix": {"affected_files": ["src/app.py"]},
        "proof_hooks": [
            {
                "hook_type": "stack",
                "summary": "trace",
                "file": "src/app.py",
                "start_line": 12,
            }
        ],
    }
    payload.update(overrides)
    return Finding.from_dict(payload)


class GenerationHeuristicsTests(unittest.TestCase):
    def test_reduces_root_branching_for_narrow_high_confidence_findings(self) -> None:
        finding = make_finding()
        self.assertEqual(recommended_root_candidate_count(finding, 5), 2)

    def test_keeps_requested_branching_for_broad_findings(self) -> None:
        finding = make_finding(
            confidence="inference",
            suggested_fix={"affected_files": ["src/a.py", "src/b.py", "src/c.py"]},
            proof_hooks=[
                {"hook_type": "stack", "summary": "trace", "file": "src/a.py"},
                {"hook_type": "stack", "summary": "trace", "file": "src/b.py"},
            ],
        )
        self.assertEqual(recommended_root_candidate_count(finding, 5), 5)

    def test_reduces_refinements_for_narrow_high_confidence_findings(self) -> None:
        finding = make_finding()
        self.assertEqual(recommended_refinements_per_parent(finding, 2), 1)


if __name__ == "__main__":
    unittest.main()
