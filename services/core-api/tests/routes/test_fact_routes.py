"""Tests for fact management API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.memory import LegacyFact
from app.models.user import User


class TestListFacts:
    """Tests for GET /api/ai/legacies/{legacy_id}/facts."""

    @pytest.mark.asyncio
    async def test_returns_user_facts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test listing facts for a legacy."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Loved fishing",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.get(
            f"/api/ai/legacies/{test_legacy.id}/facts",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["content"] == "Loved fishing"


class TestDeleteFact:
    """Tests for DELETE /api/ai/facts/{fact_id}."""

    @pytest.mark.asyncio
    async def test_deletes_own_fact(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test deleting own fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="To delete",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.delete(
            f"/api/ai/facts/{fact.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_cannot_delete_others_fact(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test that you can't delete another user's fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            category="hobby",
            content="Not yours",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.delete(
            f"/api/ai/facts/{fact.id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestUpdateFactVisibility:
    """Tests for PATCH /api/ai/facts/{fact_id}/visibility."""

    @pytest.mark.asyncio
    async def test_shares_fact(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_legacy: Legacy,
        auth_headers: dict[str, str],
    ):
        """Test sharing a fact."""
        fact = LegacyFact(
            legacy_id=test_legacy.id,
            user_id=test_user.id,
            category="hobby",
            content="Shareable",
            visibility="private",
        )
        db_session.add(fact)
        await db_session.commit()

        response = await client.patch(
            f"/api/ai/facts/{fact.id}/visibility",
            headers=auth_headers,
            json={"visibility": "shared"},
        )

        assert response.status_code == 200
        assert response.json()["visibility"] == "shared"
