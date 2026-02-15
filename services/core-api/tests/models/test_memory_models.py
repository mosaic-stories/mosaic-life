"""Tests for agent memory models."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.memory import ConversationChunk, LegacyFact
from app.models.user import User


class TestConversationChunk:
    """Tests for ConversationChunk model."""

    @pytest.mark.asyncio
    async def test_create_conversation_chunk(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a conversation chunk with embedding."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        # SQLite doesn't support pgvector, so store as empty list placeholder
        chunk = ConversationChunk(
            conversation_id=conv.id,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            content="User discussed childhood memories of fishing trips.",
            embedding=[0.1] * 1024,
            message_range_start=0,
            message_range_end=20,
        )
        db_session.add(chunk)
        await db_session.commit()
        await db_session.refresh(chunk)

        assert chunk.id is not None
        assert chunk.content == "User discussed childhood memories of fishing trips."
        assert chunk.message_range_start == 0
        assert chunk.message_range_end == 20

    @pytest.mark.skip(reason="CASCADE deletes require PostgreSQL; SQLite test DB does not enforce FK constraints")
    @pytest.mark.asyncio
    async def test_conversation_chunk_cascade_delete(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that deleting conversation cascades to chunks."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        assoc = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(assoc)
        await db_session.flush()

        chunk = ConversationChunk(
            conversation_id=conv.id,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
            content="Summary content",
            embedding=[0.1] * 1024,
            message_range_start=0,
            message_range_end=10,
        )
        db_session.add(chunk)
        await db_session.commit()

        chunk_id = chunk.id

        # Delete conversation
        await db_session.delete(conv)
        await db_session.commit()

        # Chunk should be gone
        result = await db_session.execute(
            select(ConversationChunk).where(ConversationChunk.id == chunk_id)
        )
        assert result.scalar_one_or_none() is None


class TestLegacyFact:
    """Tests for LegacyFact model."""

    @pytest.mark.asyncio
    async def test_create_legacy_fact(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test creating a legacy fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved fly fishing on weekends",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()
        await db_session.refresh(fact)

        assert fact.id is not None
        assert fact.category == "hobby"
        assert fact.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_fact_defaults_to_private(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that visibility defaults to private."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="personality",
            content="Was very generous",
        )
        db_session.add(fact)
        await db_session.commit()
        await db_session.refresh(fact)

        assert fact.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_fact_with_source_conversation(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test fact linked to source conversation."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="milestone",
            content="Graduated from MIT in 1985",
            source_conversation_id=conv.id,
        )
        db_session.add(fact)
        await db_session.commit()
        await db_session.refresh(fact)

        assert fact.source_conversation_id == conv.id

    @pytest.mark.skip(reason="CASCADE deletes require PostgreSQL; SQLite test DB does not enforce FK constraints")
    @pytest.mark.asyncio
    async def test_legacy_cascade_deletes_facts(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that deleting legacy cascades to facts."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved gardening",
        )
        db_session.add(fact)
        await db_session.commit()
        fact_id = fact.id

        await db_session.delete(test_legacy)
        await db_session.commit()

        result = await db_session.execute(
            select(LegacyFact).where(LegacyFact.id == fact_id)
        )
        assert result.scalar_one_or_none() is None
