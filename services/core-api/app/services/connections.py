"""Service layer for Connections Hub queries."""

import logging
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.personas import get_persona
from app.models.ai import AIConversation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User

logger = logging.getLogger(__name__)


def _user_legacy_ids_subquery(user_id: UUID) -> Any:
    """Return a subquery of legacy_ids where the given user is an active member."""
    return (
        select(LegacyMember.legacy_id)
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .subquery()
    )


async def get_connections_stats(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, int]:
    """Get connection-specific stats for a user."""
    user_legacy_ids = _user_legacy_ids_subquery(user_id)

    conversations_count_result = await db.execute(
        select(func.count(AIConversation.id)).where(AIConversation.user_id == user_id)
    )
    conversations_count = conversations_count_result.scalar() or 0

    people_count_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.user_id))).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    people_count = people_count_result.scalar() or 0

    shared_legacies_count_result = await db.execute(
        select(func.count(func.distinct(LegacyMember.legacy_id))).where(
            LegacyMember.legacy_id.in_(select(user_legacy_ids.c.legacy_id)),
            LegacyMember.user_id != user_id,
            LegacyMember.role != "pending",
        )
    )
    shared_legacies_count = shared_legacies_count_result.scalar() or 0

    personas_used_count_result = await db.execute(
        select(func.count(func.distinct(AIConversation.persona_id))).where(
            AIConversation.user_id == user_id
        )
    )
    personas_used_count = personas_used_count_result.scalar() or 0

    logger.info("connections.stats", extra={"user_id": str(user_id)})

    return {
        "conversations_count": conversations_count,
        "people_count": people_count,
        "shared_legacies_count": shared_legacies_count,
        "personas_used_count": personas_used_count,
    }


async def get_top_connections(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 6,
) -> list[dict[str, Any]]:
    """Get people the user shares the most legacies with."""
    user_legacy_ids = _user_legacy_ids_subquery(user_id)

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


@dataclass
class _ConnectionAccumulator:
    """Internal accumulator for building per-user connection data."""

    user_id: UUID
    display_name: str
    avatar_url: str | None
    shared_legacies: list[dict[str, Any]] = field(default_factory=list)
    highest_shared_role: str = "admirer"
    highest_level: int = 0
    is_co_creator: bool = False

    @property
    def shared_legacy_count(self) -> int:
        return len(self.shared_legacies)

    def to_dict(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "shared_legacy_count": self.shared_legacy_count,
            "shared_legacies": self.shared_legacies,
            "highest_shared_role": self.highest_shared_role,
        }


async def get_people(
    db: AsyncSession,
    user_id: UUID,
    filter_key: Literal["all", "co_creators", "collaborators"] = "all",
) -> dict[str, Any]:
    """Get human connections with shared legacy details and filter counts."""
    user_legacy_ids = _user_legacy_ids_subquery(user_id)

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
    connections: dict[UUID, _ConnectionAccumulator] = {}

    for other_user_id, legacy_id, role in other_member_rows:
        user = users_by_id.get(other_user_id)
        legacy = legacies_by_id.get(legacy_id)
        if not user or not legacy:
            continue

        if other_user_id not in connections:
            connections[other_user_id] = _ConnectionAccumulator(
                user_id=user.id,
                display_name=user.name,
                avatar_url=user.avatar_url,
            )

        conn = connections[other_user_id]
        user_role = user_roles_by_legacy.get(legacy_id, "admirer")
        conn.shared_legacies.append(
            {
                "legacy_id": legacy.id,
                "legacy_name": legacy.name,
                "user_role": user_role,
                "connection_role": role,
            }
        )

        level = role_levels.get(role, 0)
        if level > conn.highest_level:
            conn.highest_level = level
            conn.highest_shared_role = role

        if role in ("creator", "admin"):
            conn.is_co_creator = True

    # Compute counts
    all_connections = list(connections.values())
    co_creators = [c for c in all_connections if c.is_co_creator]
    collaborators = [c for c in all_connections if not c.is_co_creator]

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
    filtered.sort(key=lambda c: c.shared_legacy_count, reverse=True)

    return {"items": [c.to_dict() for c in filtered], "counts": counts}
