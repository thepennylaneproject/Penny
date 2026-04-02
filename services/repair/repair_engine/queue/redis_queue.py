from __future__ import annotations

from typing import Any
import json

import redis as redis_lib
from urllib.parse import urlparse


def _make_client(redis_url: str) -> redis_lib.Redis:  # type: ignore[type-arg]
    """
    Build a redis.Redis client from a URL, supporting auth and TLS.

    Handles:
      - redis://[:password@]host[:port][/db]
      - rediss://[:password@]host[:port][/db]  (TLS)
      - redis://:password@host:port/db         (password-only)
    """
    parsed = urlparse(redis_url)
    ssl = parsed.scheme == "rediss"
    kwargs: dict = {}
    if ssl:
        kwargs["ssl"] = True
    return redis_lib.Redis.from_url(redis_url, **kwargs)


class RedisQueue:
    def __init__(self, redis_url: str, queue_name: str = "penny:repair:jobs") -> None:
        self._client = _make_client(redis_url)
        self.queue_name = queue_name

    def enqueue(self, payload: dict[str, Any]) -> int:
        raw = json.dumps(payload)
        result = self._client.lpush(self.queue_name, raw)
        return int(result or 0)

    def dequeue(self, timeout_seconds: int = 1) -> dict[str, Any] | None:
        result = self._client.brpop(self.queue_name, timeout=timeout_seconds)
        if not result:
            return None
        _, raw = result
        if not raw:
            return None
        return json.loads(raw)

    def size(self) -> int:
        result = self._client.llen(self.queue_name)
        return int(result or 0)

