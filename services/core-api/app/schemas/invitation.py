"""Pydantic schemas for invitations."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class InvitationCreate(BaseModel):
    """Schema for creating an invitation.

    Either email or user_id must be provided, but not both.
    """

    email: EmailStr | None = Field(
        default=None, description="Email address to invite"
    )
    user_id: UUID | None = Field(
        default=None, description="User ID to invite (for existing users)"
    )
    role: str = Field(
        default="advocate",
        pattern="^(creator|admin|advocate|admirer)$",
        description="Role to grant upon acceptance",
    )

    @model_validator(mode="after")
    def validate_email_or_user_id(self) -> "InvitationCreate":
        """Ensure exactly one of email or user_id is provided."""
        if self.email is None and self.user_id is None:
            raise ValueError("Either email or user_id must be provided")
        if self.email is not None and self.user_id is not None:
            raise ValueError("Cannot provide both email and user_id")
        return self


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
