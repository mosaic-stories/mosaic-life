"""Tests for legacy visibility feature."""

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.legacy import LegacyCreate, LegacyResponse, LegacyUpdate


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


class TestLegacyVisibilitySchemas:
    """Tests for legacy visibility in Pydantic schemas."""

    def test_legacy_create_defaults_to_private(self):
        """Test LegacyCreate defaults visibility to private."""
        data = LegacyCreate(name="Test")
        assert data.visibility == "private"

    def test_legacy_create_accepts_public(self):
        """Test LegacyCreate accepts public visibility."""
        data = LegacyCreate(name="Test", visibility="public")
        assert data.visibility == "public"

    def test_legacy_create_rejects_invalid_visibility(self):
        """Test LegacyCreate rejects invalid visibility values."""
        with pytest.raises(ValidationError):
            LegacyCreate(name="Test", visibility="invalid")

    def test_legacy_update_visibility_optional(self):
        """Test LegacyUpdate has optional visibility field."""
        data = LegacyUpdate()
        assert data.visibility is None

    def test_legacy_response_includes_visibility(self):
        """Test LegacyResponse includes visibility field."""
        from datetime import datetime
        from uuid import uuid4

        response = LegacyResponse(
            id=uuid4(),
            name="Test",
            birth_date=None,
            death_date=None,
            biography=None,
            created_by=uuid4(),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            visibility="public",
        )
        assert response.visibility == "public"


from app.services import legacy as legacy_service


class TestCreateLegacyVisibility:
    """Tests for creating legacies with visibility."""

    @pytest.mark.asyncio
    async def test_create_legacy_default_private(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creating legacy defaults to private."""
        data = LegacyCreate(name="Test Legacy")
        result = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )
        assert result.visibility == "private"

    @pytest.mark.asyncio
    async def test_create_legacy_public(
        self,
        db_session: AsyncSession,
        test_user: User,
    ):
        """Test creating public legacy."""
        data = LegacyCreate(name="Public Legacy", visibility="public")
        result = await legacy_service.create_legacy(
            db=db_session,
            user_id=test_user.id,
            data=data,
        )
        assert result.visibility == "public"
