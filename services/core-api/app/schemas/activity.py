"""Pydantic schemas for Activity Tracking API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


EntityType = Literal["legacy", "story", "media", "conversation"]

Action = Literal[
    "viewed",
    "created",
    "updated",
    "deleted",
    "favorited",
    "unfavorited",
    "shared",
    "joined",
    "invited",
    "ai_conversation_started",
    "ai_story_evolved",
]


class ActivityItem(BaseModel):
    """A single activity entry."""

    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    metadata: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityFeedResponse(BaseModel):
    """Response from the activity feed endpoint."""

    items: list[ActivityItem]
    next_cursor: str | None = Field(
        default=None, description="ISO timestamp cursor for next page"
    )
    has_more: bool = False
    tracking_enabled: bool = True


class RecentItem(BaseModel):
    """A deduplicated recent item."""

    entity_type: str
    entity_id: UUID
    last_action: str
    last_activity_at: datetime
    metadata: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


class RecentItemsResponse(BaseModel):
    """Response from the recent items endpoint."""

    items: list[RecentItem]
    tracking_enabled: bool = True


class CleanupResponse(BaseModel):
    """Response from the cleanup endpoint."""

    deleted_count: int
