"""API routes for story evolution workflow."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import require_auth
from app.database import get_db
from app.providers.registry import get_provider_registry
from app.schemas.ai import SSEErrorEvent
from app.schemas.story_evolution import (
    EvolutionSessionCreate,
    EvolutionSessionResponse,
    EvolutionSSEChunkEvent,
    EvolutionSSEDoneEvent,
    PhaseAdvanceRequest,
    RevisionRequest,
)
from app.services import story_evolution as evolution_service
from app.services.story_writer import StoryWriterAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories/{story_id}/evolution", tags=["evolution"])


@router.post("", status_code=201, response_model=EvolutionSessionResponse)
async def start_evolution(
    story_id: UUID,
    data: EvolutionSessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Start a new evolution session for a story."""
    session_data = require_auth(request)
    evo_session = await evolution_service.start_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
        persona_id=data.persona_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.get("/active", response_model=EvolutionSessionResponse)
async def get_active_session(
    story_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Get the active evolution session for a story."""
    session_data = require_auth(request)
    evo_session = await evolution_service.get_active_session(
        db=db,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    if not evo_session:
        raise HTTPException(status_code=404, detail="No active evolution session")
    return EvolutionSessionResponse.model_validate(evo_session)


@router.patch(
    "/{session_id}/phase",
    response_model=EvolutionSessionResponse,
)
async def advance_phase(
    story_id: UUID,
    session_id: UUID,
    data: PhaseAdvanceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Advance the evolution session phase."""
    session_data = require_auth(request)
    evo_session = await evolution_service.advance_phase(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
        target_phase=data.phase,
        summary_text=data.summary_text,
        writing_style=data.writing_style,
        length_preference=data.length_preference,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post(
    "/{session_id}/discard",
    response_model=EvolutionSessionResponse,
)
async def discard_session(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Discard an evolution session."""
    session_data = require_auth(request)
    evo_session = await evolution_service.discard_session(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post(
    "/{session_id}/accept",
    response_model=EvolutionSessionResponse,
)
async def accept_session(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolutionSessionResponse:
    """Accept the draft and complete the session."""
    session_data = require_auth(request)
    evo_session = await evolution_service.accept_session(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )
    return EvolutionSessionResponse.model_validate(evo_session)


@router.post("/{session_id}/generate")
async def generate_draft(
    story_id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Trigger draft generation. Streams result via SSE."""
    session_data = require_auth(request)

    evo_session = await evolution_service.get_session_for_generation(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )

    writer = StoryWriterAgent()
    registry = get_provider_registry()
    llm = registry.get_llm_provider()

    async def generate_stream() -> AsyncGenerator[str, None]:
        try:
            context = await evolution_service.build_generation_context(
                db=db, session=evo_session
            )

            system_prompt = writer.build_system_prompt(
                writing_style=context["writing_style"],
                length_preference=context["length_preference"],
                legacy_name=context["legacy_name"],
                relationship_context=context.get("relationship_context", ""),
                is_revision=False,
            )

            user_message = writer.build_user_message(
                original_story=context["original_story"],
                summary_text=context["summary_text"],
            )

            full_text = ""
            async for chunk in writer.stream_draft(
                llm_provider=llm,
                system_prompt=system_prompt,
                user_message=user_message,
                model_id=context["model_id"],
            ):
                full_text += chunk
                event = EvolutionSSEChunkEvent(text=chunk)
                yield f"data: {event.model_dump_json()}\n\n"

            # Create draft version and advance phase
            version = await evolution_service.save_draft(
                db=db,
                session=evo_session,
                title=context["story_title"],
                content=full_text,
                user_id=session_data.user_id,
            )

            done_event = EvolutionSSEDoneEvent(
                version_id=version.id,
                version_number=version.version_number,
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception:
            logger.exception("evolution.generate.error")
            error_event = SSEErrorEvent(
                message="Draft generation failed. Please try again.",
                retryable=True,
            )
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/revise")
async def revise_draft(
    story_id: UUID,
    session_id: UUID,
    data: RevisionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Revise the current draft with feedback. Streams via SSE."""
    session_data = require_auth(request)

    evo_session = await evolution_service.get_session_for_revision(
        db=db,
        session_id=session_id,
        story_id=story_id,
        user_id=session_data.user_id,
    )

    writer = StoryWriterAgent()
    registry = get_provider_registry()
    llm = registry.get_llm_provider()

    async def revise_stream() -> AsyncGenerator[str, None]:
        try:
            context = await evolution_service.build_generation_context(
                db=db, session=evo_session, include_draft=True
            )

            system_prompt = writer.build_system_prompt(
                writing_style=context["writing_style"],
                length_preference=context["length_preference"],
                legacy_name=context["legacy_name"],
                relationship_context=context.get("relationship_context", ""),
                is_revision=True,
            )

            user_message = writer.build_user_message(
                original_story=context["original_story"],
                summary_text=context["summary_text"],
                previous_draft=context.get("previous_draft"),
                revision_instructions=data.instructions,
            )

            full_text = ""
            async for chunk in writer.stream_draft(
                llm_provider=llm,
                system_prompt=system_prompt,
                user_message=user_message,
                model_id=context["model_id"],
            ):
                full_text += chunk
                event = EvolutionSSEChunkEvent(text=chunk)
                yield f"data: {event.model_dump_json()}\n\n"

            version = await evolution_service.update_draft(
                db=db,
                session=evo_session,
                content=full_text,
            )

            done_event = EvolutionSSEDoneEvent(
                version_id=version.id,
                version_number=version.version_number,
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception:
            logger.exception("evolution.revise.error")
            error_event = SSEErrorEvent(
                message="Revision failed. Please try again.",
                retryable=True,
            )
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        revise_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
