"""Pydantic schemas for Favorites API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FavoriteToggleRequest(BaseModel):
    """Request to toggle a favorite."""

    entity_type: Literal["story", "legacy", "media"] = Field(
        ..., description="Type of entity to favorite"
    )
    entity_id: UUID = Field(..., description="ID of the entity to favorite")


class FavoriteToggleResponse(BaseModel):
    """Response from toggling a favorite."""

    favorited: bool = Field(description="Whether the entity is now favorited")
    favorite_count: int = Field(description="Updated favorite count for the entity")


class FavoriteCheckResponse(BaseModel):
    """Response from batch-checking favorites."""

    favorites: dict[str, bool] = Field(
        description="Map of entity_id to favorited status"
    )


class FavoriteItem(BaseModel):
    """A single favorite with entity metadata."""

    id: UUID
    entity_type: str
    entity_id: UUID
    created_at: datetime
    entity: dict[str, Any] | None = Field(
        default=None,
        description="Entity summary data (shape varies by entity_type)",
    )

    model_config = {"from_attributes": True}


class FavoriteListResponse(BaseModel):
    """Response from listing favorites."""

    items: list[FavoriteItem]
    total: int
