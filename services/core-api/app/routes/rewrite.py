"""API route for story rewrite (SSE streaming)."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.associations import StoryLegacy
from app.models.story_version import StoryVersion
from app.providers.registry import get_provider_registry
from app.schemas.ai import SSEErrorEvent
from app.schemas.rewrite import RewriteRequest
from app.schemas.story_evolution import EvolutionSSEChunkEvent, EvolutionSSEDoneEvent
from app.services.story_writer import StoryWriterAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}", tags=["rewrite"])


@router.post("/rewrite")
async def rewrite_story(
    story_id: UUID,
    data: RewriteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Rewrite a story with AI assistance. Streams result via SSE.

    Gathers context from the conversation, graph database, and pinned items,
    then streams a full rewrite of the story content.
    """
    session_data = require_auth(request)
    user_id = session_data.user_id

    # Load story
    story_result = await db.execute(select(Story).where(Story.id == story_id))
    story = story_result.scalar_one_or_none()
    if not story:
        return StreamingResponse(
            _error_stream("Story not found", retryable=False),
            media_type="text/event-stream",
            status_code=404,
        )

    # Load legacy name
    legacy_name = "the person"
    legacy_result = await db.execute(
        select(StoryLegacy).where(
            StoryLegacy.story_id == story_id,
            StoryLegacy.role == "primary",
        )
    )
    primary = legacy_result.scalar_one_or_none()
    if primary:
        leg = await db.execute(select(Legacy).where(Legacy.id == primary.legacy_id))
        legacy = leg.scalar_one_or_none()
        if legacy:
            legacy_name = legacy.name

    writer = StoryWriterAgent()
    registry = get_provider_registry()
    llm = registry.get_llm_provider()

    from app.config.personas import get_persona

    persona = get_persona(data.persona_id)
    model_id = (
        persona.model_id if persona else "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )

    async def rewrite_stream() -> AsyncGenerator[str, None]:
        try:
            # Build context from graph if available
            additional_context = ""
            try:
                graph_context_service = registry.get_graph_context_service()
                if graph_context_service and primary:
                    assembled = await graph_context_service.assemble_context(
                        query=data.content[:500],
                        legacy_id=primary.legacy_id,
                        user_id=user_id,
                        persona_type=data.persona_id,
                        db=db,
                        token_budget=2000,
                        legacy_name=legacy_name,
                    )
                    if assembled.formatted_context:
                        additional_context = (
                            "\n\n## Related Context\n" + assembled.formatted_context
                        )
            except Exception as exc:
                logger.warning(
                    "rewrite.graph_context_failed",
                    extra={"error": str(exc)},
                )

            # Load conversation summary if conversation_id provided
            conversation_summary = ""
            if data.conversation_id:
                conversation_summary = await _get_conversation_summary(
                    db, data.conversation_id
                )

            system_prompt = writer.build_system_prompt(
                writing_style=data.writing_style or "vivid",
                length_preference=data.length_preference or "similar",
                legacy_name=legacy_name,
                relationship_context="",
                is_revision=False,
            )

            user_message = writer.build_user_message(
                original_story=data.content,
                summary_text=conversation_summary + additional_context,
            )

            full_text = ""
            async for chunk in writer.stream_draft(
                llm_provider=llm,
                system_prompt=system_prompt,
                user_message=user_message,
                model_id=model_id,
            ):
                full_text += chunk
                event = EvolutionSSEChunkEvent(text=chunk)
                yield f"data: {event.model_dump_json()}\n\n"

            # Save as draft version
            version = await _save_rewrite_version(
                db=db,
                story=story,
                content=full_text,
                user_id=user_id,
                conversation_id=data.conversation_id,
            )

            done_event = EvolutionSSEDoneEvent(
                version_id=version.id,
                version_number=version.version_number,
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception:
            logger.exception("rewrite.stream.error")
            await db.rollback()
            error_event = SSEErrorEvent(
                message="Rewrite failed. Please try again.",
                retryable=True,
            )
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        rewrite_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _get_conversation_summary(db: AsyncSession, conversation_id: str) -> str:
    """Load recent messages from a conversation as summary context."""
    from app.models.ai import AIConversation, AIMessage

    conv_result = await db.execute(
        select(AIConversation).where(AIConversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        return ""

    msg_result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.desc())
        .limit(20)
    )
    messages = list(reversed(msg_result.scalars().all()))

    if not messages:
        return ""

    parts: list[str] = []
    for msg in messages:
        role = "User" if msg.role == "user" else "AI"
        parts.append(f"{role}: {msg.content}")

    return "\n".join(parts)


async def _save_rewrite_version(
    db: AsyncSession,
    story: Story,
    content: str,
    user_id: UUID,
    conversation_id: str | None,
) -> StoryVersion:
    """Save the rewritten content as a draft version."""
    # Get next version number
    max_result = await db.execute(
        select(StoryVersion.version_number)
        .where(StoryVersion.story_id == story.id)
        .order_by(StoryVersion.version_number.desc())
        .limit(1)
    )
    max_version = max_result.scalar_one_or_none() or 0

    draft = StoryVersion(
        story_id=story.id,
        version_number=max_version + 1,
        title=story.title,
        content=content,
        status="draft",
        source="ai_rewrite",
        created_by=user_id,
    )
    if conversation_id:
        draft.source_conversation_id = conversation_id  # type: ignore[assignment]

    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    return draft


async def _error_stream(
    message: str, retryable: bool = True
) -> AsyncGenerator[str, None]:
    error_event = SSEErrorEvent(message=message, retryable=retryable)
    yield f"data: {error_event.model_dump_json()}\n\n"
