"""Pydantic schemas for Legacy API."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


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


class LegacyUpdate(BaseModel):
    """Schema for updating an existing legacy."""

    name: str | None = Field(
        None, min_length=1, max_length=200, description="Name of the person"
    )
    birth_date: date | None = Field(None, description="Birth date")
    death_date: date | None = Field(None, description="Death date")
    biography: str | None = Field(None, description="Biography text")


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
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    # Optional: include creator info
    creator_email: str | None = None
    creator_name: str | None = None

    # Optional: include member info
    members: list[LegacyMemberResponse] | None = None

    model_config = {"from_attributes": True}


class LegacySearchResponse(BaseModel):
    """Schema for legacy search results."""

    id: UUID
    name: str
    birth_date: date | None
    death_date: date | None
    created_at: datetime

    # Similarity score for search ranking (0.0 to 1.0)
    similarity: float | None = None

    model_config = {"from_attributes": True}
