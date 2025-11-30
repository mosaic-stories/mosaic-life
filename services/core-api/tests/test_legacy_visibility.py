"""Tests for legacy visibility feature."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User


class TestLegacyVisibilityModel:
    """Tests for Legacy model visibility field."""

    @pytest.mark.asyncio
    async def test_legacy_default_visibility_is_private(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that new legacies default to private visibility."""
        legacy = Legacy(
            name="Test Legacy",
            created_by=test_user.id,
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.visibility == "private"

    @pytest.mark.asyncio
    async def test_legacy_can_be_created_as_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test that legacies can be created with public visibility."""
        legacy = Legacy(
            name="Public Legacy",
            created_by=test_user.id,
            visibility="public",
        )
        db_session.add(legacy)
        await db_session.commit()
        await db_session.refresh(legacy)

        assert legacy.visibility == "public"
