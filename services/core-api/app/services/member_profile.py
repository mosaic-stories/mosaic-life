"""Service for member relationship profiles."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import LegacyMember
from ..providers.registry import get_provider_registry
from ..schemas.member_profile import MemberProfileResponse, MemberProfileUpdate
from .graph_sync import categorize_relationship

if TYPE_CHECKING:
    from ..adapters.graph_adapter import GraphAdapter

logger = logging.getLogger(__name__)


async def _get_member(db: AsyncSession, legacy_id: UUID, user_id: UUID) -> LegacyMember:
    """Get a legacy member, raising 403 if not found or pending."""
    result = await db.execute(
        select(LegacyMember)
        .options(selectinload(LegacyMember.legacy))
        .where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member or member.role == "pending":
        raise HTTPException(
            status_code=403,
            detail="Not a member of this legacy",
        )

    return member


async def get_profile(
    db: AsyncSession, legacy_id: UUID, user_id: UUID
) -> MemberProfileResponse | None:
    """Get a member's relationship profile.

    Returns None if no profile has been set yet.
    Raises 403 if user is not a member.
    """
    member = await _get_member(db, legacy_id, user_id)

    if member.profile is None:
        return None

    return MemberProfileResponse(**member.profile)


async def update_profile(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
    data: MemberProfileUpdate,
) -> MemberProfileResponse:
    """Create or update a member's relationship profile.

    Merges partial updates with existing profile data.
    Raises 403 if user is not a member.
    """
    member = await _get_member(db, legacy_id, user_id)

    existing = dict(member.profile) if member.profile else {}

    # Merge: update only fields explicitly provided, including nulls for clears.
    for key in data.model_fields_set:
        existing[key] = getattr(data, key)

    member.profile = existing
    await db.commit()
    await db.refresh(member)

    logger.info(
        "member_profile.updated",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    # Best-effort graph sync for relationship edges
    try:
        registry = get_provider_registry()
        graph_adapter = registry.get_graph_adapter()
        if graph_adapter:
            await _sync_relationship_to_graph(
                graph_adapter,
                user_id=user_id,
                legacy_id=legacy_id,
                legacy_person_id=member.legacy.person_id,
                relationship_type=existing.get("relationship_type"),
            )
    except Exception:
        logger.warning(
            "member_profile.graph_sync_failed",
            extra={"legacy_id": str(legacy_id), "user_id": str(user_id)},
            exc_info=True,
        )

    return MemberProfileResponse(**member.profile)


async def _sync_relationship_to_graph(
    graph_adapter: GraphAdapter,
    user_id: UUID,
    legacy_id: UUID,
    legacy_person_id: UUID,
    relationship_type: str | None,
) -> None:
    """Sync a declared member relationship to the graph as a Person->Person edge."""

    user_node_id = f"user-{user_id}"
    legacy_node_id = str(legacy_person_id)

    # Upsert Person nodes
    await graph_adapter.upsert_node(
        "Person",
        user_node_id,
        {"user_id": str(user_id), "is_user": "true", "source": "declared"},
    )
    await graph_adapter.upsert_node(
        "Person",
        legacy_node_id,
        {"legacy_id": str(legacy_id), "is_legacy": "true", "source": "declared"},
    )

    await graph_adapter.replace_relationship(
        "Person",
        user_node_id,
        ["FAMILY_OF", "WORKED_WITH", "FRIENDS_WITH", "KNEW"],
        "Person",
        legacy_node_id,
        new_rel_type=(
            categorize_relationship(relationship_type) if relationship_type else None
        ),
        properties=(
            {
                "relationship_type": relationship_type,
                "source": "declared",
            }
            if relationship_type
            else None
        ),
    )
