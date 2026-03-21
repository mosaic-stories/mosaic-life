"""Regression tests for member relationship backfill query behavior."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.relationship import Relationship
from app.models.user import User
from scripts.backfill_member_relationships import build_member_relationship_query


@pytest.mark.asyncio
async def test_backfill_query_joins_only_owned_membership_relationship(
    db_session: AsyncSession, test_legacy, test_user: User, test_user_2: User
) -> None:
    """The backfill query should ignore unrelated owners for the same membership."""
    db_session.add_all(
        [
            Relationship(
                owner_user_id=test_user_2.id,
                legacy_member_legacy_id=test_legacy.id,
                legacy_member_user_id=test_user.id,
                relationship_type="friend",
            ),
            Relationship(
                owner_user_id=test_user.id,
                legacy_member_legacy_id=test_legacy.id,
                legacy_member_user_id=test_user.id,
                relationship_type="parent",
            ),
        ]
    )
    await db_session.commit()

    result = await db_session.execute(build_member_relationship_query())
    rows = result.all()

    assert len(rows) == 1

    member, relationship = rows[0]
    assert member.user_id == test_user.id
    assert relationship is not None
    assert relationship.owner_user_id == test_user.id
    assert relationship.relationship_type == "parent"
