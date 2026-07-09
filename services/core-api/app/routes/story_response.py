"""API routes for story responses."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.story_response import (
    StoryResponseCreate,
    StoryResponseItem,
    StoryResponseListResponse,
    StoryResponseUpdate,
)
from ..services import activity as activity_service
from ..services import story_response as story_response_service

router = APIRouter(prefix="/api/stories/{story_id}/responses", tags=["story-responses"])


@router.post(
    "",
    response_model=StoryResponseItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a response on a story",
    description="Submit a plain-text response. Requires legacy membership or authorship.",
)
async def create_response(
    story_id: UUID,
    data: StoryResponseCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryResponseItem:
    session = require_auth(request)
    response = await story_response_service.create_response(
        db=db,
        story_id=story_id,
        user_id=session.user_id,
        data=data,
    )
    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="responded",
        entity_type="story",
        entity_id=story_id,
    )
    return response


@router.get(
    "",
    response_model=StoryResponseListResponse,
    summary="List a story's responses",
    description="Cursor-paginated, oldest first. Requires legacy membership or authorship.",
)
async def list_responses(
    story_id: UUID,
    request: Request,
    cursor: str | None = Query(None, description="ISO timestamp cursor for pagination"),
    limit: int = Query(20, ge=1, le=100, description="Max items to return"),
    db: AsyncSession = Depends(get_db),
) -> StoryResponseListResponse:
    session = require_auth(request)

    cursor_dt = None
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid cursor: {cursor}")

    result = await story_response_service.list_responses(
        db=db,
        story_id=story_id,
        user_id=session.user_id,
        cursor=cursor_dt,
        limit=limit,
    )
    return StoryResponseListResponse(**result)


@router.patch(
    "/{response_id}",
    response_model=StoryResponseItem,
    summary="Edit a response",
    description="Update a response's body. Author-only.",
)
async def update_response(
    story_id: UUID,
    response_id: UUID,
    data: StoryResponseUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryResponseItem:
    session = require_auth(request)
    return await story_response_service.update_response(
        db=db,
        story_id=story_id,
        response_id=response_id,
        user_id=session.user_id,
        data=data,
    )


@router.delete(
    "/{response_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a response",
    description="Remove a response. Author or legacy creator/admin can delete.",
)
async def delete_response(
    story_id: UUID,
    response_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    session = require_auth(request)
    await story_response_service.delete_response(
        db=db,
        story_id=story_id,
        response_id=response_id,
        user_id=session.user_id,
    )
