"""Service for member relationship profiles."""

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.legacy import LegacyMember
from ..schemas.member_profile import MemberProfileResponse, MemberProfileUpdate

logger = logging.getLogger(__name__)


async def _get_member(db: AsyncSession, legacy_id: UUID, user_id: UUID) -> LegacyMember:
    """Get a legacy member, raising 403 if not found or pending."""
    result = await db.execute(
        select(LegacyMember).where(
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

    # Merge: only update fields that were explicitly provided
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None and hasattr(value, "value"):
            existing[key] = value.value
        else:
            existing[key] = value

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

    return MemberProfileResponse(**member.profile)
