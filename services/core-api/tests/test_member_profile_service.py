"""Tests for member profile service."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.graph_adapter import GraphAdapter

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
        nicknames=["Mom"],
    )
    result = await update_profile(db_session, test_legacy.id, test_user.id, data)
    assert result is not None
    assert result.relationship_type == "parent"
    assert result.nicknames == ["Mom"]
    assert result.who_i_am_to_them is None


@pytest.mark.asyncio
async def test_update_profile_merges_partial(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile merges partial updates with existing data."""
    # First update
    data1 = MemberProfileUpdate(
        relationship_type="parent",
        nicknames=["Mom"],
    )
    await update_profile(db_session, test_legacy.id, test_user.id, data1)

    # Second partial update — only changes nicknames
    data2 = MemberProfileUpdate(nicknames=["Mom", "Mama"])
    result = await update_profile(db_session, test_legacy.id, test_user.id, data2)

    assert result is not None
    assert result.relationship_type == "parent"  # preserved
    assert result.nicknames == ["Mom", "Mama"]  # updated


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
async def test_update_profile_clears_explicit_nulls_and_empty_list(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile clears explicitly provided nullable fields."""
    await update_profile(
        db_session,
        test_legacy.id,
        test_user.id,
        MemberProfileUpdate(
            relationship_type="parent",
            nicknames=["Mom"],
            who_i_am_to_them="She raised me",
            who_they_are_to_me="I am her child",
            character_traits=["kind", "funny"],
        ),
    )

    result = await update_profile(
        db_session,
        test_legacy.id,
        test_user.id,
        MemberProfileUpdate(
            relationship_type=None,
            nicknames=None,
            who_i_am_to_them=None,
            character_traits=[],
        ),
    )

    assert result is not None
    assert result.relationship_type is None
    assert result.nicknames is None
    assert result.who_i_am_to_them is None
    assert result.who_they_are_to_me == "I am her child"
    assert result.character_traits == []


@pytest.mark.asyncio
async def test_get_profile_after_update(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """get_profile returns data after update_profile."""
    data = MemberProfileUpdate(
        relationship_type="sibling",
        nicknames=["Sis"],
        who_i_am_to_them="My older sister",
        who_they_are_to_me="Her little brother",
        character_traits=["brave"],
    )
    await update_profile(db_session, test_legacy.id, test_user.id, data)
    result = await get_profile(db_session, test_legacy.id, test_user.id)
    assert result is not None
    assert result.relationship_type == "sibling"
    assert result.nicknames == ["Sis"]
    assert result.who_i_am_to_them == "My older sister"
    assert result.who_they_are_to_me == "Her little brother"
    assert result.character_traits == ["brave"]


@pytest.mark.asyncio
async def test_update_profile_non_member_raises(
    db_session: AsyncSession, test_legacy: Legacy, test_user_2: User
) -> None:
    """update_profile raises 403 for non-members."""
    from fastapi import HTTPException

    data = MemberProfileUpdate(nicknames=["Test"])
    with pytest.raises(HTTPException) as exc_info:
        await update_profile(db_session, test_legacy.id, test_user_2.id, data)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_update_profile_with_custom_relationship_type(
    db_session: AsyncSession, test_legacy: Legacy, test_user: User
) -> None:
    """update_profile accepts custom relationship types."""
    data = MemberProfileUpdate(
        relationship_type="godmother",
        nicknames=["Auntie G"],
    )
    result = await update_profile(db_session, test_legacy.id, test_user.id, data)
    assert result is not None
    assert result.relationship_type == "godmother"
    assert result.nicknames == ["Auntie G"]


@pytest.mark.asyncio
async def test_get_profile_non_member_raises(
    db_session: AsyncSession, test_legacy: Legacy, test_user_2: User
) -> None:
    """get_profile raises 403 for non-members."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await get_profile(db_session, test_legacy.id, test_user_2.id)
    assert exc_info.value.status_code == 403


class TestUpdateProfileGraphSync:
    """Test graph sync on profile update."""

    @pytest.mark.asyncio
    async def test_syncs_relationship_to_graph(
        self, db_session: AsyncSession, test_legacy: Legacy, test_user: User
    ) -> None:
        """Setting relationship_type creates Person->Person graph edge."""
        data = MemberProfileUpdate(relationship_type="uncle")

        with patch("app.services.member_profile.get_provider_registry") as mock_reg:
            mock_graph = AsyncMock(spec=GraphAdapter)
            mock_reg.return_value.get_graph_adapter.return_value = mock_graph

            await update_profile(db_session, test_legacy.id, test_user.id, data)

            # Should upsert Person nodes for user and legacy subject
            assert mock_graph.upsert_node.call_count >= 2

            mock_graph.replace_relationship.assert_awaited_once_with(
                "Person",
                f"user-{test_user.id}",
                ["FAMILY_OF", "WORKED_WITH", "FRIENDS_WITH", "KNEW"],
                "Person",
                str(test_legacy.person_id),
                new_rel_type="FAMILY_OF",
                properties={
                    "relationship_type": "uncle",
                    "source": "declared",
                },
            )

    @pytest.mark.asyncio
    async def test_graph_failure_does_not_block_profile_update(
        self, db_session: AsyncSession, test_legacy: Legacy, test_user: User
    ) -> None:
        """Graph adapter errors are logged but don't fail the profile update."""
        data = MemberProfileUpdate(relationship_type="friend")

        with patch("app.services.member_profile.get_provider_registry") as mock_reg:
            mock_graph = AsyncMock(spec=GraphAdapter)
            mock_graph.upsert_node.side_effect = Exception("Neptune down")
            mock_reg.return_value.get_graph_adapter.return_value = mock_graph

            result = await update_profile(
                db_session, test_legacy.id, test_user.id, data
            )

            # Profile still updated despite graph failure
            assert result.relationship_type == "friend"

    @pytest.mark.asyncio
    async def test_clearing_relationship_removes_existing_graph_edge(
        self, db_session: AsyncSession, test_legacy: Legacy, test_user: User
    ) -> None:
        with patch("app.services.member_profile.get_provider_registry") as mock_reg:
            mock_graph = AsyncMock(spec=GraphAdapter)
            mock_reg.return_value.get_graph_adapter.return_value = mock_graph

            await update_profile(
                db_session,
                test_legacy.id,
                test_user.id,
                MemberProfileUpdate(relationship_type="uncle"),
            )
            mock_graph.reset_mock()

            result = await update_profile(
                db_session,
                test_legacy.id,
                test_user.id,
                MemberProfileUpdate(relationship_type=None),
            )

            assert result.relationship_type is None
            mock_graph.replace_relationship.assert_awaited_once_with(
                "Person",
                f"user-{test_user.id}",
                ["FAMILY_OF", "WORKED_WITH", "FRIENDS_WITH", "KNEW"],
                "Person",
                str(test_legacy.person_id),
                new_rel_type=None,
                properties=None,
            )
