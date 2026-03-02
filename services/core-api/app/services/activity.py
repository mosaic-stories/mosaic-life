"""Activity tracking service — record, query, and cleanup user activity."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, cast
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.activity import UserActivity
from ..models.user import User

logger = logging.getLogger(__name__)

# Retention tiers: action -> max age in days
RETENTION_TIERS: dict[str, int] = {
    # Ephemeral
    "viewed": 30,
    # Standard
    "favorited": 90,
    "unfavorited": 90,
    "shared": 90,
    "joined": 90,
    "invited": 90,
    "ai_conversation_started": 90,
    "ai_story_evolved": 90,
    # Durable
    "created": 365,
    "updated": 365,
    "deleted": 365,
}

# Group actions by tier for batch cleanup
EPHEMERAL_ACTIONS = ["viewed"]
STANDARD_ACTIONS = [
    "favorited",
    "unfavorited",
    "shared",
    "joined",
    "invited",
    "ai_conversation_started",
    "ai_story_evolved",
]
DURABLE_ACTIONS = ["created", "updated", "deleted"]


async def record_activity(
    db: AsyncSession,
    user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID,
    metadata: dict[str, Any] | None = None,
    deduplicate_minutes: int = 0,
) -> None:
    """Record a user activity event.

    Respects privacy preference — skips recording if tracking is disabled.
    Optionally deduplicates by checking for a recent identical event.
    Failures are logged but never raised.
    """
    try:
        # Check privacy preference
        result = await db.execute(select(User.preferences).where(User.id == user_id))
        prefs = result.scalar_one_or_none()
        if prefs and not prefs.get("activity_tracking_enabled", True):
            return

        # Deduplication check for views
        if deduplicate_minutes > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=deduplicate_minutes)
            dup_result = await db.execute(
                select(UserActivity.id)
                .where(
                    UserActivity.user_id == user_id,
                    UserActivity.action == action,
                    UserActivity.entity_type == entity_type,
                    UserActivity.entity_id == entity_id,
                    UserActivity.created_at > cutoff,
                )
                .limit(1)
            )
            if dup_result.scalar_one_or_none() is not None:
                return

        activity = UserActivity(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_=metadata,
            created_at=datetime.now(timezone.utc),
        )
        db.add(activity)
        await db.flush()

        logger.info(
            "activity.recorded",
            extra={
                "user_id": str(user_id),
                "action": action,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
        )
    except Exception:
        logger.warning(
            "activity.record_failed",
            extra={
                "user_id": str(user_id),
                "action": action,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
            exc_info=True,
        )


async def get_activity_feed(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    action: str | None = None,
    cursor: datetime | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Get paginated activity feed for a user."""
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {
            "items": [],
            "next_cursor": None,
            "has_more": False,
            "tracking_enabled": False,
        }

    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)
    if action:
        filters.append(UserActivity.action == action)
    if cursor:
        filters.append(UserActivity.created_at < cursor)

    query = (
        select(UserActivity)
        .where(*filters)
        .order_by(UserActivity.created_at.desc())
        .limit(limit + 1)  # fetch one extra to check has_more
    )

    result = await db.execute(query)
    activities = list(result.scalars().all())

    has_more = len(activities) > limit
    if has_more:
        activities = activities[:limit]

    next_cursor = (
        activities[-1].created_at.isoformat() if activities and has_more else None
    )

    return {
        "items": activities,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "tracking_enabled": True,
    }


async def get_recent_items(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Get deduplicated recent items grouped by entity."""
    # Check if tracking is enabled
    user_result = await db.execute(select(User.preferences).where(User.id == user_id))
    prefs = user_result.scalar_one_or_none()
    if prefs and not prefs.get("activity_tracking_enabled", True):
        return {"items": [], "tracking_enabled": False}

    # Subquery: latest activity per (entity_type, entity_id)
    filters = [UserActivity.user_id == user_id]
    if entity_type:
        filters.append(UserActivity.entity_type == entity_type)

    # Use group_by approach for SQLite compat in tests
    subq = (
        select(
            UserActivity.entity_type,
            UserActivity.entity_id,
            func.max(UserActivity.created_at).label("last_activity_at"),
        )
        .where(*filters)
        .group_by(UserActivity.entity_type, UserActivity.entity_id)
        .order_by(func.max(UserActivity.created_at).desc())
        .limit(limit)
        .subquery()
    )

    # Join back to get the actual activity record for metadata
    query = (
        select(UserActivity)
        .join(
            subq,
            (UserActivity.entity_type == subq.c.entity_type)
            & (UserActivity.entity_id == subq.c.entity_id)
            & (UserActivity.created_at == subq.c.last_activity_at),
        )
        .where(UserActivity.user_id == user_id)
        .order_by(UserActivity.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    activities = list(result.scalars().all())

    items = [
        {
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "last_action": a.action,
            "last_activity_at": a.created_at,
            "metadata": a.metadata_,
        }
        for a in activities
    ]

    return {"items": items, "tracking_enabled": True}


async def clear_user_activity(db: AsyncSession, user_id: UUID) -> int:
    """Delete all activity data for a user. Returns count of deleted rows."""
    result = await db.execute(
        delete(UserActivity).where(UserActivity.user_id == user_id)
    )
    await db.flush()
    return cast(int, getattr(result, "rowcount", 0))


async def run_retention_cleanup(db: AsyncSession, batch_size: int = 1000) -> int:
    """Run tiered retention cleanup. Returns total rows deleted."""
    now = datetime.now(timezone.utc)
    total_deleted = 0

    tiers = [
        ("ephemeral", EPHEMERAL_ACTIONS, 30),
        ("standard", STANDARD_ACTIONS, 90),
        ("durable", DURABLE_ACTIONS, 365),
    ]

    for tier_name, actions, days in tiers:
        cutoff = now - timedelta(days=days)
        deleted_in_tier = 0

        # Batch delete loop
        while True:
            # Use a subquery to limit the delete batch
            subq = (
                select(UserActivity.id)
                .where(
                    UserActivity.action.in_(actions),
                    UserActivity.created_at < cutoff,
                )
                .limit(batch_size)
                .subquery()
            )
            result = await db.execute(
                delete(UserActivity).where(UserActivity.id.in_(select(subq.c.id)))
            )
            batch_count: int = cast(int, getattr(result, "rowcount", 0))
            deleted_in_tier += batch_count
            await db.flush()

            if batch_count < batch_size:
                break

        total_deleted += deleted_in_tier
        if deleted_in_tier > 0:
            logger.info(
                "activity.cleanup.tier_complete",
                extra={
                    "tier": tier_name,
                    "deleted_count": deleted_in_tier,
                    "cutoff": cutoff.isoformat(),
                },
            )

    return total_deleted
