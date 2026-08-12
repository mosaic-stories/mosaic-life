"""Per-user, per-bucket concurrency guard for in-flight AI operations.

Tracks how many concurrent LLM operations a given user has in-flight for a
given bucket (e.g. ``chat_message``, ``story_rewrite``) on this pod, and
rejects new operations once a configured limit is reached. Unlike the
frequency limiter (`app.services.ai_rate_limit`), there is no window to wait
out here — a slot frees up as soon as the in-flight operation finishes, so
rejections carry a short fixed retry hint rather than window math.

State is in-process only (per-pod), matching design.md Decision 2's
acceptance of an approximate, cheap cross-replica cap over a coordinated one.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from app.observability.metrics import AI_CONCURRENCY_ACTIVE, AI_CONCURRENCY_REJECTIONS

logger = logging.getLogger(__name__)

_active: dict[tuple[UUID, str], int] = {}
_lock = asyncio.Lock()


class AIConcurrencyLimitError(ValueError):
    """Raised when a user has too many concurrent AI operations for a bucket."""

    def __init__(self, message: str, *, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


@asynccontextmanager
async def ai_concurrency_guard(
    user_id: UUID, *, bucket: str, limit: int
) -> AsyncIterator[None]:
    """Cap concurrent in-flight AI operations per ``(user_id, bucket)``.

    Raises `AIConcurrencyLimitError` immediately if the user is already at
    `limit` concurrent operations for `bucket`. Otherwise reserves a slot,
    yields, and releases the slot on any exit path (normal completion, an
    exception propagating out of the `async with` block, or `GeneratorExit`
    from caller cancellation / client disconnect mid-stream).
    """
    key = (user_id, bucket)

    async with _lock:
        if _active.get(key, 0) >= limit:
            AI_CONCURRENCY_REJECTIONS.labels(service="core-api", bucket=bucket).inc()
            logger.warning(
                "ai.concurrency_limit.rejected",
                extra={"user_id": str(user_id), "bucket": bucket, "limit": limit},
            )
            raise AIConcurrencyLimitError(
                f"Concurrency limit exceeded for {bucket}", retry_after_seconds=5
            )

        _active[key] = _active.get(key, 0) + 1
        AI_CONCURRENCY_ACTIVE.labels(service="core-api", bucket=bucket).inc()

    try:
        yield
    finally:
        async with _lock:
            remaining = _active.get(key, 0) - 1
            if remaining > 0:
                _active[key] = remaining
            else:
                _active.pop(key, None)
            AI_CONCURRENCY_ACTIVE.labels(service="core-api", bucket=bucket).dec()


class AIConcurrencySlot:
    """A manually acquired/released concurrency slot.

    `ai_concurrency_guard` assumes the acquire and release happen in the same
    `async with` block, but every SSE route needs the acquire to happen
    synchronously in the route handler (so an over-limit request gets an
    immediate 429 before `StreamingResponse` is even constructed) while the
    release only happens once the generator itself finishes, fails, or is
    cancelled — a boundary `async with` can't span on its own. `extract_context`
    has the same split, across a route handler / `BackgroundTasks` boundary
    instead of a generator. This wraps the guard's `__aenter__`/`__aexit__`
    pair so every call site does the split the same way instead of five
    hand-rolled copies (design.md Risks).
    """

    def __init__(self, user_id: UUID, *, bucket: str, limit: int) -> None:
        self._cm = ai_concurrency_guard(user_id, bucket=bucket, limit=limit)

    @classmethod
    async def acquire(
        cls, user_id: UUID, *, bucket: str, limit: int
    ) -> "AIConcurrencySlot":
        """Acquire a slot now. Raises `AIConcurrencyLimitError` if at capacity."""
        slot = cls(user_id, bucket=bucket, limit=limit)
        await slot._cm.__aenter__()
        return slot

    async def release(self) -> None:
        """Release the slot. Call from the generator/background task's `finally`."""
        await self._cm.__aexit__(None, None, None)
