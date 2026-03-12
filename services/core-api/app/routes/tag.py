"""API routes for tags."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.tag import TagResponse
from ..services import media as media_service

router = APIRouter(prefix="/api/tags", tags=["tags"])
logger = logging.getLogger(__name__)


@router.get(
    "/",
    response_model=list[TagResponse],
    summary="List tags for a legacy",
)
async def list_legacy_tags(
    request: Request,
    legacy_id: UUID = Query(..., description="Legacy ID"),
    db: AsyncSession = Depends(get_db),
) -> list[TagResponse]:
    """List all tags for a legacy (for autocomplete)."""
    session = require_auth(request)
    return await media_service.list_legacy_tags(
        db=db, user_id=session.user_id, legacy_id=legacy_id
    )
