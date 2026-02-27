"""Tests for the rewrite SSE endpoint."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient


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
