"""Tests for member relationship profile model columns."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.user import User


@pytest_asyncio.fixture
async def member_with_profile(
    db_session: AsyncSession, test_user: User, test_legacy: Legacy
) -> LegacyMember:
    """Get the creator member and set a profile on it."""
    from sqlalchemy import select

    result = await db_session.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == test_legacy.id,
            LegacyMember.user_id == test_user.id,
        )
    )
    member = result.scalar_one()
    member.profile = {
        "relationship_type": "parent",
        "nickname": "Mom",
        "legacy_to_viewer": "She was my guiding light.",
        "viewer_to_legacy": "Her youngest child.",
        "character_traits": ["kind", "resilient", "funny"],
    }
    await db_session.commit()
    await db_session.refresh(member)
    return member


@pytest.mark.asyncio
async def test_legacy_member_profile_default_null(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """Profile column defaults to None."""
    from sqlalchemy import select

    result = await db_session.execute(
        select(LegacyMember).where(
            LegacyMember.legacy_id == test_legacy.id,
            LegacyMember.user_id == test_user.id,
        )
    )
    member = result.scalar_one()
    assert member.profile is None


@pytest.mark.asyncio
async def test_legacy_member_profile_stores_jsonb(
    member_with_profile: LegacyMember,
) -> None:
    """Profile column stores and retrieves JSONB data."""
    assert member_with_profile.profile is not None
    assert member_with_profile.profile["relationship_type"] == "parent"
    assert member_with_profile.profile["nickname"] == "Mom"
    assert "kind" in member_with_profile.profile["character_traits"]


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
