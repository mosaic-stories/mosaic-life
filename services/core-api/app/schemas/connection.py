"""Pydantic schemas for user connections."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ConnectionRequestCreate(BaseModel):
    to_user_id: UUID
    relationship_type: str = Field(..., max_length=50)
    message: str | None = Field(None, max_length=500)


class ConnectionRequestResponse(BaseModel):
    id: UUID
    from_user_id: UUID
    from_user_name: str
    from_user_username: str
    from_user_avatar_url: str | None = None
    to_user_id: UUID
    to_user_name: str
    to_user_username: str
    to_user_avatar_url: str | None = None
    relationship_type: str
    message: str | None = None
    status: str
    created_at: datetime


class ConnectionResponse(BaseModel):
    id: UUID
    user_id: UUID
    display_name: str
    username: str | None = None
    avatar_url: str | None = None
    connected_at: datetime


class ConnectionDetailResponse(BaseModel):
    id: UUID
    user_id: UUID
    display_name: str
    username: str | None = None
    avatar_url: str | None = None
    connected_at: datetime
    relationship_type: str | None = None
    who_they_are_to_me: str | None = None
    who_i_am_to_them: str | None = None
    nicknames: list[str] | None = None
    character_traits: list[str] | None = None
