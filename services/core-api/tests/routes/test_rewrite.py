"""Tests for the rewrite SSE endpoint."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.ai_rate_limits import (
    STORY_REWRITE_CONCURRENCY,
    STORY_REWRITE_THRESHOLDS,
)
from app.models.ai import AIConversation
from app.models.ai_rate_limit import AIRateLimitEvent
from app.models.story import Story
from app.models.story_evolution import StoryEvolutionSession
from app.models.story_version import StoryVersion
from app.models.user import User
from app.services.ai_concurrency import AIConcurrencySlot
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

    @pytest.mark.asyncio
    async def test_rewrite_denies_non_author_and_preserves_draft(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_story_public: Story,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """Regression test for issue #98 (IDOR).

        `POST /rewrite` used to be gated on read-only access, so any user who
        could *read* a public story (i.e. anyone) could rewrite it — which
        deletes the author's in-progress draft `StoryVersion` and repoints
        the active `StoryEvolutionSession.draft_version_id`. A non-author
        must now be denied before any mutation happens, and the author's
        draft/session must be left completely untouched.
        """
        draft = StoryVersion(
            story_id=test_story_public.id,
            version_number=2,
            title=test_story_public.title,
            content="Author's in-progress draft — must survive the attack.",
            status="draft",
            source="ai_rewrite",
            created_by=test_story_public.author_id,
        )
        db_session.add(draft)
        await db_session.flush()

        conversation = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
        )
        db_session.add(conversation)
        await db_session.flush()

        evo_session = StoryEvolutionSession(
            story_id=test_story_public.id,
            base_version_number=1,
            conversation_id=conversation.id,
            phase="drafting",
            created_by=test_user.id,
            draft_version_id=draft.id,
        )
        db_session.add(evo_session)
        await db_session.commit()
        await db_session.refresh(draft)
        await db_session.refresh(evo_session)

        draft_id = draft.id
        original_content = draft.content
        original_created_by = draft.created_by
        session_id = evo_session.id
        original_draft_version_id = evo_session.draft_version_id

        other_headers = create_auth_headers_for_user(test_user_2)

        response = await client.post(
            f"/api/stories/{test_story_public.id}/rewrite",
            json={"content": "malicious content"},
            headers=other_headers,
        )

        assert response.status_code == 403
        assert response.headers["content-type"].startswith("application/json")
        assert (
            response.json()["detail"] == "Only the story author can rewrite this story"
        )

        reloaded_draft = (
            await db_session.execute(
                select(StoryVersion).where(StoryVersion.id == draft_id)
            )
        ).scalar_one_or_none()
        assert reloaded_draft is not None
        assert reloaded_draft.id == draft_id
        assert reloaded_draft.content == original_content
        assert reloaded_draft.created_by == original_created_by

        reloaded_session = (
            await db_session.execute(
                select(StoryEvolutionSession).where(
                    StoryEvolutionSession.id == session_id
                )
            )
        ).scalar_one_or_none()
        assert reloaded_session is not None
        assert reloaded_session.draft_version_id == original_draft_version_id

    @pytest.mark.asyncio
    async def test_rewrite_allows_author(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story_public: Story,
        test_user: User,
    ) -> None:
        """The story's author must still be able to rewrite their own story."""

        async def mock_stream(**kwargs: object) -> AsyncGenerator[str, None]:
            for chunk in ["Once upon a time, ", "there was a hero."]:
                yield chunk

        mock_provider = MagicMock()
        mock_provider.stream_generate = mock_stream

        mock_registry = MagicMock()
        mock_registry.get_llm_provider.return_value = mock_provider

        with patch(
            "app.routes.rewrite.get_provider_registry",
            return_value=mock_registry,
        ):
            response = await client.post(
                f"/api/stories/{test_story_public.id}/rewrite",
                json={"content": test_story_public.content},
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert '"type":"done"' in response.text
        assert "Once upon a time, " in response.text
        assert "there was a hero." in response.text

        result = await db_session.execute(
            select(StoryVersion).where(
                StoryVersion.story_id == test_story_public.id,
                StoryVersion.status == "draft",
            )
        )
        new_draft = result.scalar_one()
        assert new_draft.content == "Once upon a time, there was a hero."
        assert new_draft.created_by == test_user.id
        assert new_draft.source == "ai_rewrite"

    @pytest.mark.asyncio
    async def test_rewrite_returns_429_when_frequency_limit_exceeded(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story_public: Story,
        test_user: User,
    ) -> None:
        """Exceeding STORY_REWRITE_THRESHOLDS returns 429 with a numeric
        Retry-After header, and the LLM provider is never touched — the
        frequency check runs before the stream/provider is reached."""
        window_seconds, max_count = STORY_REWRITE_THRESHOLDS[0]
        for _ in range(max_count):
            db_session.add(
                AIRateLimitEvent(user_id=test_user.id, bucket="story_rewrite")
            )
        await db_session.commit()

        mock_registry = MagicMock()

        with patch(
            "app.routes.rewrite.get_provider_registry",
            return_value=mock_registry,
        ):
            response = await client.post(
                f"/api/stories/{test_story_public.id}/rewrite",
                json={"content": test_story_public.content},
                headers=auth_headers,
            )

        assert response.status_code == 429
        retry_after = response.headers.get("Retry-After")
        assert retry_after is not None
        assert int(retry_after) == window_seconds
        mock_registry.get_llm_provider.assert_not_called()

    @pytest.mark.asyncio
    async def test_rewrite_returns_429_when_concurrency_limit_exceeded(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story_public: Story,
        test_user: User,
    ) -> None:
        """STORY_REWRITE_CONCURRENCY is 1, so pre-occupying the single slot
        must cause the route to reject with 429 + Retry-After. After the
        slot is released, a follow-up call must no longer be rejected for
        concurrency (it may still fail downstream, e.g. no LLM configured,
        but that must not surface as a 429)."""
        slot = await AIConcurrencySlot.acquire(
            test_user.id, bucket="story_rewrite", limit=STORY_REWRITE_CONCURRENCY
        )
        try:
            response = await client.post(
                f"/api/stories/{test_story_public.id}/rewrite",
                json={"content": test_story_public.content},
                headers=auth_headers,
            )
            assert response.status_code == 429
            retry_after = response.headers.get("Retry-After")
            assert retry_after is not None
            assert int(retry_after) > 0
        finally:
            await slot.release()

        # Bonus: the slot is free again after release, so a follow-up call
        # must not be concurrency-rejected. It may still fail downstream
        # (e.g. no LLM provider configured in the test env), which is fine —
        # we only assert it isn't a 429.
        follow_up = await client.post(
            f"/api/stories/{test_story_public.id}/rewrite",
            json={"content": test_story_public.content},
            headers=auth_headers,
        )
        assert follow_up.status_code != 429
