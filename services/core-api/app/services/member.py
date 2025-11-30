"""Member management service."""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.legacy import LegacyMember
from ..models.user import User
from .legacy import can_manage_role, check_legacy_access

logger = logging.getLogger(__name__)


async def list_members(
    db: AsyncSession,
    legacy_id: UUID,
    requester_id: UUID,
) -> list[dict[str, Any]]:
    """List all members of a legacy.

    All members can view the member list.
    """
    # Verify requester is a member
    await check_legacy_access(db, requester_id, legacy_id)

    result = await db.execute(
        select(LegacyMember, User)
        .join(User, LegacyMember.user_id == User.id)
        .where(LegacyMember.legacy_id == legacy_id)
        .order_by(
            # Sort by role level descending, then join date
            case(
                (LegacyMember.role == "creator", 4),
                (LegacyMember.role == "admin", 3),
                (LegacyMember.role == "advocate", 2),
                (LegacyMember.role == "admirer", 1),
                else_=0,
            ).desc(),
            LegacyMember.joined_at.asc(),
        )
    )

    members = []
    for member, user in result:
        joined_at = member.joined_at
        if isinstance(joined_at, datetime):
            joined_at_str = joined_at.isoformat()
        else:
            joined_at_str = None

        members.append(
            {
                "user_id": str(user.id),
                "email": user.email,
                "name": user.name,
                "avatar_url": user.avatar_url,
                "role": member.role,
                "joined_at": joined_at_str,
            }
        )

    return members


async def change_member_role(
    db: AsyncSession,
    legacy_id: UUID,
    target_user_id: UUID,
    new_role: str,
    actor_id: UUID,
) -> dict[str, Any]:
    """Change a member's role.

    Rules:
    - Actor must be creator or admin
    - Actor can only change roles at or below their level
    - Cannot demote someone to a higher role than actor has
    - Last creator cannot be demoted
    """
    # Validate new_role
    valid_roles = {"creator", "admin", "advocate", "admirer"}
    if new_role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}",
        )

    # Get actor's membership
    actor_member = await check_legacy_access(db, actor_id, legacy_id)

    if actor_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can change member roles.",
        )

    # Get target's membership
    result = await db.execute(
        select(LegacyMember, User)
        .join(User, LegacyMember.user_id == User.id)
        .where(
            and_(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == target_user_id,
            )
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found.")

    target_member, target_user = row

    # Check actor can manage target's current role
    if not can_manage_role(actor_member.role, target_member.role):
        raise HTTPException(
            status_code=403,
            detail=f"You cannot manage members with role {target_member.role}.",
        )

    # Check actor can assign the new role
    if not can_manage_role(actor_member.role, new_role):
        raise HTTPException(
            status_code=403,
            detail=f"You cannot assign the role {new_role}.",
        )

    # If demoting from creator, check there's another creator
    if target_member.role == "creator" and new_role != "creator":
        creator_count_result = await db.execute(
            select(func.count())
            .select_from(LegacyMember)
            .where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.role == "creator",
                )
            )
        )
        creator_count = creator_count_result.scalar()
        if creator_count is not None and creator_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last creator. Promote someone else first.",
            )

    target_member.role = new_role
    await db.commit()

    logger.info(
        "member.role_changed",
        extra={
            "legacy_id": str(legacy_id),
            "target_user_id": str(target_user_id),
            "new_role": new_role,
            "actor_id": str(actor_id),
        },
    )

    joined_at = target_member.joined_at
    if isinstance(joined_at, datetime):
        joined_at_str = joined_at.isoformat()
    else:
        joined_at_str = None

    return {
        "user_id": str(target_user.id),
        "email": target_user.email,
        "name": target_user.name,
        "avatar_url": target_user.avatar_url,
        "role": new_role,
        "joined_at": joined_at_str,
    }


async def remove_member(
    db: AsyncSession,
    legacy_id: UUID,
    target_user_id: UUID,
    actor_id: UUID,
) -> None:
    """Remove a member from the legacy.

    Rules:
    - Actor must be creator or admin
    - Actor can only remove roles at or below their level
    - Last creator cannot be removed
    """
    actor_member = await check_legacy_access(db, actor_id, legacy_id)

    if actor_member.role not in ("creator", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only creators and admins can remove members.",
        )

    result = await db.execute(
        select(LegacyMember).where(
            and_(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == target_user_id,
            )
        )
    )
    target_member = result.scalar_one_or_none()

    if not target_member:
        raise HTTPException(status_code=404, detail="Member not found.")

    if not can_manage_role(actor_member.role, target_member.role):
        raise HTTPException(
            status_code=403,
            detail=f"You cannot remove members with role {target_member.role}.",
        )

    # Check not removing last creator
    if target_member.role == "creator":
        creator_count_result = await db.execute(
            select(func.count())
            .select_from(LegacyMember)
            .where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.role == "creator",
                )
            )
        )
        creator_count = creator_count_result.scalar()
        if creator_count is not None and creator_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last creator.",
            )

    await db.delete(target_member)
    await db.commit()

    logger.info(
        "member.removed",
        extra={
            "legacy_id": str(legacy_id),
            "target_user_id": str(target_user_id),
            "actor_id": str(actor_id),
        },
    )


async def leave_legacy(
    db: AsyncSession,
    legacy_id: UUID,
    user_id: UUID,
) -> None:
    """Leave a legacy voluntarily.

    The last creator cannot leave.
    """
    result = await db.execute(
        select(LegacyMember).where(
            and_(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.user_id == user_id,
            )
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=404, detail="You are not a member of this legacy."
        )

    # Check not the last creator
    if member.role == "creator":
        creator_count_result = await db.execute(
            select(func.count())
            .select_from(LegacyMember)
            .where(
                and_(
                    LegacyMember.legacy_id == legacy_id,
                    LegacyMember.role == "creator",
                )
            )
        )
        creator_count = creator_count_result.scalar()
        if creator_count is not None and creator_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="You are the last creator. Promote someone else before leaving.",
            )

    await db.delete(member)
    await db.commit()

    logger.info(
        "member.left",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )
