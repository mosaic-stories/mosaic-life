"""Pydantic schemas for Person API."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PersonCreate(BaseModel):
    """Schema for creating a person (usually auto-created with legacy)."""

    canonical_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Best-known full name",
    )
    aliases: list[str] = Field(
        default_factory=list,
        description="Alternate names or nicknames",
    )
    birth_date: date | None = Field(None, description="Birth date")
    birth_date_approximate: bool = Field(
        False, description="Whether birth date is approximate"
    )
    death_date: date | None = Field(None, description="Death date")
    death_date_approximate: bool = Field(
        False, description="Whether death date is approximate"
    )
    locations: list[str] = Field(
        default_factory=list,
        description="Associated locations",
    )


class PersonResponse(BaseModel):
    """Schema for person response."""

    id: UUID
    canonical_name: str
    aliases: list[str]
    birth_date: date | None
    birth_date_approximate: bool
    death_date: date | None
    death_date_approximate: bool
    locations: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonMatchCandidate(BaseModel):
    """Schema for a person match candidate (privacy-safe)."""

    person_id: UUID
    canonical_name: str
    birth_year_range: str | None = Field(None, description="e.g. '1948-1952' or '1950'")
    death_year_range: str | None = Field(None, description="e.g. '2020'")
    legacy_count: int = Field(description="Number of legacies referencing this person")
    confidence: float = Field(
        description="Match confidence score 0.0-1.0", ge=0.0, le=1.0
    )


class PersonMatchResponse(BaseModel):
    """Response for match candidates endpoint."""

    candidates: list[PersonMatchCandidate]
