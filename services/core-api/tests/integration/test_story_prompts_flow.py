"""Integration tests for story prompts full flow.

Tests the complete lifecycle: unauthenticated access denied,
get prompt, shuffle prompt, act on prompt (discuss).
"""

import pytest
from httpx import AsyncClient

from app.models.legacy import Legacy
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestStoryPromptsFlow:
    """End-to-end tests for the story prompts feature."""

    @pytest.mark.asyncio
    async def test_get_current_prompt_no_auth(
        self,
        client: AsyncClient,
    ) -> None:
        """Unauthenticated GET /api/prompts/current returns 401."""
        response = await client.get("/api/prompts/current")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_prompt_no_legacies_returns_204(
        self,
        client: AsyncClient,
        test_user: User,
    ) -> None:
        """Authenticated user with no legacies gets 204 No Content."""
        headers = create_auth_headers_for_user(test_user)
        # test_user has no legacy yet (test_legacy fixture not requested)
        response = await client.get("/api/prompts/current", headers=headers)
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_full_prompt_lifecycle(
        self,
        client: AsyncClient,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Full flow: get prompt -> shuffle -> act (discuss).

        Steps:
        1. GET /api/prompts/current - should return a prompt
        2. POST /api/prompts/{id}/shuffle - should return a different prompt
        3. POST /api/prompts/{id}/act with discuss - should create conversation
        """
        headers = create_auth_headers_for_user(test_user)

        # Step 1: Get initial prompt
        response = await client.get("/api/prompts/current", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "id" in data
        assert "legacy_id" in data
        assert "prompt_text" in data
        assert "category" in data
        assert "legacy_name" in data
        assert data["legacy_name"] == "Test Legacy"

        first_prompt_id = data["id"]
        first_prompt_text = data["prompt_text"]

        # Step 2: Shuffle the prompt
        response = await client.post(
            f"/api/prompts/{first_prompt_id}/shuffle",
            headers=headers,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        shuffled_data = response.json()
        assert "id" in shuffled_data
        shuffled_prompt_id = shuffled_data["id"]
        # Shuffled prompt should be different from the original
        assert shuffled_prompt_id != first_prompt_id

        # Step 3: Act on the shuffled prompt (discuss)
        response = await client.post(
            f"/api/prompts/{shuffled_prompt_id}/act",
            headers=headers,
            json={"action": "discuss"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        act_data = response.json()
        assert act_data["action"] == "discuss"
        assert act_data["legacy_id"] == str(test_legacy.id)
        assert act_data["conversation_id"] is not None

    @pytest.mark.asyncio
    async def test_act_write_story(
        self,
        client: AsyncClient,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Acting with write_story creates a draft story and evolution session."""
        headers = create_auth_headers_for_user(test_user)

        # Get a prompt
        response = await client.get("/api/prompts/current", headers=headers)
        assert response.status_code == 200
        prompt_id = response.json()["id"]

        # Act: write_story
        response = await client.post(
            f"/api/prompts/{prompt_id}/act",
            headers=headers,
            json={"action": "write_story"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        act_data = response.json()
        assert act_data["action"] == "write_story"
        assert act_data["legacy_id"] == str(test_legacy.id)
        assert act_data["story_id"] is not None
        assert act_data["conversation_id"] is not None

    @pytest.mark.asyncio
    async def test_act_on_already_used_prompt_returns_400(
        self,
        client: AsyncClient,
        test_user: User,
        test_legacy: Legacy,
    ) -> None:
        """Acting on an already-used prompt returns 400."""
        headers = create_auth_headers_for_user(test_user)

        # Get a prompt
        response = await client.get("/api/prompts/current", headers=headers)
        assert response.status_code == 200
        prompt_id = response.json()["id"]

        # Act on it once
        response = await client.post(
            f"/api/prompts/{prompt_id}/act",
            headers=headers,
            json={"action": "discuss"},
        )
        assert response.status_code == 200

        # Act on the same prompt again should fail
        response = await client.post(
            f"/api/prompts/{prompt_id}/act",
            headers=headers,
            json={"action": "discuss"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_shuffle_nonexistent_prompt_returns_404(
        self,
        client: AsyncClient,
        test_user: User,
    ) -> None:
        """Shuffling a non-existent prompt returns 404."""
        headers = create_auth_headers_for_user(test_user)
        fake_id = "00000000-0000-0000-0000-000000000000"

        response = await client.post(
            f"/api/prompts/{fake_id}/shuffle",
            headers=headers,
        )
        assert response.status_code == 404
