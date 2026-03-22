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
from ..models.associations import MediaLegacy, MediaPerson, MediaTag
from ..models.legacy import Legacy, LegacyMember
from ..models.media import Media
from ..models.person import Person
from ..models.tag import Tag
from ..schemas.associations import LegacyAssociationResponse
from ..schemas.media import (
    AddMediaLegacyAssociationRequest,
    MediaConfirmResponse,
    MediaDetail,
    MediaPersonCreate,
    MediaPersonResponse,
    MediaSummary,
    MediaUpdate,
    UploadUrlRequest,
    UploadUrlResponse,
)
from ..schemas.tag import TagResponse

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


async def list_user_media(
    db: AsyncSession,
    user_id: UUID,
) -> list[MediaSummary]:
    """List all media uploaded by the current user across all legacies."""
    result = await db.execute(
        select(Media)
        .options(
            selectinload(Media.owner),
            selectinload(Media.legacy_associations),
        )
        .where(Media.owner_id == user_id)
        .order_by(Media.created_at.desc())
    )
    media_list = result.scalars().unique().all()

    # Get all unique legacy IDs from all media
    all_legacy_ids: set[UUID] = set()
    for media in media_list:
        all_legacy_ids.update(assoc.legacy_id for assoc in media.legacy_associations)

    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    storage = get_storage_adapter()

    # Bulk fetch tags and people for all media
    media_ids = [m.id for m in media_list]

    tag_result = (
        await db.execute(
            select(MediaTag.media_id, Tag.id, Tag.name)
            .join(Tag, MediaTag.tag_id == Tag.id)
            .where(MediaTag.media_id.in_(media_ids))
        )
        if media_ids
        else None
    )
    tags_by_media: dict[UUID, list[TagResponse]] = {}
    if tag_result:
        for row in tag_result.all():
            tags_by_media.setdefault(row[0], []).append(
                TagResponse(id=row[1], name=row[2])
            )

    people_result = (
        await db.execute(
            select(
                MediaPerson.media_id,
                MediaPerson.person_id,
                Person.canonical_name,
                MediaPerson.role,
            )
            .join(Person, MediaPerson.person_id == Person.id)
            .where(MediaPerson.media_id.in_(media_ids))
        )
        if media_ids
        else None
    )
    people_by_media: dict[UUID, list[MediaPersonResponse]] = {}
    if people_result:
        for p_media_id, p_person_id, p_name, p_role in people_result.all():
            people_by_media.setdefault(p_media_id, []).append(
                MediaPersonResponse(
                    person_id=p_person_id, person_name=p_name, role=p_role
                )
            )

    return [
        MediaSummary(
            id=m.id,
            filename=m.filename,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            download_url=storage.generate_download_url(m.storage_path),
            uploaded_by=m.owner_id,
            uploader_name=m.owner.name,
            uploader_username=m.owner.username,
            uploader_avatar_url=m.owner.avatar_url,
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
            favorite_count=m.favorite_count or 0,
            caption=m.caption,
            date_taken=m.date_taken,
            location=m.location,
            era=m.era,
            tags=tags_by_media.get(m.id, []),
            people=people_by_media.get(m.id, []),
        )
        for m in media_list
    ]


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

    # Bulk fetch tags and people for all media
    media_ids = [m.id for m in media_list]

    tag_result = await db.execute(
        select(MediaTag.media_id, Tag.id, Tag.name)
        .join(Tag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id.in_(media_ids))
    )
    tags_by_media: dict[UUID, list[TagResponse]] = {}
    for row in tag_result.all():
        tags_by_media.setdefault(row[0], []).append(TagResponse(id=row[1], name=row[2]))

    people_result = await db.execute(
        select(
            MediaPerson.media_id,
            MediaPerson.person_id,
            Person.canonical_name,
            MediaPerson.role,
        )
        .join(Person, MediaPerson.person_id == Person.id)
        .where(MediaPerson.media_id.in_(media_ids))
    )
    people_by_media: dict[UUID, list[MediaPersonResponse]] = {}
    for p_media_id, p_person_id, p_name, p_role in people_result.all():
        people_by_media.setdefault(p_media_id, []).append(
            MediaPersonResponse(person_id=p_person_id, person_name=p_name, role=p_role)
        )

    return [
        MediaSummary(
            id=m.id,
            filename=m.filename,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            download_url=storage.generate_download_url(m.storage_path),
            uploaded_by=m.owner_id,
            uploader_name=m.owner.name,
            uploader_username=m.owner.username,
            uploader_avatar_url=m.owner.avatar_url,
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
            favorite_count=m.favorite_count or 0,
            caption=m.caption,
            date_taken=m.date_taken,
            location=m.location,
            era=m.era,
            tags=tags_by_media.get(m.id, []),
            people=people_by_media.get(m.id, []),
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
    media = await _check_media_access(db, user_id, media_id)
    return await _build_media_detail(db, media)


async def delete_media(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> dict[str, str]:
    """Delete media file and record.

    Only the owner can delete their media.

    Args:
        db: Database session
        user_id: User requesting deletion
        media_id: Media ID to delete

    Returns:
        Dict with filename of the deleted media

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

    media_filename = media.filename

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

    return {"filename": media_filename}


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
    # Check user is creator or admin
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be creator or admin to set profile image",
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


async def set_background_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
    media_id: UUID,
) -> None:
    """Set legacy background image from existing media.

    Media must be associated with the legacy. User must be an editor or creator.

    Args:
        db: Database session
        user_id: User setting the background image
        legacy_id: Legacy ID
        media_id: Media ID to use as background image

    Raises:
        HTTPException: 404 if media not found or not associated, 403 if no access
    """
    # Check user is creator or admin
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be creator or admin to set background image",
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
    legacy.background_image_id = media_id

    await db.commit()

    logger.info(
        "legacy.background_image_set",
        extra={
            "legacy_id": str(legacy_id),
            "media_id": str(media_id),
            "user_id": str(user_id),
        },
    )


async def clear_profile_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> None:
    """Clear the legacy profile image."""
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be creator or admin to clear profile image",
        )

    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one_or_none()
    if not legacy:
        raise HTTPException(status_code=404, detail="Legacy not found")

    legacy.profile_image_id = None
    await db.commit()

    logger.info(
        "legacy.profile_image_cleared",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )


async def clear_background_image(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> None:
    """Clear the legacy background image."""
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role.in_(["creator", "admin"]),
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be creator or admin to clear background image",
        )

    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one_or_none()
    if not legacy:
        raise HTTPException(status_code=404, detail="Legacy not found")

    legacy.background_image_id = None
    await db.commit()

    logger.info(
        "legacy.background_image_cleared",
        extra={
            "legacy_id": str(legacy_id),
            "user_id": str(user_id),
        },
    )


async def add_media_legacy_association(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    data: AddMediaLegacyAssociationRequest,
) -> MediaDetail:
    """Associate an existing user-owned media item with a legacy."""
    media_result = await db.execute(
        select(Media)
        .options(
            selectinload(Media.owner),
            selectinload(Media.legacy_associations),
            selectinload(Media.tag_associations),
            selectinload(Media.person_associations),
        )
        .where(Media.id == media_id)
    )
    media = media_result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if media.owner_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the owner can associate media with a legacy",
        )

    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == data.legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=403,
            detail="Must be a legacy member to associate media",
        )

    existing_assoc = next(
        (
            assoc
            for assoc in media.legacy_associations
            if assoc.legacy_id == data.legacy_id
        ),
        None,
    )
    if existing_assoc:
        existing_assoc.role = data.role
        existing_assoc.position = data.position
    else:
        db.add(
            MediaLegacy(
                media_id=media_id,
                legacy_id=data.legacy_id,
                role=data.role,
                position=data.position,
            )
        )

    await db.commit()

    logger.info(
        "media.legacy_association_added",
        extra={
            "media_id": str(media_id),
            "legacy_id": str(data.legacy_id),
            "user_id": str(user_id),
        },
    )

    await db.refresh(media, attribute_names=["legacy_associations"])
    await db.refresh(media, attribute_names=["owner"])
    return await _build_media_detail(db, media)


async def _check_media_access(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> Media:
    """Load media and verify the user has access.

    Access is granted if the user is the owner OR is a non-pending member
    of at least one legacy the media is associated with.

    Args:
        db: Database session
        user_id: User requesting access
        media_id: Media ID to check

    Returns:
        Media ORM object (with legacy_associations loaded)

    Raises:
        HTTPException: 404 if not found, 403 if no access
    """
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

    # Owner always has access
    if media.owner_id == user_id:
        return media

    # Otherwise user must be a non-pending member of an associated legacy
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
        if member:
            return media

    raise HTTPException(
        status_code=403,
        detail="Not authorized to access this media",
    )


async def _require_legacy_membership(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> None:
    """Require that a user is a non-pending member of the given legacy."""
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    if member_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=403,
            detail="Must be a member of the legacy to manage tags",
        )


async def _build_media_detail(
    db: AsyncSession,
    media: Media,
) -> MediaDetail:
    """Build a full MediaDetail response from a loaded Media ORM object.

    Args:
        db: Database session
        media: Media ORM object (legacy_associations must already be loaded)

    Returns:
        MediaDetail with tags, people, and download URL populated
    """
    # Get legacy names
    legacy_ids = [assoc.legacy_id for assoc in media.legacy_associations]
    legacy_names = await _get_legacy_names(db, legacy_ids)

    # Bulk fetch tags for this media
    tag_result = await db.execute(
        select(MediaTag.media_id, Tag.id, Tag.name)
        .join(Tag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id == media.id)
    )
    tags = [TagResponse(id=row[1], name=row[2]) for row in tag_result.all()]

    # Bulk fetch people for this media
    people_result = await db.execute(
        select(
            MediaPerson.media_id,
            MediaPerson.person_id,
            Person.canonical_name,
            MediaPerson.role,
        )
        .join(Person, MediaPerson.person_id == Person.id)
        .where(MediaPerson.media_id == media.id)
    )
    people = [
        MediaPersonResponse(person_id=row[1], person_name=row[2], role=row[3])
        for row in people_result.all()
    ]

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
        uploader_username=media.owner.username,
        uploader_avatar_url=media.owner.avatar_url,
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
        favorite_count=media.favorite_count or 0,
        caption=media.caption,
        date_taken=media.date_taken,
        location=media.location,
        era=media.era,
        tags=tags,
        people=people,
    )


async def update_media(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    data: MediaUpdate,
) -> MediaDetail:
    """Update media metadata fields.

    Only the owner or a non-pending legacy member may update media.

    Args:
        db: Database session
        user_id: User requesting update
        media_id: Media ID to update
        data: Fields to update (only set fields are applied)

    Returns:
        Updated MediaDetail

    Raises:
        HTTPException: 404 if not found, 403 if no access
    """
    # Load media with all needed relationships
    result = await db.execute(
        select(Media)
        .options(
            selectinload(Media.owner),
            selectinload(Media.legacy_associations),
            selectinload(Media.tag_associations),
            selectinload(Media.person_associations),
        )
        .where(Media.id == media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check access: owner or non-pending legacy member
    has_access = media.owner_id == user_id
    if not has_access and media.legacy_associations:
        legacy_ids = [assoc.legacy_id for assoc in media.legacy_associations]
        member_result = await db.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        has_access = member_result.scalar_one_or_none() is not None

    if not has_access:
        raise HTTPException(
            status_code=403, detail="Not authorized to update this media"
        )

    # Apply only the fields that were explicitly set
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(media, field, value)

    await db.commit()
    await db.refresh(media)

    logger.info(
        "media.updated",
        extra={
            "media_id": str(media_id),
            "user_id": str(user_id),
        },
    )

    return await _build_media_detail(db, media)


async def list_media_people(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> list[MediaPersonResponse]:
    """List all people tagged in a media item.

    Args:
        db: Database session
        user_id: User requesting people list
        media_id: Media ID

    Returns:
        List of people tagged in the media

    Raises:
        HTTPException: 404 if media not found, 403 if no access
    """
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(MediaPerson.person_id, Person.canonical_name, MediaPerson.role)
        .join(Person, MediaPerson.person_id == Person.id)
        .where(MediaPerson.media_id == media_id)
    )
    return [
        MediaPersonResponse(person_id=row[0], person_name=row[1], role=row[2])
        for row in result.all()
    ]


async def tag_person(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    data: MediaPersonCreate,
) -> MediaPersonResponse:
    """Tag a person in a media item.

    Either an existing person_id or a name for a new person must be provided.

    Args:
        db: Database session
        user_id: User requesting the tag
        media_id: Media ID
        data: Person tag request (person_id or name, plus role)

    Returns:
        Created person tag

    Raises:
        HTTPException: 400 if neither person_id nor name given, 404/403 access,
                       409 if already tagged
    """
    await _check_media_access(db, user_id, media_id)

    if data.person_id is None and not data.name:
        raise HTTPException(
            status_code=400,
            detail="Either person_id or name must be provided",
        )

    person_id: UUID
    person_name: str

    if data.person_id is not None:
        # Look up existing person
        person_result = await db.execute(
            select(Person).where(Person.id == data.person_id)
        )
        person = person_result.scalar_one_or_none()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        person_id = person.id
        person_name = person.canonical_name
    else:
        # Create a new Person record
        person = Person(canonical_name=data.name)
        db.add(person)
        await db.flush()
        person_id = person.id
        person_name = person.canonical_name

    # Check for duplicate association
    existing_result = await db.execute(
        select(MediaPerson).where(
            MediaPerson.media_id == media_id,
            MediaPerson.person_id == person_id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Person is already tagged in this media",
        )

    association = MediaPerson(
        media_id=media_id,
        person_id=person_id,
        role=data.role,
    )
    db.add(association)
    await db.commit()

    logger.info(
        "media.person_tagged",
        extra={
            "media_id": str(media_id),
            "person_id": str(person_id),
            "user_id": str(user_id),
        },
    )

    return MediaPersonResponse(
        person_id=person_id,
        person_name=person_name,
        role=data.role,
    )


async def untag_person(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    person_id: UUID,
) -> None:
    """Remove a person tag from a media item.

    Args:
        db: Database session
        user_id: User requesting removal
        media_id: Media ID
        person_id: Person ID to remove

    Raises:
        HTTPException: 404 if association not found, 403 if no access
    """
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(MediaPerson).where(
            MediaPerson.media_id == media_id,
            MediaPerson.person_id == person_id,
        )
    )
    association = result.scalar_one_or_none()

    if not association:
        raise HTTPException(
            status_code=404,
            detail="Person tag not found on this media",
        )

    await db.delete(association)
    await db.commit()

    logger.info(
        "media.person_untagged",
        extra={
            "media_id": str(media_id),
            "person_id": str(person_id),
            "user_id": str(user_id),
        },
    )


async def list_media_tags(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
) -> list[TagResponse]:
    """List all tags on a media item.

    Args:
        db: Database session
        user_id: User requesting tag list
        media_id: Media ID

    Returns:
        List of tags on the media

    Raises:
        HTTPException: 404 if media not found, 403 if no access
    """
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(Tag.id, Tag.name)
        .join(MediaTag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id == media_id)
    )
    return [TagResponse(id=row[0], name=row[1]) for row in result.all()]


async def add_media_tag(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    legacy_id: UUID,
    tag_name: str,
) -> TagResponse:
    """Add a tag to a media item.

    The tag is scoped to the given legacy. If a tag with that name already
    exists for the legacy it will be reused; otherwise a new tag is created.

    Args:
        db: Database session
        user_id: User requesting the tag
        media_id: Media ID
        legacy_id: Legacy the tag belongs to
        tag_name: Name of the tag

    Returns:
        The applied tag

    Raises:
        HTTPException: 403/404 access errors, 409 if tag already on media
    """
    media = await _check_media_access(db, user_id, media_id)
    await _require_legacy_membership(db, user_id, legacy_id)

    if all(assoc.legacy_id != legacy_id for assoc in media.legacy_associations):
        raise HTTPException(
            status_code=400,
            detail="legacy_id must be associated with this media",
        )

    # Find or create the Tag for this legacy
    tag_result = await db.execute(
        select(Tag).where(Tag.legacy_id == legacy_id, Tag.name == tag_name)
    )
    tag = tag_result.scalar_one_or_none()

    if tag is None:
        tag = Tag(name=tag_name, legacy_id=legacy_id, created_by=user_id)
        db.add(tag)
        await db.flush()

    # Check for duplicate media-tag association
    existing_result = await db.execute(
        select(MediaTag).where(
            MediaTag.media_id == media_id,
            MediaTag.tag_id == tag.id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Tag is already applied to this media",
        )

    association = MediaTag(media_id=media_id, tag_id=tag.id)
    db.add(association)
    await db.commit()

    logger.info(
        "media.tag_added",
        extra={
            "media_id": str(media_id),
            "tag_id": str(tag.id),
            "tag_name": tag_name,
            "user_id": str(user_id),
        },
    )

    return TagResponse(id=tag.id, name=tag.name)


async def remove_media_tag(
    db: AsyncSession,
    user_id: UUID,
    media_id: UUID,
    tag_id: UUID,
) -> None:
    """Remove a tag from a media item.

    Args:
        db: Database session
        user_id: User requesting removal
        media_id: Media ID
        tag_id: Tag ID to remove

    Raises:
        HTTPException: 404 if association not found, 403 if no access
    """
    await _check_media_access(db, user_id, media_id)

    result = await db.execute(
        select(MediaTag).where(
            MediaTag.media_id == media_id,
            MediaTag.tag_id == tag_id,
        )
    )
    association = result.scalar_one_or_none()

    if not association:
        raise HTTPException(
            status_code=404,
            detail="Tag not found on this media",
        )

    await db.delete(association)
    await db.commit()

    logger.info(
        "media.tag_removed",
        extra={
            "media_id": str(media_id),
            "tag_id": str(tag_id),
            "user_id": str(user_id),
        },
    )


async def list_legacy_tags(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> list[TagResponse]:
    """List all tags defined for a legacy.

    User must be a non-pending member of the legacy.

    Args:
        db: Database session
        user_id: User requesting tag list
        legacy_id: Legacy ID

    Returns:
        Tags for the legacy ordered by name

    Raises:
        HTTPException: 403 if not a member
    """
    await _require_legacy_membership(db, user_id, legacy_id)

    result = await db.execute(
        select(Tag).where(Tag.legacy_id == legacy_id).order_by(Tag.name)
    )
    tags = result.scalars().all()
    return [TagResponse(id=t.id, name=t.name) for t in tags]
