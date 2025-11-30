"""Notification service for managing user notifications."""

import logging
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.notification import Notification, NotificationStatus
from ..schemas.notification import NotificationResponse, UnreadCountResponse

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: UUID,
    notification_type: str,
    title: str,
    message: str,
    link: str | None = None,
    actor_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
) -> Notification:
    """Create a new notification for a user."""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        link=link,
        actor_id=actor_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    logger.info(
        "notification.created",
        extra={
            "notification_id": str(notification.id),
            "user_id": str(user_id),
            "type": notification_type,
        },
    )

    return notification


async def list_notifications(
    db: AsyncSession,
    user_id: UUID,
    include_dismissed: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[NotificationResponse]:
    """List notifications for a user."""
    query = (
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(Notification.user_id == user_id)
    )

    if not include_dismissed:
        query = query.where(Notification.status != NotificationStatus.DISMISSED.value)

    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    notifications = result.scalars().all()

    return [
        NotificationResponse(
            id=n.id,
            type=n.type,
            title=n.title,
            message=n.message,
            link=n.link,
            actor_id=n.actor_id,
            actor_name=n.actor.name if n.actor else None,
            actor_avatar_url=n.actor.avatar_url if n.actor else None,
            resource_type=n.resource_type,
            resource_id=n.resource_id,
            status=n.status,
            created_at=n.created_at,
        )
        for n in notifications
    ]


async def get_unread_count(db: AsyncSession, user_id: UUID) -> UnreadCountResponse:
    """Get count of unread notifications for a user."""
    result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(
                Notification.user_id == user_id,
                Notification.status == NotificationStatus.UNREAD.value,
            )
        )
    )
    count = result.scalar() or 0
    return UnreadCountResponse(count=count)


async def update_notification_status(
    db: AsyncSession,
    notification_id: UUID,
    user_id: UUID,
    new_status: str,
) -> NotificationResponse | None:
    """Update the status of a notification."""
    result = await db.execute(
        select(Notification)
        .options(selectinload(Notification.actor))
        .where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        return None

    notification.status = new_status
    await db.commit()
    await db.refresh(notification)

    logger.info(
        "notification.status_updated",
        extra={
            "notification_id": str(notification_id),
            "user_id": str(user_id),
            "new_status": new_status,
        },
    )

    return NotificationResponse(
        id=notification.id,
        type=notification.type,
        title=notification.title,
        message=notification.message,
        link=notification.link,
        actor_id=notification.actor_id,
        actor_name=notification.actor.name if notification.actor else None,
        actor_avatar_url=notification.actor.avatar_url if notification.actor else None,
        resource_type=notification.resource_type,
        resource_id=notification.resource_id,
        status=notification.status,
        created_at=notification.created_at,
    )


async def mark_all_as_read(db: AsyncSession, user_id: UUID) -> int:
    """Mark all unread notifications as read for a user."""
    result: CursorResult[tuple[Notification]] = await db.execute(
        update(Notification)
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.status == NotificationStatus.UNREAD.value,
            )
        )
        .values(status=NotificationStatus.READ.value)
    )
    await db.commit()

    count: int = result.rowcount or 0
    logger.info(
        "notification.mark_all_read",
        extra={"user_id": str(user_id), "count": count},
    )

    return count
