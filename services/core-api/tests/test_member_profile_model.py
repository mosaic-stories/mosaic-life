"""Tests for relationship model and legacy/user gender columns."""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.relationship import Relationship
from app.models.user import User


@pytest_asyncio.fixture
async def member_with_relationship(
    db_session: AsyncSession, test_user: User, test_legacy: Legacy
) -> Relationship:
    """Create a Relationship row linked to the creator membership."""
    result = await db_session.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == test_legacy.id,
            LegacyMember.user_id == test_user.id,
        )
    )
    result.scalar_one()  # ensure member exists

    rel = Relationship(
        owner_user_id=test_user.id,
        legacy_member_legacy_id=test_legacy.id,
        legacy_member_user_id=test_user.id,
        relationship_type="parent",
        nicknames=["Mom", "Mama"],
        who_i_am_to_them="She was my guiding light.",
        who_they_are_to_me="Her youngest child.",
        character_traits=["kind", "resilient", "funny"],
    )
    db_session.add(rel)
    await db_session.commit()
    await db_session.refresh(rel)
    return rel


@pytest.mark.asyncio
async def test_relationship_stores_data(
    member_with_relationship: Relationship,
) -> None:
    """Relationship model stores and retrieves data."""
    assert member_with_relationship.relationship_type == "parent"
    assert member_with_relationship.nicknames == ["Mom", "Mama"]
    assert "kind" in member_with_relationship.character_traits  # type: ignore[operator]
    assert member_with_relationship.who_i_am_to_them == "She was my guiding light."
    assert member_with_relationship.who_they_are_to_me == "Her youngest child."


@pytest.mark.asyncio
async def test_legacy_gender_column(
    db_session: AsyncSession, test_legacy: Legacy
) -> None:
    """Legacy gender column stores and retrieves."""
    test_legacy.gender = "female"
    await db_session.commit()
    await db_session.refresh(test_legacy)
    assert test_legacy.gender == "female"


@pytest.mark.asyncio
async def test_user_gender_column(db_session: AsyncSession, test_user: User) -> None:
    """User gender column stores and retrieves."""
    test_user.gender = "male"
    await db_session.commit()
    await db_session.refresh(test_user)
    assert test_user.gender == "male"
