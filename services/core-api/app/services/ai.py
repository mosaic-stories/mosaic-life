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
from ..models.associations import ConversationLegacy
from ..models.legacy import Legacy, LegacyMember
from ..schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    ConversationSummary,
    MessageListResponse,
    MessageResponse,
)
from ..schemas.associations import LegacyAssociationResponse

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("core-api.ai")

# Maximum messages to include in conversation context
MAX_CONTEXT_MESSAGES = 20


async def _get_legacy_names(
    db: AsyncSession, legacy_ids: list[UUID]
) -> dict[UUID, str]:
    """Fetch legacy names by IDs.

    Args:
        db: Database session.
        legacy_ids: List of legacy IDs.

    Returns:
        Dictionary mapping legacy ID to legacy name.
    """
    if not legacy_ids:
        return {}

    result = await db.execute(
        select(Legacy.id, Legacy.name).where(Legacy.id.in_(legacy_ids))
    )
    return {row[0]: row[1] for row in result.all()}


def get_primary_legacy_id(conversation: AIConversation) -> UUID:
    """Get the primary legacy ID from conversation associations.

    Args:
        conversation: Conversation with loaded legacy_associations.

    Returns:
        UUID of the primary legacy.

    Raises:
        ValueError: If no legacy associations found.
    """
    if not conversation.legacy_associations:
        raise ValueError("Conversation has no legacy associations")

    # Find primary role, or fall back to first association
    primary = next(
        (
            assoc
            for assoc in conversation.legacy_associations
            if assoc.role == "primary"
        ),
        conversation.legacy_associations[0],
    )
    return primary.legacy_id


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


async def create_conversation(
    db: AsyncSession,
    user_id: UUID,
    data: ConversationCreate,
) -> ConversationResponse:
    """Create a new conversation (always creates new).

    Unlike get_or_create_conversation, this always creates a new conversation
    even if one exists for the user+legacies+persona combination.

    Args:
        db: Database session.
        user_id: User ID.
        data: Conversation creation data.

    Returns:
        Conversation response.

    Raises:
        HTTPException: 403 if not a member, 400 if invalid persona or legacies.
    """
    with tracer.start_as_current_span("ai.conversation.create") as span:
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("persona_id", data.persona_id)
        span.set_attribute("legacy_count", len(data.legacies))

        # Validate at least one legacy provided
        if not data.legacies:
            raise HTTPException(
                status_code=400,
                detail="At least one legacy must be provided",
            )

        # Extract legacy IDs
        legacy_ids = [leg.legacy_id for leg in data.legacies]

        # Check user is member of at least one specified legacy
        member_result = await db.execute(
            select(LegacyMember.legacy_id).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        accessible_legacy_ids = {row[0] for row in member_result.all()}

        if not accessible_legacy_ids:
            raise HTTPException(
                status_code=403,
                detail="You must be a member of at least one specified legacy",
            )

        # Check persona exists
        from ..config.personas import get_persona

        if not get_persona(data.persona_id):
            raise HTTPException(status_code=400, detail="Invalid persona")

        # Create new conversation
        conversation = AIConversation(
            user_id=user_id,
            persona_id=data.persona_id,
        )
        db.add(conversation)
        await db.flush()  # Get conversation ID before creating associations

        # Create legacy associations
        for legacy_data in data.legacies:
            association = ConversationLegacy(
                conversation_id=conversation.id,
                legacy_id=legacy_data.legacy_id,
                role=legacy_data.role,
                position=legacy_data.position,
            )
            db.add(association)

        await db.commit()
        await db.refresh(conversation, ["legacy_associations"])

        # Get legacy names for response
        legacy_names = await _get_legacy_names(db, legacy_ids)

        logger.info(
            "ai.conversation.created",
            extra={
                "conversation_id": str(conversation.id),
                "persona_id": data.persona_id,
                "legacy_count": len(data.legacies),
            },
        )

        # Build response with legacy associations
        return ConversationResponse(
            id=conversation.id,
            user_id=conversation.user_id,
            persona_id=conversation.persona_id,
            title=conversation.title,
            legacies=[
                LegacyAssociationResponse(
                    legacy_id=assoc.legacy_id,
                    legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                    role=assoc.role,
                    position=assoc.position,
                )
                for assoc in conversation.legacy_associations
            ],
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )


async def get_or_create_conversation(
    db: AsyncSession,
    user_id: UUID,
    data: ConversationCreate,
) -> ConversationResponse:
    """Get existing or create new conversation.

    For multi-legacy conversations, this always creates a new conversation
    since matching exact legacy sets is complex. Use create_conversation directly.

    Args:
        db: Database session.
        user_id: User ID.
        data: Conversation creation data.

    Returns:
        Conversation response.

    Raises:
        HTTPException: 403 if not a member, 400 if invalid persona or legacies.
    """
    with tracer.start_as_current_span("ai.conversation.get_or_create") as span:
        span.set_attribute("user_id", str(user_id))
        span.set_attribute("persona_id", data.persona_id)
        span.set_attribute("legacy_count", len(data.legacies))

        # Validate at least one legacy provided
        if not data.legacies:
            raise HTTPException(
                status_code=400,
                detail="At least one legacy must be provided",
            )

        # Extract legacy IDs
        legacy_ids = [leg.legacy_id for leg in data.legacies]

        # Check user is member of at least one specified legacy
        member_result = await db.execute(
            select(LegacyMember.legacy_id).where(
                LegacyMember.user_id == user_id,
                LegacyMember.legacy_id.in_(legacy_ids),
                LegacyMember.role != "pending",
            )
        )
        accessible_legacy_ids = {row[0] for row in member_result.all()}

        if not accessible_legacy_ids:
            raise HTTPException(
                status_code=403,
                detail="You must be a member of at least one specified legacy",
            )

        # Check persona exists
        from ..config.personas import get_persona

        if not get_persona(data.persona_id):
            raise HTTPException(status_code=400, detail="Invalid persona")

        # For single legacy, try to find existing conversation
        conversation = None
        if len(data.legacies) == 1:
            primary_legacy_id = data.legacies[0].legacy_id
            result = await db.execute(
                select(AIConversation)
                .join(ConversationLegacy)
                .options(selectinload(AIConversation.legacy_associations))
                .where(
                    AIConversation.user_id == user_id,
                    AIConversation.persona_id == data.persona_id,
                    ConversationLegacy.legacy_id == primary_legacy_id,
                )
                .order_by(AIConversation.updated_at.desc())
                .limit(1)
            )
            conversation = result.scalar_one_or_none()

        if conversation:
            span.set_attribute("created", False)
            logger.info(
                "ai.conversation.found",
                extra={"conversation_id": str(conversation.id)},
            )

            # Get legacy names for response
            conv_legacy_ids = [
                assoc.legacy_id for assoc in conversation.legacy_associations
            ]
            legacy_names = await _get_legacy_names(db, conv_legacy_ids)

            return ConversationResponse(
                id=conversation.id,
                user_id=conversation.user_id,
                persona_id=conversation.persona_id,
                title=conversation.title,
                legacies=[
                    LegacyAssociationResponse(
                        legacy_id=assoc.legacy_id,
                        legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                        role=assoc.role,
                        position=assoc.position,
                    )
                    for assoc in conversation.legacy_associations
                ],
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
            )
        else:
            # Create new conversation
            conversation = AIConversation(
                user_id=user_id,
                persona_id=data.persona_id,
            )
            db.add(conversation)
            await db.flush()  # Get conversation ID before creating associations

            # Create legacy associations
            for legacy_data in data.legacies:
                association = ConversationLegacy(
                    conversation_id=conversation.id,
                    legacy_id=legacy_data.legacy_id,
                    role=legacy_data.role,
                    position=legacy_data.position,
                )
                db.add(association)

            await db.commit()
            await db.refresh(conversation, ["legacy_associations"])

            # Get legacy names for response
            legacy_names = await _get_legacy_names(db, legacy_ids)

            span.set_attribute("created", True)
            logger.info(
                "ai.conversation.created",
                extra={
                    "conversation_id": str(conversation.id),
                    "persona_id": data.persona_id,
                    "legacy_count": len(data.legacies),
                },
            )

            return ConversationResponse(
                id=conversation.id,
                user_id=conversation.user_id,
                persona_id=conversation.persona_id,
                title=conversation.title,
                legacies=[
                    LegacyAssociationResponse(
                        legacy_id=assoc.legacy_id,
                        legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                        role=assoc.role,
                        position=assoc.position,
                    )
                    for assoc in conversation.legacy_associations
                ],
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
            )


async def list_conversations(
    db: AsyncSession,
    user_id: UUID,
    legacy_id: UUID | None = None,
    persona_id: str | None = None,
    limit: int = 10,
) -> list[ConversationSummary]:
    """List user's conversations.

    Args:
        db: Database session.
        user_id: User ID.
        legacy_id: Optional filter by legacy.
        persona_id: Optional filter by persona.
        limit: Maximum conversations to return (default 10).

    Returns:
        List of conversation summaries.
    """
    # Create subquery for message count and last_message_at
    # This optimizes from N+2 queries to a single query
    msg_count_subq = (
        select(
            AIMessage.conversation_id,
            func.count(AIMessage.id).label("message_count"),
            func.max(AIMessage.created_at).label("last_message_at"),
        )
        .group_by(AIMessage.conversation_id)
        .subquery()
    )

    # Main query with join to subquery
    query = (
        select(
            AIConversation,
            func.coalesce(msg_count_subq.c.message_count, 0).label("message_count"),
            msg_count_subq.c.last_message_at,
        )
        .options(selectinload(AIConversation.legacy_associations))
        .outerjoin(
            msg_count_subq, AIConversation.id == msg_count_subq.c.conversation_id
        )
        .where(AIConversation.user_id == user_id)
    )

    # Filter by legacy if specified (via junction table)
    if legacy_id:
        query = query.join(ConversationLegacy).where(
            ConversationLegacy.legacy_id == legacy_id
        )

    if persona_id:
        query = query.where(AIConversation.persona_id == persona_id)

    query = query.order_by(AIConversation.updated_at.desc()).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    # Collect all legacy IDs for batch lookup
    all_legacy_ids = set()
    for row in rows:
        conv = row[0]
        for assoc in conv.legacy_associations:
            all_legacy_ids.add(assoc.legacy_id)

    # Fetch all legacy names in one query
    legacy_names = await _get_legacy_names(db, list(all_legacy_ids))

    summaries = []
    for row in rows:
        conv = row[0]  # AIConversation object
        message_count = row[1]  # message_count from query
        last_message_at = row[2]  # last_message_at from query

        summaries.append(
            ConversationSummary(
                id=conv.id,
                persona_id=conv.persona_id,
                title=conv.title,
                legacies=[
                    LegacyAssociationResponse(
                        legacy_id=assoc.legacy_id,
                        legacy_name=legacy_names.get(assoc.legacy_id, "Unknown"),
                        role=assoc.role,
                        position=assoc.position,
                    )
                    for assoc in conv.legacy_associations
                ],
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
        .options(
            selectinload(AIConversation.messages),
            selectinload(AIConversation.legacy_associations),
        )
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
            .where(
                AIMessage.conversation_id == conversation_id,
                ~AIMessage.blocked,
            )
            .order_by(AIMessage.created_at.desc())
            .limit(MAX_CONTEXT_MESSAGES)
        )
        messages = list(reversed(result.scalars().all()))

        span.set_attribute("message_count", len(messages))

        # Filter out empty messages to avoid Bedrock API validation errors
        return [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.content and m.content.strip()
        ]


async def save_message(
    db: AsyncSession,
    conversation_id: UUID,
    role: str,
    content: str,
    token_count: int | None = None,
    blocked: bool = False,
) -> AIMessage:
    """Save a message to the conversation.

    Args:
        db: Database session.
        conversation_id: Conversation ID.
        role: Message role (user/assistant).
        content: Message content.
        token_count: Optional token count.
        blocked: Whether message was blocked by guardrail.

    Returns:
        Saved message.
    """
    message = AIMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        token_count=token_count,
        blocked=blocked,
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
            "blocked": blocked,
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


async def mark_message_blocked(
    db: AsyncSession,
    message_id: UUID,
) -> None:
    """Mark a message as blocked by guardrail.

    Args:
        db: Database session.
        message_id: Message ID to mark as blocked.
    """
    result = await db.execute(select(AIMessage).where(AIMessage.id == message_id))
    message = result.scalar_one_or_none()
    if message:
        message.blocked = True
        await db.commit()

        logger.info(
            "ai.message.marked_blocked",
            extra={
                "message_id": str(message_id),
                "conversation_id": str(message.conversation_id),
            },
        )
