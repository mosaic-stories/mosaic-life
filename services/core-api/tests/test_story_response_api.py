"""Integration tests for story response API endpoints."""

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


class TestCreateResponseRoute:
    @pytest.mark.asyncio
    async def test_member_creates_response(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Add what you remember..."},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["body"] == "Add what you remember..."
        assert data["edited_at"] is None

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
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Not allowed"},
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
            f"/api/stories/{test_story.id}/responses",
            json={"body": "No auth"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_html_body_stripped(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "<b>Bold</b> memory\nwith a line break"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert "<" not in data["body"]
        assert "\n" in data["body"]

    @pytest.mark.asyncio
    async def test_empty_body_rejected(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "   "},
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestListResponsesRoute:
    @pytest.mark.asyncio
    async def test_list_returns_created_responses_oldest_first(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        for body in ["first", "second", "third"]:
            await client.post(
                f"/api/stories/{test_story.id}/responses",
                json={"body": body},
                headers=auth_headers,
            )

        response = await client.get(
            f"/api/stories/{test_story.id}/responses",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert [item["body"] for item in data["items"]] == ["first", "second", "third"]
        assert data["has_more"] is False

    @pytest.mark.asyncio
    async def test_list_respects_limit(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        for body in ["first", "second", "third"]:
            await client.post(
                f"/api/stories/{test_story.id}/responses",
                json={"body": body},
                headers=auth_headers,
            )

        response = await client.get(
            f"/api/stories/{test_story.id}/responses?limit=2",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["has_more"] is True
        assert data["next_cursor"] is not None

    @pytest.mark.asyncio
    async def test_list_rejects_malformed_cursor(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.get(
            f"/api/stories/{test_story.id}/responses?cursor=not-a-date",
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_denied_for_non_member(
        self,
        client: AsyncClient,
        test_user_2: User,
        test_story: Story,
    ):
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.get(
            f"/api/stories/{test_story.id}/responses",
            headers=headers,
        )
        assert response.status_code == 403


class TestUpdateResponseRoute:
    @pytest.mark.asyncio
    async def test_author_can_edit(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Original"},
            headers=auth_headers,
        )
        response_id = create_resp.json()["id"]

        edit_resp = await client.patch(
            f"/api/stories/{test_story.id}/responses/{response_id}",
            json={"body": "Edited"},
            headers=auth_headers,
        )
        assert edit_resp.status_code == 200
        data = edit_resp.json()
        assert data["body"] == "Edited"
        assert data["edited_at"] is not None

    @pytest.mark.asyncio
    async def test_non_author_cannot_edit(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Original"},
            headers=auth_headers,
        )
        response_id = create_resp.json()["id"]

        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        other_headers = create_auth_headers_for_user(test_user_2)

        edit_resp = await client.patch(
            f"/api/stories/{test_story.id}/responses/{response_id}",
            json={"body": "Hijacked"},
            headers=other_headers,
        )
        assert edit_resp.status_code == 403


class TestDeleteResponseRoute:
    @pytest.mark.asyncio
    async def test_author_can_delete(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Delete me"},
            headers=auth_headers,
        )
        response_id = create_resp.json()["id"]

        delete_resp = await client.delete(
            f"/api/stories/{test_story.id}/responses/{response_id}",
            headers=auth_headers,
        )
        assert delete_resp.status_code == 204

        list_resp = await client.get(
            f"/api/stories/{test_story.id}/responses",
            headers=auth_headers,
        )
        assert list_resp.json()["items"] == []

    @pytest.mark.asyncio
    async def test_advocate_cannot_delete_others_response(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Delete me"},
            headers=auth_headers,
        )
        response_id = create_resp.json()["id"]

        await _add_member(db_session, test_legacy.id, test_user_2.id, "advocate")
        other_headers = create_auth_headers_for_user(test_user_2)

        delete_resp = await client.delete(
            f"/api/stories/{test_story.id}/responses/{response_id}",
            headers=other_headers,
        )
        assert delete_resp.status_code == 403

    @pytest.mark.asyncio
    async def test_legacy_admin_can_delete_others_response(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict[str, str],
        test_user_2: User,
        test_legacy: Legacy,
        test_story: Story,
    ):
        create_resp = await client.post(
            f"/api/stories/{test_story.id}/responses",
            json={"body": "Delete me"},
            headers=auth_headers,
        )
        response_id = create_resp.json()["id"]

        await _add_member(db_session, test_legacy.id, test_user_2.id, "admin")
        other_headers = create_auth_headers_for_user(test_user_2)

        delete_resp = await client.delete(
            f"/api/stories/{test_story.id}/responses/{response_id}",
            headers=other_headers,
        )
        assert delete_resp.status_code == 204
