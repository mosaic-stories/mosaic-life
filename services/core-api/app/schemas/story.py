"""Pydantic schemas for Story API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class StoryCreate(BaseModel):
    """Schema for creating a new story."""

    legacy_id: UUID = Field(..., description="Legacy this story belongs to")
    title: str = Field(..., min_length=1, max_length=500, description="Story title")
    content: str = Field(..., min_length=1, max_length=50000, description="Story content in Markdown")
    visibility: Literal["public", "private", "personal"] = Field(
        default="private",
        description="Visibility level: public, private (legacy members), or personal (author only)",
    )


class StoryUpdate(BaseModel):
    """Schema for updating an existing story."""

    title: str | None = Field(None, min_length=1, max_length=500, description="Story title")
    content: str | None = Field(None, min_length=1, max_length=50000, description="Story content in Markdown")
    visibility: Literal["public", "private", "personal"] | None = Field(
        None,
        description="Visibility level",
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
    legacy_id: UUID
    title: str
    author_id: UUID
    author_name: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StoryDetail(BaseModel):
    """Schema for full story details."""

    id: UUID
    legacy_id: UUID
    legacy_name: str
    author_id: UUID
    author_name: str
    author_email: str
    title: str
    content: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StoryResponse(BaseModel):
    """Schema for story creation/update response."""

    id: UUID
    legacy_id: UUID
    title: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
