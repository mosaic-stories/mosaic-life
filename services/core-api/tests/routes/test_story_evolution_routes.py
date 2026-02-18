"""Tests for story evolution API routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestCreateEvolutionSession:
    @pytest.mark.asyncio
    async def test_start_session_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["phase"] == "elicitation"
        assert data["conversation_id"] is not None

    @pytest.mark.asyncio
    async def test_start_session_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ) -> None:
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_start_session_non_author_forbidden(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_start_session_conflict(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        # First session
        await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )

        # Second attempt — 409
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        assert response.status_code == 409


class TestGetActiveSession:
    @pytest.mark.asyncio
    async def test_get_active_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        # Create session first
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        assert create_resp.status_code == 201

        # Get active
        response = await client.get(
            f"/api/stories/{test_story.id}/evolution/active",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["phase"] == "elicitation"

    @pytest.mark.asyncio
    async def test_get_active_session_404(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        response = await client.get(
            f"/api/stories/{test_story.id}/evolution/active",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestAdvancePhase:
    @pytest.mark.asyncio
    async def test_advance_to_summary(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/stories/{test_story.id}/evolution/{session_id}/phase",
            json={
                "phase": "summary",
                "summary_text": "## New Details\n- Uncle Ray",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["phase"] == "summary"

    @pytest.mark.asyncio
    async def test_invalid_transition(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/stories/{test_story.id}/evolution/{session_id}/phase",
            json={"phase": "review"},
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestDiscardSession:
    @pytest.mark.asyncio
    async def test_discard_session(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{session_id}/discard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["phase"] == "discarded"


class TestSummarizeConversation:
    @pytest.mark.asyncio
    async def test_summarize_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        mock_messages = [
            {"role": "assistant", "content": "Tell me about this story."},
            {"role": "user", "content": "Uncle Ray was there."},
        ]

        async def mock_stream(**kwargs):
            for chunk in ["**New Details**\n", "- Uncle Ray was present"]:
                yield chunk

        mock_provider = MagicMock()
        mock_provider.stream_generate = mock_stream

        mock_registry = MagicMock()
        mock_registry.get_llm_provider.return_value = mock_provider

        with (
            patch(
                "app.services.ai.get_context_messages",
                new_callable=AsyncMock,
                return_value=mock_messages,
            ),
            patch(
                "app.routes.story_evolution.get_provider_registry",
                return_value=mock_registry,
            ),
        ):
            response = await client.post(
                f"/api/stories/{test_story.id}/evolution/{session_id}/summarize",
                headers=auth_headers,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["phase"] == "summary"
        assert "Uncle Ray" in data["summary_text"]

    @pytest.mark.asyncio
    async def test_summarize_wrong_phase(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        # Advance to summary first
        await client.patch(
            f"/api/stories/{test_story.id}/evolution/{session_id}/phase",
            json={
                "phase": "summary",
                "summary_text": "## New Details\n- Detail",
            },
            headers=auth_headers,
        )

        mock_registry = MagicMock()

        with patch(
            "app.routes.story_evolution.get_provider_registry",
            return_value=mock_registry,
        ):
            response = await client.post(
                f"/api/stories/{test_story.id}/evolution/{session_id}/summarize",
                headers=auth_headers,
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_summarize_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ) -> None:
        from uuid import uuid4

        fake_session_id = uuid4()
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{fake_session_id}/summarize",
        )
        assert response.status_code == 401


class TestGenerateDraft:
    @pytest.mark.asyncio
    async def test_generate_requires_style_selection_phase(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        # Create session in elicitation phase
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        # Try to generate from wrong phase
        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{session_id}/generate",
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestReviseDraft:
    @pytest.mark.asyncio
    async def test_revise_requires_review_phase(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ) -> None:
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/evolution",
            json={"persona_id": "biographer"},
            headers=auth_headers,
        )
        session_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/stories/{test_story.id}/evolution/{session_id}/revise",
            json={"instructions": "Make it longer"},
            headers=auth_headers,
        )
        assert response.status_code == 422
