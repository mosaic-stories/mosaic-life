"""Tests for POST /api/ai/conversations/{id}/evolve endpoint."""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models.ai import AIConversation, AIMessage
from app.models.associations import ConversationLegacy
from app.models.legacy import Legacy
from app.models.user import User


class TestEvolveRoute:
    """Test POST /api/ai/conversations/{id}/evolve."""

    @pytest.mark.asyncio
    async def test_evolve_endpoint_returns_story(
        self,
        client: AsyncClient,
        db_session,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """POST /api/ai/conversations/{id}/evolve should return new story and conversation."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        db_session.add(
            ConversationLegacy(
                conversation_id=conv.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=0,
            )
        )
        db_session.add(
            AIMessage(
                conversation_id=conv.id,
                role="user",
                content="A great memory",
            )
        )
        await db_session.flush()
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/evolve",
            json={},
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert "story_id" in data
        assert "conversation_id" in data
        assert "story_title" in data

    @pytest.mark.asyncio
    async def test_evolve_with_custom_title(
        self,
        client: AsyncClient,
        db_session,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Should use provided title for the story."""
        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        db_session.add(
            ConversationLegacy(
                conversation_id=conv.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=0,
            )
        )
        await db_session.flush()
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/evolve",
            json={"title": "Grandpa's Workshop"},
            headers=auth_headers,
        )

        assert response.status_code == 201
        assert response.json()["story_title"] == "Grandpa's Workshop"

    @pytest.mark.asyncio
    async def test_evolve_unauthenticated(self, client: AsyncClient):
        """Should return 401 without auth."""
        response = await client.post(
            f"/api/ai/conversations/{uuid4()}/evolve",
            json={},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_evolve_returns_403_when_membership_revoked(
        self,
        client: AsyncClient,
        db_session,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Should return 403 if user's legacy membership was revoked."""
        from sqlalchemy import select
        from app.models.legacy import LegacyMember

        conv = AIConversation(user_id=test_user.id, persona_id="biographer")
        db_session.add(conv)
        await db_session.flush()

        db_session.add(
            ConversationLegacy(
                conversation_id=conv.id,
                legacy_id=test_legacy.id,
                role="primary",
                position=0,
            )
        )
        db_session.add(
            AIMessage(
                conversation_id=conv.id,
                role="user",
                content="A memory",
            )
        )
        await db_session.flush()

        # Revoke membership
        result = await db_session.execute(
            select(LegacyMember).where(
                LegacyMember.user_id == test_user.id,
                LegacyMember.legacy_id == test_legacy.id,
            )
        )
        member = result.scalar_one_or_none()
        if member:
            await db_session.delete(member)
            await db_session.flush()
        await db_session.commit()

        response = await client.post(
            f"/api/ai/conversations/{conv.id}/evolve",
            json={},
            headers=auth_headers,
        )
        assert response.status_code == 403
