"""Pydantic schemas for Legacy Link API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class LegacyLinkCreate(BaseModel):
    """Schema for creating a link request."""

    target_legacy_id: UUID = Field(..., description="Legacy to request a link with")
    person_id: UUID = Field(..., description="Shared Person ID")


class LegacyLinkRespond(BaseModel):
    """Schema for responding to a link request."""

    action: Literal["accept", "reject"] = Field(
        ..., description="Accept or reject the link request"
    )


class LegacyLinkShareCreate(BaseModel):
    """Schema for sharing a resource via a link."""

    resource_type: Literal["story", "media"] = Field(
        ..., description="Type of resource to share"
    )
    resource_id: UUID = Field(..., description="ID of the story or media to share")


class LegacyLinkShareModeUpdate(BaseModel):
    """Schema for updating share mode."""

    mode: Literal["selective", "all"] = Field(
        ..., description="Share mode: selective or all"
    )


class LegacyLinkShareResponse(BaseModel):
    """Schema for a shared resource."""

    id: UUID
    resource_type: str
    resource_id: UUID
    source_legacy_id: UUID
    shared_at: datetime
    shared_by: UUID

    model_config = {"from_attributes": True}


class LegacyLinkResponse(BaseModel):
    """Schema for legacy link response."""

    id: UUID
    person_id: UUID
    requester_legacy_id: UUID
    target_legacy_id: UUID
    status: str
    requester_share_mode: str
    target_share_mode: str
    requested_by: UUID
    responded_by: UUID | None
    requested_at: datetime
    responded_at: datetime | None
    revoked_at: datetime | None

    # Enriched fields (populated by service)
    requester_legacy_name: str | None = None
    target_legacy_name: str | None = None
    person_name: str | None = None

    model_config = {"from_attributes": True}
