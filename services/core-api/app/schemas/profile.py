"""Pydantic schemas for user profiles."""

from uuid import UUID

from pydantic import BaseModel, Field


class ProfileResponse(BaseModel):
    """Public profile data, filtered by viewer authorization."""

    user_id: UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    bio: str | None = None
    legacies: list["ProfileLegacyCard"] | None = None
    stories: list["ProfileStoryCard"] | None = None
    connections: list["ProfileConnectionCard"] | None = None
    visibility_context: "VisibilityContext"


class ProfileLegacyCard(BaseModel):
    id: UUID
    name: str
    subject_photo_url: str | None = None
    story_count: int = 0


class ProfileStoryCard(BaseModel):
    id: UUID
    title: str
    preview: str | None = None
    legacy_name: str | None = None


class ProfileConnectionCard(BaseModel):
    username: str
    display_name: str
    avatar_url: str | None = None


class VisibilityContext(BaseModel):
    """Tells the frontend which sections to render."""

    show_bio: bool = False
    show_legacies: bool = False
    show_stories: bool = False
    show_media: bool = False
    show_connections: bool = False


class ProfileSettingsResponse(BaseModel):
    username: str
    discoverable: bool
    visibility_legacies: str
    visibility_stories: str
    visibility_media: str
    visibility_connections: str
    visibility_bio: str


class ProfileSettingsUpdate(BaseModel):
    discoverable: bool | None = None
    visibility_legacies: str | None = Field(
        None, pattern="^(nobody|connections|authenticated|public)$"
    )
    visibility_stories: str | None = Field(
        None, pattern="^(nobody|connections|authenticated|public)$"
    )
    visibility_media: str | None = Field(
        None, pattern="^(nobody|connections|authenticated|public)$"
    )
    visibility_connections: str | None = Field(
        None, pattern="^(nobody|connections|authenticated|public)$"
    )
    visibility_bio: str | None = Field(
        None, pattern="^(nobody|connections|authenticated|public)$"
    )


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    bio: str | None = Field(None, max_length=500)
    avatar_url: str | None = Field(None, max_length=2000)


# Rebuild forward refs
ProfileResponse.model_rebuild()
