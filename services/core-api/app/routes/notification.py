"""Notification API routes."""

from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.notification import (
    NotificationResponse,
    NotificationUpdateRequest,
    UnreadCountResponse,
)
from ..services import notification as notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    request: Request,
    include_dismissed: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
) -> list[NotificationResponse]:
    """List notifications for the current user."""
    session = require_auth(request)
    return await notification_service.list_notifications(
        db, session.user_id, include_dismissed, limit, offset
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UnreadCountResponse:
    """Get unread notification count for the current user."""
    session = require_auth(request)
    return await notification_service.get_unread_count(db, session.user_id)


@router.patch("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: UUID,
    data: NotificationUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> NotificationResponse:
    """Update notification status (read/dismissed)."""
    session = require_auth(request)
    result = await notification_service.update_notification_status(
        db, notification_id, session.user_id, data.status
    )
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result


@router.post("/mark-all-read")
async def mark_all_read(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Mark all unread notifications as read."""
    session = require_auth(request)
    count = await notification_service.mark_all_as_read(db, session.user_id)
    return {"message": f"Marked {count} notifications as read", "count": count}
