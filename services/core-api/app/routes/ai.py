"""API routes for AI chat."""

import asyncio
import hmac
import json
import logging
import re
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from opentelemetry import trace
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.ai import AIProviderError
from ..adapters.storytelling import format_story_context as format_story_context_impl
from ..auth.middleware import require_auth
from ..config.personas import get_persona, get_personas
from ..config.settings import get_settings
from ..database import get_db, get_db_for_background
from ..models.ai import AIMessage as AIMessageModel
from ..models.legacy import Legacy
from ..providers.registry import get_provider_registry
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    EvolveConversationRequest,
    EvolveConversationResponse,
    MessageCreate,
    MessageListResponse,
    PersonaResponse,
    SSEChunkEvent,
    SSEDebugEvent,
    SSEDoneEvent,
    SSEErrorEvent,
    SSEEvolveSuggestionEvent,
)
from ..schemas.memory import FactResponse, FactVisibilityUpdate
from ..schemas.retrieval import ChunkResult
from ..services import activity as activity_service
from ..services import ai as ai_service
from ..services import memory as memory_service
from ..services.story_access import require_story_read_access

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


_EVOLVE_SUGGEST_RE = re.compile(r"<<EVOLVE_SUGGEST:\s*(.*?)>>", re.DOTALL)
_EVOLVE_SUGGEST_PREFIX = "<<EVOLVE_SUGGEST:"


def parse_evolve_suggestion(text: str) -> tuple[str, str | None]:
    """Extract evolve suggestion marker from AI response text.

    Returns:
        Tuple of (cleaned_text, reason_or_none)
    """
    match = _EVOLVE_SUGGEST_RE.search(text)
    if not match:
        return text, None
    reason = match.group(1).strip()
    cleaned = _EVOLVE_SUGGEST_RE.sub("", text).strip()
    return cleaned, reason


def _longest_marker_prefix_suffix(text: str) -> int:
    """Return the longest suffix of text that could start an evolve marker."""
    max_len = min(len(text), len(_EVOLVE_SUGGEST_PREFIX) - 1)
    for size in range(max_len, 0, -1):
        if text.endswith(_EVOLVE_SUGGEST_PREFIX[:size]):
            return size
    return 0


def _consume_visible_chunk(
    buffer: str,
    in_marker: bool,
    chunk: str,
) -> tuple[list[str], str, bool]:
    """Consume one streamed chunk while suppressing evolve markers."""
    visible_chunks: list[str] = []
    buffer += chunk

    while buffer:
        if in_marker:
            marker_end = buffer.find(">>")
            if marker_end == -1:
                return visible_chunks, "", True

            buffer = buffer[marker_end + 2 :]
            in_marker = False
            continue

        marker_start = buffer.find(_EVOLVE_SUGGEST_PREFIX)
        if marker_start != -1:
            if marker_start > 0:
                visible_chunks.append(buffer[:marker_start])
            buffer = buffer[marker_start + len(_EVOLVE_SUGGEST_PREFIX) :]
            in_marker = True
            continue

        partial_prefix_len = _longest_marker_prefix_suffix(buffer)
        if partial_prefix_len:
            visible_chunks.append(buffer[:-partial_prefix_len])
            buffer = buffer[-partial_prefix_len:]
        else:
            visible_chunks.append(buffer)
            buffer = ""

    return visible_chunks, buffer, in_marker


def stream_visible_chunks(chunks: list[str]) -> list[str]:
    """Filter evolve markers from chunked streaming content."""
    visible_chunks: list[str] = []
    buffer = ""
    in_marker = False

    for chunk in chunks:
        next_chunks, buffer, in_marker = _consume_visible_chunk(
            buffer, in_marker, chunk
        )
        visible_chunks.extend(next_chunks)

    if buffer and not in_marker:
        visible_chunks.append(buffer)
    elif buffer and in_marker:
        visible_chunks.append(f"{_EVOLVE_SUGGEST_PREFIX}{buffer}")

    return [chunk for chunk in visible_chunks if chunk]


async def _resolve_story_id_for_extraction(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
) -> UUID | None:
    """Resolve deterministic story linkage for extraction via evolution session."""
    from ..models.story_evolution import StoryEvolutionSession

    result = await db.execute(
        select(StoryEvolutionSession.story_id)
        .where(
            StoryEvolutionSession.conversation_id == conversation_id,
            StoryEvolutionSession.created_by == user_id,
        )
        .order_by(StoryEvolutionSession.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


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
    result = await ai_service.get_or_create_conversation(
        db=db,
        user_id=session.user_id,
        data=data,
    )
    primary_legacy = next(
        (leg for leg in result.legacies if leg.position == 0),
        result.legacies[0] if result.legacies else None,
    )
    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="ai_conversation_started",
        entity_type="conversation",
        entity_id=result.id,
        metadata={
            "persona_id": result.persona_id,
            "title": result.title,
            "legacy_id": str(primary_legacy.legacy_id) if primary_legacy else None,
        },
    )
    return result


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
    result = await ai_service.create_conversation(
        db=db,
        user_id=session.user_id,
        data=data,
    )
    primary_legacy = next(
        (leg for leg in result.legacies if leg.position == 0),
        result.legacies[0] if result.legacies else None,
    )
    await activity_service.record_activity(
        db=db,
        user_id=session.user_id,
        action="ai_conversation_started",
        entity_type="conversation",
        entity_id=result.id,
        metadata={
            "persona_id": result.persona_id,
            "title": result.title,
            "legacy_id": str(primary_legacy.legacy_id) if primary_legacy else None,
        },
    )
    return result


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
    story_id: UUID | None = Query(
        None, description="Story to use as context for the opening message"
    ),
    seed_mode: str = Query(
        default="default",
        description="Seed mode: 'default' for normal, 'evolve_summary' for evolved conversations, 'story_prompt' for prompt-seeded AI chat conversations",
    ),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Seed a conversation with a contextual AI opening message via SSE."""
    session = require_auth(request)

    with tracer.start_as_current_span("ai.conversation.seed") as span:
        span.set_attribute("user_id", str(session.user_id))
        span.set_attribute("conversation_id", str(conversation_id))
        span.set_attribute("seed_mode", seed_mode)
        if story_id is not None:
            span.set_attribute("story_id", str(story_id))

        # Get conversation and verify ownership
        conversation = await ai_service.get_conversation(
            db=db,
            conversation_id=conversation_id,
            user_id=session.user_id,
        )

        message_result = await db.execute(
            select(AIMessageModel)
            .where(AIMessageModel.conversation_id == conversation_id)
            .order_by(AIMessageModel.created_at.asc(), AIMessageModel.id.asc())
        )
        conversation_messages = list(message_result.scalars())

        prompt_message: str | None = None

        # Idempotency rules vary by seed mode.
        if seed_mode == "story_prompt":
            if any(message.role == "assistant" for message in conversation_messages):
                return StreamingResponse(
                    content=iter([]),
                    status_code=204,
                    media_type="text/plain",
                )

            if (
                len(conversation_messages) != 1
                or conversation_messages[0].role != "user"
            ):
                return StreamingResponse(
                    content=iter([]),
                    status_code=204,
                    media_type="text/plain",
                )

            prompt_message = conversation_messages[0].content
        elif seed_mode != "evolve_summary":
            if conversation_messages:
                return StreamingResponse(
                    content=iter([]),
                    status_code=204,
                    media_type="text/plain",
                )

        story = None
        if seed_mode != "story_prompt":
            if story_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="story_id is required for this seed mode",
                )
            story = await require_story_read_access(
                db=db,
                story_id=story_id,
                user_id=session.user_id,
            )

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
        if seed_mode != "story_prompt" and story is not None:
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
            elicitation_mode=seed_mode != "story_prompt",
            original_story_text=story.content if story is not None else None,
            include_graph_suggestions=bool(story_context),
        )
        if not system_prompt:
            raise HTTPException(status_code=500, detail="Failed to build system prompt")

        # Seed instruction (not saved to conversation)
        has_story_content = bool(story and story.content and story.content.strip())

        if seed_mode == "story_prompt":
            seed_instruction = (
                "[System] The user's opening message in this conversation is:\n\n"
                f"{prompt_message}\n\n"
                "Please respond as the selected persona. Acknowledge the memory prompt, "
                "offer 1-2 concrete follow-up directions, and ask one warm question that helps "
                "the user continue the conversation. Keep it concise and natural."
            )
        elif seed_mode == "evolve_summary":
            # Get existing messages for context (from cloned conversation)
            context_messages = await ai_service.get_context_messages(
                db, conversation_id
            )
            conversation_summary = "\n".join(
                f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
                for m in context_messages
            )
            seed_instruction = (
                "You are now in the Evolve Workspace helping the user create a "
                "story from a conversation. "
                "Here is the conversation that was evolved:\n\n"
                f"{conversation_summary}\n\n"
                "Please:\n"
                "1. Briefly summarize the key narrative threads and memorable "
                "details from this conversation\n"
                "2. Suggest 2-3 possible story angles or themes you noticed\n"
                "3. Ask the user which direction they'd like to take\n"
                "4. Mention that when they're ready, they can use the Writer tool "
                "(pencil icon) in the toolbar above to generate a draft story\n\n"
                "Keep your response warm and concise."
            )
        elif has_story_content:
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
        else:
            seed_instruction = (
                "[System] The user has just created a brand new story and entered the workspace. "
                "The editor is completely blank — they haven't written anything yet. "
                "This is the very first message in the conversation. Please:\n"
                "1. Warmly welcome them and set an encouraging tone for creating a new story\n"
                "2. Let them know they have two paths: they can start writing directly in the "
                "editor on the left, or they can chat with you here to explore ideas and "
                "memories first\n"
                "3. Ask one warm, open-ended question to help them get started — something "
                "like 'What memory or moment brought you here today?' or 'Is there a "
                "particular person or experience you'd like to capture?'\n"
                "4. Keep it brief and encouraging — don't overwhelm them\n\n"
                "IMPORTANT: Do NOT reference any existing story content — the page is blank. "
                "Do NOT say things like 'the story you've shared' or comment on story details. "
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


@router.post(
    "/conversations/{conversation_id}/evolve",
    response_model=EvolveConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Evolve conversation into a story",
    description="Create a new draft story from a legacy conversation. "
    "Clones the conversation and links it to the story.",
)
async def evolve_conversation_route(
    conversation_id: UUID,
    data: EvolveConversationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvolveConversationResponse:
    """Evolve a conversation into a draft story."""
    session = require_auth(request)

    result = await ai_service.evolve_conversation(
        db=db,
        conversation_id=conversation_id,
        user_id=session.user_id,
        title=data.title,
    )

    await db.commit()

    logger.info(
        "api.conversation.evolved",
        extra={
            "user_id": str(session.user_id),
            "conversation_id": str(conversation_id),
            "story_id": result.story_id,
        },
    )

    return result


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
            story_id = await _resolve_story_id_for_extraction(
                db=bg_db,
                conversation_id=conversation_id,
                user_id=user_id,
            )
            if not story_id:
                logger.warning(
                    "context_extraction.story_link_missing",
                    extra={
                        "conversation_id": str(conversation_id),
                        "user_id": str(user_id),
                        "message_id": str(message_id),
                    },
                )
                return

            try:
                await require_story_read_access(
                    db=bg_db,
                    story_id=story_id,
                    user_id=user_id,
                )
            except HTTPException as exc:
                logger.warning(
                    "context_extraction.story_not_accessible",
                    extra={
                        "conversation_id": str(conversation_id),
                        "story_id": str(story_id),
                        "user_id": str(user_id),
                        "message_id": str(message_id),
                        "status_code": exc.status_code,
                    },
                )
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
            visible_chunks: list[str] = []
            stream_buffer = ""
            stream_in_marker = False
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
                    next_chunks, stream_buffer, stream_in_marker = (
                        _consume_visible_chunk(
                            stream_buffer,
                            stream_in_marker,
                            chunk,
                        )
                    )
                    for visible_chunk in next_chunks:
                        visible_chunks.append(visible_chunk)
                        event = SSEChunkEvent(content=visible_chunk)
                        yield f"data: {event.model_dump_json()}\n\n"

                if stream_buffer:
                    trailing_chunk = (
                        f"{_EVOLVE_SUGGEST_PREFIX}{stream_buffer}"
                        if stream_in_marker
                        else stream_buffer
                    )
                    visible_chunks.append(trailing_chunk)
                    event = SSEChunkEvent(content=trailing_chunk)
                    yield f"data: {event.model_dump_json()}\n\n"

                # Parse evolve suggestion marker before persisting
                cleaned_response, evolve_reason = parse_evolve_suggestion(full_response)

                # Save assistant message with cleaned content (marker stripped)
                message = await storytelling_agent.save_assistant_message(
                    db=db,
                    conversation_id=conversation_id,
                    content=cleaned_response,
                    token_count=token_count,
                )

                # Fire-and-forget background context extraction
                asyncio.create_task(
                    _extract_context_from_conversation(
                        conversation_id=conversation_id,
                        user_id=session.user_id,
                        user_content=data.content,
                        assistant_content=cleaned_response,
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

                # Emit evolve_suggestion event if marker was present
                if evolve_reason:
                    suggest_event = SSEEvolveSuggestionEvent(reason=evolve_reason)
                    yield f"data: {suggest_event.model_dump_json()}\n\n"

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
                        "response_length": len("".join(visible_chunks)),
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
