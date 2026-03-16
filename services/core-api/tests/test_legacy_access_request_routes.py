"""Tests for legacy access request routes."""

import pytest
from httpx import AsyncClient

from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


@pytest.mark.asyncio
class TestAccessRequestRoutes:
    async def test_submit_request(
        self, client: AsyncClient, test_user_2: User, test_legacy: Legacy
    ) -> None:
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "advocate", "message": "I knew them"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"

    async def test_list_pending_as_admin(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ) -> None:
        # Submit request first
        user2_headers = create_auth_headers_for_user(test_user_2)
        await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "advocate"},
            headers=user2_headers,
        )

        # List as admin (test_user is creator)
        response = await client.get(
            f"/api/legacies/{test_legacy.id}/access-requests",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    async def test_approve_request(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ) -> None:
        user2_headers = create_auth_headers_for_user(test_user_2)
        submit_resp = await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "advocate"},
            headers=user2_headers,
        )
        request_id = submit_resp.json()["id"]

        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/access-requests/{request_id}/approve",
            json={},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "approved"

    async def test_list_outgoing(
        self, client: AsyncClient, test_user_2: User, test_legacy: Legacy
    ) -> None:
        user2_headers = create_auth_headers_for_user(test_user_2)
        await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "admirer"},
            headers=user2_headers,
        )

        response = await client.get(
            "/api/access-requests/outgoing",
            headers=user2_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    async def test_approve_rejects_mismatched_legacy_id(
        self,
        client: AsyncClient,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        test_legacy_2: Legacy,
        auth_headers: dict[str, str],
    ) -> None:
        user2_headers = create_auth_headers_for_user(test_user_2)
        submit_resp = await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "advocate"},
            headers=user2_headers,
        )
        request_id = submit_resp.json()["id"]

        response = await client.patch(
            f"/api/legacies/{test_legacy_2.id}/access-requests/{request_id}/approve",
            json={},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_approve_rejects_existing_member(
        self,
        client: AsyncClient,
        db_session,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ) -> None:
        user2_headers = create_auth_headers_for_user(test_user_2)
        submit_resp = await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "advocate"},
            headers=user2_headers,
        )
        request_id = submit_resp.json()["id"]

        db_session.add(
            LegacyMember(
                legacy_id=test_legacy.id,
                user_id=test_user_2.id,
                role="admirer",
            )
        )
        await db_session.commit()

        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/access-requests/{request_id}/approve",
            json={},
            headers=auth_headers,
        )
        assert response.status_code == 409

    async def test_decline_rejects_mismatched_legacy_id(
        self,
        client: AsyncClient,
        test_user_2: User,
        test_legacy: Legacy,
        test_legacy_2: Legacy,
        auth_headers: dict[str, str],
    ) -> None:
        user2_headers = create_auth_headers_for_user(test_user_2)
        submit_resp = await client.post(
            f"/api/legacies/{test_legacy.id}/access-requests",
            json={"requested_role": "advocate"},
            headers=user2_headers,
        )
        request_id = submit_resp.json()["id"]

        response = await client.patch(
            f"/api/legacies/{test_legacy_2.id}/access-requests/{request_id}/decline",
            headers=auth_headers,
        )
        assert response.status_code == 404
