"""Pydantic schemas for Tag API."""

from uuid import UUID

from pydantic import BaseModel, Field


class TagResponse(BaseModel):
    """Tag in API responses."""

    id: UUID
    name: str

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    """Request to add a tag to media."""

    name: str = Field(..., min_length=1, max_length=100)


class TagListResponse(BaseModel):
    """List of tags for a legacy."""

    tags: list[TagResponse]
