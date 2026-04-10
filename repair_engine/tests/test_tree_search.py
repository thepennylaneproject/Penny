from __future__ import annotations

import unittest

from repair_engine.config import SearchConfig
from repair_engine.models import EvalResult, EvalSummary, PatchCandidate, PatchOperation
from repair_engine.scoring import score_candidate
from repair_engine.tree_search import PatchTree, should_prune


class PatchTreeTests(unittest.TestCase):
    def _candidate(self, marker: str) -> PatchCandidate:
        return PatchCandidate(
            finding_id="f-tree",
            operations=[
                PatchOperation(
                    file="src/file.py",
                    description="desc",
                    search=f"old_{marker}",
                    replace=f"new_{marker}",
                )
            ],
        )

    def test_tree_add_and_prune_duplicate(self) -> None:
        tree = PatchTree(finding_id="f-tree")
        seen: set[str] = set()
        config = SearchConfig(max_depth=2, min_expand_score=0.4)

        c1 = self._candidate("a")
        n1 = tree.add_root(c1)
        e1 = EvalResult(
            candidate_id=c1.candidate_id,
            apply_ok=True,
            compile_ok=True,
            lint_ok=True,
            tests_ok=True,
            warnings=0,
        )
        s1 = score_candidate(e1, c1)
        n1.eval_summary = EvalSummary(result=e1, score=s1)
        self.assertFalse(should_prune(n1, config, seen))

        c2 = PatchCandidate(finding_id="f-tree", operations=c1.operations.copy())
        n2 = tree.add_root(c2)
        e2 = EvalResult(
            candidate_id=c2.candidate_id,
            apply_ok=True,
            compile_ok=True,
            lint_ok=True,
            tests_ok=True,
            warnings=0,
        )
        s2 = score_candidate(e2, c2)
        n2.eval_summary = EvalSummary(result=e2, score=s2)
        self.assertTrue(should_prune(n2, config, seen))


if __name__ == "__main__":
    unittest.main()

