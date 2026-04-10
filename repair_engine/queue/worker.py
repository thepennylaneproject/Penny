from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
import time

from ..models import Finding

if TYPE_CHECKING:
    from ..orchestrator import RepairOrchestrator


@dataclass
class WorkerStats:
    processed: int = 0
    failed: int = 0
    missing: int = 0


def _can_process_concurrently(engine: RepairOrchestrator) -> bool:
    return not engine.config.apply.auto_apply


def _record_result(stats: WorkerStats, result: dict[str, Any]) -> None:
    stats.processed += 1
    status = result.get("status", "")
    if status == "missing":
        stats.missing += 1
    elif status in ("failed", "dequeue_error"):
        stats.failed += 1


def _process_dashboard_payload(
    engine: RepairOrchestrator,
    payload: dict[str, Any],
) -> dict[str, Any]:
    finding_data = payload.get("finding")
    job = payload.get("job", {})
    finding_id = str(job.get("finding_id", ""))
    project_name = str(job.get("project_name", ""))

    if not finding_data or not finding_id:
        return {
            "finding_id": finding_id,
            "status": "missing",
            "error": "No finding data returned by dashboard dequeue",
        }

    if isinstance(finding_data, dict) and "project_name" not in finding_data:
        finding_data = {**finding_data, "project_name": project_name}

    try:
        finding = Finding.from_dict(finding_data)
        return engine.run_for_finding(finding)
    except Exception as exc:
        return {
            "finding_id": finding_id,
            "status": "failed",
            "error": str(exc),
        }


def _claim_dashboard_jobs(
    engine: RepairOrchestrator,
    limit: int,
) -> tuple[list[dict[str, Any]], str | None]:
    if not engine.dashboard_client:
        raise RuntimeError(
            "LYRA_DASHBOARD_URL is not configured; "
            "dashboard worker mode requires a reachable dashboard."
        )

    claimed: list[dict[str, Any]] = []
    for _ in range(limit):
        try:
            payload = engine.dashboard_client.dequeue_next_job()
        except Exception as exc:
            return claimed, str(exc)
        if not payload:
            break
        claimed.append(payload)
    return claimed, None


def run_dashboard_worker_loop(
    engine: RepairOrchestrator,
    poll_interval: float = 5.0,
    max_jobs: int = 100,
    batch_size: int = 5,
    concurrency: int = 1,
) -> dict[str, Any]:
    """
    Worker loop that drains the dashboard-backed repair queue.

    Claims dashboard jobs in bounded batches, sleeping between polls when the
    queue is empty. When auto-apply is disabled, claimed jobs can be processed
    concurrently to reduce queue age without risking overlapping repo writes.
    Stops after processing max_jobs total.

    Args:
        engine: Configured RepairOrchestrator with a dashboard_client set.
        poll_interval: Seconds to sleep when the queue is empty.
        max_jobs: Maximum total jobs to process before returning.
        batch_size: Maximum jobs to claim from the dashboard per poll.
        concurrency: Maximum concurrent finding repairs when auto-apply is disabled.

    Returns:
        Stats dict: {"processed": int, "failed": int, "missing": int}.
    """
    stats = WorkerStats()
    effective_batch_size = max(1, batch_size)
    requested_concurrency = max(1, concurrency)
    while stats.processed < max_jobs:
        remaining = max_jobs - stats.processed
        claimed, dequeue_error = _claim_dashboard_jobs(
            engine,
            min(effective_batch_size, remaining),
        )
        if not claimed and dequeue_error is None:
            time.sleep(poll_interval)
            continue

        effective_concurrency = 1
        if _can_process_concurrently(engine):
            effective_concurrency = min(requested_concurrency, len(claimed))

        results: list[dict[str, Any]] = []
        if effective_concurrency > 1:
            with ThreadPoolExecutor(max_workers=effective_concurrency) as executor:
                futures = [
                    executor.submit(_process_dashboard_payload, engine, payload)
                    for payload in claimed
                ]
                for future in as_completed(futures):
                    results.append(future.result())
        else:
            for payload in claimed:
                results.append(_process_dashboard_payload(engine, payload))

        for result in results:
            _record_result(stats, result)

        if dequeue_error is not None:
            _record_result(stats, {"status": "dequeue_error", "error": dequeue_error})
            break

    return {"processed": stats.processed, "failed": stats.failed, "missing": stats.missing}


def run_worker_loop(
    engine: RepairOrchestrator,
    poll_interval: float = 2.0,
    max_jobs: int = 100,
    batch_size: int = 5,
) -> dict[str, Any]:
    stats = WorkerStats()
    effective_batch_size = max(1, batch_size)
    while stats.processed < max_jobs:
        remaining = max_jobs - stats.processed
        results = engine.run_queue_worker(limit=min(effective_batch_size, remaining))
        if not results:
            time.sleep(poll_interval)
            continue
        for result in results:
            _record_result(stats, result)
    return {"processed": stats.processed, "failed": stats.failed, "missing": stats.missing}
