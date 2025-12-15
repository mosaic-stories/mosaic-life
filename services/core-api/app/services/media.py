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
from ..models.associations import MediaLegacy
from ..models.legacy import Legacy, LegacyMember
from ..models.media import Media
from ..schemas.associations import LegacyAssociationResponse
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaSummary,
    UploadUrlRequest,
    UploadUrlResponse,
)

logger = logging.getLogger(__name__)


def get_file_extension(filename: str) -> str:
    """Extract file extension from filename."""
    return Path(filename).suffix.lower()


def generate_storage_path(user_id: UUID, media_id: UUID, ext: str) -> str:
    """Generate user-scoped storage path.

    Args:
        user_id: User ID who owns the media
        media_id: Media ID
        ext: File extension (including dot)

    Returns:
        Storage path in format: users/{user_id}/{media_id}{ext}
    """
    return f"users/{user_id}/{media_id}{ext}"


async def _get_legacy_names(
    db: AsyncSession, legacy_ids: list[UUID]
) -> dict[UUID, str]:
    """Fetch legacy names by IDs.

    Args:
        db: Database session
        legacy_ids: List of legacy IDs

    Returns:
        Mapping of legacy ID to legacy name
    """
    if not legacy_ids:
        return {}

    result = await db.execute(
        select(Legacy.id, Legacy.name).where(Legacy.id.in_(legacy_ids))
    )
    return {row[0]: row[1] for row in result.all()}


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
    data: UploadUrlRequest,
) -> UploadUrlResponse:
    """Generate presigned upload URL and create pending media record.

    Media is now owned by users and can be associated with multiple legacies.
    If legacies are provided, user must be a member of at least one.

    Args:
        db: Database session
        user_id: User requesting upload
        data: Upload request data with optional legacy associations

    Returns:
        Upload URL and media metadata

    Raises:
        HTTPException: 403 if user not a member of any provided legacy
    """
    # If legacies provided, verify user is a member of at least one
    if data.legacies:
        legacy_ids = [leg.legacy_id for leg in data.legacies]

        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        member = member_result.scalar_one_or_none()

        if not member:
            logger.warning(
                "media.upload_denied",
                extra={
                    "user_id": str(user_id),
                    "legacy_ids": [str(lid) for lid in legacy_ids],
                },
            )
            raise HTTPException(
                status_code=403,
                detail="Must be a member of at least one legacy to upload media",
            )

    # Validate request
    validate_upload_request(data)

    # Generate storage path
    media_id = uuid4()
    ext = get_file_extension(data.filename)
    storage_path = generate_storage_path(user_id, media_id, ext)

    # Create media record (user-owned)
    media = Media(
        id=media_id,
        owner_id=user_id,
        filename=data.filename,
        content_type=data.content_type,
        size_bytes=data.size_bytes,
        storage_path=storage_path,
    )
    db.add(media)
    await db.flush()  # Get media.id without committing

    # Create legacy associations if provided
    if data.legacies:
        for leg_data in data.legacies:
            association = MediaLegacy(
                media_id=media_id,
                legacy_id=leg_data.legacy_id,
                role=leg_data.role,
                position=leg_data.position,
            )
            db.add(association)

    await db.commit()

    # Generate upload URL
    storage = get_storage_adapter()
    upload_url = storage.generate_upload_url(storage_path, data.content_type)

    logger.info(
        "media.upload_url_generated",
        extra={
            "media_id": str(media_id),
            "user_id": str(user_id),
            "media_filename": data.filename,
            "legacy_count": len(data.legacies) if data.legacies else 0,
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
    media_id: UUID,
) -> MediaConfirmResponse:
    """Confirm upload completed and verify file exists.

    Args:
        db: Database session
        user_id: User confirming upload
        media_id: Media ID to confirm

    Returns:
        Confirmed media metadata

    Raises:
        HTTPException: 404 if not found, 403 if not owner
    """
    # Load media record
    result = await db.execute(select(Media).where(Media.id == media_id))
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check user is the owner
    if media.owner_id != user_id:
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
    """List all media associated with a legacy.

    Uses union access: user must be a member of the legacy to view media.

    Args:
        db: Database session
        user_id: User requesting media list
        legacy_id: Legacy ID to filter by

    Returns:
        List of media associated with the legacy
    """
    # Check if user is a member (not pending)
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be a member of the legacy to view media",
        )

    # Get media associated with this legacy
    result = await db.execute(
        select(Media)
        .options(
            selectinload(Media.owner),
            selectinload(Media.legacy_associations),
        )
        .join(MediaLegacy, Media.id == MediaLegacy.media_id)
        .where(MediaLegacy.legacy_id == legacy_id)
        .order_by(Media.created_at.desc())
    )
    media_list = result.scalars().unique().all()

    # Get all unique legacy IDs from all media
    all_legacy_ids: set[UUID] = set()
    for media in media_list:
        all_legacy_ids.update(assoc.legacy_id for assoc in media.legacy_associations)

    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    storage = get_storage_adapter()

    return [
        MediaSummary(
            id=m.id,
            filename=m.filename,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            download_url=storage.generate_download_url(m.storage_path),
            uploaded_by=m.owner_id,
            uploader_name=m.owner.name,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in sorted(m.legacy_associations, key=lambda a: a.position)
            ],
            created_at=m.created_at,
        )
        for m in media_list
    ]


async def get_media_detail(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> MediaDetail:
    """Get single media item with download URL.

    Uses union access: user can view media if they are a member of ANY
    legacy the media is associated with.

    Args:
        db: Database session
        user_id: User requesting media
        media_id: Media ID

    Returns:
        Media details with download URL

    Raises:
        HTTPException: 404 if not found, 403 if no access
    """
    # Load media with associations
    result = await db.execute(
        select(Media)
        .options(
            selectinload(Media.owner),
            selectinload(Media.legacy_associations),
        )
        .where(Media.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check union access: user must be member of at least one associated legacy
    if media.legacy_associations:
        legacy_ids = [assoc.legacy_id for assoc in media.legacy_associations]

        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        member = member_result.scalar_one_or_none()

        if not member:
            raise HTTPException(
                status_code=403,
                detail="Must be a member of an associated legacy to view media",
            )

    # Get legacy names
    legacy_ids = [assoc.legacy_id for assoc in media.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    storage = get_storage_adapter()

    return MediaDetail(
        id=media.id,
        filename=media.filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        storage_path=media.storage_path,
        download_url=storage.generate_download_url(media.storage_path),
        uploaded_by=media.owner_id,
        uploader_name=media.owner.name,
        legacies=[
            LegacyAssociationResponse(
                legacy_id=assoc.legacy_id,
                legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                role=assoc.role,
                position=assoc.position,
            )
            for assoc in sorted(media.legacy_associations, key=lambda a: a.position)
        ],
        created_at=media.created_at,
    )


async def delete_media(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> None:
    """Delete media file and record.

    Only the owner can delete their media.

    Args:
        db: Database session
        user_id: User requesting deletion
        media_id: Media ID to delete

    Raises:
        HTTPException: 404 if not found, 403 if not owner
    """
    result = await db.execute(select(Media).where(Media.id == media_id))
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Only owner can delete
    if media.owner_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the owner can delete media",
        )

    # Delete from storage
    storage = get_storage_adapter()
    storage.delete_file(media.storage_path)

    # Delete record (cascade will handle associations)
    await db.delete(media)
    await db.commit()

    logger.info(
        "media.deleted",
        extra={
            "media_id": str(media_id),
            "user_id": str(user_id),
        },
    )


async def set_profile_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Set legacy profile image from existing media.

    Media must be associated with the legacy. User must be an editor or creator.

    Args:
        db: Database session
        user_id: User setting the profile image
        legacy_id: Legacy ID
        media_id: Media ID to use as profile image

    Raises:
        HTTPException: 404 if media not found or not associated, 403 if no access
    """
    # Check user is creator or editor
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "editor"]),
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be creator or editor to set profile image",
        )

    # Verify media is associated with this legacy
    assoc_result = await db.execute(
        select(MediaLegacy).where(
            MediaLegacy.media_id == media_id,
            MediaLegacy.legacy_id == legacy_id,
        )
    )
    association = assoc_result.scalar_one_or_none()

    if not association:
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
