from __future__ import annotations

from dataclasses import dataclass, field

from .config import SearchConfig
from .models import EvalSummary, PatchCandidate, PatchNode


@dataclass
class PatchTree:
    finding_id: str
    nodes: dict[str, PatchNode] = field(default_factory=dict)
    roots: list[str] = field(default_factory=list)

    def add_root(self, candidate: PatchCandidate) -> PatchNode:
        node = PatchNode(
            node_id=f"node-{candidate.candidate_id}",
            finding_id=self.finding_id,
            depth=0,
            candidate=candidate,
            parent_id=None,
        )
        self.nodes[node.node_id] = node
        self.roots.append(node.node_id)
        return node

    def add_child(self, parent_id: str, candidate: PatchCandidate) -> PatchNode:
        parent = self.nodes[parent_id]
        node = PatchNode(
            node_id=f"node-{candidate.candidate_id}",
            finding_id=self.finding_id,
            depth=parent.depth + 1,
            candidate=candidate,
            parent_id=parent_id,
        )
        self.nodes[node.node_id] = node
        parent.children.append(node.node_id)
        return node

    def open_frontier(self) -> list[PatchNode]:
        return [n for n in self.nodes.values() if (not n.pruned and n.eval_summary is not None)]

    def best_nodes(self, k: int) -> list[PatchNode]:
        ranked = sorted(self.open_frontier(), key=lambda n: n.score, reverse=True)
        return ranked[:k]


def should_prune(node: PatchNode, config: SearchConfig, seen_fingerprints: set[str]) -> bool:
    fingerprint = node.candidate.patch_fingerprint()
    if fingerprint in seen_fingerprints:
        node.pruned = True
        return True
    seen_fingerprints.add(fingerprint)

    if node.eval_summary is None:
        return False
    if not node.eval_summary.result.apply_ok:
        node.pruned = True
        return True
    if node.depth >= config.max_depth:
        node.pruned = True
        return True
    if node.eval_summary.score.score < config.min_expand_score:
        node.pruned = True
        return True
    return False


def score_node(node: PatchNode, eval_summary: EvalSummary) -> None:
    node.eval_summary = eval_summary

