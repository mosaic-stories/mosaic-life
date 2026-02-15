"""Tests for storytelling agent memory integration."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.adapters.storytelling import DefaultStorytellingAgent


class TestPrepareTurnWithMemory:
    """Tests for prepare_turn with facts and conversation memory."""

    @pytest.mark.asyncio
    async def test_includes_facts_in_system_prompt(self):
        """Test that prepare_turn fetches facts and passes them to build_system_prompt."""
        mock_llm = MagicMock()
        mock_vector_store = AsyncMock()
        mock_vector_store.retrieve_context.return_value = []
        mock_memory = AsyncMock()
        mock_memory.get_context_messages.return_value = []
        mock_guardrail = MagicMock()
        mock_guardrail.get_bedrock_guardrail.return_value = (None, None)

        agent = DefaultStorytellingAgent(
            llm_provider=mock_llm,
            vector_store=mock_vector_store,
            memory=mock_memory,
            guardrail=mock_guardrail,
        )

        mock_db = AsyncMock()
        mock_fact = MagicMock()
        mock_fact.category = "hobby"
        mock_fact.content = "Loved fishing"
        mock_fact.visibility = "private"

        with patch(
            "app.adapters.storytelling.memory_service.get_facts_for_context",
            new_callable=AsyncMock,
            return_value=[mock_fact],
        ) as mock_get_facts:
            turn = await agent.prepare_turn(
                db=mock_db,
                conversation_id=uuid4(),
                user_id=uuid4(),
                user_query="Tell me about their hobbies",
                legacy_id=uuid4(),
                persona_id="biographer",
                legacy_name="John",
            )

            mock_get_facts.assert_called_once()
            assert "Loved fishing" in turn.system_prompt
