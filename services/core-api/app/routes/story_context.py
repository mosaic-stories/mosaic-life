"""API routes for story context (extracted facts and summary)."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.middleware import require_auth
from app.database import get_db, get_db_for_background
from app.models.story import Story
from app.models.story_context import ContextFact, StoryContext
from app.providers.registry import get_provider_registry
from app.schemas.story_context import (
    ExtractRequest,
    ExtractResponse,
    FactStatusUpdate,
    ContextFactResponse,
    StoryContextResponse,
)
from app.services.context_extractor import ContextExtractor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}/context", tags=["story-context"])


def _get_extractor() -> ContextExtractor:
    """Create a ContextExtractor with the configured LLM provider."""
    registry = get_provider_registry()
    llm = registry.get_llm_provider()
    from app.config import get_settings

    settings = get_settings()
    model_id = (
        getattr(settings, "context_extraction_model_id", None)
        or "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )
    return ContextExtractor(llm_provider=llm, model_id=model_id)


@router.get("", response_model=StoryContextResponse)
async def get_story_context(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StoryContextResponse:
    """Get the extracted context (summary + facts) for a story."""
    session_data = require_auth(request)

    result = await db.execute(
        select(StoryContext)
        .options(selectinload(StoryContext.facts))
        .where(
            StoryContext.story_id == story_id,
            StoryContext.user_id == session_data.user_id,
        )
    )
    ctx = result.scalar_one_or_none()

    if not ctx:
        # Return empty context (not yet extracted)
        raise HTTPException(status_code=404, detail="No context found for this story")

    # Filter out dismissed facts from the response
    active_facts = [f for f in ctx.facts if f.status != "dismissed"]

    return StoryContextResponse(
        id=ctx.id,
        story_id=ctx.story_id,
        summary=ctx.summary,
        summary_updated_at=ctx.summary_updated_at,
        extracting=ctx.extracting,
        facts=[ContextFactResponse.model_validate(f) for f in active_facts],
    )


@router.post("/extract", response_model=ExtractResponse, status_code=202)
async def extract_context(
    story_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    data: ExtractRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> ExtractResponse:
    """Trigger context extraction from story text. Runs in background."""
    session_data = require_auth(request)
    user_id = session_data.user_id
    force = data.force if data else False

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # Check if already extracted and not forcing
    if not force:
        existing = await db.execute(
            select(StoryContext).where(
                StoryContext.story_id == story_id,
                StoryContext.user_id == user_id,
            )
        )
        ctx = existing.scalar_one_or_none()
        if ctx and ctx.summary and not ctx.extracting:
            return ExtractResponse(status="cached")

    # Run extraction in background
    story_content = story.content

    async def background_extract() -> None:
        try:
            async for bg_db in get_db_for_background():
                extractor = _get_extractor()
                await extractor.extract_from_story(
                    db=bg_db,
                    story_id=story_id,
                    user_id=user_id,
                    story_content=story_content,
                )
        except Exception:
            logger.exception(
                "story_context.extract.background_failed",
                extra={"story_id": str(story_id)},
            )

    background_tasks.add_task(background_extract)
    return ExtractResponse(status="extracting")


@router.patch(
    "/facts/{fact_id}",
    response_model=ContextFactResponse,
)
async def update_fact_status(
    story_id: UUID,
    fact_id: UUID,
    data: FactStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ContextFactResponse:
    """Update a fact's status (pin, dismiss, reactivate)."""
    session_data = require_auth(request)

    # Verify the fact belongs to this user's context for this story
    result = await db.execute(
        select(ContextFact)
        .join(StoryContext)
        .where(
            ContextFact.id == fact_id,
            StoryContext.story_id == story_id,
            StoryContext.user_id == session_data.user_id,
        )
    )
    fact = result.scalar_one_or_none()
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    fact.status = data.status
    await db.commit()
    await db.refresh(fact)

    return ContextFactResponse.model_validate(fact)
