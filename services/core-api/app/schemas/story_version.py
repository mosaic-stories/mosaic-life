"""Pydantic schemas for Story Version API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StoryVersionSummary(BaseModel):
    """Version summary for list view (excludes content)."""

    version_number: int
    status: str
    source: str
    source_version: int | None = None
    change_summary: str | None = None
    stale: bool = False
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryVersionDetail(BaseModel):
    """Full version detail including content."""

    version_number: int
    title: str
    content: str
    status: str
    source: str
    source_version: int | None = None
    change_summary: str | None = None
    stale: bool = False
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryVersionListResponse(BaseModel):
    """Paginated version list response."""

    versions: list[StoryVersionSummary]
    total: int
    page: int
    page_size: int
    warning: str | None = None


class BulkDeleteRequest(BaseModel):
    """Request body for bulk version deletion."""

    version_numbers: list[int] = Field(..., min_length=1)
