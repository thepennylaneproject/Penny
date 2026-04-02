"""Beam search orchestration for repair jobs."""

from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID


@dataclass
class BeamSearchConfig:
    """Configuration for beam search."""

    beam_width: int = 4  # Number of candidates to keep at each depth
    max_depth: int = 4  # Maximum search depth
    timeout_seconds: int = 180  # Overall timeout
    early_stop_confidence: float = 0.98  # Stop if confidence exceeds this


@dataclass
class BeamSearchNode:
    """Node in the beam search tree."""

    depth: int
    sequence_number: int
    patch_diff: str
    score: float
    parent_id: Optional[UUID] = None
    validation_results: Optional[dict] = None
    error_log: Optional[str] = None


class BeamSearchOrchestrator:
    """Orchestrates beam search for patch repair."""

    def __init__(self, config: BeamSearchConfig = BeamSearchConfig()):
        """Initialize beam search orchestrator."""
        self.config = config
        self.best_candidate: Optional[BeamSearchNode] = None
        self.candidates_by_depth: dict[int, list[BeamSearchNode]] = {}
        self.total_candidates: int = 0

    async def run(
        self,
        request,
        evaluator,
        generator,
    ) -> Optional[BeamSearchNode]:
        """
        Run beam search to find best patch.

        Args:
            request: Patch request (file_path, code_context, etc.)
            evaluator: Evaluator to score patches
            generator: Patch generator for refinement

        Returns:
            Best candidate found, or None if search failed
        """
        import time

        start_time = time.time()

        # Generate root patch
        try:
            root_candidate, root_usage = await generator.generate_root_patch(request)
        except Exception as e:
            print(f"[beam-search] Root generation failed: {e}")
            return None

        # Validate root patch syntax
        if not await generator.validate_patch_syntax(root_candidate.patch_diff, request.language):
            print(f"[beam-search] Root patch failed syntax validation")
            return None

        # Add root candidate to beam
        root_node = self.add_candidate(
            depth=0,
            sequence_number=0,
            patch_diff=root_candidate.patch_diff,
            score=root_candidate.confidence,
        )

        # Beam search loop
        for depth in range(1, self.config.max_depth + 1):
            if time.time() - start_time > self.config.timeout_seconds:
                print(f"[beam-search] Timeout after depth {depth}")
                break

            # Get candidates to refine
            candidates_to_refine = self.get_candidates_at_depth(depth - 1)
            if not candidates_to_refine:
                break

            # Generate and evaluate refinements
            for seq, parent_candidate in enumerate(candidates_to_refine):
                if time.time() - start_time > self.config.timeout_seconds:
                    break

                try:
                    # Generate refinement
                    refined_candidate, refinement_usage = await generator.refine_patch(
                        request,
                        parent_patch=parent_candidate.patch_diff,
                        feedback="Previous patch did not pass all validation checks. Please refine.",
                    )

                    # Evaluate refinement
                    eval_result = await evaluator.evaluate(
                        patch_id=f"{depth}-{seq}",
                        patch_diff=refined_candidate.patch_diff,
                        repo_path="/tmp/repo",  # TODO: Pass actual repo path
                        file_path=request.file_path,
                        lint_command="npm run lint",  # TODO: Use from job config
                        typecheck_command="npx tsc --noEmit",
                        test_command="npm test",
                    )

                    # Score candidate
                    validation_score = refined_candidate.confidence * 0.5
                    if eval_result.lint_ok:
                        validation_score += 20
                    if eval_result.typecheck_ok:
                        validation_score += 20
                    if eval_result.tests_ok:
                        validation_score += 20

                    # Add to beam
                    node = self.add_candidate(
                        depth=depth,
                        sequence_number=seq,
                        patch_diff=refined_candidate.patch_diff,
                        score=min(100.0, validation_score),
                        parent_id=None,
                        validation_results=eval_result.to_dict(),
                    )

                    # Check early stopping
                    if node.score >= self.config.early_stop_confidence * 100:
                        return node

                except Exception as e:
                    print(f"[beam-search] Refinement at depth {depth} seq {seq} failed: {e}")
                    continue

        return self.best_candidate

    def add_candidate(
        self,
        depth: int,
        sequence_number: int,
        patch_diff: str,
        score: float,
        parent_id: Optional[UUID] = None,
        validation_results: Optional[dict] = None,
        error_log: Optional[str] = None,
    ) -> BeamSearchNode:
        """
        Add a candidate to the beam.

        Args:
            depth: Depth in search tree
            sequence_number: Sequence number at this depth
            patch_diff: The patch
            score: Evaluation score
            parent_id: Parent candidate ID
            validation_results: Validation test results
            error_log: Error message if evaluation failed

        Returns:
            The added node
        """
        node = BeamSearchNode(
            depth=depth,
            sequence_number=sequence_number,
            patch_diff=patch_diff,
            score=score,
            parent_id=parent_id,
            validation_results=validation_results,
            error_log=error_log,
        )

        if depth not in self.candidates_by_depth:
            self.candidates_by_depth[depth] = []

        self.candidates_by_depth[depth].append(node)
        self.candidates_by_depth[depth].sort(key=lambda c: c.score, reverse=True)

        # Keep only top beam_width candidates
        if len(self.candidates_by_depth[depth]) > self.config.beam_width:
            self.candidates_by_depth[depth] = self.candidates_by_depth[depth][
                : self.config.beam_width
            ]

        self.total_candidates += 1

        if self.best_candidate is None or score > self.best_candidate.score:
            self.best_candidate = node

        return node

    def get_best_candidate(self) -> Optional[BeamSearchNode]:
        """Get best candidate found so far."""
        return self.best_candidate

    def get_candidates_at_depth(self, depth: int) -> list[BeamSearchNode]:
        """Get candidates at specific depth."""
        return self.candidates_by_depth.get(depth, [])

    def should_continue(self) -> bool:
        """Check if should continue searching."""
        if self.best_candidate is None:
            return True

        # Stop if best candidate is very confident
        if self.best_candidate.score >= self.config.early_stop_confidence * 100:
            return False

        # Stop if we've reached max depth
        current_depth = max(self.candidates_by_depth.keys()) if self.candidates_by_depth else 0
        if current_depth >= self.config.max_depth:
            return False

        return True

    def get_summary(self) -> dict:
        """Get summary of search results."""
        return {
            "total_candidates": self.total_candidates,
            "best_score": self.best_candidate.score if self.best_candidate else 0.0,
            "best_depth": self.best_candidate.depth if self.best_candidate else 0,
            "max_depth": max(self.candidates_by_depth.keys())
            if self.candidates_by_depth
            else 0,
            "candidates_by_depth": {
                depth: len(candidates)
                for depth, candidates in self.candidates_by_depth.items()
            },
        }
