"""Pydantic schemas for legacy access requests."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LegacyAccessRequestCreate(BaseModel):
    requested_role: str = Field(..., pattern="^(advocate|admirer)$")
    message: str | None = Field(None, max_length=500)


class LegacyAccessRequestResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_name: str
    user_avatar_url: str | None = None
    legacy_id: UUID
    legacy_name: str
    requested_role: str
    assigned_role: str | None = None
    message: str | None = None
    status: str
    connected_members: list["ConnectedMemberInfo"] | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class ConnectedMemberInfo(BaseModel):
    user_id: UUID
    display_name: str
    avatar_url: str | None = None
    role: str


class OutgoingAccessRequestResponse(BaseModel):
    id: UUID
    legacy_id: UUID
    legacy_name: str
    requested_role: str
    status: str
    created_at: datetime


LegacyAccessRequestResponse.model_rebuild()
