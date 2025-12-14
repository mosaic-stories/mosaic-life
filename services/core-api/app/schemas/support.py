"""Schemas for support requests."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SupportContext(BaseModel):
    """Context captured with support request."""

    page_url: str
    timestamp: datetime
    user_agent: str
    legacy_id: str | None = None
    session_duration_seconds: int | None = None
    recent_errors: list[str] = Field(default_factory=list)


class SupportRequestCreate(BaseModel):
    """Request to create a support ticket."""

    category: str = Field(
        ...,
        pattern="^(general_question|bug_report|feature_request|account_issue|other)$",
        description="Support request category",
    )
    subject: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=2000)
    context: SupportContext


class SupportRequestResponse(BaseModel):
    """Response after creating support request."""

    id: UUID
    category: str
    subject: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
