"""Pydantic schemas for Media API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .associations import LegacyAssociationCreate, LegacyAssociationResponse
from .tag import TagResponse


class UploadUrlRequest(BaseModel):
    """Request for presigned upload URL."""

    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., min_length=1, max_length=100)
    size_bytes: int = Field(..., gt=0)
    legacies: list[LegacyAssociationCreate] | None = Field(
        None,
        description="Optional legacy associations (can be added after upload)",
    )


class UploadUrlResponse(BaseModel):
    """Response with presigned upload URL."""

    upload_url: str
    media_id: UUID
    storage_path: str


class MediaConfirmResponse(BaseModel):
    """Response after confirming upload."""

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MediaUpdate(BaseModel):
    """Schema for updating media metadata."""

    caption: str | None = Field(None, max_length=2000)
    date_taken: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=255)
    era: str | None = Field(None, max_length=50)


class MediaPersonResponse(BaseModel):
    """Person tagged in media."""

    person_id: UUID
    person_name: str
    role: str

    model_config = {"from_attributes": True}


class MediaPersonCreate(BaseModel):
    """Request to tag a person in media."""

    person_id: UUID | None = Field(None, description="Existing person ID")
    name: str | None = Field(None, min_length=1, max_length=200, description="Name for new person")
    role: Literal["subject", "family", "friend", "other"] = Field(default="subject")


class MediaSummary(BaseModel):
    """Media item in list responses."""

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    download_url: str
    uploaded_by: UUID
    uploader_name: str
    legacies: list[LegacyAssociationResponse]
    favorite_count: int = Field(
        default=0, description="Number of times this media has been favorited"
    )
    caption: str | None = None
    date_taken: str | None = None
    location: str | None = None
    era: str | None = None
    tags: list[TagResponse] = Field(default_factory=list)
    people: list[MediaPersonResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class MediaDetail(BaseModel):
    """Full media item details."""

    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    storage_path: str
    download_url: str
    uploaded_by: UUID
    uploader_name: str
    legacies: list[LegacyAssociationResponse]
    favorite_count: int = Field(
        default=0, description="Number of times this media has been favorited"
    )
    caption: str | None = None
    date_taken: str | None = None
    location: str | None = None
    era: str | None = None
    tags: list[TagResponse] = Field(default_factory=list)
    people: list[MediaPersonResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class SetProfileImageRequest(BaseModel):
    """Request to set legacy profile image."""

    media_id: UUID
