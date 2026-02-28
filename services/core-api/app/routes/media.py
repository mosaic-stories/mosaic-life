# services/core-api/app/routes/media.py
"""API routes for media management."""

import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..config import get_settings
from ..database import get_db
from ..schemas.media import (
    MediaConfirmResponse,
    MediaDetail,
    MediaSummary,
    UploadUrlRequest,
    UploadUrlResponse,
)
from ..services import media as media_service

router = APIRouter(prefix="/api/media", tags=["media"])
logger = logging.getLogger(__name__)


@router.post(
    "/upload-url",
    response_model=UploadUrlResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request upload URL",
)
async def request_upload_url(
    data: UploadUrlRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UploadUrlResponse:
    """Request a presigned URL for uploading media.

    Media is user-owned and can optionally be associated with legacies
    via the 'legacies' field in the request body.
    """
    session = require_auth(request)
    return await media_service.request_upload_url(
        db=db,
        user_id=session.user_id,
        data=data,
    )


@router.post(
    "/{media_id}/confirm",
    response_model=MediaConfirmResponse,
    summary="Confirm upload",
)
async def confirm_upload(
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaConfirmResponse:
    """Confirm that file upload completed successfully."""
    session = require_auth(request)
    return await media_service.confirm_upload(
        db=db,
        user_id=session.user_id,
        media_id=media_id,
    )


@router.get(
    "/",
    response_model=list[MediaSummary],
    summary="List media",
)
async def list_media(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    db: AsyncSession = Depends(get_db),
) -> list[MediaSummary]:
    """List media.

    If legacy_id is provided, returns media associated with that legacy.
    User must be a member of the legacy to view its media.
    """
    session = require_auth(request)
    if legacy_id is not None:
        return await media_service.list_legacy_media(
            db=db,
            user_id=session.user_id,
            legacy_id=legacy_id,
        )
    # TODO: Implement list_user_media for listing all user's media
    # For now, require legacy_id
    raise HTTPException(
        status_code=400,
        detail="legacy_id query parameter is required",
    )


@router.get(
    "/{media_id}",
    response_model=MediaDetail,
    summary="Get media details",
)
async def get_media(
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaDetail:
    """Get single media item with download URL.

    User must be a member of at least one legacy the media is associated with.
    """
    session = require_auth(request)
    return await media_service.get_media_detail(
        db=db,
        user_id=session.user_id,
        media_id=media_id,
    )


@router.get(
    "/{media_id}/content",
    summary="Get media content",
)
async def get_media_content(
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Resolve media content URL and redirect to fresh signed object URL.

    This endpoint is stable and can be safely embedded in story markdown.
    """
    session = require_auth(request)
    media = await media_service.get_media_detail(
        db=db,
        user_id=session.user_id,
        media_id=media_id,
    )
    response = RedirectResponse(
        url=media.download_url,
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@router.delete(
    "/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete media",
)
async def delete_media(
    media_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete media file and record.

    Only the owner can delete their media.
    """
    session = require_auth(request)
    await media_service.delete_media(
        db=db,
        user_id=session.user_id,
        media_id=media_id,
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
