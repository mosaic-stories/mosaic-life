"""Pydantic schemas for notifications."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """Schema for notification response."""

    id: UUID
    type: str
    title: str
    message: str
    link: str | None = None
    actor_id: UUID | None = None
    actor_name: str | None = None
    actor_avatar_url: str | None = None
    resource_type: str | None = None
    resource_id: UUID | None = None
    status: str  # unread, read, dismissed
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationUpdateRequest(BaseModel):
    """Schema for updating notification status."""

    status: str = Field(
        ...,
        pattern="^(read|dismissed)$",
        description="New status for the notification",
    )


class UnreadCountResponse(BaseModel):
    """Schema for unread notification count."""

    count: int
