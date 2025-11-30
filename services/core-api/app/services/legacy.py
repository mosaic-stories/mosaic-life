"""Service layer for legacy operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..adapters.storage import get_storage_adapter
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

# Role hierarchy for permission checks (new 4-tier model)
ROLE_LEVELS: dict[str, int] = {
    "creator": 4,
    "admin": 3,
    "advocate": 2,
    "admirer": 1,
}

# Legacy role hierarchy (deprecated, kept for backwards compatibility during migration)
ROLE_HIERARCHY = {
    "creator": 4,
    "admin": 3,
    "advocate": 2,
    "admirer": 1,
    # Old role names mapped to new levels for transition period
    "editor": 3,  # editor -> admin
    "member": 2,  # member -> advocate
    "pending": 0,
}


def can_manage_role(actor_role: str, target_role: str) -> bool:
    """Check if actor can manage (invite, demote, remove) target role.

    Rules:
    - Creator can manage all roles including other creators
    - Admin can manage admin, advocate, admirer
    - Advocate can manage advocate, admirer
    - Admirer cannot manage anyone
    """
    actor_level = ROLE_LEVELS.get(actor_role, 0)
    target_level = ROLE_LEVELS.get(target_role, 0)

    # Admirer cannot manage anyone
    if actor_role == "admirer":
        return False

    return actor_level >= target_level


def can_invite_role(actor_role: str, target_role: str) -> bool:
    """Check if actor can invite someone at target role level.

    Same rules as can_manage_role.
    """
    return can_manage_role(actor_role, target_role)


def get_profile_image_url(legacy: Legacy) -> str | None:
    """Get the download URL for a legacy's profile image."""
    if not legacy.profile_image or not legacy.profile_image.storage_path:
        return None
    storage = get_storage_adapter()
    return storage.generate_download_url(legacy.profile_image.storage_path)


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
        visibility=data.visibility,
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
            "legacy_name": legacy.name,
        },
    )

    # Load creator info
    result = await db.execute(select(User).where(User.id == user_id))
    creator = result.scalar_one()

    return LegacyResponse(
        id=legacy.id,
        name=legacy.name,
        birth_date=legacy.birth_date,
        death_date=legacy.death_date,
        biography=legacy.biography,
        visibility=legacy.visibility,
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
        .options(
            selectinload(Legacy.creator),
            selectinload(Legacy.profile_image),
        )
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
            visibility=legacy.visibility,
            created_by=legacy.created_by,
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
            creator_email=legacy.creator.email,
            creator_name=legacy.creator.name,
            profile_image_id=legacy.profile_image_id,
            profile_image_url=get_profile_image_url(legacy),
        )
        for legacy in legacies
    ]


async def search_legacies_by_name(
    db: AsyncSession,
    query: str,
    user_id: UUID | None = None,
) -> list[LegacySearchResponse]:
    """Search legacies by name (case-insensitive).

    Args:
        db: Database session
        query: Search query string
        user_id: Current user ID (None if unauthenticated)

    Returns:
        List of matching legacies user can access
    """
    from sqlalchemy import or_

    # Build base query
    base_query = select(Legacy).where(Legacy.name.ilike(f"%{query}%"))

    # Apply visibility filtering
    if user_id is None:
        # Unauthenticated: only public legacies
        base_query = base_query.where(Legacy.visibility == "public")
    else:
        # Authenticated: public + private legacies user is member of
        member_subquery = (
            select(LegacyMember.legacy_id)
            .where(
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
            .scalar_subquery()
        )
        base_query = base_query.where(
            or_(
                Legacy.visibility == "public",
                Legacy.id.in_(member_subquery),
            )
        )

    base_query = base_query.order_by(Legacy.created_at.desc()).limit(50)

    result = await db.execute(base_query)
    legacies = result.scalars().all()

    logger.info(
        "legacy.search",
        extra={
            "query": query,
            "count": len(legacies),
            "user_id": str(user_id) if user_id else None,
        },
    )

    return [
        LegacySearchResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            created_at=legacy.created_at,
            visibility=legacy.visibility,
        )
        for legacy in legacies
    ]


async def explore_legacies(
    db: AsyncSession,
    limit: int = 20,
    user_id: UUID | None = None,
    visibility_filter: str = "all",
) -> list[LegacyResponse]:
    """Get legacies for exploration.

    Args:
        db: Database session
        limit: Maximum number of legacies to return
        user_id: Current user ID (None if unauthenticated)
        visibility_filter: Filter by visibility ('all', 'public', 'private')

    Returns:
        List of legacies with creator info
    """
    from sqlalchemy import or_

    # Build base query
    query = (
        select(Legacy)
        .options(
            selectinload(Legacy.creator),
            selectinload(Legacy.members).selectinload(LegacyMember.user),
            selectinload(Legacy.profile_image),
        )
    )

    # Apply visibility filtering
    if user_id is None:
        # Unauthenticated: only public legacies
        query = query.where(Legacy.visibility == "public")
    elif visibility_filter == "public":
        # Authenticated, filter public only
        query = query.where(Legacy.visibility == "public")
    elif visibility_filter == "private":
        # Authenticated, filter private only (must be member)
        query = query.join(LegacyMember).where(
            Legacy.visibility == "private",
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    else:
        # 'all': public legacies + private legacies user is member of
        # Use subquery to check membership for private legacies
        member_subquery = (
            select(LegacyMember.legacy_id)
            .where(
                LegacyMember.user_id == user_id,
                LegacyMember.role != "pending",
            )
            .scalar_subquery()
        )
        query = query.where(
            or_(
                Legacy.visibility == "public",
                Legacy.id.in_(member_subquery),
            )
        )

    query = query.order_by(Legacy.created_at.desc()).limit(limit)

    result = await db.execute(query)
    legacies = result.scalars().unique().all()

    logger.info(
        "legacy.explore",
        extra={
            "count": len(legacies),
            "user_id": str(user_id) if user_id else None,
            "visibility_filter": visibility_filter,
        },
    )

    return [
        LegacyResponse(
            id=legacy.id,
            name=legacy.name,
            birth_date=legacy.birth_date,
            death_date=legacy.death_date,
            biography=legacy.biography,
            visibility=legacy.visibility,
            created_by=legacy.created_by,
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
            creator_email=legacy.creator.email if legacy.creator else None,
            creator_name=legacy.creator.name if legacy.creator else None,
            members=[
                LegacyMemberResponse(
                    user_id=member.user_id,
                    email=member.user.email if member.user else "",
                    name=member.user.name if member.user else "",
                    role=member.role,
                    joined_at=member.joined_at,
                )
                for member in legacy.members
                if member.role != "pending"
            ]
            if legacy.members
            else [],
            profile_image_id=legacy.profile_image_id,
            profile_image_url=get_profile_image_url(legacy),
        )
        for legacy in legacies
    ]


async def get_legacy_public(
    db: AsyncSession,
    legacy_id: UUID,
) -> LegacyResponse:
    """Get legacy details for public viewing (no auth required).

    Only returns public legacies. Private legacies return 404.

    Args:
        db: Database session
        legacy_id: Legacy ID

    Returns:
        Legacy details with members

    Raises:
        HTTPException: 404 if not found or if legacy is private
    """
    # Load legacy with creator and members (only if public)
    result = await db.execute(
        select(Legacy)
        .options(
            selectinload(Legacy.creator),
            selectinload(Legacy.members).selectinload(LegacyMember.user),
            selectinload(Legacy.profile_image),
        )
        .where(Legacy.id == legacy_id, Legacy.visibility == "public")
    )
    legacy = result.scalar_one_or_none()

    if not legacy:
        logger.warning(
            "legacy.not_found.public",
            extra={
                "legacy_id": str(legacy_id),
            },
        )
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    logger.info(
        "legacy.detail.public",
        extra={
            "legacy_id": str(legacy_id),
        },
    )

    # Build member responses
    members = [
        LegacyMemberResponse(
            user_id=member.user_id,
            email=member.user.email if member.user else "",
            name=member.user.name if member.user else "",
            role=member.role,
            joined_at=member.joined_at,
        )
        for member in legacy.members
        if member.role != "pending"
    ]

    return LegacyResponse(
        id=legacy.id,
        name=legacy.name,
        birth_date=legacy.birth_date,
        death_date=legacy.death_date,
        biography=legacy.biography,
        visibility=legacy.visibility,
        created_by=legacy.created_by,
        created_at=legacy.created_at,
        updated_at=legacy.updated_at,
        creator_email=legacy.creator.email if legacy.creator else None,
        creator_name=legacy.creator.name if legacy.creator else None,
        members=members,
        profile_image_id=legacy.profile_image_id,
        profile_image_url=get_profile_image_url(legacy),
    )


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
            selectinload(Legacy.profile_image),
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
        visibility=legacy.visibility,
        created_by=legacy.created_by,
        created_at=legacy.created_at,
        updated_at=legacy.updated_at,
        creator_email=legacy.creator.email,
        creator_name=legacy.creator.name,
        members=members,
        profile_image_id=legacy.profile_image_id,
        profile_image_url=get_profile_image_url(legacy),
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
    result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = result.scalar_one_or_none()

    if not legacy:
        raise HTTPException(
            status_code=404,
            detail="Legacy not found",
        )

    # Check if already a member
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    existing_member: LegacyMember | None = member_result.scalar_one_or_none()

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
    if data.visibility is not None:
        legacy.visibility = data.visibility

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
        visibility=legacy.visibility,
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
    result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
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
