# services/core-api/app/services/media.py
"""Service layer for media operations."""

import logging
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..adapters.storage import get_storage_adapter
from ..config import get_settings
from ..models.legacy import Legacy
from ..models.media import Media
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaSummary,
    UploadUrlRequest,
    UploadUrlResponse,
)
from .legacy import check_legacy_access

logger = logging.getLogger(__name__)


def get_file_extension(filename: str) -> str:
    """Extract file extension from filename."""
    return Path(filename).suffix.lower()


def validate_upload_request(data: UploadUrlRequest) -> None:
    """Validate upload request parameters."""
    settings = get_settings()

    # Check file size
    if data.size_bytes > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum of {max_mb:.0f} MB",
        )

    # Check content type
    if data.content_type not in settings.allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Content type '{data.content_type}' not allowed. "
            f"Allowed: {', '.join(settings.allowed_content_types)}",
        )


async def request_upload_url(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    data: UploadUrlRequest,
) -> UploadUrlResponse:
    """Generate presigned upload URL and create pending media record."""
    # Check user has access to legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    # Validate request
    validate_upload_request(data)

    # Generate storage path
    media_id = uuid4()
    ext = get_file_extension(data.filename)
    storage_path = f"legacy/{legacy_id}/{media_id}{ext}"

    # Create media record (pending)
    media = Media(
        id=media_id,
        legacy_id=legacy_id,
        filename=data.filename,
        content_type=data.content_type,
        size_bytes=data.size_bytes,
        storage_path=storage_path,
        uploaded_by=user_id,
    )
    db.add(media)
    await db.commit()

    # Generate upload URL
    storage = get_storage_adapter()
    upload_url = storage.generate_upload_url(storage_path, data.content_type)

    logger.info(
        "media.upload_url_generated",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
            "media_filename": data.filename,
        },
    )

    return UploadUrlResponse(
        upload_url=upload_url,
        media_id=media_id,
        storage_path=storage_path,
    )


async def confirm_upload(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> MediaConfirmResponse:
    """Confirm upload completed and verify file exists."""
    # Load media record
    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check user is the uploader
    if media.uploaded_by != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Verify file exists in storage
    storage = get_storage_adapter()
    if not storage.file_exists(media.storage_path):
        raise HTTPException(
            status_code=400,
            detail="File not found in storage. Upload may have failed.",
        )

    logger.info(
        "media.upload_confirmed",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )

    return MediaConfirmResponse(
        id=media.id,
        filename=media.filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        created_at=media.created_at,
    )


async def list_legacy_media(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> list[MediaSummary]:
    """List all media for a legacy."""
    # Check user has access to legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    result = await db.execute(
        select(Media)
        .options(selectinload(Media.uploader))
        .where(Media.legacy_id == legacy_id)
        .order_by(Media.created_at.desc())
    )
    media_list = result.scalars().all()

    storage = get_storage_adapter()

    return [
        MediaSummary(
            id=m.id,
            filename=m.filename,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            download_url=storage.generate_download_url(m.storage_path),
            uploaded_by=m.uploaded_by,
            uploader_name=m.uploader.name,
            created_at=m.created_at,
        )
        for m in media_list
    ]


async def get_media_detail(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> MediaDetail:
    """Get single media item with download URL."""
    # Check user has access to legacy
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    result = await db.execute(
        select(Media)
        .options(selectinload(Media.uploader))
        .where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    storage = get_storage_adapter()

    return MediaDetail(
        id=media.id,
        legacy_id=media.legacy_id,
        filename=media.filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        storage_path=media.storage_path,
        download_url=storage.generate_download_url(media.storage_path),
        uploaded_by=media.uploaded_by,
        uploader_name=media.uploader.name,
        created_at=media.created_at,
    )


async def delete_media(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Delete media file and record."""
    # Check user has access as creator or editor
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="member",
    )

    result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Only uploader or legacy creator can delete
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one()

    if media.uploaded_by != user_id and legacy.created_by != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only uploader or legacy creator can delete",
        )

    # Delete from storage
    storage = get_storage_adapter()
    storage.delete_file(media.storage_path)

    # Delete record
    await db.delete(media)
    await db.commit()

    logger.info(
        "media.deleted",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )


async def set_profile_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Set legacy profile image from existing media."""
    # Check user is creator or editor
    await check_legacy_access(
        db=db,
        user_id=user_id,
        legacy_id=legacy_id,
        required_role="editor",
    )

    # Verify media exists and belongs to legacy
    media_result = await db.execute(
        select(Media).where(
            Media.id == media_id,
            Media.legacy_id == legacy_id,
        )
    )
    media = media_result.scalar_one_or_none()

    if not media:
        raise HTTPException(
            status_code=404,
            detail="Media not found in this legacy",
        )

    # Update legacy
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one()
    legacy.profile_image_id = media_id

    await db.commit()

    logger.info(
        "legacy.profile_image_set",
        extra={
            "legacy_id": str(legacy_id),
            "media_id": str(media_id),
            "user_id": str(user_id),
        },
    )
