"""Tests for conversation seed SSE endpoint."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.story import Story
from app.models.user import User


class TestConversationSeed:
    """Test POST /api/ai/conversations/{conversation_id}/seed."""

    @pytest.mark.asyncio
    async def test_seed_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ) -> None:
        from uuid import uuid4

        response = await client.post(
            f"/api/ai/conversations/{uuid4()}/seed",
            params={"story_id": str(test_story.id)},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_seed_returns_204_when_messages_exist(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        test_story: Story,
    ) -> None:
        # Create conversation
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test",
        )
        db_session.add(conv)
        await db_session.flush()

        # Link to legacy
        cl = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(cl)

        # Add an existing message
        msg = AIMessage(
            conversation_id=conv.id,
            role="assistant",
            content="Hello!",
        )
        db_session.add(msg)
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/seed",
            params={"story_id": str(test_story.id)},
            headers=auth_headers,
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_seed_returns_404_for_unknown_conversation(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        from uuid import uuid4

        response = await client.post(
            f"/api/ai/conversations/{uuid4()}/seed",
            params={"story_id": str(test_story.id)},
            headers=auth_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_seed_returns_404_for_unknown_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        from uuid import uuid4

        # Create conversation
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test",
        )
        db_session.add(conv)
        await db_session.flush()

        cl = ConversationLegacy(
            conversation_id=conv.id,
            legacy_id=test_legacy.id,
            role="primary",
            position=0,
        )
        db_session.add(cl)
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/seed",
            params={"story_id": str(uuid4())},
            headers=auth_headers,
        )
        assert response.status_code == 404
