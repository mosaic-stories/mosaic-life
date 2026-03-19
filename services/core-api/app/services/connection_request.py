"""Service for connection requests."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.connection import Connection, ConnectionRequest
from ..models.relationship import Relationship
from ..models.user import User
from ..schemas.connection import ConnectionRequestResponse, ConnectionResponse

logger = logging.getLogger(__name__)

MAX_PENDING_REQUESTS = 20
COOLDOWN_DAYS = 30


def _is_pending_pair_integrity_error(exc: IntegrityError) -> bool:
    """Return True when the DB rejected a duplicate pending request pair."""
    message = str(exc.orig).lower() if exc.orig is not None else str(exc).lower()
    return "uq_connection_requests_pending_pair" in message


async def create_request(
    db: AsyncSession,
    from_user_id: UUID,
    to_user_id: UUID,
    relationship_type: str,
    message: str | None = None,
) -> ConnectionRequestResponse:
    """Create a connection request."""
    if from_user_id == to_user_id:
        raise HTTPException(status_code=400, detail="Cannot connect with yourself")

    # Check target user exists
    target = await db.execute(select(User).where(User.id == to_user_id))
    target_user = target.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Check no existing pending request in either direction
    existing = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.status == "pending",
            or_(
                and_(
                    ConnectionRequest.from_user_id == from_user_id,
                    ConnectionRequest.to_user_id == to_user_id,
                ),
                and_(
                    ConnectionRequest.from_user_id == to_user_id,
                    ConnectionRequest.to_user_id == from_user_id,
                ),
            ),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="A pending request already exists")

    # Check no existing active connection
    user_a_id = min(from_user_id, to_user_id)
    user_b_id = max(from_user_id, to_user_id)
    existing_conn = await db.execute(
        select(Connection).where(
            Connection.user_a_id == user_a_id,
            Connection.user_b_id == user_b_id,
            Connection.removed_at.is_(None),
        )
    )
    if existing_conn.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Already connected")

    # Check cooldown from previous decline
    now = datetime.now(timezone.utc)
    cooldown_check = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.from_user_id == from_user_id,
            ConnectionRequest.to_user_id == to_user_id,
            ConnectionRequest.status == "declined",
            ConnectionRequest.declined_cooldown_until > now,
        )
    )
    if cooldown_check.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=429,
            detail="Please wait before sending another request to this user",
        )

    # Check rate limit (max pending outgoing)
    pending_count_result = await db.execute(
        select(func.count())
        .select_from(ConnectionRequest)
        .where(
            ConnectionRequest.from_user_id == from_user_id,
            ConnectionRequest.status == "pending",
        )
    )
    pending_count = pending_count_result.scalar() or 0
    if pending_count >= MAX_PENDING_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=f"Maximum {MAX_PENDING_REQUESTS} pending requests allowed",
        )

    # Get sender info
    sender_result = await db.execute(select(User).where(User.id == from_user_id))
    sender = sender_result.scalar_one()

    req = ConnectionRequest(
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        relationship_type=relationship_type,
        message=message,
    )
    db.add(req)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if _is_pending_pair_integrity_error(exc):
            raise HTTPException(
                status_code=409, detail="A pending request already exists"
            ) from None
        raise
    await db.refresh(req)

    logger.info(
        "connection_request.created",
        extra={"from_user_id": str(from_user_id), "to_user_id": str(to_user_id)},
    )

    # Best-effort notification to target user
    try:
        from . import notification as notification_service

        await notification_service.create_notification(
            db,
            user_id=to_user_id,
            notification_type="connection_request_received",
            title="New connection request",
            message=f"{sender.name} wants to connect with you",
            link=(
                f"/connections?tab=requests&filter=all&focus=incoming&request={req.id}"
            ),
            actor_id=from_user_id,
            resource_type="connection_request",
            resource_id=req.id,
        )
    except Exception:
        logger.warning("connection_request.notification_failed", exc_info=True)

    return ConnectionRequestResponse(
        id=req.id,
        from_user_id=req.from_user_id,
        from_user_name=sender.name,
        from_user_username=sender.username,
        from_user_avatar_url=sender.avatar_url,
        to_user_id=req.to_user_id,
        to_user_name=target_user.name,
        to_user_username=target_user.username,
        to_user_avatar_url=target_user.avatar_url,
        relationship_type=req.relationship_type,
        message=req.message,
        status=req.status,
        created_at=req.created_at,
    )


async def accept_request(
    db: AsyncSession, request_id: UUID, user_id: UUID
) -> ConnectionResponse:
    """Accept a connection request."""
    req = await _get_request(db, request_id)

    if req.to_user_id != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to accept this request"
        )

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    now = datetime.now(timezone.utc)
    req.status = "accepted"
    req.resolved_at = now

    # Reuse a soft-deleted connection for the pair when reconnecting.
    user_a_id = min(req.from_user_id, req.to_user_id)
    user_b_id = max(req.from_user_id, req.to_user_id)

    existing_conn_result = await db.execute(
        select(Connection).where(
            Connection.user_a_id == user_a_id,
            Connection.user_b_id == user_b_id,
        )
    )
    conn = existing_conn_result.scalar_one_or_none()

    if conn is None:
        conn = Connection(user_a_id=user_a_id, user_b_id=user_b_id)
        db.add(conn)
        await db.flush()
    else:
        conn.removed_at = None
        conn.connected_at = now

    # Preserve existing sender notes on reconnect and only refresh the declared type.
    rel_result = await db.execute(
        select(Relationship).where(
            Relationship.owner_user_id == req.from_user_id,
            Relationship.connection_id == conn.id,
        )
    )
    rel = rel_result.scalar_one_or_none()
    if rel is None:
        rel = Relationship(
            owner_user_id=req.from_user_id,
            connection_id=conn.id,
            relationship_type=req.relationship_type,
        )
        db.add(rel)
    else:
        rel.relationship_type = req.relationship_type

    await db.commit()
    await db.refresh(conn)

    # Get the other user's info for response
    other_user_result = await db.execute(
        select(User).where(User.id == req.from_user_id)
    )
    other_user = other_user_result.scalar_one()

    logger.info(
        "connection_request.accepted",
        extra={"request_id": str(request_id), "connection_id": str(conn.id)},
    )

    # Best-effort graph sync
    try:
        from ..providers.registry import get_provider_registry

        registry = get_provider_registry()
        graph_adapter = registry.get_graph_adapter()
        if graph_adapter:
            user_a_node = f"user-{req.from_user_id}"
            user_b_node = f"user-{req.to_user_id}"
            await graph_adapter.upsert_node(
                "Person",
                user_a_node,
                {
                    "user_id": str(req.from_user_id),
                    "is_user": "true",
                    "source": "connection",
                },
            )
            await graph_adapter.upsert_node(
                "Person",
                user_b_node,
                {
                    "user_id": str(req.to_user_id),
                    "is_user": "true",
                    "source": "connection",
                },
            )
            await graph_adapter.upsert_relationship(
                "Person",
                user_a_node,
                "CONNECTED_TO",
                "Person",
                user_b_node,
                properties={
                    "relationship_type": req.relationship_type,
                    "source": "connection",
                    "connected_at": str(conn.connected_at),
                },
            )
    except Exception:
        logger.warning(
            "connection.graph_sync_failed",
            extra={"connection_id": str(conn.id)},
            exc_info=True,
        )

    # Best-effort notification to requester
    try:
        from . import notification as notification_service

        target_user_result = await db.execute(select(User).where(User.id == user_id))
        target_user = target_user_result.scalar_one()
        await notification_service.create_notification(
            db,
            user_id=req.from_user_id,
            notification_type="connection_request_accepted",
            title="Connection request accepted",
            message=f"{target_user.name} accepted your connection request",
            link=(f"/connections?tab=my-connections&filter=all&connection={conn.id}"),
            actor_id=user_id,
            resource_type="connection",
            resource_id=conn.id,
        )
    except Exception:
        logger.warning("connection_request.accept_notification_failed", exc_info=True)

    return ConnectionResponse(
        id=conn.id,
        user_id=other_user.id,
        display_name=other_user.name,
        username=other_user.username,
        avatar_url=other_user.avatar_url,
        connected_at=conn.connected_at,
    )


async def decline_request(db: AsyncSession, request_id: UUID, user_id: UUID) -> None:
    """Decline a connection request."""
    req = await _get_request(db, request_id)

    if req.to_user_id != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to decline this request"
        )

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    now = datetime.now(timezone.utc)
    req.status = "declined"
    req.resolved_at = now
    req.declined_cooldown_until = now + timedelta(days=COOLDOWN_DAYS)

    await db.commit()

    logger.info(
        "connection_request.declined",
        extra={"request_id": str(request_id)},
    )

    # Best-effort notification to requester
    try:
        from . import notification as notification_service

        await notification_service.create_notification(
            db,
            user_id=req.from_user_id,
            notification_type="connection_request_declined",
            title="Connection request update",
            message="Your connection request was not accepted at this time",
            link="/connections?tab=requests&filter=all&focus=outgoing",
            actor_id=user_id,
            resource_type="connection_request",
            resource_id=request_id,
        )
    except Exception:
        logger.warning("connection_request.decline_notification_failed", exc_info=True)


async def cancel_request(db: AsyncSession, request_id: UUID, user_id: UUID) -> None:
    """Cancel an outgoing connection request."""
    req = await _get_request(db, request_id)

    if req.from_user_id != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to cancel this request"
        )

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "cancelled"
    req.resolved_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        "connection_request.cancelled",
        extra={"request_id": str(request_id)},
    )


async def list_incoming(
    db: AsyncSession, user_id: UUID
) -> list[ConnectionRequestResponse]:
    """List pending incoming connection requests."""
    result = await db.execute(
        select(ConnectionRequest)
        .options(
            selectinload(ConnectionRequest.from_user),
            selectinload(ConnectionRequest.to_user),
        )
        .where(
            ConnectionRequest.to_user_id == user_id,
            ConnectionRequest.status == "pending",
        )
        .order_by(ConnectionRequest.created_at.desc())
    )
    requests = result.scalars().all()

    return [
        ConnectionRequestResponse(
            id=req.id,
            from_user_id=req.from_user_id,
            from_user_name=req.from_user.name,
            from_user_username=req.from_user.username,
            from_user_avatar_url=req.from_user.avatar_url,
            to_user_id=req.to_user_id,
            to_user_name=req.to_user.name,
            to_user_username=req.to_user.username,
            to_user_avatar_url=req.to_user.avatar_url,
            relationship_type=req.relationship_type,
            message=req.message,
            status=req.status,
            created_at=req.created_at,
        )
        for req in requests
    ]


async def list_outgoing(
    db: AsyncSession, user_id: UUID
) -> list[ConnectionRequestResponse]:
    """List pending outgoing connection requests."""
    result = await db.execute(
        select(ConnectionRequest)
        .options(
            selectinload(ConnectionRequest.from_user),
            selectinload(ConnectionRequest.to_user),
        )
        .where(
            ConnectionRequest.from_user_id == user_id,
            ConnectionRequest.status == "pending",
        )
        .order_by(ConnectionRequest.created_at.desc())
    )
    requests = result.scalars().all()

    return [
        ConnectionRequestResponse(
            id=req.id,
            from_user_id=req.from_user_id,
            from_user_name=req.from_user.name,
            from_user_username=req.from_user.username,
            from_user_avatar_url=req.from_user.avatar_url,
            to_user_id=req.to_user_id,
            to_user_name=req.to_user.name,
            to_user_username=req.to_user.username,
            to_user_avatar_url=req.to_user.avatar_url,
            relationship_type=req.relationship_type,
            message=req.message,
            status=req.status,
            created_at=req.created_at,
        )
        for req in requests
    ]


async def _get_request(db: AsyncSession, request_id: UUID) -> ConnectionRequest:
    """Get a connection request by ID."""
    result = await db.execute(
        select(ConnectionRequest).where(ConnectionRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Connection request not found")
    return req
