from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from repair_engine.apply import apply_candidate_to_root, update_finding_after_apply
from repair_engine.config import ApplyConfig
from repair_engine.ingestion import IngestionFilters, filter_findings
from repair_engine.models import EvalResult, Finding, PatchCandidate, PatchOperation
from repair_engine.scoring import score_candidate


class RepairEngineSmokeTests(unittest.TestCase):
    def test_filter_findings_keeps_actionable_bug(self) -> None:
        findings = [
            Finding.from_dict(
                {
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
                    "proof_hooks": [],
                    "history": [],
                    "suggested_fix": {"affected_files": ["src/a.py"]},
                }
            ),
            Finding.from_dict(
                {
                    "finding_id": "f-2",
                    "type": "question",
                    "category": "ux",
                    "severity": "minor",
                    "priority": "P3",
                    "confidence": "inference",
                    "title": "Question",
                    "description": "Desc",
                    "impact": "Impact",
                    "status": "open",
                    "proof_hooks": [],
                    "history": [],
                }
            ),
        ]
        selected = filter_findings(findings, IngestionFilters())
        self.assertEqual([f.finding_id for f in selected], ["f-1"])

    def test_apply_candidate_and_update_finding(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src = root / "src"
            audits = root / "audits"
            src.mkdir(parents=True, exist_ok=True)
            audits.mkdir(parents=True, exist_ok=True)

            target = src / "module.py"
            target.write_text("value = old_call()\n")

            findings_file = audits / "open_findings.json"
            findings_file.write_text(
                json.dumps(
                    {
                        "schema_version": "1.1.0",
                        "open_findings": [
                            {
                                "finding_id": "f-abc",
                                "type": "bug",
                                "category": "runtime-error",
                                "severity": "major",
                                "priority": "P1",
                                "confidence": "evidence",
                                "title": "Bug",
                                "description": "Desc",
                                "impact": "Impact",
                                "status": "open",
                                "proof_hooks": [],
                                "history": [],
                                "suggested_fix": {"affected_files": ["src/module.py"]},
                            }
                        ],
                    }
                )
            )

            candidate = PatchCandidate(
                finding_id="f-abc",
                operations=[
                    PatchOperation(
                        file="src/module.py",
                        description="Use safe call",
                        search="old_call()",
                        replace="new_call()",
                    )
                ],
            )

            ok, touched, _msg = apply_candidate_to_root(
                candidate=candidate,
                repo_root=str(root),
                config=ApplyConfig(auto_apply=True, dry_run=False),
            )
            self.assertTrue(ok)
            self.assertIn("src/module.py", touched)
            self.assertIn("new_call()", target.read_text())

            updated = update_finding_after_apply(
                findings_file=str(findings_file),
                finding_id="f-abc",
                run_id="repair-test",
                selected_node_id="node-x",
                touched_files=touched,
                notes="auto-applied",
            )
            self.assertTrue(updated)
            data = json.loads(findings_file.read_text())
            self.assertEqual(data["open_findings"][0]["status"], "fixed_pending_verify")

    def test_score_candidate(self) -> None:
        candidate = PatchCandidate(
            finding_id="f-score",
            operations=[PatchOperation(file="x.py", description="d", search="a", replace="b")],
        )
        eval_result = EvalResult(
            candidate_id=candidate.candidate_id,
            apply_ok=True,
            compile_ok=True,
            lint_ok=True,
            tests_ok=True,
            warnings=0,
        )
        score = score_candidate(eval_result, candidate)
        self.assertTrue(score.passed)
        self.assertGreater(score.score, 0.7)


if __name__ == "__main__":
    unittest.main()

