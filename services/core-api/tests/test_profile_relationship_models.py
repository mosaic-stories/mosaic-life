"""Tests for ProfileSettings and Relationship models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_settings import ProfileSettings, VisibilityTier
from app.models.relationship import Relationship
from app.models.user import User
from app.models.legacy import Legacy


@pytest.mark.asyncio
class TestProfileSettings:
    async def test_create_profile_settings(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        settings = ProfileSettings(user_id=test_user.id)
        db_session.add(settings)
        await db_session.commit()
        await db_session.refresh(settings)

        assert settings.discoverable is False
        assert settings.visibility_legacies == VisibilityTier.NOBODY.value
        assert settings.visibility_bio == VisibilityTier.CONNECTIONS.value


@pytest.mark.asyncio
class TestRelationship:
    async def test_create_legacy_membership_relationship(
        self, db_session: AsyncSession, test_user: User, test_legacy: Legacy
    ) -> None:
        rel = Relationship(
            owner_user_id=test_user.id,
            legacy_member_legacy_id=test_legacy.id,
            legacy_member_user_id=test_user.id,
            relationship_type="parent",
            who_they_are_to_me="my father",
        )
        db_session.add(rel)
        await db_session.commit()
        await db_session.refresh(rel)

        assert rel.relationship_type == "parent"
        assert rel.who_they_are_to_me == "my father"
        assert rel.connection_id is None
