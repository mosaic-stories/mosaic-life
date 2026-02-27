"""API route for graph context (related stories and entities)."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.associations import StoryLegacy
from app.providers.registry import get_provider_registry
from app.schemas.graph_context import (
    EntityGroup,
    GraphContextResponse,
    RelatedStory,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}", tags=["graph-context"])


@router.get("/graph-context", response_model=GraphContextResponse)
async def get_graph_context(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> GraphContextResponse:
    """Get graph-connected stories and entities for a story.

    Returns related stories, people, places, events, and objects
    discovered through the graph database.
    """
    session_data = require_auth(request)
    user_id = session_data.user_id

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        return GraphContextResponse()

    # Load primary legacy
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    if not primary:
        return GraphContextResponse()

    legacy_name = "the person"
    leg = await db.execute(select(Legacy).where(Legacy.id == primary.legacy_id))
    legacy = leg.scalar_one_or_none()
    if legacy:
        legacy_name = legacy.name

    # Try to get graph context
    registry = get_provider_registry()
    service = registry.get_graph_context_service()
    if not service:
        return GraphContextResponse()

    try:
        assembled = await service.assemble_context(
            query=story.content[:500],
            legacy_id=primary.legacy_id,
            user_id=user_id,
            persona_type="biographer",
            db=db,
            token_budget=3000,
            legacy_name=legacy_name,
        )

        # Convert graph results to response schema
        related_stories: list[RelatedStory] = []
        for gr in assembled.graph_results:
            related_stories.append(
                RelatedStory(
                    id=str(gr.story_id),
                    title=gr.source_type,
                    snippet="",
                    relevance=gr.relevance_score,
                )
            )

        # Extract entities from metadata if available
        entities = EntityGroup()
        if assembled.metadata and hasattr(assembled.metadata, "intent"):
            intent = assembled.metadata.intent
            if intent and hasattr(intent, "entities"):
                ents = intent.entities
                entities = EntityGroup(
                    people=ents.get("people", []),
                    places=ents.get("places", []),
                    events=ents.get("events", []),
                    objects=ents.get("objects", []),
                )

        return GraphContextResponse(
            related_stories=related_stories,
            entities=entities,
        )

    except Exception as exc:
        logger.warning(
            "graph_context.route.failed",
            extra={"story_id": str(story_id), "error": str(exc)},
        )
        return GraphContextResponse()
