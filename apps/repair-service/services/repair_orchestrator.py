"""Main orchestrator for repair job lifecycle."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from config import get_settings
from db.supabase_client import get_supabase_client

from .beam_search import BeamSearchConfig, BeamSearchOrchestrator
from .confidence_scorer import ConfidenceScorer, LocalityScore, RiskScore, ValidationScore
from .cost_tracker import CostTracker
from .evaluator import PatchEvaluator


class RepairOrchestrator:
    """Orchestrates the complete repair job lifecycle."""

    def __init__(self, job_id: UUID):
        """Initialize orchestrator for a repair job.

        Args:
            job_id: The repair job ID
        """
        self.job_id = job_id
        self.settings = get_settings()
        self.supabase = get_supabase_client()
        self.cost_tracker = CostTracker()
        self.confidence_scorer = ConfidenceScorer()
        self.evaluator = PatchEvaluator()
        self.beam_search: Optional[BeamSearchOrchestrator] = None

    async def run(self, repo_path: str, code_context: str) -> dict:
        """
        Execute the repair job from start to finish.

        Args:
            repo_path: Path to repository for evaluation
            code_context: Code context for the finding

        Returns:
            Job completion result
        """
        # Fetch job details
        job = await self.supabase.get_repair_job(self.job_id)
        if not job:
            return {"status": "error", "message": f"Job {self.job_id} not found"}

        # Update job status to in_progress
        await self.supabase.update_repair_job(
            self.job_id,
            {
                "status": "in_progress",
                "started_at": datetime.utcnow().isoformat(),
            },
        )

        try:
            # Initialize components
            from .patch_generator import PatchGenerator, PatchRequest

            beam_config = BeamSearchConfig(
                beam_width=job.get("beam_width", 4),
                max_depth=job.get("max_depth", 4),
                timeout_seconds=job.get("timeout_seconds", 180),
                early_stop_confidence=self.settings.CONFIDENCE_FAST_LANE_THRESHOLD,
            )
            self.beam_search = BeamSearchOrchestrator(beam_config)

            generator = PatchGenerator(
                model=self.settings.CLAUDE_MODEL,
                api_key=self.settings.ANTHROPIC_API_KEY,
            )
            self.evaluator = PatchEvaluator(timeout_seconds=job.get("timeout_seconds", 60))

            # Build patch request
            patch_request = PatchRequest(
                file_path=job.get("file_path", "unknown"),
                code_context=code_context,
                finding_title=job.get("finding_id", "unknown"),
                finding_description="",
                language=job.get("language", "typescript"),
                is_root_generation=True,
            )

            # Run beam search
            best_candidate = await self.beam_search.run(
                patch_request,
                self.evaluator,
                generator,
            )

            if not best_candidate:
                # No valid candidates found
                await self.supabase.update_repair_job(
                    self.job_id,
                    {
                        "status": "completed",
                        "completed_at": datetime.utcnow().isoformat(),
                        "action": "do_not_repair",
                        "confidence_score": 0.0,
                    },
                )

                return {
                    "status": "completed",
                    "job_id": str(self.job_id),
                    "action": "do_not_repair",
                    "confidence_score": 0.0,
                }

            # Score best candidate
            confidence_score = best_candidate.score
            action = await self.determine_action(confidence_score)

            # Get all candidates
            candidates = await self.supabase.get_repair_candidates(self.job_id)

            # Update job with results
            await self.supabase.update_repair_job(
                self.job_id,
                {
                    "status": "completed",
                    "completed_at": datetime.utcnow().isoformat(),
                    "best_candidate_id": str(best_candidate.parent_id or best_candidate.parent_id),
                    "best_score": best_candidate.score,
                    "confidence_score": confidence_score,
                    "action": action,
                    "total_candidates_evaluated": self.beam_search.total_candidates,
                },
            )

            return {
                "status": "completed",
                "job_id": str(self.job_id),
                "action": action,
                "confidence_score": confidence_score,
                "total_candidates": self.beam_search.total_candidates,
            }

        except Exception as e:
            # Update job with error
            import traceback

            error_msg = str(e)
            print(f"[orchestrator] Error: {error_msg}")
            print(traceback.format_exc())

            await self.supabase.update_repair_job(
                self.job_id,
                {
                    "status": "failed",
                    "completed_at": datetime.utcnow().isoformat(),
                    "error_message": error_msg,
                },
            )

            return {
                "status": "failed",
                "job_id": str(self.job_id),
                "error": error_msg,
            }

    async def determine_action(self, confidence_score: float) -> str:
        """
        Determine action based on confidence score.

        Routes according to governance policy:
        - >= 98%: fast_lane_ready_pr (PR ready, no draft)
        - >= 95%: ready_pr (PR ready for review)
        - >= 85%: draft_pr (Draft PR for review)
        - >= 75%: candidate_only (Show as candidate, no PR)
        - < 75%: do_not_repair (Block, too low confidence)

        Args:
            confidence_score: Overall confidence (0-100)

        Returns:
            Action string
        """
        threshold_fast = self.settings.CONFIDENCE_FAST_LANE_THRESHOLD * 100
        threshold_ready = 95.0
        threshold_draft = 85.0
        threshold_candidate = 75.0

        if confidence_score >= threshold_fast:
            return "fast_lane_ready_pr"
        elif confidence_score >= threshold_ready:
            return "ready_pr"
        elif confidence_score >= threshold_draft:
            return "draft_pr"
        elif confidence_score >= threshold_candidate:
            return "candidate_only"
        else:
            return "do_not_repair"

    async def check_vulnerability_eligibility(
        self,
        finding_type: str,
        confidence_score: float,
        locality_score: float,
        has_new_dependencies: bool,
        has_external_imports: bool,
    ) -> tuple[bool, Optional[str]]:
        """
        Check if vulnerability repair is eligible.

        Vulnerabilities require:
        - finding_type == "vulnerability"
        - confidence_score >= CONFIDENCE_VULNERABILITY_MINIMUM (97%)
        - locality_score >= VULNERABILITY_LOCALITY_MINIMUM (90%)
        - NO new dependencies
        - NO external imports

        Args:
            finding_type: Type of finding (bug, vulnerability, etc.)
            confidence_score: Overall confidence (0-100)
            locality_score: Locality score (0-100)
            has_new_dependencies: Whether patch adds dependencies
            has_external_imports: Whether patch adds external imports

        Returns:
            (eligible, reason) tuple
        """
        if finding_type != "vulnerability":
            return True, None  # Non-vulnerabilities have no special requirements

        if not self.settings.ALLOW_VULNERABILITY_REPAIRS:
            return False, "Vulnerability repairs are disabled"

        min_confidence = self.settings.CONFIDENCE_VULNERABILITY_MINIMUM * 100
        if confidence_score < min_confidence:
            return False, f"Confidence {confidence_score:.1f}% < minimum {min_confidence}%"

        min_locality = self.settings.VULNERABILITY_LOCALITY_MINIMUM * 100
        if locality_score < min_locality:
            return False, f"Locality {locality_score:.1f}% < minimum {min_locality}%"

        if has_new_dependencies:
            return False, "Vulnerability repairs cannot add dependencies"

        if has_external_imports and self.settings.VULNERABILITY_NO_EXTERNAL_IMPORTS:
            return False, "Vulnerability repairs cannot add external imports"

        return True, None

    def get_summary(self) -> dict:
        """Get summary of repair job progress."""
        if not self.beam_search:
            return {"status": "not_started"}

        return {
            "beam_search_summary": self.beam_search.get_summary(),
            "cost_summary": self.cost_tracker.get_summary(),
        }
