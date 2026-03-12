"""Tests for Person API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import MediaPerson
from app.models.person import Person
from tests.conftest import create_auth_headers_for_user


@pytest.mark.asyncio
class TestMatchCandidates:
    async def test_match_candidates_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/persons/match-candidates?name=John")
        assert response.status_code == 401

    async def test_match_candidates_requires_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get(
            "/api/persons/match-candidates",
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_match_candidates_returns_results(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
    ):
        person = Person(canonical_name="John Smith")
        db_session.add(person)
        await db_session.commit()

        response = await client.get(
            "/api/persons/match-candidates?name=John+Smith",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "candidates" in data
        assert isinstance(data["candidates"], list)

    async def test_match_candidates_empty_for_no_match(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        response = await client.get(
            "/api/persons/match-candidates?name=ZzzNoMatchXxx",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["candidates"] == []


@pytest.mark.asyncio
class TestPersonSearch:
    async def test_search_requires_legacy_id(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        response = await client.get(
            "/api/persons/search",
            params={"q": "Test"},
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_search_requires_non_pending_membership(
        self,
        client: AsyncClient,
        test_legacy_with_pending,
        test_user_2,
    ):
        pending_headers = create_auth_headers_for_user(test_user_2)
        response = await client.get(
            "/api/persons/search",
            params={"q": "Pending", "legacy_id": str(test_legacy_with_pending.id)},
            headers=pending_headers,
        )

        assert response.status_code == 403

    async def test_search_returns_only_requested_legacy_scope(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        test_legacy,
        test_legacy_2,
        test_media,
    ):
        primary_person = Person(canonical_name="Shared Query Person")
        secondary_person = Person(canonical_name="Shared Query Person Two")
        unrelated_person = Person(canonical_name="Shared Query Elsewhere")
        db_session.add_all([primary_person, secondary_person, unrelated_person])
        await db_session.flush()

        test_legacy.person_id = primary_person.id
        db_session.add(
            MediaPerson(
                media_id=test_media.id,
                person_id=secondary_person.id,
                role="subject",
            )
        )

        test_legacy_2.person_id = unrelated_person.id
        await db_session.commit()

        response = await client.get(
            "/api/persons/search",
            params={"q": "Shared Query", "legacy_id": str(test_legacy.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        returned_ids = {item["id"] for item in data}
        assert str(primary_person.id) in returned_ids
        assert str(secondary_person.id) in returned_ids
        assert str(unrelated_person.id) not in returned_ids
