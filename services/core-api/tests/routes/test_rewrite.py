"""Tests for the rewrite SSE endpoint."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestRewriteEndpoint:
    """Test POST /api/stories/{story_id}/rewrite."""

    @pytest.mark.asyncio
    async def test_returns_401_without_auth(self, client: AsyncClient) -> None:
        story_id = uuid4()
        resp = await client.post(
            f"/api/stories/{story_id}/rewrite",
            json={"content": "test"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_rewrite_schema_validates(self) -> None:
        from app.schemas.rewrite import RewriteRequest

        req = RewriteRequest(content="Hello world")
        assert req.content == "Hello world"
        assert req.persona_id == "biographer"
        assert req.writing_style is None
        assert req.pinned_context_ids == []

    @pytest.mark.asyncio
    async def test_rewrite_schema_with_all_fields(self) -> None:
        from app.schemas.rewrite import RewriteRequest

        req = RewriteRequest(
            content="Hello",
            conversation_id="conv-123",
            pinned_context_ids=["ent-1", "ent-2"],
            writing_style="vivid",
            length_preference="longer",
            persona_id="colleague",
        )
        assert req.conversation_id == "conv-123"
        assert len(req.pinned_context_ids) == 2

    @pytest.mark.asyncio
    async def test_rewrite_returns_json_404_for_missing_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            f"/api/stories/{uuid4()}/rewrite",
            json={"content": "test"},
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")
        assert response.json()["detail"] == "Story not found"

    @pytest.mark.asyncio
    async def test_rewrite_rejects_unauthorized_story_access(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        other_headers = create_auth_headers_for_user(test_user_2)

        response = await client.post(
            f"/api/stories/{test_story.id}/rewrite",
            json={"content": "test"},
            headers=other_headers,
        )

        assert response.status_code == 403
        assert response.headers["content-type"].startswith("application/json")
        assert response.json()["detail"] == "Not authorized to view this story"

    @pytest.mark.asyncio
    async def test_rewrite_rejects_foreign_conversation_securely(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story: Story,
        test_user_2: User,
    ) -> None:
        foreign_conversation = AIConversation(
            user_id=test_user_2.id,
            persona_id="biographer",
            title="Foreign",
        )
        db_session.add(foreign_conversation)
        await db_session.commit()

        response = await client.post(
            f"/api/stories/{test_story.id}/rewrite",
            json={
                "content": "test",
                "conversation_id": str(foreign_conversation.id),
            },
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Conversation not found"
