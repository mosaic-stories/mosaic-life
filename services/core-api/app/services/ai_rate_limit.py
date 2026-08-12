"""Per-user, per-bucket frequency rate limiting for AI/LLM-invoking endpoints.

Counts recent `AIRateLimitEvent` rows for a `(user_id, bucket)` pair against
an ordered list of `(window_seconds, max_count)` thresholds — e.g. 20/minute
AND 200/hour — all of which must hold. Every call records a usage-ratio
metric observation (count / max_count for the threshold with the highest
ratio) regardless of outcome, so operators can see fleet-wide headroom
before rejections start happening.

Unlike the concurrency guard (`app.services.ai_concurrency`), rejections here
carry a full-window retry hint (`retry_after_seconds` equal to the violated
threshold's window) rather than a precise "next slot" estimate — that's an
intentional simplification, not a bug.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.observability.metrics import (
    AI_RATE_LIMIT_REJECTIONS,
    AI_RATE_LIMIT_USAGE_RATIO,
)

from ..models.ai_rate_limit import AIRateLimitEvent

logger = logging.getLogger(__name__)


class AIRateLimitError(ValueError):
    """Raised when a user exceeds a per-bucket AI frequency rate limit."""

    def __init__(self, message: str, *, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


async def enforce_ai_rate_limit(
    db: AsyncSession,
    user_id: UUID,
    *,
    bucket: str,
    thresholds: list[tuple[int, int]],
) -> None:
    """Enforce ordered per-user frequency thresholds for an AI bucket.

    `thresholds` is an ordered list of `(window_seconds, max_count)` pairs;
    all must hold (e.g. `[(60, 20), (3600, 200)]` means 20/minute AND
    200/hour). Raises `AIRateLimitError` on the first threshold whose count
    meets or exceeds its `max_count`. On success, records a new
    `AIRateLimitEvent` row and opportunistically prunes rows older than the
    largest configured window.

    Always observes the highest count/max_count ratio seen across the
    thresholds actually checked into `AI_RATE_LIMIT_USAGE_RATIO`, whether or
    not a rejection occurs.
    """
    now = datetime.now(timezone.utc)

    highest_ratio = 0.0
    highest_count = 0
    highest_limit = 0
    highest_window = 0
    violation: tuple[int, int] | None = None

    for window_seconds, max_count in thresholds:
        cutoff = now - timedelta(seconds=window_seconds)
        result = await db.execute(
            select(func.count(AIRateLimitEvent.id)).where(
                AIRateLimitEvent.user_id == user_id,
                AIRateLimitEvent.bucket == bucket,
                AIRateLimitEvent.created_at > cutoff,
            )
        )
        count = result.scalar() or 0
        ratio = count / max_count if max_count else 0.0

        if ratio > highest_ratio:
            highest_ratio = ratio
            highest_count = count
            highest_limit = max_count
            highest_window = window_seconds

        if count >= max_count:
            violation = (window_seconds, max_count)
            break

    AI_RATE_LIMIT_USAGE_RATIO.labels(service="core-api", bucket=bucket).observe(
        highest_ratio
    )

    if highest_ratio >= 0.8:
        logger.info(
            "ai.rate_limit.near_limit",
            extra={
                "user_id": str(user_id),
                "bucket": bucket,
                "count": highest_count,
                "limit": highest_limit,
                "window_seconds": highest_window,
            },
        )

    if violation is not None:
        window_seconds, max_count = violation
        AI_RATE_LIMIT_REJECTIONS.labels(service="core-api", bucket=bucket).inc()
        logger.warning(
            "ai.rate_limit.rejected",
            extra={
                "user_id": str(user_id),
                "bucket": bucket,
                "window_seconds": window_seconds,
                "limit": max_count,
            },
        )
        raise AIRateLimitError(
            f"Rate limit exceeded for {bucket}, try again in {window_seconds}s",
            retry_after_seconds=window_seconds,
        )

    db.add(AIRateLimitEvent(user_id=user_id, bucket=bucket))

    max_window_seconds = max(window_seconds for window_seconds, _ in thresholds)
    prune_cutoff = now - timedelta(seconds=max_window_seconds)
    await db.execute(
        delete(AIRateLimitEvent).where(
            AIRateLimitEvent.user_id == user_id,
            AIRateLimitEvent.bucket == bucket,
            AIRateLimitEvent.created_at < prune_cutoff,
        )
    )

    await db.commit()
