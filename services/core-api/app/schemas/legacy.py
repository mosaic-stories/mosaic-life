"""Pydantic schemas for Legacy API."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .member_profile import GenderType


class LegacyCreate(BaseModel):
    """Schema for creating a new legacy."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Name of the person being remembered",
    )
    birth_date: date | None = Field(None, description="Birth date (optional)")
    death_date: date | None = Field(None, description="Death date (optional)")
    biography: str | None = Field(None, description="Biography text (optional)")
    visibility: Literal["public", "private"] = Field(
        default="private",
        description="Legacy visibility: 'public' (anyone can view) or 'private' (members only)",
    )
    person_id: UUID | None = Field(
        None,
        description="Optional: link to existing Person. If not provided, a Person is auto-created.",
    )


class LegacyUpdate(BaseModel):
    """Schema for updating an existing legacy."""

    name: str | None = Field(
        None, min_length=1, max_length=200, description="Name of the person"
    )
    birth_date: date | None = Field(None, description="Birth date")
    death_date: date | None = Field(None, description="Death date")
    biography: str | None = Field(None, description="Biography text")
    visibility: Literal["public", "private"] | None = Field(
        default=None,
        description="Legacy visibility: 'public' or 'private'",
    )
    gender: GenderType | None = Field(None, description="Gender of the legacy subject")


class LegacyMemberResponse(BaseModel):
    """Schema for legacy member information."""

    user_id: UUID
    email: str
    name: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class LegacyResponse(BaseModel):
    """Schema for legacy response."""

    id: UUID
    name: str
    birth_date: date | None
    death_date: date | None
    biography: str | None
    gender: str | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    # Visibility
    visibility: str = "private"

    # Optional: include creator info
    creator_email: str | None = None
    creator_name: str | None = None

    # Optional: include member info
    members: list[LegacyMemberResponse] | None = None
    current_user_role: str = Field(
        default="admirer",
        description="Current user's membership role for this legacy",
    )

    # Person
    person_id: UUID | None = None

    # Profile image
    profile_image_id: UUID | None = None
    profile_image_url: str | None = None

    favorite_count: int = Field(
        default=0, description="Number of times this legacy has been favorited"
    )
    story_count: int = Field(
        default=0, description="Number of stories associated with this legacy"
    )

    model_config = {"from_attributes": True}


class LegacyScopeCounts(BaseModel):
    """Filter counts for legacies hub."""

    all: int
    created: int
    connected: int


class LegacyScopedResponse(BaseModel):
    """Legacies list with scope filter counts."""

    items: list[LegacyResponse]
    counts: LegacyScopeCounts


class LegacySearchResponse(BaseModel):
    """Schema for legacy search results."""

    id: UUID
    name: str
    birth_date: date | None
    death_date: date | None
    created_at: datetime

    # Visibility
    visibility: str = "private"

    # Similarity score for search ranking (0.0 to 1.0)
    similarity: float | None = None

    model_config = {"from_attributes": True}
