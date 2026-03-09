"""Story prompts API routes."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.middleware import require_auth
from ..database import get_db
from ..models.legacy import Legacy
from ..schemas.story_prompt import (
    ActOnPromptRequest,
    ActOnPromptResponse,
    StoryPromptResponse,
)
from ..services.legacy import get_profile_image_url
from ..services import story_prompts as prompts_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


def _legacy_profile_image_url(legacy: Legacy | None) -> str | None:
    if not legacy or not legacy.profile_image_id:
        return None
    return get_profile_image_url(legacy)


@router.get("/current", response_model=StoryPromptResponse | None)
async def get_current_prompt(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryPromptResponse | Response:
    """Get the user's current active story prompt.

    Returns 204 if user has no legacies or no prompt available.
    """
    session_data = require_auth(request)
    prompt = await prompts_service.get_or_create_active_prompt(db, session_data.user_id)
    if not prompt:
        await db.commit()
        return Response(status_code=204)

    legacy = await db.get(Legacy, prompt.legacy_id)
    legacy_name = legacy.name if legacy else "Unknown"
    legacy_profile_image_url = _legacy_profile_image_url(legacy)

    await db.commit()

    return StoryPromptResponse(
        id=str(prompt.id),
        legacy_id=str(prompt.legacy_id),
        legacy_name=legacy_name,
        legacy_profile_image_url=legacy_profile_image_url,
        prompt_text=prompt.prompt_text,
        category=prompt.category,
        created_at=prompt.created_at,
    )


@router.post("/{prompt_id}/shuffle", response_model=StoryPromptResponse | None)
async def shuffle_prompt(
    prompt_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryPromptResponse | Response:
    """Rotate the current prompt and get a new one."""
    session_data = require_auth(request)
    prompt = await prompts_service.shuffle_prompt(db, prompt_id, session_data.user_id)
    if not prompt:
        await db.commit()
        return Response(status_code=204)

    legacy = await db.get(Legacy, prompt.legacy_id)
    legacy_name = legacy.name if legacy else "Unknown"
    legacy_profile_image_url = _legacy_profile_image_url(legacy)

    await db.commit()

    return StoryPromptResponse(
        id=str(prompt.id),
        legacy_id=str(prompt.legacy_id),
        legacy_name=legacy_name,
        legacy_profile_image_url=legacy_profile_image_url,
        prompt_text=prompt.prompt_text,
        category=prompt.category,
        created_at=prompt.created_at,
    )


@router.post("/{prompt_id}/act", response_model=ActOnPromptResponse)
async def act_on_prompt(
    prompt_id: UUID,
    body: ActOnPromptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ActOnPromptResponse:
    """Act on a prompt — write a story or start a discussion."""
    session_data = require_auth(request)
    result = await prompts_service.act_on_prompt(
        db, prompt_id, body.action, session_data.user_id
    )
    await db.commit()

    return ActOnPromptResponse(
        action=result["action"] or "",
        legacy_id=result["legacy_id"] or "",
        story_id=result.get("story_id"),
        conversation_id=result.get("conversation_id"),
    )
