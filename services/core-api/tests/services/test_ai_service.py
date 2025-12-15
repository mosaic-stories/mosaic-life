"""Tests for AI service layer."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.ai import ConversationCreate
from app.schemas.associations import LegacyAssociationCreate
from app.services import ai as ai_service


class TestCheckLegacyAccess:
    """Tests for check_legacy_access."""

    @pytest.mark.asyncio
    async def test_allows_member_access(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that legacy members can access AI chat."""
        # Should not raise
        await ai_service.check_legacy_access(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

    @pytest.mark.asyncio
    async def test_denies_non_member_access(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that non-members cannot access AI chat."""
        with pytest.raises(HTTPException) as exc:
            await ai_service.check_legacy_access(
                db=db_session,
                user_id=test_user_2.id,
                legacy_id=test_legacy.id,
            )

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_denies_pending_member_access(
        self,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy_with_pending: Legacy,
    ):
        """Test that pending members cannot access AI chat."""
        with pytest.raises(HTTPException) as exc:
            await ai_service.check_legacy_access(
                db=db_session,
                user_id=test_user_2.id,
                legacy_id=test_legacy_with_pending.id,
            )

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_raises_404_for_nonexistent_legacy(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test 404 for nonexistent legacy."""
        from uuid import uuid4

        with pytest.raises(HTTPException) as exc:
            await ai_service.check_legacy_access(
                db=db_session,
                user_id=test_user.id,
                legacy_id=uuid4(),
            )

        assert exc.value.status_code == 404


class TestGetOrCreateConversation:
    """Tests for get_or_create_conversation."""

    @pytest.mark.asyncio
    async def test_creates_new_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a new conversation."""
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        conversation = await ai_service.get_or_create_conversation(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )

        assert conversation.id is not None
        assert conversation.user_id == test_user.id
        assert conversation.persona_id == "biographer"
        assert len(conversation.legacies) == 1
        assert conversation.legacies[0].legacy_id == test_legacy.id

    @pytest.mark.asyncio
    async def test_returns_existing_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test returning existing conversation."""
        # Create first conversation
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        conv1 = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        # Request again - should return same
        conv2 = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        assert conv1.id == conv2.id

    @pytest.mark.asyncio
    async def test_creates_separate_conversation_for_different_persona(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test separate conversations for different personas."""
        data1 = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        data2 = ConversationCreate(
            persona_id="friend",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        conv1 = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data1
        )
        conv2 = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data2
        )

        assert conv1.id != conv2.id
        assert conv1.persona_id == "biographer"
        assert conv2.persona_id == "friend"

    @pytest.mark.asyncio
    async def test_requires_legacy_membership(
        self,
        db_session: AsyncSession,
        test_user_2: User,  # Not a member
        test_legacy: Legacy,
    ):
        """Test that non-members cannot create conversations."""
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        with pytest.raises(HTTPException) as exc:
            await ai_service.get_or_create_conversation(
                db=db_session,
                user_id=test_user_2.id,
                data=data,
            )

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_rejects_invalid_persona(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that invalid persona IDs are rejected."""
        data = ConversationCreate(
            persona_id="invalid_persona",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )

        with pytest.raises(HTTPException) as exc:
            await ai_service.get_or_create_conversation(
                db=db_session,
                user_id=test_user.id,
                data=data,
            )

        assert exc.value.status_code == 400


class TestListConversations:
    """Tests for list_conversations."""

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_conversations(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test empty list when no conversations exist."""
        result = await ai_service.list_conversations(
            db=db_session,
            user_id=test_user.id,
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_returns_user_conversations(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test listing user's conversations."""
        # Create conversations
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        result = await ai_service.list_conversations(
            db=db_session,
            user_id=test_user.id,
        )

        assert len(result) == 1
        assert result[0].persona_id == "biographer"

    @pytest.mark.asyncio
    async def test_filters_by_legacy_id(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test filtering by legacy ID."""
        # Create conversation
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        # Query with legacy filter
        result = await ai_service.list_conversations(
            db=db_session,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        assert len(result) == 1

        # Query with different legacy ID should return empty
        from uuid import uuid4

        result_empty = await ai_service.list_conversations(
            db=db_session,
            user_id=test_user.id,
            legacy_id=uuid4(),
        )

        assert result_empty == []


class TestGetConversation:
    """Tests for get_conversation."""

    @pytest.mark.asyncio
    async def test_returns_conversation_with_ownership(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test getting a conversation by ID."""
        # Create conversation
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        created = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        result = await ai_service.get_conversation(
            db=db_session,
            conversation_id=created.id,
            user_id=test_user.id,
        )

        assert result.id == created.id

    @pytest.mark.asyncio
    async def test_raises_404_for_other_users_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that users cannot access others' conversations."""
        # Create conversation for user 1
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        created = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        # Try to access as user 2
        with pytest.raises(HTTPException) as exc:
            await ai_service.get_conversation(
                db=db_session,
                conversation_id=created.id,
                user_id=test_user_2.id,
            )

        assert exc.value.status_code == 404


class TestSaveMessage:
    """Tests for save_message."""

    @pytest.mark.asyncio
    async def test_saves_user_message(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test saving a user message."""
        # Create conversation first
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.commit()

        message = await ai_service.save_message(
            db=db_session,
            conversation_id=conv.id,
            role="user",
            content="Tell me about their childhood.",
        )

        assert message.id is not None
        assert message.role == "user"
        assert message.content == "Tell me about their childhood."

    @pytest.mark.asyncio
    async def test_saves_assistant_message_with_token_count(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test saving an assistant message with token count."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.commit()

        message = await ai_service.save_message(
            db=db_session,
            conversation_id=conv.id,
            role="assistant",
            content="Here is the response...",
            token_count=150,
        )

        assert message.role == "assistant"
        assert message.token_count == 150


class TestGetConversationMessages:
    """Tests for get_conversation_messages."""

    @pytest.mark.asyncio
    async def test_returns_messages_in_order(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test messages returned in chronological order."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add messages
        msg1 = AIMessage(conversation_id=conv.id, role="user", content="First")
        msg2 = AIMessage(conversation_id=conv.id, role="assistant", content="Second")
        msg3 = AIMessage(conversation_id=conv.id, role="user", content="Third")
        db_session.add_all([msg1, msg2, msg3])
        await db_session.commit()

        result = await ai_service.get_conversation_messages(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
        )

        assert len(result.messages) == 3
        assert result.messages[0].content == "First"
        assert result.messages[1].content == "Second"
        assert result.messages[2].content == "Third"
        assert result.total == 3
        assert result.has_more is False

    @pytest.mark.asyncio
    async def test_pagination_works(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test message pagination."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add messages
        for i in range(5):
            msg = AIMessage(
                conversation_id=conv.id, role="user", content=f"Message {i}"
            )
            db_session.add(msg)
        await db_session.commit()

        # Get first page
        result = await ai_service.get_conversation_messages(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
            limit=2,
            offset=0,
        )

        assert len(result.messages) == 2
        assert result.total == 5
        assert result.has_more is True


class TestGetContextMessages:
    """Tests for get_context_messages."""

    @pytest.mark.asyncio
    async def test_returns_messages_for_llm_context(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test getting context messages for LLM."""
        from datetime import datetime, timedelta, timezone

        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add messages with explicit timestamps to ensure ordering
        now = datetime.now(timezone.utc)
        msg1 = AIMessage(
            conversation_id=conv.id,
            role="user",
            content="Hello",
            created_at=now,
        )
        msg2 = AIMessage(
            conversation_id=conv.id,
            role="assistant",
            content="Hi there!",
            created_at=now + timedelta(seconds=1),
        )
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        result = await ai_service.get_context_messages(
            db=db_session,
            conversation_id=conv.id,
        )

        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "Hello"
        assert result[1]["role"] == "assistant"
        assert result[1]["content"] == "Hi there!"

    @pytest.mark.asyncio
    async def test_limits_context_to_max_messages(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that context is limited to MAX_CONTEXT_MESSAGES."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conv)
        await db_session.flush()

        # Create legacy association
        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # Add more than MAX_CONTEXT_MESSAGES
        for i in range(25):
            msg = AIMessage(
                conversation_id=conv.id, role="user", content=f"Message {i}"
            )
            db_session.add(msg)
        await db_session.commit()

        result = await ai_service.get_context_messages(
            db=db_session,
            conversation_id=conv.id,
        )

        assert len(result) == ai_service.MAX_CONTEXT_MESSAGES


class TestDeleteConversation:
    """Tests for delete_conversation."""

    @pytest.mark.asyncio
    async def test_deletes_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test deleting a conversation."""
        # Create conversation
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        created = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        # Delete it
        await ai_service.delete_conversation(
            db=db_session,
            conversation_id=created.id,
            user_id=test_user.id,
        )

        # Should not exist anymore
        with pytest.raises(HTTPException) as exc:
            await ai_service.get_conversation(
                db=db_session,
                conversation_id=created.id,
                user_id=test_user.id,
            )

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_other_users_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
    ):
        """Test that users cannot delete others' conversations."""
        # Create conversation for user 1
        data = ConversationCreate(
            persona_id="biographer",
            legacies=[
                LegacyAssociationCreate(
                    legacy_id=test_legacy.id, role="primary", position=0
                )
            ],
        )
        created = await ai_service.get_or_create_conversation(
            db=db_session, user_id=test_user.id, data=data
        )

        # Try to delete as user 2
        with pytest.raises(HTTPException) as exc:
            await ai_service.delete_conversation(
                db=db_session,
                conversation_id=created.id,
                user_id=test_user_2.id,
            )

        assert exc.value.status_code == 404
