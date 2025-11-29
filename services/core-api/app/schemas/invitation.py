"""Pydantic schemas for invitations."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class InvitationCreate(BaseModel):
    """Schema for creating an invitation."""

    email: EmailStr = Field(..., description="Email address to invite")
    role: str = Field(
        default="advocate",
        pattern="^(creator|admin|advocate|admirer)$",
        description="Role to grant upon acceptance",
    )


class InvitationResponse(BaseModel):
    """Schema for invitation response."""

    id: UUID
    legacy_id: UUID
    email: str
    role: str
    invited_by: UUID
    inviter_name: str | None = None
    inviter_email: str | None = None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    status: str  # pending, accepted, expired, revoked

    model_config = {"from_attributes": True}


class InvitationPreview(BaseModel):
    """Schema for invitation preview (shown to invitee before accepting)."""

    legacy_id: UUID
    legacy_name: str
    legacy_biography: str | None = None
    legacy_profile_image_url: str | None = None
    inviter_name: str | None = None
    role: str
    expires_at: datetime
    status: str


class InvitationAcceptResponse(BaseModel):
    """Schema for successful invitation acceptance."""

    message: str
    legacy_id: UUID
    role: str
