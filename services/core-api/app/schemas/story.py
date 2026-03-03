# services/core-api/app/schemas/story.py
"""Pydantic schemas for Story API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from .associations import LegacyAssociationCreate, LegacyAssociationResponse


class StoryCreate(BaseModel):
    """Schema for creating a new story."""

    title: str = Field(..., min_length=1, max_length=500, description="Story title")
    content: str = Field(
        default="", max_length=50000, description="Story content in Markdown"
    )
    visibility: Literal["public", "private", "personal"] = Field(
        default="private",
        description="Visibility level: public, private (legacy members), or personal (author only)",
    )
    status: Literal["draft", "published"] = Field(
        default="published",
        description="Story status: draft (work in progress) or published",
    )
    legacies: list[LegacyAssociationCreate] = Field(
        ...,
        min_length=1,
        description="Legacies this story is about (at least one required)",
    )

    @field_validator("legacies")
    @classmethod
    def validate_has_primary(
        cls, v: list[LegacyAssociationCreate]
    ) -> list[LegacyAssociationCreate]:
        """Ensure at least one legacy has primary role."""
        if not any(leg.role == "primary" for leg in v):
            # Auto-promote first to primary
            if v:
                v[0].role = "primary"
        return v

    @model_validator(mode="after")
    def validate_content_for_published(self) -> "StoryCreate":
        """Published stories must have non-empty content."""
        if self.status == "published" and not self.content.strip():
            raise ValueError("Published stories must have content")
        return self


class StoryUpdate(BaseModel):
    """Schema for updating an existing story."""

    title: str | None = Field(
        None, min_length=1, max_length=500, description="Story title"
    )
    content: str | None = Field(
        None, min_length=1, max_length=50000, description="Story content in Markdown"
    )
    visibility: Literal["public", "private", "personal"] | None = Field(
        None,
        description="Visibility level",
    )
    legacies: list[LegacyAssociationCreate] | None = Field(
        None,
        min_length=1,
        description="Updated legacy associations",
    )


class StoryAuthorInfo(BaseModel):
    """Schema for story author information."""

    id: UUID
    name: str
    email: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class StorySummary(BaseModel):
    """Schema for story summary in lists."""

    id: UUID
    title: str
    content_preview: str = Field(description="Truncated preview of story content")
    author_id: UUID
    author_name: str
    visibility: str
    status: str
    legacies: list[LegacyAssociationResponse]
    shared_from: str | None = Field(
        default=None,
        description="Name of the linked legacy this story was shared from, if applicable",
    )
    favorite_count: int = Field(
        default=0, description="Number of times this story has been favorited"
    )
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StoryStatsResponse(BaseModel):
    """Story-specific stats for the authenticated user."""

    my_stories_count: int
    favorites_given_count: int
    stories_evolved_count: int
    legacies_written_for_count: int


class TopLegacyResponse(BaseModel):
    """A legacy ranked by story count for the user."""

    legacy_id: UUID
    legacy_name: str
    profile_image_url: str | None
    story_count: int


class StoryDetail(BaseModel):
    """Schema for full story details."""

    id: UUID
    author_id: UUID
    author_name: str
    author_email: str
    title: str
    content: str
    visibility: str
    status: str
    legacies: list[LegacyAssociationResponse]
    version_count: int | None = None
    has_draft: bool | None = None
    favorite_count: int = Field(
        default=0, description="Number of times this story has been favorited"
    )
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StoryResponse(BaseModel):
    """Schema for story creation/update response."""

    id: UUID
    title: str
    version_number: int | None = None
    visibility: str
    status: str
    legacies: list[LegacyAssociationResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
