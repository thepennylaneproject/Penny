from typing import TYPE_CHECKING, Any

__all__ = ["RedisQueue"]

if TYPE_CHECKING:
    from .redis_queue import RedisQueue


def __getattr__(name: str) -> Any:
    if name == "RedisQueue":
        from .redis_queue import RedisQueue

        return RedisQueue
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
