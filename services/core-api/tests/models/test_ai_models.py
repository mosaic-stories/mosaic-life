"""Tests for AI models."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.user import User


class TestAIConversation:
    """Tests for AIConversation model."""

    @pytest.mark.asyncio
    async def test_create_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating an AI conversation."""
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test Conversation",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.commit()

        # Reload with associations
        result = await db_session.execute(
            select(AIConversation)
            .options(selectinload(AIConversation.legacy_associations))
            .where(AIConversation.id == conversation.id)
        )
        loaded_conversation = result.scalar_one()

        assert loaded_conversation.id is not None
        assert loaded_conversation.user_id == test_user.id
        assert loaded_conversation.persona_id == "biographer"
        assert loaded_conversation.created_at is not None
        assert len(loaded_conversation.legacy_associations) == 1
        assert loaded_conversation.legacy_associations[0].legacy_id == test_legacy.id


class TestAIMessage:
    """Tests for AIMessage model."""

    @pytest.mark.asyncio
    async def test_create_message(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating an AI message."""
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        message = AIMessage(
            conversation_id=conversation.id,
            role="user",
            content="Tell me about their childhood.",
            token_count=10,
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        assert message.id is not None
        assert message.conversation_id == conversation.id
        assert message.role == "user"
        assert message.content == "Tell me about their childhood."
        assert message.token_count == 10

    @pytest.mark.asyncio
    async def test_conversation_messages_relationship(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test conversation has messages relationship."""
        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="friend",
        )
        db_session.add(conversation)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conversation.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        msg1 = AIMessage(conversation_id=conversation.id, role="user", content="Hello")
        msg2 = AIMessage(
            conversation_id=conversation.id, role="assistant", content="Hi there!"
        )
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        # Use selectinload to eagerly load messages in async context
        result = await db_session.execute(
            select(AIConversation)
            .options(selectinload(AIConversation.messages))
            .where(AIConversation.id == conversation.id)
        )
        loaded_conversation = result.scalar_one()
        assert len(loaded_conversation.messages) == 2
