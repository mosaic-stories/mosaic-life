"""Integration tests for story reaction API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


async def _add_member(db: AsyncSession, legacy_id, user_id, role: str) -> None:
    db.add(LegacyMember(legacy_id=legacy_id, user_id=user_id, role=role))
    await db.commit()


class TestToggleReactionRoute:
    @pytest.mark.asyncio
    async def test_member_toggles_reaction_on(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "heart"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["reacted"] is True
        assert data["reaction_type"] == "heart"
        assert data["reaction_heart_count"] == 1
        assert data["reaction_candle_count"] == 0
        assert data["reaction_smile_count"] == 0

    @pytest.mark.asyncio
    async def test_toggling_same_type_twice_removes_it(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "candle"},
            headers=auth_headers,
        )
        response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "candle"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["reacted"] is False
        assert data["reaction_candle_count"] == 0

    @pytest.mark.asyncio
    async def test_non_member_denied(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user_2: User,
        test_story: Story,
    ):
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "smile"},
            headers=headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "heart"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_reaction_type_rejected(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "wow"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_one_of_each_type_per_user(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        heart_resp = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "heart"},
            headers=auth_headers,
        )
        smile_resp = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "smile"},
            headers=auth_headers,
        )
        assert heart_resp.json()["reacted"] is True
        assert smile_resp.json()["reaction_heart_count"] == 1
        assert smile_resp.json()["reaction_smile_count"] == 1

        # Reacting heart again only removes heart.
        heart_toggle_off = await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "heart"},
            headers=auth_headers,
        )
        data = heart_toggle_off.json()
        assert data["reacted"] is False
        assert data["reaction_heart_count"] == 0
        assert data["reaction_smile_count"] == 1

    @pytest.mark.asyncio
    async def test_member_denied_on_personal_story(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user_2: User,
        test_legacy: Legacy,
        test_story_personal: Story,
    ):
        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        headers = create_auth_headers_for_user(test_user_2)

        response = await client.post(
            f"/api/stories/{test_story_personal.id}/reactions",
            json={"reaction_type": "heart"},
            headers=headers,
        )
        assert response.status_code == 403


class TestReactionCountsOnStoryEndpoints:
    @pytest.mark.asyncio
    async def test_counts_appear_on_story_detail(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        await client.post(
            f"/api/stories/{test_story.id}/reactions",
            json={"reaction_type": "heart"},
            headers=auth_headers,
        )

        detail_resp = await client.get(
            f"/api/stories/{test_story.id}", headers=auth_headers
        )
        assert detail_resp.status_code == 200
        data = detail_resp.json()
        assert data["reaction_heart_count"] == 1
        assert data["reaction_candle_count"] == 0
        assert data["reaction_smile_count"] == 0
        assert data["response_count"] == 0
