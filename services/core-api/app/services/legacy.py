"""Service layer for legacy operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import Legacy, LegacyMember
from ..models.user import User
from ..schemas.legacy import (
    LegacyCreate,
    LegacyMemberResponse,
    LegacyResponse,
    LegacySearchResponse,
    LegacyUpdate,
)

logger = logging.getLogger(__name__)

# Role hierarchy for permission checks
ROLE_HIERARCHY = {
    "creator": 3,
    "editor": 2,
    "member": 1,
    "pending": 0,
}


async def check_legacy_access(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    required_role: str = "member",
) -> LegacyMember:
    """Check if user has required role for legacy.

    Args:
        db: Database session
        user_id: User ID to check
        legacy_id: Legacy ID to check access for
        required_role: Minimum required role (default: "member")

    Returns:
        LegacyMember if authorized

    Raises:
        HTTPException: 403 if not authorized or not a member
    """
    # Find membership
    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        logger.warning(
            "legacy.access_denied.not_member",
            extra={
                "user_id": str(user_id),
                "legacy_id": str(legacy_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Not a member of this legacy",
        )

    if member.role == "pending":
        logger.warning(
            "legacy.access_denied.pending",
            extra={
                "user_id": str(user_id),
                "legacy_id": str(legacy_id),
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Membership pending approval",
        )

    # Check role hierarchy
    user_role_level = ROLE_HIERARCHY.get(member.role, 0)
    required_role_level = ROLE_HIERARCHY.get(required_role, 0)

    if user_role_level < required_role_level:
        logger.warning(
            "legacy.access_denied.insufficient_role",
            extra={
                "user_id": str(user_id),
                "legacy_id": str(legacy_id),
                "user_role": member.role,
                "required_role": required_role,
            },
        )
        raise HTTPException(
            status_code=403,
            detail=f"Requires {required_role} role",
        )

    return member


async def create_legacy(
    db: AsyncSession,
    user_id: UUID,
    data: LegacyCreate,
) -> LegacyResponse:
    """Create a new legacy.

    User automatically becomes the creator.

    Args:
        db: Database session
        user_id: User creating the legacy
        data: Legacy creation data

    Returns:
        Created legacy with creator role
    """
    # Create legacy
    legacy = Legacy(
        name=data.name,
        birth_date=data.birth_date,
        death_date=data.death_date,
        biography=data.biography,
        created_by=user_id,
    )
    db.add(legacy)
    await db.flush()  # Get the legacy ID

    # Add creator as member with creator role
    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=user_id,
        role="creator",
    )
    db.add(member)

    await db.commit()
    await db.refresh(legacy)

    logger.info(
        "legacy.created",
        extra={
            "legacy_id": str(legacy.id),
            "user_id": str(user_id),
            "name": legacy.name,
        },
    )

    # Load creator info
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    creator = result.scalar_one()

    return LegacyResponse(
        id=legacy.id,
        name=legacy.name,
        birth_date=legacy.birth_date,
        death_date=legacy.death_date,
        biography=legacy.biography,
        created_by=legacy.created_by,
        created_at=legacy.created_at,
        updated_at=legacy.updated_at,
        creator_email=creator.email,
        creator_name=creator.name,
    )


async def list_user_legacies(
    db: AsyncSession,
    user_id: UUID,
) -> list[LegacyResponse]:
    """List all legacies where user is a member.

    Args:
        db: Database session
        user_id: User ID

    Returns:
        List of legacies where user has membership (not pending)
    """
    result = await db.execute(
        select(Legacy)
        .join(LegacyMember)
        .options(selectinload(Legacy.creator))
        .where(
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
        .order_by(Legacy.created_at.desc())
    )
    legacies = result.scalars().all()

    logger.info(
        "legacy.list",
        extra={
            "user_id": str(user_id),
            "count": len(legacies),
        },
    )

    return [
        LegacyResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            biography=legacy.biography,
            created_by=legacy.created_by,
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
            creator_email=legacy.creator.email,
            creator_name=legacy.creator.name,
        )
        for legacy in legacies
    ]


async def search_legacies_by_name(
    db: AsyncSession,
    query: str,
) -> list[LegacySearchResponse]:
    """Search legacies by name (case-insensitive).

    Args:
        db: Database session
        query: Search query string

    Returns:
        List of matching legacies
    """
    # Use ILIKE for case-insensitive search
    result = await db.execute(
        select(Legacy)
        .where(Legacy.name.ilike(f"%{query}%"))
        .order_by(Legacy.created_at.desc())
        .limit(50)  # Limit results
    )
    legacies = result.scalars().all()

    logger.info(
        "legacy.search",
        extra={
            "query": query,
            "count": len(legacies),
        },
    )

    return [
        LegacySearchResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            created_at=legacy.created_at,
        )
        for legacy in legacies
    ]


async def get_legacy_detail(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> LegacyResponse:
    """Get legacy details.

    User must be a member to access.

    Args:
        db: Database session
        user_id: Requesting user ID
        legacy_id: Legacy ID

    Returns:
        Legacy details with members

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    # Check access (must be member)
    await check_legacy_access(db, user_id, legacy_id, required_role="member")

    # Load legacy with creator and members
    result = await db.execute(
        select(Legacy)
        .options(
            selectinload(Legacy.creator),
            selectinload(Legacy.members).selectinload(LegacyMember.user),
        )
        .where(Legacy.id == legacy_id)
    )
    legacy = result.scalar_one_or_none()

    if not legacy:
        logger.warning(
            "legacy.not_found",
            extra={
                "legacy_id": str(legacy_id),
                "user_id": str(user_id),
            },
        )
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    logger.info(
        "legacy.detail",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    # Build member responses
    members = [
        LegacyMemberResponse(
            user_id=member.user_id,
            email=member.user.email,
            name=member.user.name,
            role=member.role,
            joined_at=member.joined_at,
        )
        for member in legacy.members
    ]

    return LegacyResponse(
        id=legacy.id,
        name=legacy.name,
        birth_date=legacy.birth_date,
        death_date=legacy.death_date,
        biography=legacy.biography,
        created_by=legacy.created_by,
        created_at=legacy.created_at,
        updated_at=legacy.updated_at,
        creator_email=legacy.creator.email,
        creator_name=legacy.creator.name,
        members=members,
    )


async def request_join_legacy(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> dict[str, str]:
    """Request to join a legacy.

    Creates pending membership.

    Args:
        db: Database session
        user_id: User requesting to join
        legacy_id: Legacy ID

    Returns:
        Success message

    Raises:
        HTTPException: 404 if legacy not found, 400 if already a member
    """
    # Check if legacy exists
    result = await db.execute(
        select(Legacy).where(Legacy.id == legacy_id)
    )
    legacy = result.scalar_one_or_none()

    if not legacy:
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    # Check if already a member
    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    existing_member = result.scalar_one_or_none()

    if existing_member:
        if existing_member.role == "pending":
            raise HTTPException(
                status_code=400,
                detail="Join request already pending",
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Already a member of this legacy",
            )

    # Create pending membership
    member = LegacyMember(
        legacy_id=legacy_id,
        user_id=user_id,
        role="pending",
    )
    db.add(member)
    await db.commit()

    logger.info(
        "legacy.join_request",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    return {"message": "Join request submitted"}


async def approve_legacy_member(
    db: AsyncSession,
    approver_user_id: UUID,
    legacy_id: UUID,
    user_id: UUID,
) -> dict[str, str]:
    """Approve a pending join request.

    Only creators can approve.

    Args:
        db: Database session
        approver_user_id: User approving the request (must be creator)
        legacy_id: Legacy ID
        user_id: User being approved

    Returns:
        Success message

    Raises:
        HTTPException: 403 if not authorized, 404 if request not found
    """
    # Check approver has creator role
    await check_legacy_access(db, approver_user_id, legacy_id, required_role="creator")

    # Find pending membership
    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=404,
            detail="Join request not found",
        )

    if member.role != "pending":
        raise HTTPException(
            status_code=400,
            detail="User is not pending approval",
        )

    # Update role to member
    member.role = "member"
    await db.commit()

    logger.info(
        "legacy.member_approved",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
            "approver_id": str(approver_user_id),
        },
    )

    return {"message": "Member approved"}


async def update_legacy(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    data: LegacyUpdate,
) -> LegacyResponse:
    """Update a legacy.

    Only creator can update.

    Args:
        db: Database session
        user_id: User updating the legacy
        legacy_id: Legacy ID
        data: Update data

    Returns:
        Updated legacy

    Raises:
        HTTPException: 403 if not authorized, 404 if not found
    """
    # Check creator access
    await check_legacy_access(db, user_id, legacy_id, required_role="creator")

    # Load legacy
    result = await db.execute(
        select(Legacy)
        .options(selectinload(Legacy.creator))
        .where(Legacy.id == legacy_id)
    )
    legacy = result.scalar_one_or_none()

    if not legacy:
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    # Update fields
    if data.name is not None:
        legacy.name = data.name
    if data.birth_date is not None:
        legacy.birth_date = data.birth_date
    if data.death_date is not None:
        legacy.death_date = data.death_date
    if data.biography is not None:
        legacy.biography = data.biography

    legacy.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(legacy)

    logger.info(
        "legacy.updated",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    return LegacyResponse(
        id=legacy.id,
        name=legacy.name,
        birth_date=legacy.birth_date,
        death_date=legacy.death_date,
        biography=legacy.biography,
        created_by=legacy.created_by,
        created_at=legacy.created_at,
        updated_at=legacy.updated_at,
        creator_email=legacy.creator.email,
        creator_name=legacy.creator.name,
    )


async def delete_legacy(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> dict[str, str]:
    """Delete a legacy.

    Only creator can delete.

    Args:
        db: Database session
        user_id: User deleting the legacy
        legacy_id: Legacy ID

    Returns:
        Success message

    Raises:
        HTTPException: 403 if not authorized, 404 if not found
    """
    # Check creator access
    await check_legacy_access(db, user_id, legacy_id, required_role="creator")

    # Load legacy
    result = await db.execute(
        select(Legacy).where(Legacy.id == legacy_id)
    )
    legacy = result.scalar_one_or_none()

    if not legacy:
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    # Delete (cascade will handle members)
    await db.delete(legacy)
    await db.commit()

    logger.info(
        "legacy.deleted",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    return {"message": "Legacy deleted"}


async def remove_legacy_member(
    db: AsyncSession,
    remover_user_id: UUID,
    legacy_id: UUID,
    user_id: UUID,
) -> dict[str, str]:
    """Remove a member from a legacy.

    Only creator can remove members.

    Args:
        db: Database session
        remover_user_id: User removing the member (must be creator)
        legacy_id: Legacy ID
        user_id: User being removed

    Returns:
        Success message

    Raises:
        HTTPException: 403 if not authorized, 404 if member not found, 400 if trying to remove creator
    """
    # Check remover has creator role
    await check_legacy_access(db, remover_user_id, legacy_id, required_role="creator")

    # Find membership
    result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=404,
            detail="Member not found",
        )

    # Cannot remove creator
    if member.role == "creator":
        raise HTTPException(
            status_code=400,
            detail="Cannot remove legacy creator",
        )

    # Remove member
    await db.delete(member)
    await db.commit()

    logger.info(
        "legacy.member_removed",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
            "remover_id": str(remover_user_id),
        },
    )

    return {"message": "Member removed"}
