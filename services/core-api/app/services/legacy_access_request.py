"""Service for legacy access requests."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.connection import Connection
from ..models.legacy import Legacy, LegacyMember
from ..models.legacy_access_request import LegacyAccessRequest
from ..models.user import User
from ..schemas.legacy_access_request import (
    ConnectedMemberInfo,
    LegacyAccessRequestResponse,
    OutgoingAccessRequestResponse,
)

logger = logging.getLogger(__name__)

MAX_PENDING_REQUESTS = 10


async def submit_request(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    requested_role: str,
    message: str | None = None,
) -> LegacyAccessRequestResponse:
    """Submit a request to join a legacy."""
    # Check legacy exists
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one_or_none()
    if legacy is None:
        raise HTTPException(status_code=404, detail="Legacy not found")

    # Check not already a member
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
        )
    )
    if member_result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Already a member of this legacy")

    # Check no existing pending request
    pending_result = await db.execute(
        select(LegacyAccessRequest).where(
            LegacyAccessRequest.user_id == user_id,
            LegacyAccessRequest.legacy_id == legacy_id,
            LegacyAccessRequest.status == "pending",
        )
    )
    if pending_result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="A pending request already exists")

    # Check rate limit
    count_result = await db.execute(
        select(func.count())
        .select_from(LegacyAccessRequest)
        .where(
            LegacyAccessRequest.user_id == user_id,
            LegacyAccessRequest.status == "pending",
        )
    )
    count = count_result.scalar() or 0
    if count >= MAX_PENDING_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=f"Maximum {MAX_PENDING_REQUESTS} pending access requests allowed",
        )

    # Get user info
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one()

    req = LegacyAccessRequest(
        user_id=user_id,
        legacy_id=legacy_id,
        requested_role=requested_role,
        message=message,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    logger.info(
        "legacy_access_request.submitted",
        extra={"user_id": str(user_id), "legacy_id": str(legacy_id)},
    )

    # Notify admins/creators
    try:
        from . import notification as notification_service

        admin_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.legacy_id == legacy_id,
                LegacyMember.role.in_(["creator", "admin"]),
            )
        )
        admins = admin_result.scalars().all()
        for admin in admins:
            await notification_service.create_notification(
                db,
                user_id=admin.user_id,
                notification_type="legacy_access_request_received",
                title="New access request",
                message=f"{user.name} has requested to join {legacy.name}",
                actor_id=user_id,
                resource_type="legacy_access_request",
                resource_id=req.id,
            )
    except Exception:
        logger.warning("legacy_access_request.notification_failed", exc_info=True)

    return LegacyAccessRequestResponse(
        id=req.id,
        user_id=req.user_id,
        user_name=user.name,
        user_avatar_url=user.avatar_url,
        legacy_id=req.legacy_id,
        legacy_name=legacy.name,
        requested_role=req.requested_role,
        message=req.message,
        status=req.status,
        created_at=req.created_at,
    )


async def list_pending(
    db: AsyncSession,
    legacy_id: UUID,
    admin_user_id: UUID,
) -> list[LegacyAccessRequestResponse]:
    """List pending access requests for a legacy (admin only)."""
    # Verify admin
    admin_check = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == admin_user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    if admin_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.execute(
        select(LegacyAccessRequest)
        .options(
            selectinload(LegacyAccessRequest.user),
            selectinload(LegacyAccessRequest.legacy),
        )
        .where(
            LegacyAccessRequest.legacy_id == legacy_id,
            LegacyAccessRequest.status == "pending",
        )
        .order_by(LegacyAccessRequest.created_at.desc())
    )
    requests = result.scalars().all()

    responses = []
    for req in requests:
        # Find connected members for context
        connected_members = await _get_connected_members(db, req.user_id, legacy_id)

        responses.append(
            LegacyAccessRequestResponse(
                id=req.id,
                user_id=req.user_id,
                user_name=req.user.name,
                user_avatar_url=req.user.avatar_url,
                legacy_id=req.legacy_id,
                legacy_name=req.legacy.name,
                requested_role=req.requested_role,
                message=req.message,
                status=req.status,
                connected_members=connected_members if connected_members else None,
                created_at=req.created_at,
            )
        )

    return responses


async def approve_request(
    db: AsyncSession,
    request_id: UUID,
    admin_user_id: UUID,
    assigned_role: str | None = None,
) -> LegacyAccessRequestResponse:
    """Approve a legacy access request."""
    req = await _get_request(db, request_id)

    # Verify admin
    admin_check = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == req.legacy_id,
            LegacyMember.user_id == admin_user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    if admin_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    role = assigned_role or req.requested_role
    now = datetime.now(timezone.utc)
    req.status = "approved"
    req.assigned_role = role
    req.resolved_by = admin_user_id
    req.resolved_at = now

    # Create legacy member
    member = LegacyMember(
        legacy_id=req.legacy_id,
        user_id=req.user_id,
        role=role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(req)

    # Load related objects for response
    user_result = await db.execute(select(User).where(User.id == req.user_id))
    user = user_result.scalar_one()
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == req.legacy_id))
    legacy = legacy_result.scalar_one()

    logger.info(
        "legacy_access_request.approved",
        extra={"request_id": str(request_id), "role": role},
    )

    # Notify requester
    try:
        from . import notification as notification_service

        await notification_service.create_notification(
            db,
            user_id=req.user_id,
            notification_type="legacy_access_request_approved",
            title="Access request approved",
            message=f"Your request to join {legacy.name} has been approved",
            actor_id=admin_user_id,
            resource_type="legacy",
            resource_id=req.legacy_id,
        )
    except Exception:
        logger.warning(
            "legacy_access_request.approve_notification_failed", exc_info=True
        )

    return LegacyAccessRequestResponse(
        id=req.id,
        user_id=req.user_id,
        user_name=user.name,
        user_avatar_url=user.avatar_url,
        legacy_id=req.legacy_id,
        legacy_name=legacy.name,
        requested_role=req.requested_role,
        assigned_role=req.assigned_role,
        message=req.message,
        status=req.status,
        created_at=req.created_at,
        resolved_at=req.resolved_at,
    )


async def decline_request(
    db: AsyncSession,
    request_id: UUID,
    admin_user_id: UUID,
) -> None:
    """Decline a legacy access request."""
    req = await _get_request(db, request_id)

    # Verify admin
    admin_check = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == req.legacy_id,
            LegacyMember.user_id == admin_user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    if admin_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "declined"
    req.resolved_by = admin_user_id
    req.resolved_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        "legacy_access_request.declined",
        extra={"request_id": str(request_id)},
    )

    # Load legacy for notification
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == req.legacy_id))
    legacy = legacy_result.scalar_one()

    # Notify requester
    try:
        from . import notification as notification_service

        await notification_service.create_notification(
            db,
            user_id=req.user_id,
            notification_type="legacy_access_request_declined",
            title="Access request update",
            message=f"Your request to join {legacy.name} was not approved at this time",
            actor_id=admin_user_id,
            resource_type="legacy_access_request",
            resource_id=request_id,
        )
    except Exception:
        logger.warning(
            "legacy_access_request.decline_notification_failed", exc_info=True
        )


async def list_outgoing(
    db: AsyncSession, user_id: UUID
) -> list[OutgoingAccessRequestResponse]:
    """List a user's pending access requests."""
    result = await db.execute(
        select(LegacyAccessRequest)
        .options(selectinload(LegacyAccessRequest.legacy))
        .where(
            LegacyAccessRequest.user_id == user_id,
            LegacyAccessRequest.status == "pending",
        )
        .order_by(LegacyAccessRequest.created_at.desc())
    )
    requests = result.scalars().all()

    return [
        OutgoingAccessRequestResponse(
            id=req.id,
            legacy_id=req.legacy_id,
            legacy_name=req.legacy.name,
            requested_role=req.requested_role,
            status=req.status,
            created_at=req.created_at,
        )
        for req in requests
    ]


async def _get_request(db: AsyncSession, request_id: UUID) -> LegacyAccessRequest:
    """Get a legacy access request by ID."""
    result = await db.execute(
        select(LegacyAccessRequest).where(LegacyAccessRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    return req


async def _get_connected_members(
    db: AsyncSession, requester_user_id: UUID, legacy_id: UUID
) -> list[ConnectedMemberInfo]:
    """Find legacy members who are connected to the requester."""
    from sqlalchemy import or_

    # Get all connections for the requester
    connections_result = await db.execute(
        select(Connection).where(
            or_(
                Connection.user_a_id == requester_user_id,
                Connection.user_b_id == requester_user_id,
            ),
            Connection.removed_at.is_(None),
        )
    )
    connections = connections_result.scalars().all()

    connected_user_ids = set()
    for conn in connections:
        other_id = (
            conn.user_b_id if conn.user_a_id == requester_user_id else conn.user_a_id
        )
        connected_user_ids.add(other_id)

    if not connected_user_ids:
        return []

    # Find which connected users are members of this legacy
    members_result = await db.execute(
        select(LegacyMember)
        .options(selectinload(LegacyMember.user))
        .where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id.in_(connected_user_ids),
        )
    )
    members = members_result.scalars().all()

    return [
        ConnectedMemberInfo(
            user_id=m.user_id,
            display_name=m.user.name,
            avatar_url=m.user.avatar_url,
            role=m.role,
        )
        for m in members
    ]
