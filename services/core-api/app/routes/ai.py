"""API routes for AI chat."""

import asyncio
import hmac
import json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from opentelemetry import trace
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.ai import AIProviderError
from ..adapters.storytelling import format_story_context as format_story_context_impl
from ..auth.middleware import require_auth
from ..config.personas import get_persona, get_personas
from ..config.settings import get_settings
from ..database import get_db, get_db_for_background
from ..models.ai import AIMessage as AIMessageModel
from ..models.legacy import Legacy
from ..models.story import Story
from ..providers.registry import get_provider_registry
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    MessageCreate,
    MessageListResponse,
    PersonaResponse,
    SSEChunkEvent,
    SSEDebugEvent,
    SSEDoneEvent,
    SSEErrorEvent,
)
from ..schemas.memory import FactResponse, FactVisibilityUpdate
from ..schemas.retrieval import ChunkResult
from ..services import ai as ai_service
from ..services import memory as memory_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ai")
DEBUG_SSE_HEADER = "x-debug-sse-token"


def format_story_context(chunks: list[ChunkResult]) -> str:
    """Format retrieved chunks for the system prompt.

    Args:
        chunks: Retrieved story chunks with their content.

    Returns:
        Formatted context string for system prompt, or empty string if no chunks.
    """
    return format_story_context_impl(chunks)


# ============================================================================
# Persona Endpoints
# ============================================================================


@router.get(
    "/personas",
    response_model=list[PersonaResponse],
    summary="List available AI personas",
    description="Get list of available AI personas for chat.",
)
async def list_personas() -> list[PersonaResponse]:
    """List available AI personas."""
    personas = get_personas()
    return [
        PersonaResponse(
            id=p.id,
            name=p.name,
            icon=p.icon,
            description=p.description,
        )
        for p in personas
    ]


# ============================================================================
# Conversation Endpoints
# ============================================================================


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or get conversation",
    description="Create a new conversation or get existing one for the legacy/persona.",
)
async def create_conversation(
    data: ConversationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConversationResponse:
    """Create or get existing conversation."""
    session = require_auth(request)
    return await ai_service.get_or_create_conversation(
        db=db,
        user_id=session.user_id,
        data=data,
    )


@router.post(
    "/conversations/new",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new conversation",
    description="Always creates a new conversation, even if one exists for this legacy/persona.",
)
async def create_new_conversation(
    data: ConversationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ConversationResponse:
    """Create a new conversation (always new, never returns existing)."""
    session = require_auth(request)
    return await ai_service.create_conversation(
        db=db,
        user_id=session.user_id,
        data=data,
    )


@router.post(
    "/conversations/{conversation_id}/seed",
    summary="Seed conversation with AI opening message",
    description="Stream an AI-generated opening message into an empty conversation. "
    "Requires a story_id to provide context. Idempotent: returns 204 if "
    "the conversation already has messages.",
)
async def seed_conversation(
    conversation_id: UUID,
    request: Request,
    story_id: UUID = Query(
        ..., description="Story to use as context for the opening message"
    ),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Seed a conversation with a contextual AI opening message via SSE."""
    session = require_auth(request)

    with tracer.start_as_current_span("ai.conversation.seed") as span:
        span.set_attribute("user_id", str(session.user_id))
        span.set_attribute("conversation_id", str(conversation_id))
        span.set_attribute("story_id", str(story_id))

        # Get conversation and verify ownership
        conversation = await ai_service.get_conversation(
            db=db,
            conversation_id=conversation_id,
            user_id=session.user_id,
        )

        # Idempotency: if conversation already has messages, return 204
        msg_count_result = await db.execute(
            select(func.count(AIMessageModel.id)).where(
                AIMessageModel.conversation_id == conversation_id
            )
        )
        if (msg_count_result.scalar() or 0) > 0:
            return StreamingResponse(
                content=iter([]),
                status_code=204,
                media_type="text/plain",
            )

        # Load story
        story_result = await db.execute(select(Story).where(Story.id == story_id))
        story = story_result.scalar_one_or_none()
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")

        # Load legacy name from conversation's linked legacy
        primary_legacy_id = ai_service.get_primary_legacy_id(conversation)
        legacy_result = await db.execute(
            select(Legacy).where(Legacy.id == primary_legacy_id)
        )
        legacy = legacy_result.scalar_one()

        # Get persona config
        persona = get_persona(conversation.persona_id)
        if not persona:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid persona: {conversation.persona_id}",
            )

        # Best-effort graph context
        story_context = ""
        registry = get_provider_registry()
        try:
            graph_context_service = registry.get_graph_context_service()
            if graph_context_service:
                assembled = await graph_context_service.assemble_context(
                    query=story.content[:500],
                    legacy_id=primary_legacy_id,
                    user_id=session.user_id,
                    persona_type=conversation.persona_id,
                    db=db,
                    token_budget=2000,
                    legacy_name=legacy.name,
                )
                story_context = assembled.formatted_context
                span.set_attribute("graph.context_length", len(story_context))
        except Exception:
            logger.warning(
                "ai.seed.graph_context_failed",
                extra={"conversation_id": str(conversation_id)},
            )

        # Build elicitation-mode system prompt
        from ..config.personas import build_system_prompt

        system_prompt = build_system_prompt(
            persona_id=conversation.persona_id,
            legacy_name=legacy.name,
            story_context=story_context,
            elicitation_mode=True,
            original_story_text=story.content,
            include_graph_suggestions=bool(story_context),
        )
        if not system_prompt:
            raise HTTPException(status_code=500, detail="Failed to build system prompt")

        # Seed instruction (not saved to conversation)
        seed_instruction = (
            "[System] The user has just started a story evolution session. "
            "This is the very first message in the conversation. Please:\n"
            "1. Briefly greet the user and introduce what you'll be doing together\n"
            "2. Share what stood out to you about the story — key moments, themes, "
            "or details that caught your attention\n"
            "3. Suggest 2-3 specific directions they could explore to deepen the story "
            "(use the story context provided, including any connected stories or people)\n"
            "4. Let them know they're free to take the conversation in any direction\n\n"
            "Keep it warm, concise, and inviting. Use 2-3 short paragraphs."
        )

        llm = registry.get_llm_provider()

        async def seed_stream() -> AsyncGenerator[str, None]:
            full_response = ""
            try:
                async for chunk in llm.stream_generate(
                    messages=[{"role": "user", "content": seed_instruction}],
                    system_prompt=system_prompt,
                    model_id=persona.model_id,
                    max_tokens=persona.max_tokens,
                ):
                    full_response += chunk
                    event = SSEChunkEvent(content=chunk)
                    yield f"data: {event.model_dump_json()}\n\n"

                # Save as assistant message (seed instruction NOT saved)
                message = await ai_service.save_message(
                    db=db,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                )

                done_event = SSEDoneEvent(
                    message_id=message.id,
                    token_count=None,
                )
                yield f"data: {done_event.model_dump_json()}\n\n"

            except Exception:
                logger.exception(
                    "ai.seed.stream_error",
                    extra={"conversation_id": str(conversation_id)},
                )
                error_event = SSEErrorEvent(
                    message="Failed to generate opening message.",
                    retryable=True,
                )
                yield f"data: {error_event.model_dump_json()}\n\n"

        return StreamingResponse(
            seed_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )


@router.get(
    "/conversations",
    response_model=list[ConversationSummary],
    summary="List conversations",
    description="List user's AI conversations, optionally filtered by legacy and persona.",
)
async def list_conversations(
    request: Request,
    legacy_id: UUID | None = Query(None, description="Filter by legacy"),
    persona_id: str | None = Query(None, description="Filter by persona"),
    limit: int = Query(10, ge=1, le=50, description="Maximum conversations to return"),
    db: AsyncSession = Depends(get_db),
) -> list[ConversationSummary]:
    """List user's conversations."""
    session = require_auth(request)
    return await ai_service.list_conversations(
        db=db,
        user_id=session.user_id,
        legacy_id=legacy_id,
        persona_id=persona_id,
        limit=limit,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessageListResponse,
    summary="Get conversation messages",
    description="Get paginated message history for a conversation.",
)
async def get_messages(
    conversation_id: UUID,
    request: Request,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> MessageListResponse:
    """Get messages for a conversation."""
    session = require_auth(request)
    return await ai_service.get_conversation_messages(
        db=db,
        conversation_id=conversation_id,
        user_id=session.user_id,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete conversation",
    description="Delete a conversation and all its messages.",
)
async def delete_conversation(
    conversation_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a conversation."""
    session = require_auth(request)
    await ai_service.delete_conversation(
        db=db,
        conversation_id=conversation_id,
        user_id=session.user_id,
    )


# ============================================================================
# Fact Management Endpoints
# ============================================================================


@router.get(
    "/legacies/{legacy_id}/facts",
    response_model=list[FactResponse],
    summary="List facts for a legacy",
    description="List the current user's facts for a legacy.",
)
async def list_facts(
    legacy_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[FactResponse]:
    """List facts for a legacy visible to the current user."""
    session = require_auth(request)
    facts = await memory_service.list_user_facts(
        db=db,
        legacy_id=legacy_id,
        user_id=session.user_id,
    )
    return [FactResponse.model_validate(f) for f in facts]


@router.delete(
    "/facts/{fact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a fact",
    description="Delete a fact you own.",
)
async def delete_fact(
    fact_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a fact (ownership enforced)."""
    session = require_auth(request)
    await memory_service.delete_fact(
        db=db,
        fact_id=fact_id,
        user_id=session.user_id,
    )


@router.patch(
    "/facts/{fact_id}/visibility",
    response_model=FactResponse,
    summary="Update fact visibility",
    description="Toggle a fact between private and shared.",
)
async def update_fact_visibility(
    fact_id: UUID,
    data: FactVisibilityUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FactResponse:
    """Update fact visibility (ownership enforced)."""
    session = require_auth(request)
    fact = await memory_service.update_fact_visibility(
        db=db,
        fact_id=fact_id,
        user_id=session.user_id,
        visibility=data.visibility,
    )
    return FactResponse.model_validate(fact)


async def _extract_context_from_conversation(
    conversation_id: UUID,
    user_id: UUID,
    user_content: str,
    assistant_content: str,
    message_id: UUID,
) -> None:
    """Background task to extract context from conversation."""
    try:
        async for bg_db in get_db_for_background():
            # Find story_id via conversation's legacy associations
            from app.models.associations import ConversationLegacy, StoryLegacy

            conv_legacy_result = await bg_db.execute(
                select(ConversationLegacy.legacy_id).where(
                    ConversationLegacy.conversation_id == conversation_id,
                    ConversationLegacy.role == "primary",
                )
            )
            legacy_id = conv_legacy_result.scalar_one_or_none()
            if not legacy_id:
                return

            story_legacy_result = await bg_db.execute(
                select(StoryLegacy.story_id)
                .where(
                    StoryLegacy.legacy_id == legacy_id,
                    StoryLegacy.role == "primary",
                )
                .limit(1)
            )
            story_id = story_legacy_result.scalar_one_or_none()
            if not story_id:
                return

            from app.services.context_extractor import ContextExtractor
            from app.providers.registry import get_provider_registry
            from app.config import get_settings

            registry = get_provider_registry()
            llm = registry.get_llm_provider()
            settings = get_settings()
            model_id = (
                getattr(settings, "context_extraction_model_id", None)
                or "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
            )
            extractor = ContextExtractor(llm_provider=llm, model_id=model_id)

            await extractor.extract_from_conversation(
                db=bg_db,
                story_id=story_id,
                user_id=user_id,
                user_message=user_content,
                assistant_message=assistant_content,
                message_id=message_id,
            )
    except Exception:
        logger.exception(
            "context_extraction.background.failed",
            extra={"conversation_id": str(conversation_id)},
        )


# ============================================================================
# Message/Chat Endpoints
# ============================================================================


@router.post(
    "/conversations/{conversation_id}/messages",
    summary="Send message and stream response",
    description="Send a message and receive AI response as SSE stream.",
)
async def send_message(
    conversation_id: UUID,
    data: MessageCreate,
    request: Request,
    debug: bool = Query(
        False, description="Include graph-augmented RAG debug metadata"
    ),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Send message and stream AI response."""
    session = require_auth(request)

    with tracer.start_as_current_span("ai.chat.request") as span:
        span.set_attribute("user_id", str(session.user_id))
        span.set_attribute("conversation_id", str(conversation_id))

        # Get conversation and verify ownership
        conversation = await ai_service.get_conversation(
            db=db,
            conversation_id=conversation_id,
            user_id=session.user_id,
        )

        # Get primary legacy for system prompt
        primary_legacy_id = ai_service.get_primary_legacy_id(conversation)
        span.set_attribute("legacy_id", str(primary_legacy_id))
        span.set_attribute("persona_id", conversation.persona_id)

        # Get persona config
        persona = get_persona(conversation.persona_id)
        if not persona:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid persona: {conversation.persona_id}",
            )

        # Get legacy name for prompt
        legacy_result = await db.execute(
            select(Legacy).where(Legacy.id == primary_legacy_id)
        )
        legacy = legacy_result.scalar_one()

        # Save user message BEFORE streaming starts and capture its ID
        user_message = await ai_service.save_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=data.content,
        )
        user_message_id = user_message.id

        storytelling_agent = get_provider_registry().get_storytelling_agent()

        async def generate_stream() -> AsyncGenerator[str, None]:
            """Generate SSE stream."""
            full_response = ""
            token_count: int | None = None

            try:
                turn = await storytelling_agent.prepare_turn(
                    db=db,
                    conversation_id=conversation_id,
                    user_id=session.user_id,
                    user_query=data.content,
                    legacy_id=primary_legacy_id,
                    persona_id=conversation.persona_id,
                    legacy_name=legacy.name,
                    top_k=5,
                )
                span.set_attribute("rag.chunks_retrieved", turn.chunks_count)

                async for chunk in storytelling_agent.stream_response(
                    turn=turn,
                    model_id=persona.model_id,
                    max_tokens=persona.max_tokens,
                ):
                    full_response += chunk
                    event = SSEChunkEvent(content=chunk)
                    yield f"data: {event.model_dump_json()}\n\n"

                # Save assistant message
                message = await storytelling_agent.save_assistant_message(
                    db=db,
                    conversation_id=conversation_id,
                    content=full_response,
                    token_count=token_count,
                )

                # Fire-and-forget background context extraction
                asyncio.create_task(
                    _extract_context_from_conversation(
                        conversation_id=conversation_id,
                        user_id=session.user_id,
                        user_content=data.content,
                        assistant_content=full_response,
                        message_id=message.id,
                    )
                )

                # Trigger background summarization check
                try:
                    await memory_service.maybe_summarize(
                        db=db,
                        conversation_id=conversation_id,
                        user_id=session.user_id,
                        legacy_id=primary_legacy_id,
                        legacy_name=legacy.name,
                    )
                except Exception:
                    logger.exception(
                        "ai.chat.summarization_failed",
                        extra={"conversation_id": str(conversation_id)},
                    )

                # Send done event
                done_event = SSEDoneEvent(
                    message_id=message.id,
                    token_count=token_count,
                )
                yield f"data: {done_event.model_dump_json()}\n\n"

                # Send debug event if requested
                if debug and turn.graph_context_metadata is not None:
                    from ..services.graph_context import ContextMetadata

                    meta = turn.graph_context_metadata
                    if isinstance(meta, ContextMetadata):
                        debug_event = SSEDebugEvent(
                            intent={
                                "type": meta.intent,
                                "confidence": meta.intent_confidence,
                            },
                            context_sources=[{"source": s} for s in meta.sources],
                            circuit_state=meta.circuit_breaker_state,
                        )
                        yield f"data: {debug_event.model_dump_json()}\n\n"

                logger.info(
                    "ai.chat.complete",
                    extra={
                        "conversation_id": str(conversation_id),
                        "message_id": str(message.id),
                        "response_length": len(full_response),
                    },
                )

            except AIProviderError as e:
                logger.warning(
                    "ai.chat.error",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": e.message,
                        "retryable": e.retryable,
                        "error_code": e.code,
                        "provider": e.provider,
                        "operation": e.operation,
                    },
                )

                # Mark user message as blocked if guardrail intervened
                if "filtered for safety" in e.message:
                    await ai_service.mark_message_blocked(db, user_message_id)

                error_event = SSEErrorEvent(
                    message=e.message,
                    retryable=e.retryable,
                )
                yield f"data: {error_event.model_dump_json()}\n\n"

            except Exception:
                logger.exception(
                    "ai.chat.unexpected_error",
                    extra={"conversation_id": str(conversation_id)},
                )
                error_event = SSEErrorEvent(
                    message="An unexpected error occurred.",
                    retryable=False,
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


@router.get(
    "/debug/stream",
    summary="Debug SSE probe (GET)",
    description=(
        "Internal-only endpoint for validating streaming behavior through upstream proxies. "
        "Requires the X-Debug-SSE-Token header."
    ),
)
@router.post(
    "/debug/stream",
    summary="Debug SSE probe (POST)",
    description=(
        "POST version of debug SSE probe to test if POST requests behave differently. "
        "Requires the X-Debug-SSE-Token header."
    ),
)
async def debug_sse_probe(request: Request) -> StreamingResponse:
    """Emit a short SSE stream without requiring Google auth."""
    settings = get_settings()
    if not settings.debug_sse_enabled or not settings.debug_sse_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Debug stream disabled"
        )

    provided_token = request.headers.get(DEBUG_SSE_HEADER)
    if not provided_token or not hmac.compare_digest(
        provided_token, settings.debug_sse_token
    ):
        logger.warning(
            "ai.debug_sse.invalid_token",
            extra={"client_ip": request.client.host if request.client else None},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid debug token"
        )

    interval = max(settings.debug_sse_interval_ms, 50) / 1000
    max_seconds = max(settings.debug_sse_max_seconds, 1)

    async def generate_debug_stream() -> AsyncGenerator[str, None]:
        """Generate predictable SSE events for troubleshooting."""
        yield ": debug-sse-start\n\n"
        start_time = time.monotonic()
        sequence = 0
        while time.monotonic() - start_time < max_seconds:
            sequence += 1
            payload = {
                "type": "debug-chunk",
                "sequence": sequence,
                "timestamp": datetime.now(timezone.utc).isoformat(
                    timespec="milliseconds"
                ),
                "uptime_ms": int((time.monotonic() - start_time) * 1000),
            }
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(interval)

        done_payload = {
            "type": "debug-done",
            "sequence": sequence,
            "duration_ms": int((time.monotonic() - start_time) * 1000),
        }
        yield f"data: {json.dumps(done_payload)}\n\n"

    logger.info(
        "ai.debug_sse.start",
        extra={"client_ip": request.client.host if request.client else None},
    )
    return StreamingResponse(
        generate_debug_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
