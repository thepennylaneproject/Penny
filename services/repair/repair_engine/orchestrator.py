from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any
import json
import os
import uuid

from .apply import apply_candidate_to_root, update_finding_after_apply
from .config import EngineConfig
from .evaluator.docker_runner import DockerEvaluator
from .generation import (
    generate_root_candidates,
    recommended_refinements_per_parent,
    refine_candidates,
)
from .ingestion import IngestionFilters, filter_findings, load_findings
from .integrations.dashboard_client import DashboardClient
from .localization import localize_fault
from .memory.qdrant_store import QdrantMemoryStore
from .models import EvalSummary, Finding, PatchCandidate, RepairRun
from .queue.redis_queue import RedisQueue
from .scoring import score_candidate
from .tree_search import PatchTree, score_node, should_prune


class RepairOrchestrator:
    def __init__(self, repo_root: str, config: EngineConfig) -> None:
        self.repo_root = repo_root
        self.config = config
        self.router = config.providers.build_gateway()
        self.evaluator = DockerEvaluator(config.evaluation, config.apply)
        self.queue = RedisQueue(config.integrations.redis_url)
        self.memory = QdrantMemoryStore(
            config.integrations.qdrant_url,
            config.integrations.qdrant_collection,
        )
        # Initialize dashboard client if configured
        self.dashboard_client: DashboardClient | None = None
        dashboard_url = os.getenv("penny_DASHBOARD_URL", "")
        dashboard_key = os.getenv("penny_DASHBOARD_API_KEY", "")
        if dashboard_url:
            self.dashboard_client = DashboardClient(dashboard_url, dashboard_key)

    def _run_dir(self, run_id: str) -> Path:
        run_dir = Path(self.repo_root) / self.config.artifacts.runs_root / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        return run_dir

    def _feedback(self, node_reasons: list[str], stderr: str) -> str:
        reasons = "; ".join(node_reasons[:5]) if node_reasons else "no score reasons"
        if stderr.strip():
            reasons += f"\nEvaluator stderr:\n{stderr[:800]}"
        return reasons

    def _seed_from_memory(self, finding: Finding) -> list[PatchCandidate]:
        seeded: list[PatchCandidate] = []
        try:
            self.memory.ensure_collection()
            hits = self.memory.lookup_similar(finding, limit=3)
        except Exception:
            return seeded
        for hit in hits:
            payload = hit.payload.get("candidate", {})
            if not isinstance(payload, dict):
                continue
            ops = payload.get("operations", [])
            if not isinstance(ops, list):
                continue
            from .models import PatchOperation  # local import to keep module boundary simple

            operations = [PatchOperation.from_dict(item) for item in ops if isinstance(item, dict)]
            if not operations:
                continue
            seeded.append(
                PatchCandidate(
                    finding_id=finding.finding_id,
                    operations=operations,
                    notes=f"seeded from memory hit score={hit.score:.3f}",
                    tests_to_add=payload.get("tests_to_add", []),
                    source="memory",
                )
            )
        return seeded

    def _report_to_dashboard(
        self,
        finding: Finding,
        run_id: str,
        status: str,
        touched_files: list[str],
        apply_msg: str,
        patch_applied: bool,
        repair_proof: dict[str, Any] | None,
        routing_usage: dict[str, Any] | None,
    ) -> None:
        """Report repair completion to dashboard if configured."""
        if not self.dashboard_client:
            return

        try:
            # Determine if patch was applied based on status and touched files
            applied = patch_applied and status == "applied" and len(touched_files) > 0

            self.dashboard_client.report_repair_complete(
                finding_id=finding.finding_id,
                project_name=finding.raw.get("project_name", "unknown"),
                run_id=run_id,
                status=status if status in ("completed", "failed", "applied") else "completed",
                patch_applied=applied,
                applied_files=touched_files,
                repair_proof=repair_proof,
                provider_used=(
                    str(routing_usage.get("primary_provider"))
                    if routing_usage and routing_usage.get("primary_provider")
                    else None
                ),
                model_used=(
                    str(routing_usage.get("primary_model"))
                    if routing_usage and routing_usage.get("primary_model")
                    else None
                ),
                routing_lane=(
                    str(routing_usage.get("routing_lane"))
                    if routing_usage and routing_usage.get("routing_lane")
                    else None
                ),
                routing_strategy=(
                    str(routing_usage.get("strategy"))
                    if routing_usage and routing_usage.get("strategy")
                    else None
                ),
                routing_usage=routing_usage,
                error=apply_msg if not applied else None,
                message=apply_msg,
            )
        except Exception as e:
            # Log error but don't fail the repair run
            print(f"Failed to report repair to dashboard: {e}")

    def _build_repair_proof(
        self,
        run: RepairRun,
        selected: Any,
        touched_files: list[str],
        verification_commands: list[str],
        run_dir: Path,
        routing_usage: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if selected is None or selected.eval_summary is None or not touched_files:
            return None

        eval_result = selected.eval_summary.result
        score = selected.eval_summary.score
        return {
            "source": "repair_engine",
            "generated_at": run.started_at,
            "selected_node_id": selected.node_id,
            "artifacts": {
                "summary_path": str(
                    Path(self.config.artifacts.runs_root) / run.run_id / "summary.json"
                ),
                "tree_path": str(
                    Path(self.config.artifacts.runs_root) / run.run_id / "tree.json"
                ),
            },
            "evaluation": {
                "candidate_passed": bool(score.passed),
                "apply_ok": bool(eval_result.apply_ok),
                "compile_ok": bool(eval_result.compile_ok),
                "lint_ok": bool(eval_result.lint_ok),
                "tests_ok": bool(eval_result.tests_ok),
                "warnings": int(eval_result.warnings),
                "exit_code": int(eval_result.exit_code),
                "reasons": list(score.reasons),
            },
            "verification": {
                "status": "passed" if score.passed else "failed",
                "summary": (
                    "Evaluator checks passed; review artifacts before final verification."
                    if score.passed
                    else "Evaluator checks did not fully pass; manual review is required."
                ),
                "commands_declared": verification_commands,
            },
            "routing": routing_usage,
        }

    def run_for_finding(self, finding: Finding) -> dict[str, Any]:
        if hasattr(self.router, "reset_usage"):
            self.router.reset_usage()
        run_id = f"repair-{finding.finding_id}-{uuid.uuid4().hex[:8]}"
        run = RepairRun(run_id=run_id, finding_id=finding.finding_id, status="generating")
        run_dir = self._run_dir(run_id)

        fault_slice = localize_fault(finding)
        tree = PatchTree(finding_id=finding.finding_id)
        seen_fingerprints: set[str] = set()
        eval_count = 0

        roots = self._seed_from_memory(finding)
        needed = max(0, self.config.search.root_branching_factor - len(roots))
        if needed > 0:
            roots.extend(generate_root_candidates(finding, fault_slice, self.router, needed))

        for candidate in roots:
            node = tree.add_root(candidate)
            eval_result = self.evaluator.evaluate(candidate, self.repo_root, str(run_dir))
            score = score_candidate(eval_result, candidate)
            score_node(node, EvalSummary(result=eval_result, score=score))
            eval_count += 1
            should_prune(node, self.config.search, seen_fingerprints)

        strong_pass_threshold = float(os.getenv("penny_STRONG_PASS_SCORE", "0.93"))
        depth = 0
        while depth < self.config.search.max_depth and eval_count < self.config.search.max_evals_per_finding:
            strong_passing = next(
                (
                    node for node in tree.nodes.values()
                    if node.eval_summary
                    and node.eval_summary.result.passed
                    and node.eval_summary.score.score >= strong_pass_threshold
                ),
                None,
            )
            if strong_passing is not None:
                break
            parents = [node for node in tree.best_nodes(self.config.search.beam_width)
                       if not node.pruned and node.depth == depth]
            if not parents:
                break

            refine_inputs: list[tuple[PatchCandidate, str]] = []
            for parent in parents:
                if not parent.eval_summary:
                    continue
                feedback = self._feedback(parent.eval_summary.score.reasons, parent.eval_summary.result.stderr)
                child_seed = parent.candidate
                child_seed.parent_node_id = parent.node_id
                refine_inputs.append((child_seed, feedback))
            refined = refine_candidates(
                finding,
                refine_inputs,
                self.router,
                refinements_per_parent=recommended_refinements_per_parent(finding, 2),
            )

            for candidate in refined:
                parent_id = candidate.parent_node_id
                if not parent_id or parent_id not in tree.nodes:
                    continue
                node = tree.add_child(parent_id, candidate)
                eval_result = self.evaluator.evaluate(candidate, self.repo_root, str(run_dir))
                score = score_candidate(eval_result, candidate)
                score_node(node, EvalSummary(result=eval_result, score=score))
                eval_count += 1
                should_prune(node, self.config.search, seen_fingerprints)
                if eval_count >= self.config.search.max_evals_per_finding:
                    break
            depth += 1

        run.max_depth_reached = max((n.depth for n in tree.nodes.values()), default=0)
        run.total_candidates = len(tree.nodes)
        run.status = "selected"

        ranked = sorted(
            [n for n in tree.nodes.values() if n.eval_summary is not None],
            key=lambda n: n.score,
            reverse=True,
        )
        best_passing = next((n for n in ranked if n.eval_summary and n.eval_summary.result.passed), None)
        selected = best_passing or (ranked[0] if ranked else None)

        touched_files: list[str] = []
        apply_msg = "no candidate selected"
        repair_proof: dict[str, Any] | None = None
        if selected:
            run.selected_node_id = selected.node_id
            candidate_passed = bool(selected.eval_summary and selected.eval_summary.result.passed)
            if self.config.apply.auto_apply:
                if not candidate_passed:
                    # Do not auto-apply a non-passing candidate (ARCH-016)
                    run.status = "selected"
                    apply_msg = "no passing candidate; skipped auto-apply"
                else:
                    run.status = "applied"
                    ok, touched_files, apply_msg = apply_candidate_to_root(selected.candidate, self.repo_root, self.config.apply)
                    if ok:
                        update_finding_after_apply(
                            findings_file=os.path.join(self.repo_root, self.config.artifacts.findings_file),
                            finding_id=finding.finding_id,
                            run_id=run_id,
                            selected_node_id=selected.node_id,
                            touched_files=touched_files,
                            notes=selected.candidate.notes,
                        )
                        try:
                            self.memory.ensure_collection()
                            self.memory.remember_success(finding, selected.candidate, selected.score)
                        except Exception:
                            pass
                        verification_commands = []
                        raw_policy = finding.raw.get("repair_policy", {})
                        if isinstance(raw_policy, dict):
                            commands = raw_policy.get("verification_commands", [])
                            if isinstance(commands, list):
                                verification_commands = [
                                    str(command).strip()
                                    for command in commands
                                    if str(command).strip()
                                ]
                        if not verification_commands:
                            suggested_fix = finding.raw.get("suggested_fix", {})
                            if isinstance(suggested_fix, dict):
                                commands = suggested_fix.get("verification_commands", [])
                                if isinstance(commands, list):
                                    verification_commands = [
                                        str(command).strip()
                                        for command in commands
                                        if str(command).strip()
                                    ]
                        repair_proof = self._build_repair_proof(
                            run,
                            selected,
                            touched_files,
                            verification_commands,
                            run_dir,
                            getattr(self.router, "usage_summary", lambda *_args, **_kwargs: None)(
                                task_type="patch_generation"
                            ),
                        )
                    else:
                        run.status = "failed"
            else:
                run.status = "selected"

        routing_usage = getattr(self.router, "usage_summary", lambda *_args, **_kwargs: None)(
            task_type="patch_generation"
        )
        if routing_usage:
            run.metadata["routing_usage"] = routing_usage
        self._persist_run(run_dir, run, finding, fault_slice, tree, touched_files, apply_msg)

        # Report completion to dashboard if configured
        patch_applied = run.status == "applied" and len(touched_files) > 0
        self._report_to_dashboard(
            finding, run_id, run.status, touched_files, apply_msg, patch_applied, repair_proof, routing_usage
        )

        return {
            "run_id": run_id,
            "finding_id": finding.finding_id,
            "status": run.status,
            "selected_node_id": run.selected_node_id,
            "applied_files": touched_files,
            "message": apply_msg,
            "routing_usage": routing_usage,
            "usage_records": getattr(self.router, "usage_records", lambda *_args, **_kwargs: [])(
                task_type="patch_generation"
            ),
        }

    def _persist_run(
        self,
        run_dir: Path,
        run: RepairRun,
        finding: Finding,
        fault_slice: Any,
        tree: PatchTree,
        touched_files: list[str],
        apply_msg: str,
    ) -> None:
        tree_payload = {
            "run": asdict(run),
            "finding_id": finding.finding_id,
            "fault_slice": {
                "score": fault_slice.score,
                "files": fault_slice.files,
                "hook_summaries": fault_slice.hook_summaries,
                "stack_signals": fault_slice.stack_signals,
                "context": fault_slice.context,
            },
            "nodes": {},
        }
        for node_id, node in tree.nodes.items():
            tree_payload["nodes"][node_id] = {
                "node_id": node.node_id,
                "parent_id": node.parent_id,
                "children": node.children,
                "depth": node.depth,
                "pruned": node.pruned,
                "score": node.score,
                "candidate": node.candidate.to_dict(),
                "eval": {
                    "passed": node.eval_summary.result.passed if node.eval_summary else False,
                    "apply_ok": node.eval_summary.result.apply_ok if node.eval_summary else False,
                    "compile_ok": node.eval_summary.result.compile_ok if node.eval_summary else False,
                    "lint_ok": node.eval_summary.result.lint_ok if node.eval_summary else False,
                    "tests_ok": node.eval_summary.result.tests_ok if node.eval_summary else False,
                    "warnings": node.eval_summary.result.warnings if node.eval_summary else 0,
                    "exit_code": node.eval_summary.result.exit_code if node.eval_summary else -1,
                    "reasons": node.eval_summary.score.reasons if node.eval_summary else [],
                    "metrics": node.eval_summary.score.metrics if node.eval_summary else {},
                },
            }

        summary = {
            "run_id": run.run_id,
            "finding_id": finding.finding_id,
            "status": run.status,
            "selected_node_id": run.selected_node_id,
            "applied_files": touched_files,
            "message": apply_msg,
            "nodes": len(tree.nodes),
            "max_depth": run.max_depth_reached,
        }
        (run_dir / "tree.json").write_text(json.dumps(tree_payload, indent=2) + "\n")
        (run_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")

    def enqueue_findings(self, findings: list[Finding]) -> int:
        total = 0
        for finding in findings:
            payload = {"finding_id": finding.finding_id}
            self.queue.enqueue(payload)
            total += 1
        return total

    def run_queue_worker(self, limit: int = 10) -> list[dict[str, Any]]:
        findings, _data = load_findings(os.path.join(self.repo_root, self.config.artifacts.findings_file))
        by_id = {f.finding_id: f for f in findings}
        results: list[dict[str, Any]] = []
        for _ in range(limit):
            job = self.queue.dequeue(timeout_seconds=1)
            if not job:
                break
            fid = str(job.get("finding_id", ""))
            finding = by_id.get(fid)
            if not finding:
                results.append({"finding_id": fid, "status": "missing"})
                continue
            results.append(self.run_for_finding(finding))
        return results

    def run_dashboard_worker(self, limit: int = 10) -> list[dict[str, Any]]:
        """
        Process repair jobs queued in the dashboard (Postgres-backed queue).

        Requires penny_DASHBOARD_URL to be configured. Calls
        POST /api/engine/dequeue repeatedly to claim and process jobs one at a
        time. Each job's completion is automatically reported back to the
        dashboard via _report_to_dashboard (POST /api/engine/complete).

        Args:
            limit: Maximum number of jobs to process in this run.

        Returns:
            List of result dicts, one per processed job.
        """
        if not self.dashboard_client:
            raise RuntimeError(
                "penny_DASHBOARD_URL is not configured; "
                "dashboard worker mode requires a reachable dashboard."
            )

        results: list[dict[str, Any]] = []
        for _ in range(limit):
            try:
                payload = self.dashboard_client.dequeue_next_job()
            except Exception as exc:
                results.append({"status": "dequeue_error", "error": str(exc)})
                break

            if not payload:
                break  # Queue is empty

            finding_data = payload.get("finding")
            job = payload.get("job", {})
            finding_id = str(job.get("finding_id", ""))
            project_name = str(job.get("project_name", ""))

            if not finding_data or not finding_id:
                results.append({
                    "finding_id": finding_id,
                    "status": "missing",
                    "error": "No finding data returned by dashboard dequeue",
                })
                continue

            # Inject project_name into raw finding dict so the engine can use it
            if isinstance(finding_data, dict) and "project_name" not in finding_data:
                finding_data = {**finding_data, "project_name": project_name}

            finding = Finding.from_dict(finding_data)
            results.append(self.run_for_finding(finding))

        return results

    def run_selected(self, filters: IngestionFilters) -> list[dict[str, Any]]:
        findings, _data = load_findings(os.path.join(self.repo_root, self.config.artifacts.findings_file))
        selected = filter_findings(findings, filters)
        outputs: list[dict[str, Any]] = []
        for finding in selected:
            outputs.append(self.run_for_finding(finding))
        return outputs
