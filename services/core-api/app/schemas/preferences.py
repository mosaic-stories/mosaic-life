"""Schemas for user preferences."""

from pydantic import BaseModel, Field

from .member_profile import GenderType


class UserPreferences(BaseModel):
    """User preferences structure."""

    theme: str = Field(default="warm-amber", description="UI theme identifier")
    default_model: str = Field(
        default="claude-sonnet-4.5", description="Default AI model for new chats"
    )
    hidden_personas: list[str] = Field(
        default_factory=list, description="List of hidden agent persona IDs"
    )
    activity_tracking_enabled: bool = Field(
        default=True, description="Whether activity tracking is enabled"
    )


class PreferencesUpdateRequest(BaseModel):
    """Request to update user preferences."""

    theme: str | None = Field(None, description="UI theme identifier")
    default_model: str | None = Field(None, description="Default AI model")
    hidden_personas: list[str] | None = Field(None, description="Hidden persona IDs")
    activity_tracking_enabled: bool | None = Field(
        None, description="Enable or disable activity tracking"
    )


class PreferencesResponse(BaseModel):
    """Response containing user preferences."""

    theme: str
    default_model: str
    hidden_personas: list[str]
    activity_tracking_enabled: bool

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    """Request to update user profile."""

    name: str | None = Field(None, min_length=1, max_length=100)
    bio: str | None = Field(None, max_length=500)
    gender: GenderType | None = Field(None, description="User's gender")


class ProfileResponse(BaseModel):
    """Response containing user profile."""

    id: str
    email: str
    name: str
    bio: str | None
    gender: str | None = None
    avatar_url: str | None
    created_at: str

    model_config = {"from_attributes": True}
