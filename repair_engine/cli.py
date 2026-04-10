#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys

from .config import EngineConfig
from .ingestion import IngestionFilters
from .orchestrator import RepairOrchestrator


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Lyra patch-tree repair engine")
    parser.add_argument("--repo-root", default=".", help="Repository root")
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("run", help="Run repair over selected findings")
    run.add_argument("--max-findings", type=int, default=None)
    run.add_argument("--min-priority", default=None)
    run.add_argument("--min-severity", default=None)
    run.add_argument("--types", default="bug,debt")

    enqueue = sub.add_parser("enqueue", help="Enqueue selected findings for workers")
    enqueue.add_argument("--max-findings", type=int, default=None)
    enqueue.add_argument("--types", default="bug,debt")

    worker = sub.add_parser("worker", help="Run queue worker")
    worker.add_argument("--limit", type=int, default=10)

    dash_worker = sub.add_parser(
        "dashboard-worker",
        help="Run worker that drains the dashboard-backed repair queue (requires LYRA_DASHBOARD_URL)",
    )
    dash_worker.add_argument("--limit", type=int, default=10)
    dash_worker.add_argument(
        "--poll-interval", type=float, default=5.0,
        help="Seconds to sleep between polls when the queue is empty",
    )
    dash_worker.add_argument(
        "--batch-size", type=int, default=5,
        help="Maximum dashboard jobs to claim per poll",
    )
    dash_worker.add_argument(
        "--concurrency", type=int, default=1,
        help="Maximum concurrent repairs when auto-apply is disabled",
    )

    sub.add_parser("status", help="Print queue and config summary")
    return parser


def _filters(args: argparse.Namespace) -> IngestionFilters:
    types = tuple(t.strip() for t in str(getattr(args, "types", "bug,debt")).split(",") if t.strip())
    return IngestionFilters(
        types=types or ("bug", "debt"),
        max_findings=getattr(args, "max_findings", None),
        min_priority=getattr(args, "min_priority", None),
        min_severity=getattr(args, "min_severity", None),
    )


def cmd_status(engine: RepairOrchestrator, config: EngineConfig) -> int:
    try:
        queue_size = engine.queue.size()
    except Exception as exc:
        queue_size = -1
        print(f"Queue status unavailable: {exc}")
    print("Lyra Repair Engine Status")
    print("=" * 40)
    print(f"Repo root: {engine.repo_root}")
    print(f"Findings file: {config.artifacts.findings_file}")
    print(f"Runs root: {config.artifacts.runs_root}")
    print(f"Queue size: {queue_size}")
    print(f"Routing config: {config.providers.routing_config_path}")
    print(f"Routing strategy: {config.providers.build_gateway().config.strategy}")
    print(f"Docker eval: {config.evaluation.use_docker} image={config.evaluation.docker_image}")
    print(f"Auto apply: {config.apply.auto_apply} dry_run={config.apply.dry_run}")
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1

    repo_root = os.path.abspath(args.repo_root)
    config = EngineConfig()
    engine = RepairOrchestrator(repo_root, config)

    if args.command == "status":
        return cmd_status(engine, config)

    if args.command == "run":
        outputs = engine.run_selected(_filters(args))
        print(json.dumps({"runs": outputs}, indent=2))
        return 0

    if args.command == "enqueue":
        from .ingestion import filter_findings, load_findings

        findings, _ = load_findings(os.path.join(repo_root, config.artifacts.findings_file))
        selected = filter_findings(findings, _filters(args))
        total = engine.enqueue_findings(selected)
        print(f"Enqueued {total} findings")
        return 0

    if args.command == "worker":
        outputs = engine.run_queue_worker(limit=args.limit)
        print(json.dumps({"worker_results": outputs}, indent=2))
        return 0

    if args.command == "dashboard-worker":
        from .queue.worker import run_dashboard_worker_loop

        stats = run_dashboard_worker_loop(
            engine,
            poll_interval=args.poll_interval,
            max_jobs=args.limit,
            batch_size=args.batch_size,
            concurrency=args.concurrency,
        )
        print(json.dumps(stats, indent=2))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
