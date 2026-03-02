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


class ActorSummary(BaseModel):
    """Minimal user info for social feed items."""

    id: UUID
    name: str
    avatar_url: str | None = None


class EntitySummary(BaseModel):
    """Summary of an entity referenced by activity."""

    name: str | None = None
    title: str | None = None
    profile_image_url: str | None = None
    content_preview: str | None = None
    biography: str | None = None
    visibility: str | None = None
    birth_date: str | None = None
    death_date: str | None = None
    filename: str | None = None
    author_name: str | None = None
    legacy_id: str | None = None
    legacy_name: str | None = None


class SocialFeedItem(BaseModel):
    """A single item in the social activity feed."""

    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    created_at: datetime
    metadata: dict[str, Any] | None = None
    actor: ActorSummary
    entity: EntitySummary | None = None


class SocialFeedResponse(BaseModel):
    """Response from the social feed endpoint."""

    items: list[SocialFeedItem]
    next_cursor: str | None = Field(
        default=None, description="ISO timestamp cursor for next page"
    )
    has_more: bool = False


class EnrichedRecentItem(BaseModel):
    """A recent item with full entity details."""

    entity_type: str
    entity_id: UUID
    last_action: str
    last_activity_at: datetime
    metadata: dict[str, Any] | None = None
    entity: EntitySummary | None = None


class EnrichedRecentItemsResponse(BaseModel):
    """Response from the enriched recent items endpoint."""

    items: list[EnrichedRecentItem]
    tracking_enabled: bool = True
