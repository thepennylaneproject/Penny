from __future__ import annotations

import threading
import time
import unittest
from types import SimpleNamespace

from repair_engine.queue.worker import run_dashboard_worker_loop


def _payload(finding_id: str) -> dict[str, object]:
    return {
        "job": {
            "finding_id": finding_id,
            "project_name": "Codra",
        },
        "finding": {
            "finding_id": finding_id,
            "type": "bug",
            "category": "runtime-error",
            "severity": "major",
            "priority": "P1",
            "confidence": "evidence",
            "title": f"Finding {finding_id}",
            "description": "Desc",
            "impact": "Impact",
            "status": "open",
            "proof_hooks": [],
            "history": [],
            "suggested_fix": {"affected_files": ["src/app.py"]},
        },
    }


class FakeDashboardClient:
    def __init__(self, payloads: list[dict[str, object]] | None = None, error: str | None = None) -> None:
        self._payloads = list(payloads or [])
        self._error = error

    def dequeue_next_job(self) -> dict[str, object] | None:
        if self._error is not None:
            raise RuntimeError(self._error)
        if not self._payloads:
            return None
        return self._payloads.pop(0)


class FakeEngine:
    def __init__(self, auto_apply: bool, payloads: list[dict[str, object]] | None = None, error: str | None = None) -> None:
        self.dashboard_client = FakeDashboardClient(payloads=payloads, error=error)
        self.config = SimpleNamespace(
            apply=SimpleNamespace(auto_apply=auto_apply),
        )
        self._active = 0
        self.max_active = 0
        self._lock = threading.Lock()

    def run_for_finding(self, finding) -> dict[str, str]:
        with self._lock:
            self._active += 1
            self.max_active = max(self.max_active, self._active)
        time.sleep(0.02)
        with self._lock:
            self._active -= 1
        return {
            "finding_id": finding.finding_id,
            "status": "completed",
        }


class QueueWorkerTests(unittest.TestCase):
    def test_dashboard_worker_batches_claims(self) -> None:
        engine = FakeEngine(
            auto_apply=True,
            payloads=[_payload("f-1"), _payload("f-2"), _payload("f-3")],
        )

        stats = run_dashboard_worker_loop(
            engine,
            poll_interval=0.0,
            max_jobs=3,
            batch_size=3,
            concurrency=3,
        )

        self.assertEqual(stats, {"processed": 3, "failed": 0, "missing": 0})
        self.assertEqual(engine.max_active, 1)

    def test_dashboard_worker_allows_concurrency_only_without_auto_apply(self) -> None:
        engine = FakeEngine(
            auto_apply=False,
            payloads=[_payload("f-1"), _payload("f-2"), _payload("f-3")],
        )

        stats = run_dashboard_worker_loop(
            engine,
            poll_interval=0.0,
            max_jobs=3,
            batch_size=3,
            concurrency=3,
        )

        self.assertEqual(stats, {"processed": 3, "failed": 0, "missing": 0})
        self.assertGreaterEqual(engine.max_active, 2)

    def test_dashboard_worker_stops_on_dequeue_error(self) -> None:
        engine = FakeEngine(auto_apply=False, error="dashboard offline")

        stats = run_dashboard_worker_loop(
            engine,
            poll_interval=0.0,
            max_jobs=5,
            batch_size=2,
            concurrency=2,
        )

        self.assertEqual(stats, {"processed": 1, "failed": 1, "missing": 0})


if __name__ == "__main__":
    unittest.main()
