"""Tests for member profile service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.user import User
from app.schemas.member_profile import MemberProfileUpdate
from app.services.member_profile import get_profile, update_profile


@pytest.mark.asyncio
async def test_get_profile_returns_none_when_empty(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """get_profile returns None when no profile is set."""
    result = await get_profile(db_session, test_legacy.id, test_user.id)
    assert result is None


@pytest.mark.asyncio
async def test_update_profile_creates_new(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile creates a profile when none exists."""
    data = MemberProfileUpdate(
        relationship_type="parent",
        nickname="Mom",
    )
    result = await update_profile(db_session, test_legacy.id, test_user.id, data)
    assert result is not None
    assert result.relationship_type == "parent"
    assert result.nickname == "Mom"
    assert result.legacy_to_viewer is None


@pytest.mark.asyncio
async def test_update_profile_merges_partial(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile merges partial updates with existing data."""
    # First update
    data1 = MemberProfileUpdate(
        relationship_type="parent",
        nickname="Mom",
    )
    await update_profile(db_session, test_legacy.id, test_user.id, data1)

    # Second partial update — only changes nickname
    data2 = MemberProfileUpdate(nickname="Mama")
    result = await update_profile(db_session, test_legacy.id, test_user.id, data2)

    assert result is not None
    assert result.relationship_type == "parent"  # preserved
    assert result.nickname == "Mama"  # updated


@pytest.mark.asyncio
async def test_update_profile_with_character_traits(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile handles character_traits list."""
    data = MemberProfileUpdate(
        character_traits=["kind", "funny", "resilient"],
    )
    result = await update_profile(db_session, test_legacy.id, test_user.id, data)
    assert result is not None
    assert result.character_traits == ["kind", "funny", "resilient"]


@pytest.mark.asyncio
async def test_get_profile_after_update(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """get_profile returns data after update_profile."""
    data = MemberProfileUpdate(
        relationship_type="sibling",
        nickname="Sis",
        legacy_to_viewer="My older sister",
        viewer_to_legacy="Her little brother",
        character_traits=["brave"],
    )
    await update_profile(db_session, test_legacy.id, test_user.id, data)
    result = await get_profile(db_session, test_legacy.id, test_user.id)
    assert result is not None
    assert result.relationship_type == "sibling"
    assert result.nickname == "Sis"
    assert result.legacy_to_viewer == "My older sister"
    assert result.viewer_to_legacy == "Her little brother"
    assert result.character_traits == ["brave"]


@pytest.mark.asyncio
async def test_update_profile_non_member_raises(
    db_session: AsyncSession, test_legacy: Legacy, test_user_2: User
) -> None:
    """update_profile raises 403 for non-members."""
    from fastapi import HTTPException

    data = MemberProfileUpdate(nickname="Test")
    with pytest.raises(HTTPException) as exc_info:
        await update_profile(db_session, test_legacy.id, test_user_2.id, data)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_profile_non_member_raises(
    db_session: AsyncSession, test_legacy: Legacy, test_user_2: User
) -> None:
    """get_profile raises 403 for non-members."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await get_profile(db_session, test_legacy.id, test_user_2.id)
    assert exc_info.value.status_code == 403
