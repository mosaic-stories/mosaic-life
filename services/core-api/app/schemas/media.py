"""Pydantic schemas for Media API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from .associations import LegacyAssociationCreate, LegacyAssociationResponse


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
    created_at: datetime

    model_config = {"from_attributes": True}


class SetProfileImageRequest(BaseModel):
    """Request to set legacy profile image."""

    media_id: UUID
