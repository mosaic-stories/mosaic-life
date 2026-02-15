"""Tests for memory summarization and fact extraction."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.memory import ConversationChunk, LegacyFact
from app.models.user import User
from app.services import memory as memory_service
from app.services.memory import (
    SUMMARIZATION_THRESHOLD,
    parse_summary_response,
)


class TestParseSummaryResponse:
    """Tests for JSON response parsing."""

    def test_parses_valid_response(self):
        """Test parsing a well-formed LLM response."""
        raw = json.dumps(
            {
                "summary": "User discussed fishing memories.",
                "facts": [
                    {"category": "hobby", "content": "Loved fly fishing"},
                    {"category": "personality", "content": "Was very patient"},
                ],
            }
        )
        result = parse_summary_response(raw)
        assert result.summary == "User discussed fishing memories."
        assert len(result.facts) == 2

    def test_returns_none_for_malformed_json(self):
        """Test that malformed JSON returns None."""
        result = parse_summary_response("not valid json {{{")
        assert result is None

    def test_returns_none_for_missing_summary(self):
        """Test that missing 'summary' key returns None."""
        raw = json.dumps({"facts": []})
        result = parse_summary_response(raw)
        assert result is None

    def test_handles_empty_facts(self):
        """Test response with no facts extracted."""
        raw = json.dumps({"summary": "General chat, no facts.", "facts": []})
        result = parse_summary_response(raw)
        assert result is not None
        assert result.summary == "General chat, no facts."
        assert result.facts == []


class TestMaybeSummarize:
    """Tests for summarization trigger logic."""

    @pytest.mark.asyncio
    async def test_does_not_summarize_below_threshold(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that summarization is skipped when below threshold."""
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

        # Add fewer messages than threshold
        for i in range(5):
            db_session.add(
                AIMessage(conversation_id=conv.id, role="user", content=f"Msg {i}")
            )
        await db_session.commit()

        await memory_service.maybe_summarize(
            db=db_session,
            conversation_id=conv.id,
            user_id=test_user.id,
            legacy_id=test_legacy.id,
        )

        # No chunks should be created
        count = await db_session.execute(
            select(func.count())
            .select_from(ConversationChunk)
            .where(ConversationChunk.conversation_id == conv.id)
        )
        assert (count.scalar() or 0) == 0

    @pytest.mark.asyncio
    async def test_summarizes_when_above_threshold(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that summarization triggers when messages exceed threshold."""
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

        # Add more messages than threshold
        for i in range(SUMMARIZATION_THRESHOLD + 5):
            role = "user" if i % 2 == 0 else "assistant"
            db_session.add(
                AIMessage(conversation_id=conv.id, role=role, content=f"Message {i}")
            )
        await db_session.commit()

        # Mock the LLM and embedding providers
        mock_llm_response = json.dumps(
            {
                "summary": "User discussed various life memories.",
                "facts": [
                    {"category": "hobby", "content": "Enjoyed painting"},
                ],
            }
        )

        mock_embedding = [0.1] * 1024

        with (
            patch.object(
                memory_service,
                "_call_summarize_llm",
                new_callable=AsyncMock,
                return_value=mock_llm_response,
            ),
            patch.object(
                memory_service,
                "_embed_text",
                new_callable=AsyncMock,
                return_value=mock_embedding,
            ),
        ):
            await memory_service.maybe_summarize(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )

        # Should have created a conversation chunk
        chunk_count = await db_session.execute(
            select(func.count())
            .select_from(ConversationChunk)
            .where(ConversationChunk.conversation_id == conv.id)
        )
        assert (chunk_count.scalar() or 0) == 1

        # Should have created a fact
        fact_count = await db_session.execute(
            select(func.count())
            .select_from(LegacyFact)
            .where(
                LegacyFact.legacy_id == test_legacy.id,
                LegacyFact.user_id == test_user.id,
            )
        )
        assert (fact_count.scalar() or 0) == 1

    @pytest.mark.asyncio
    async def test_idempotent_summarization(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ):
        """Test that re-running summarization doesn't create duplicates."""
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

        for i in range(SUMMARIZATION_THRESHOLD + 5):
            role = "user" if i % 2 == 0 else "assistant"
            db_session.add(
                AIMessage(conversation_id=conv.id, role=role, content=f"Message {i}")
            )
        await db_session.commit()

        mock_llm_response = json.dumps({"summary": "Summary text.", "facts": []})
        mock_embedding = [0.1] * 1024

        with (
            patch.object(
                memory_service,
                "_call_summarize_llm",
                new_callable=AsyncMock,
                return_value=mock_llm_response,
            ),
            patch.object(
                memory_service,
                "_embed_text",
                new_callable=AsyncMock,
                return_value=mock_embedding,
            ),
        ):
            # Run twice
            await memory_service.maybe_summarize(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )
            await memory_service.maybe_summarize(
                db=db_session,
                conversation_id=conv.id,
                user_id=test_user.id,
                legacy_id=test_legacy.id,
            )

        # Should still only have 1 chunk (same range)
        chunk_count = await db_session.execute(
            select(func.count())
            .select_from(ConversationChunk)
            .where(ConversationChunk.conversation_id == conv.id)
        )
        assert (chunk_count.scalar() or 0) == 1
