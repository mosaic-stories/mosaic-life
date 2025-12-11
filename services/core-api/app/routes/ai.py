"""API routes for AI chat."""

import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from opentelemetry import trace
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.bedrock import BedrockError, get_bedrock_adapter
from ..config.settings import get_settings
from ..auth.middleware import require_auth
from ..config.personas import build_system_prompt, get_persona, get_personas
from ..database import get_db
from ..models.legacy import Legacy
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    MessageCreate,
    MessageListResponse,
    PersonaResponse,
    SSEChunkEvent,
    SSEDoneEvent,
    SSEErrorEvent,
)
from ..services import ai as ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ai")


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

        span.set_attribute("legacy_id", str(conversation.legacy_id))
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
            select(Legacy).where(Legacy.id == conversation.legacy_id)
        )
        legacy = legacy_result.scalar_one()

        # Build system prompt
        system_prompt = build_system_prompt(
            conversation.persona_id,
            legacy.name,
        )
        if not system_prompt:
            raise HTTPException(
                status_code=500,
                detail="Failed to build system prompt",
            )

        # Save user message BEFORE streaming starts and capture its ID
        user_message = await ai_service.save_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=data.content,
        )
        user_message_id = user_message.id

        # Get context messages
        context = await ai_service.get_context_messages(db, conversation_id)

        async def generate_stream() -> AsyncGenerator[str, None]:
            """Generate SSE stream."""
            adapter = get_bedrock_adapter()
            full_response = ""
            token_count: int | None = None

            try:
                settings = get_settings()
                async for chunk in adapter.stream_generate(
                    messages=context,
                    system_prompt=system_prompt,
                    model_id=persona.model_id,
                    max_tokens=persona.max_tokens,
                    guardrail_id=settings.bedrock_guardrail_id,
                    guardrail_version=settings.bedrock_guardrail_version,
                ):
                    full_response += chunk
                    event = SSEChunkEvent(content=chunk)
                    yield f"data: {event.model_dump_json()}\n\n"

                # Save assistant message
                message = await ai_service.save_message(
                    db=db,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                    token_count=token_count,
                )

                # Send done event
                done_event = SSEDoneEvent(
                    message_id=message.id,
                    token_count=token_count,
                )
                yield f"data: {done_event.model_dump_json()}\n\n"

                logger.info(
                    "ai.chat.complete",
                    extra={
                        "conversation_id": str(conversation_id),
                        "message_id": str(message.id),
                        "response_length": len(full_response),
                    },
                )

            except BedrockError as e:
                logger.warning(
                    "ai.chat.error",
                    extra={
                        "conversation_id": str(conversation_id),
                        "error": e.message,
                        "retryable": e.retryable,
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
