"""API routes for story reactions."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..schemas.story_reaction import (
    StoryReactionToggleRequest,
    StoryReactionToggleResponse,
)
from ..services import activity as activity_service
from ..services import story_reaction as story_reaction_service

router = APIRouter(prefix="/api/stories/{story_id}/reactions", tags=["story-reactions"])


@router.post(
    "",
    response_model=StoryReactionToggleResponse,
    summary="Toggle a reaction on a story",
    description=(
        "Add or remove one of the three fixed reaction types (heart, candle, "
        "smile). Reacting again with the same type removes it (toggle). "
        "Requires legacy membership or authorship."
    ),
)
async def toggle_reaction(
    story_id: UUID,
    data: StoryReactionToggleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryReactionToggleResponse:
    session = require_auth(request)
    result = await story_reaction_service.toggle_reaction(
        db=db,
        story_id=story_id,
        user_id=session.user_id,
        reaction_type=data.reaction_type,
    )
    if result["reacted"]:
        # Only record on toggle-on, never on toggle-off/removal.
        await activity_service.record_activity(
            db=db,
            user_id=session.user_id,
            action="reacted",
            entity_type="story",
            entity_id=story_id,
            metadata={"reaction_type": result["reaction_type"]},
        )
    return StoryReactionToggleResponse(**result)
