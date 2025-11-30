"""Pydantic schemas for user-related API operations."""

from uuid import UUID

from pydantic import BaseModel


class UserSearchResult(BaseModel):
    """Schema for user search result."""

    id: UUID
    name: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}
