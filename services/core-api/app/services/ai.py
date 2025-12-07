"""Service layer for AI chat operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from opentelemetry import trace
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.ai import AIConversation, AIMessage
from ..models.legacy import Legacy, LegacyMember
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    MessageListResponse,
    MessageResponse,
)

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ai")

# Maximum messages to include in conversation context
MAX_CONTEXT_MESSAGES = 20


async def check_legacy_access(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID,
) -> None:
    """Check if user has access to legacy for AI chat.

    Args:
        db: Database session.
        user_id: User ID.
        legacy_id: Legacy ID.

    Raises:
        HTTPException: 404 if legacy not found, 403 if not a member.
    """
    # Check legacy exists
    legacy_result = await db.execute(select(Legacy).where(Legacy.id == legacy_id))
    legacy = legacy_result.scalar_one_or_none()
    if not legacy:
        raise HTTPException(status_code=404, detail="Legacy not found")

    # Check membership (any role except pending)
    member_result = await db.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == legacy_id,
            LegacyMember.user_id == user_id,
            LegacyMember.role != "pending",
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=403,
            detail="You must be a legacy member to use AI chat",
        )


async def get_or_create_conversation(
    db: AsyncSession,
    user_id: UUID,
    data: ConversationCreate,
) -> ConversationResponse:
    """Get existing or create new conversation.

    Args:
        db: Database session.
        user_id: User ID.
        data: Conversation creation data.

    Returns:
        Conversation response.

    Raises:
        HTTPException: 403 if not a member, 400 if invalid persona.
    """
    with tracer.start_as_current_span("ai.conversation.get_or_create") as span:
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("legacy_id", str(data.legacy_id))
        span.set_attribute("persona_id", data.persona_id)

        # Check access
        await check_legacy_access(db, user_id, data.legacy_id)

        # Check persona exists
        from ..config.personas import get_persona

        if not get_persona(data.persona_id):
            raise HTTPException(status_code=400, detail="Invalid persona")

        # Look for existing conversation
        result = await db.execute(
            select(AIConversation).where(
                AIConversation.user_id == user_id,
                AIConversation.legacy_id == data.legacy_id,
                AIConversation.persona_id == data.persona_id,
            )
        )
        conversation = result.scalar_one_or_none()

        if conversation:
            span.set_attribute("created", False)
            logger.info(
                "ai.conversation.found",
                extra={"conversation_id": str(conversation.id)},
            )
        else:
            # Create new conversation
            conversation = AIConversation(
                user_id=user_id,
                legacy_id=data.legacy_id,
                persona_id=data.persona_id,
            )
            db.add(conversation)
            await db.commit()
            await db.refresh(conversation)
            span.set_attribute("created", True)
            logger.info(
                "ai.conversation.created",
                extra={
                    "conversation_id": str(conversation.id),
                    "persona_id": data.persona_id,
                },
            )

        return ConversationResponse.model_validate(conversation)


async def list_conversations(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID | None = None,
) -> list[ConversationSummary]:
    """List user's conversations.

    Args:
        db: Database session.
        user_id: User ID.
        legacy_id: Optional filter by legacy.

    Returns:
        List of conversation summaries.
    """
    query = select(AIConversation).where(AIConversation.user_id == user_id)

    if legacy_id:
        query = query.where(AIConversation.legacy_id == legacy_id)

    query = query.order_by(AIConversation.updated_at.desc())

    result = await db.execute(query)
    conversations = result.scalars().all()

    summaries = []
    for conv in conversations:
        # Get message count and last message time
        count_result = await db.execute(
            select(func.count(AIMessage.id)).where(AIMessage.conversation_id == conv.id)
        )
        message_count = count_result.scalar() or 0

        last_msg_result = await db.execute(
            select(AIMessage.created_at)
            .where(AIMessage.conversation_id == conv.id)
            .order_by(AIMessage.created_at.desc())
            .limit(1)
        )
        last_message_at = last_msg_result.scalar_one_or_none()

        summaries.append(
            ConversationSummary(
                id=conv.id,
                legacy_id=conv.legacy_id,
                persona_id=conv.persona_id,
                title=conv.title,
                message_count=message_count,
                last_message_at=last_message_at,
                created_at=conv.created_at,
            )
        )

    return summaries


async def get_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
) -> AIConversation:
    """Get a conversation by ID.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        user_id: User ID (for ownership check).

    Returns:
        Conversation.

    Raises:
        HTTPException: 404 if not found.
    """
    result = await db.execute(
        select(AIConversation)
        .options(selectinload(AIConversation.messages))
        .where(
            AIConversation.id == conversation_id,
            AIConversation.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


async def get_conversation_messages(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> MessageListResponse:
    """Get messages for a conversation.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        user_id: User ID.
        limit: Maximum messages to return.
        offset: Offset for pagination.

    Returns:
        Paginated message list.
    """
    # Verify ownership
    await get_conversation(db, conversation_id, user_id)

    # Count total
    count_result = await db.execute(
        select(func.count(AIMessage.id)).where(
            AIMessage.conversation_id == conversation_id
        )
    )
    total = count_result.scalar() or 0

    # Get messages
    result = await db.execute(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    messages = result.scalars().all()

    return MessageListResponse(
        messages=[MessageResponse.model_validate(m) for m in messages],
        total=total,
        has_more=offset + len(messages) < total,
    )


async def get_context_messages(
    db: AsyncSession,
    conversation_id: UUID,
) -> list[dict[str, str]]:
    """Get recent messages for context.

    Args:
        db: Database session.
        conversation_id: Conversation ID.

    Returns:
        List of message dicts for Bedrock API.
    """
    with tracer.start_as_current_span("ai.chat.context_load") as span:
        result = await db.execute(
            select(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
            .order_by(AIMessage.created_at.desc())
            .limit(MAX_CONTEXT_MESSAGES)
        )
        messages = list(reversed(result.scalars().all()))

        span.set_attribute("message_count", len(messages))

        return [{"role": m.role, "content": m.content} for m in messages]


async def save_message(
    db: AsyncSession,
    conversation_id: UUID,
    role: str,
    content: str,
    token_count: int | None = None,
) -> AIMessage:
    """Save a message to the conversation.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        role: Message role (user/assistant).
        content: Message content.
        token_count: Optional token count.

    Returns:
        Saved message.
    """
    message = AIMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        token_count=token_count,
    )
    db.add(message)

    # Update conversation timestamp
    conv_result = await db.execute(
        select(AIConversation).where(AIConversation.id == conversation_id)
    )
    conversation = conv_result.scalar_one()
    conversation.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(message)

    logger.info(
        "ai.message.saved",
        extra={
            "message_id": str(message.id),
            "conversation_id": str(conversation_id),
            "role": role,
            "token_count": token_count,
        },
    )

    return message


async def delete_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    user_id: UUID,
) -> None:
    """Delete a conversation and all its messages.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        user_id: User ID.

    Raises:
        HTTPException: 404 if not found.
    """
    conversation = await get_conversation(db, conversation_id, user_id)
    await db.delete(conversation)
    await db.commit()

    logger.info(
        "ai.conversation.deleted",
        extra={"conversation_id": str(conversation_id)},
    )
