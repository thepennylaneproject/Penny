from __future__ import annotations

import unittest

from repair_engine.integrations.dashboard_client import DashboardClient


class _FakeDashboardClient(DashboardClient):
    def __init__(self) -> None:
        super().__init__("http://example.test", "secret")
        self.calls: list[tuple[str, str, dict[str, object] | None]] = []

    def _make_request(
        self,
        method: str,
        path: str,
        data: dict[str, object] | None = None,
        timeout: int = 30,
    ) -> dict[str, object]:
        self.calls.append((method, path, data))
        return {"ok": True}


class DashboardClientTests(unittest.TestCase):
    def test_report_repair_complete_includes_repair_proof(self) -> None:
        client = _FakeDashboardClient()
        proof = {
            "source": "repair_engine",
            "generated_at": "2026-03-25T00:00:00Z",
            "selected_node_id": "node-1",
            "artifacts": {
                "summary_path": "audits/repair_runs/run-1/summary.json",
                "tree_path": "audits/repair_runs/run-1/tree.json",
            },
            "evaluation": {
                "candidate_passed": True,
                "apply_ok": True,
                "compile_ok": True,
                "lint_ok": True,
                "tests_ok": True,
            },
            "verification": {
                "status": "passed",
                "summary": "Evaluator checks passed.",
            },
        }

        client.report_repair_complete(
            finding_id="finding-1",
            project_name="Codra",
            run_id="run-1",
            status="applied",
            patch_applied=True,
            applied_files=["src/app.ts"],
            repair_proof=proof,
            message="applied cleanly",
        )

        self.assertEqual(len(client.calls), 1)
        method, path, payload = client.calls[0]
        self.assertEqual(method, "POST")
        self.assertEqual(path, "/api/engine/complete")
        assert payload is not None
        self.assertEqual(payload["repair_proof"], proof)


if __name__ == "__main__":
    unittest.main()
