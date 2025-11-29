# services/core-api/app/routes/media.py
"""API routes for media management."""

import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..config import get_settings
from ..database import get_db
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaSummary,
    SetProfileImageRequest,
    UploadUrlRequest,
    UploadUrlResponse,
)
from ..services import media as media_service

router = APIRouter(prefix="/api/legacies", tags=["media"])
logger = logging.getLogger(__name__)


@router.post(
    "/{legacy_id}/media/upload-url",
    response_model=UploadUrlResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request upload URL",
)
async def request_upload_url(
    legacy_id: UUID,
    data: UploadUrlRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """Request a presigned URL for uploading media."""
    session = require_auth(request)
    return await media_service.request_upload_url(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        data=data,
    )


@router.post(
    "/{legacy_id}/media/{media_id}/confirm",
    response_model=MediaConfirmResponse,
    summary="Confirm upload",
)
async def confirm_upload(
    legacy_id: UUID,
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaConfirmResponse:
    """Confirm that file upload completed successfully."""
    session = require_auth(request)
    return await media_service.confirm_upload(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=media_id,
    )


@router.get(
    "/{legacy_id}/media",
    response_model=list[MediaSummary],
    summary="List legacy media",
)
async def list_media(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[MediaSummary]:
    """List all media for a legacy."""
    session = require_auth(request)
    return await media_service.list_legacy_media(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
    )


@router.get(
    "/{legacy_id}/media/{media_id}",
    response_model=MediaDetail,
    summary="Get media details",
)
async def get_media(
    legacy_id: UUID,
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaDetail:
    """Get single media item with download URL."""
    session = require_auth(request)
    return await media_service.get_media_detail(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=media_id,
    )


@router.delete(
    "/{legacy_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete media",
)
async def delete_media(
    legacy_id: UUID,
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete media file and record."""
    session = require_auth(request)
    await media_service.delete_media(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=media_id,
    )


@router.patch(
    "/{legacy_id}/profile-image",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set profile image",
)
async def set_profile_image(
    legacy_id: UUID,
    data: SetProfileImageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Set legacy profile image from existing media."""
    session = require_auth(request)
    await media_service.set_profile_image(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        media_id=data.media_id,
    )


# Local storage routes (development only)
local_router = APIRouter(prefix="/media", tags=["media-local"])


@local_router.put("/{path:path}")
async def upload_local_file(
    path: str,
    request: Request,
) -> Response:
    """Accept file upload to local storage (dev only)."""
    settings = get_settings()
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Not found")

    # Validate path doesn't escape
    base_path = Path(settings.local_media_path)
    full_path = (base_path / path).resolve()
    if not str(full_path).startswith(str(base_path.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    # Create parent directories
    full_path.parent.mkdir(parents=True, exist_ok=True)

    # Write file
    body = await request.body()
    full_path.write_bytes(body)

    logger.info("local.file_uploaded", extra={"path": path})
    return Response(status_code=200)


@local_router.get("/{path:path}")
async def serve_local_file(path: str) -> FileResponse:
    """Serve file from local storage (dev only)."""
    settings = get_settings()
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Not found")

    # Validate path doesn't escape
    base_path = Path(settings.local_media_path)
    full_path = (base_path / path).resolve()
    if not str(full_path).startswith(str(base_path.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(full_path)
