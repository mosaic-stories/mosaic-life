"""Tests for LegacyLink and LegacyLinkShare models."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy
from app.models.legacy_link import LegacyLink, LegacyLinkShare
from app.models.person import Person
from app.models.user import User


@pytest.mark.asyncio
class TestLegacyLinkModel:
    async def test_create_link_request(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person = Person(canonical_name="Shared Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(name="Legacy A", created_by=test_user.id, person_id=person.id)
        legacy_b = Legacy(
            name="Legacy B", created_by=test_user_2.id, person_id=person.id
        )
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            requested_by=test_user.id,
        )
        db_session.add(link)
        await db_session.commit()
        await db_session.refresh(link)

        assert link.id is not None
        assert link.status == "pending"
        assert link.requester_share_mode == "selective"
        assert link.target_share_mode == "selective"

    async def test_link_share(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person = Person(canonical_name="Shared Person 2")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(name="LA", created_by=test_user.id, person_id=person.id)
        legacy_b = Legacy(name="LB", created_by=test_user_2.id, person_id=person.id)
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            requested_by=test_user.id,
            status="active",
        )
        db_session.add(link)
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_a.id,
            resource_type="story",
            resource_id=legacy_a.id,  # Using legacy_a.id as placeholder UUID
            shared_by=test_user.id,
        )
        db_session.add(share)
        await db_session.commit()
        await db_session.refresh(share)

        assert share.id is not None
        assert share.resource_type == "story"
