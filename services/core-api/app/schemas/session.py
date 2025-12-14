"""Schemas for user sessions."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SessionResponse(BaseModel):
    """Response containing session information."""

    id: UUID
    device_info: str | None
    location: str | None
    last_active_at: datetime
    created_at: datetime
    is_current: bool = False

    model_config = {"from_attributes": True}


class SessionListResponse(BaseModel):
    """Response containing list of sessions."""

    sessions: list[SessionResponse]
