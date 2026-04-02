from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import hashlib
import json
import urllib.error
import urllib.request

from ..models import Finding, PatchCandidate


def hash_embedding(text: str, dim: int = 32) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    vec: list[float] = []
    for idx in range(dim):
        byte = digest[idx % len(digest)]
        vec.append((byte / 255.0) * 2.0 - 1.0)
    return vec


@dataclass
class MemoryHit:
    score: float
    payload: dict[str, Any]


class QdrantMemoryStore:
    def __init__(self, base_url: str, collection: str, vector_size: int = 32) -> None:
        self.base_url = base_url.rstrip("/")
        self.collection = collection
        self.vector_size = vector_size
        self._collection_ready = False

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        http_request = urllib.request.Request(url, data=body, method=method, headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(http_request, timeout=20) as http_response:
                if http_response.status == 204:
                    return {}
                raw = http_response.read()
                if not raw:
                    return {}
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Qdrant {method} {path} failed ({exc.code}): {text[:400]}") from exc

    def ensure_collection(self) -> None:
        if self._collection_ready:
            return
        payload = {"vectors": {"size": self.vector_size, "distance": "Cosine"}}
        self._request("PUT", f"/collections/{self.collection}", payload)
        self._collection_ready = True

    def remember_success(self, finding: Finding, candidate: PatchCandidate, score: float) -> None:
        point_id = int(hashlib.sha1(candidate.candidate_id.encode("utf-8")).hexdigest()[:12], 16)
        payload = {
            "points": [
                {
                    "id": point_id,
                    "vector": hash_embedding(finding.signature(), self.vector_size),
                    "payload": {
                        "finding_id": finding.finding_id,
                        "signature": finding.signature(),
                        "score": score,
                        "candidate": candidate.to_dict(),
                    },
                }
            ]
        }
        self._request("PUT", f"/collections/{self.collection}/points", payload)

    def lookup_similar(self, finding: Finding, limit: int = 5) -> list[MemoryHit]:
        payload = {
            "vector": hash_embedding(finding.signature(), self.vector_size),
            "limit": limit,
            "with_payload": True,
            "with_vector": False,
        }
        result = self._request("POST", f"/collections/{self.collection}/points/search", payload)
        hits: list[MemoryHit] = []
        for point in result.get("result", []):
            hits.append(MemoryHit(score=float(point.get("score", 0.0)), payload=point.get("payload", {})))
        return hits
