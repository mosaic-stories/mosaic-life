"""Service layer for legacy link operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.legacy import Legacy
from ..models.legacy_link import LegacyLink, LegacyLinkShare
from ..services.legacy import check_legacy_access
from ..services.notification import create_notification

logger = logging.getLogger(__name__)


async def create_link_request(
    db: AsyncSession,
    user_id: UUID,
    requester_legacy_id: UUID,
    target_legacy_id: UUID,
    person_id: UUID,
) -> LegacyLink:
    """Create a link request between two legacies about the same person.

    Validates:
    - Requester is creator/admin of requester legacy
    - Both legacies reference the same person_id
    - Cannot link a legacy to itself
    - No existing active/pending link between the pair
    """
    if requester_legacy_id == target_legacy_id:
        raise HTTPException(status_code=400, detail="Cannot link a legacy to itself")

    # Check requester has admin+ access
    await check_legacy_access(db, user_id, requester_legacy_id, required_role="admin")

    # Load both legacies
    req_result = await db.execute(
        select(Legacy).where(Legacy.id == requester_legacy_id)
    )
    requester_legacy = req_result.scalar_one_or_none()
    if not requester_legacy:
        raise HTTPException(status_code=404, detail="Requester legacy not found")

    tgt_result = await db.execute(select(Legacy).where(Legacy.id == target_legacy_id))
    target_legacy = tgt_result.scalar_one_or_none()
    if not target_legacy:
        raise HTTPException(status_code=404, detail="Target legacy not found")

    # Both must reference the same person
    if requester_legacy.person_id != person_id or target_legacy.person_id != person_id:
        raise HTTPException(
            status_code=400,
            detail="Both legacies must reference the same person",
        )

    # Check for existing link (either direction)
    existing_result = await db.execute(
        select(LegacyLink).where(
            or_(
                (LegacyLink.requester_legacy_id == requester_legacy_id)
                & (LegacyLink.target_legacy_id == target_legacy_id),
                (LegacyLink.requester_legacy_id == target_legacy_id)
                & (LegacyLink.target_legacy_id == requester_legacy_id),
            ),
            LegacyLink.status.in_(["pending", "active"]),
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A link already exists between these legacies",
        )

    link = LegacyLink(
        person_id=person_id,
        requester_legacy_id=requester_legacy_id,
        target_legacy_id=target_legacy_id,
        requested_by=user_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Notify target legacy creator (separate transaction via notification service)
    await create_notification(
        db=db,
        user_id=target_legacy.created_by,
        notification_type="link_request",
        title="Legacy Link Request",
        message=f'"{requester_legacy.name}" has requested to link with "{target_legacy.name}"',
        actor_id=user_id,
        resource_type="legacy_link",
        resource_id=link.id,
    )

    logger.info(
        "legacy_link.created",
        extra={
            "link_id": str(link.id),
            "requester_legacy_id": str(requester_legacy_id),
            "target_legacy_id": str(target_legacy_id),
        },
    )
    return link


async def respond_to_link(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
    action: str,
) -> LegacyLink:
    """Accept or reject a link request. Must be creator/admin of target legacy."""
    result = await db.execute(select(LegacyLink).where(LegacyLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    if link.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot respond to a link with status '{link.status}'",
        )

    # Must be admin+ of target legacy
    await check_legacy_access(db, user_id, link.target_legacy_id, required_role="admin")

    now = datetime.now(timezone.utc)
    if action == "accept":
        link.status = "active"
    elif action == "reject":
        link.status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    link.responded_by = user_id
    link.responded_at = now

    await db.commit()
    await db.refresh(link)

    logger.info(
        "legacy_link.responded",
        extra={
            "link_id": str(link_id),
            "action": action,
            "user_id": str(user_id),
        },
    )
    return link


async def revoke_link(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
) -> LegacyLink:
    """Revoke an active link. Either side's creator/admin can revoke."""
    result = await db.execute(select(LegacyLink).where(LegacyLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    if link.status != "active":
        raise HTTPException(status_code=400, detail="Can only revoke active links")

    # Check caller is admin+ of either side
    try:
        await check_legacy_access(
            db, user_id, link.requester_legacy_id, required_role="admin"
        )
    except HTTPException:
        await check_legacy_access(
            db, user_id, link.target_legacy_id, required_role="admin"
        )

    link.status = "revoked"
    link.revoked_by = user_id
    link.revoked_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(link)

    logger.info(
        "legacy_link.revoked",
        extra={"link_id": str(link_id), "user_id": str(user_id)},
    )
    return link


async def update_share_mode(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
    mode: str,
) -> LegacyLink:
    """Update the share mode for the caller's side of the link."""
    result = await db.execute(select(LegacyLink).where(LegacyLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    if link.status != "active":
        raise HTTPException(
            status_code=400, detail="Can only update share mode on active links"
        )

    # Determine which side the caller is on
    try:
        await check_legacy_access(
            db, user_id, link.requester_legacy_id, required_role="admin"
        )
        link.requester_share_mode = mode
    except HTTPException:
        await check_legacy_access(
            db, user_id, link.target_legacy_id, required_role="admin"
        )
        link.target_share_mode = mode

    await db.commit()
    await db.refresh(link)
    return link


async def share_resource(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
    resource_type: str,
    resource_id: UUID,
) -> LegacyLinkShare:
    """Share a resource (story/media) via an active link."""
    result = await db.execute(select(LegacyLink).where(LegacyLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    if link.status != "active":
        raise HTTPException(
            status_code=400, detail="Can only share resources on active links"
        )

    # Determine caller's legacy
    try:
        await check_legacy_access(
            db, user_id, link.requester_legacy_id, required_role="admin"
        )
        source_legacy_id = link.requester_legacy_id
    except HTTPException:
        await check_legacy_access(
            db, user_id, link.target_legacy_id, required_role="admin"
        )
        source_legacy_id = link.target_legacy_id

    share = LegacyLinkShare(
        legacy_link_id=link.id,
        source_legacy_id=source_legacy_id,
        resource_type=resource_type,
        resource_id=resource_id,
        shared_by=user_id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    logger.info(
        "legacy_link.resource_shared",
        extra={
            "link_id": str(link_id),
            "resource_type": resource_type,
            "resource_id": str(resource_id),
        },
    )
    return share


async def unshare_resource(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
    share_id: UUID,
) -> None:
    """Remove a shared resource from a link."""
    result = await db.execute(
        select(LegacyLinkShare).where(
            LegacyLinkShare.id == share_id,
            LegacyLinkShare.legacy_link_id == link_id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    # Check caller is admin+ of the source legacy
    await check_legacy_access(
        db, user_id, share.source_legacy_id, required_role="admin"
    )

    await db.delete(share)
    await db.commit()


async def list_links_for_user(
    db: AsyncSession,
    user_id: UUID,
) -> list[LegacyLink]:
    """List all links for legacies where user is creator/admin."""
    from ..models.legacy import LegacyMember

    # Find all legacy IDs where user is admin+
    member_result = await db.execute(
        select(LegacyMember.legacy_id).where(
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    legacy_ids = [row[0] for row in member_result]

    if not legacy_ids:
        return []

    result = await db.execute(
        select(LegacyLink)
        .options(
            selectinload(LegacyLink.requester_legacy),
            selectinload(LegacyLink.target_legacy),
            selectinload(LegacyLink.person),
        )
        .where(
            or_(
                LegacyLink.requester_legacy_id.in_(legacy_ids),
                LegacyLink.target_legacy_id.in_(legacy_ids),
            )
        )
        .order_by(LegacyLink.requested_at.desc())
    )
    return list(result.scalars().all())


async def get_link_detail(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
) -> LegacyLink:
    """Get a single link with access check."""
    from ..models.legacy import LegacyMember

    result = await db.execute(
        select(LegacyLink)
        .options(
            selectinload(LegacyLink.requester_legacy),
            selectinload(LegacyLink.target_legacy),
            selectinload(LegacyLink.person),
        )
        .where(LegacyLink.id == link_id)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Check caller is admin+ of either side
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "admin"]),
            LegacyMember.legacy_id.in_(
                [link.requester_legacy_id, link.target_legacy_id]
            ),
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized to view this link")

    return link


async def list_shares(
    db: AsyncSession,
    user_id: UUID,
    link_id: UUID,
) -> list[LegacyLinkShare]:
    """List shared resources for a link."""
    # Verify access first
    await get_link_detail(db, user_id, link_id)

    result = await db.execute(
        select(LegacyLinkShare)
        .where(LegacyLinkShare.legacy_link_id == link_id)
        .order_by(LegacyLinkShare.shared_at.desc())
    )
    return list(result.scalars().all())
