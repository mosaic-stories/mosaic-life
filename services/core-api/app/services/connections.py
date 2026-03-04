"""Service layer for Connections Hub queries."""

import logging
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.personas import get_persona
from app.models.ai import AIConversation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User

logger = logging.getLogger(__name__)


async def get_connections_stats(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, int]:
    """Get connection-specific stats for a user."""
    # Count total conversations
    conv_result = await db.execute(
        select(func.count(AIConversation.id)).where(AIConversation.user_id == user_id)
    )
    conversations_count = conv_result.scalar() or 0

    # Count distinct other users who share at least one legacy
    # Subquery: legacy_ids where current user is a member
    user_legacy_ids = (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )
    people_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.user_id))).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    people_count = people_result.scalar() or 0

    # Count distinct legacies where user AND at least one other user are members
    shared_legacies_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.legacy_id))).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    shared_legacies_count = shared_legacies_result.scalar() or 0

    # Count distinct personas used
    personas_result = await db.execute(
        select(func.count(func.distinct(AIConversation.persona_id))).where(
            AIConversation.user_id == user_id
        )
    )
    personas_used_count = personas_result.scalar() or 0

    logger.info("connections.stats", extra={"user_id": str(user_id)})

    return {
        "conversations_count": conversations_count,
        "people_count": people_count,
        "shared_legacies_count": shared_legacies_count,
        "personas_used_count": personas_used_count,
    }


class TopConnectionItem:
    """Internal result type for top connections query."""

    def __init__(
        self,
        user_id: UUID,
        display_name: str,
        avatar_url: str | None,
        shared_legacy_count: int,
    ):
        self.user_id = user_id
        self.display_name = display_name
        self.avatar_url = avatar_url
        self.shared_legacy_count = shared_legacy_count


async def get_top_connections(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 6,
) -> list[dict[str, Any]]:
    """Get people the user shares the most legacies with."""
    # Subquery: legacy_ids where current user is a member
    user_legacy_ids = (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )

    # Count shared legacies per other user
    result = await db.execute(
        select(
            LegacyMember.user_id,
            func.count(func.distinct(LegacyMember.legacy_id)).label("shared_count"),
        )
        .where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
        .group_by(LegacyMember.user_id)
        .order_by(func.count(func.distinct(LegacyMember.legacy_id)).desc())
        .limit(limit)
    )
    rows = result.all()

    if not rows:
        return []

    # Fetch user details
    other_user_ids = [row[0] for row in rows]
    users_result = await db.execute(select(User).where(User.id.in_(other_user_ids)))
    users_by_id = {u.id: u for u in users_result.scalars().all()}

    items: list[dict[str, Any]] = []
    for other_user_id, shared_count in rows:
        user = users_by_id.get(other_user_id)
        if user:
            items.append(
                {
                    "user_id": user.id,
                    "display_name": user.name,
                    "avatar_url": user.avatar_url,
                    "shared_legacy_count": shared_count,
                }
            )

    return items


async def get_favorite_personas(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 4,
) -> list[dict[str, Any]]:
    """Get personas ranked by conversation count for the user."""
    result = await db.execute(
        select(
            AIConversation.persona_id,
            func.count(AIConversation.id).label("conv_count"),
        )
        .where(AIConversation.user_id == user_id)
        .group_by(AIConversation.persona_id)
        .order_by(func.count(AIConversation.id).desc())
        .limit(limit)
    )
    rows = result.all()

    items: list[dict[str, Any]] = []
    for persona_id, conv_count in rows:
        persona = get_persona(persona_id)
        if persona:
            items.append(
                {
                    "persona_id": persona_id,
                    "persona_name": persona.name,
                    "persona_icon": persona.icon,
                    "conversation_count": conv_count,
                }
            )

    return items


async def get_people(
    db: AsyncSession,
    user_id: UUID,
    filter_key: Literal["all", "co_creators", "collaborators"] = "all",
) -> dict[str, Any]:
    """Get human connections with shared legacy details and filter counts."""
    # Subquery: legacy_ids where current user is a member
    user_legacy_ids = (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )

    # Get all other members on shared legacies with their roles
    result = await db.execute(
        select(
            LegacyMember.user_id,
            LegacyMember.legacy_id,
            LegacyMember.role,
        ).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    other_member_rows = result.all()

    if not other_member_rows:
        empty_counts = {"all": 0, "co_creators": 0, "collaborators": 0}
        return {"items": [], "counts": empty_counts}

    # Get current user's roles on their legacies
    user_roles_result = await db.execute(
        select(LegacyMember.legacy_id, LegacyMember.role).where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    user_roles_by_legacy = {row[0]: row[1] for row in user_roles_result.all()}

    # Fetch user and legacy details
    other_user_ids = list({row[0] for row in other_member_rows})
    legacy_ids = list({row[1] for row in other_member_rows})

    users_result = await db.execute(select(User).where(User.id.in_(other_user_ids)))
    users_by_id = {u.id: u for u in users_result.scalars().all()}

    legacies_result = await db.execute(select(Legacy).where(Legacy.id.in_(legacy_ids)))
    legacies_by_id = {leg.id: leg for leg in legacies_result.scalars().all()}

    # Build per-user connection data
    role_levels = {"creator": 4, "admin": 3, "advocate": 2, "admirer": 1}
    connections: dict[UUID, dict[str, Any]] = {}

    for other_user_id, legacy_id, role in other_member_rows:
        user = users_by_id.get(other_user_id)
        legacy = legacies_by_id.get(legacy_id)
        if not user or not legacy:
            continue

        if other_user_id not in connections:
            connections[other_user_id] = {
                "user_id": user.id,
                "display_name": user.name,
                "avatar_url": user.avatar_url,
                "shared_legacy_count": 0,
                "shared_legacies": [],
                "highest_shared_role": "admirer",
                "_highest_level": 0,
                "_is_co_creator": False,
            }

        conn = connections[other_user_id]
        shared_legacies = conn["shared_legacies"]
        assert isinstance(shared_legacies, list)

        user_role = user_roles_by_legacy.get(legacy_id, "admirer")
        shared_legacies.append(
            {
                "legacy_id": legacy.id,
                "legacy_name": legacy.name,
                "user_role": user_role,
                "connection_role": role,
            }
        )
        conn["shared_legacy_count"] = len(shared_legacies)

        level = role_levels.get(role, 0)
        highest_level = conn["_highest_level"]
        assert isinstance(highest_level, int)
        if level > highest_level:
            conn["_highest_level"] = level
            conn["highest_shared_role"] = role

        if role in ("creator", "admin"):
            conn["_is_co_creator"] = True

    # Compute counts
    all_connections = list(connections.values())
    co_creators = [c for c in all_connections if c["_is_co_creator"]]
    collaborators = [c for c in all_connections if not c["_is_co_creator"]]

    counts = {
        "all": len(all_connections),
        "co_creators": len(co_creators),
        "collaborators": len(collaborators),
    }

    # Apply filter
    if filter_key == "co_creators":
        filtered = co_creators
    elif filter_key == "collaborators":
        filtered = collaborators
    else:
        filtered = all_connections

    # Sort by shared_legacy_count descending
    filtered.sort(
        key=lambda c: (
            c["shared_legacy_count"] if isinstance(c["shared_legacy_count"], int) else 0
        ),
        reverse=True,
    )

    # Clean internal keys
    items = []
    for conn in filtered:
        items.append(
            {
                "user_id": conn["user_id"],
                "display_name": conn["display_name"],
                "avatar_url": conn["avatar_url"],
                "shared_legacy_count": conn["shared_legacy_count"],
                "shared_legacies": conn["shared_legacies"],
                "highest_shared_role": conn["highest_shared_role"],
            }
        )

    return {"items": items, "counts": counts}
