"""Tests for Legacy Link service."""

import pytest
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.user import User
from app.services.legacy_link import (
    create_link_request,
    get_link_detail,
    list_links_for_user,
    list_shares,
    respond_to_link,
    revoke_link,
    share_resource,
    unshare_resource,
    update_share_mode,
)


async def _make_legacy_with_member(
    db: AsyncSession,
    user: User,
    person: Person,
    name: str = "Test Legacy",
) -> Legacy:
    """Helper to create a legacy with the user as creator member."""
    legacy = Legacy(name=name, created_by=user.id, person_id=person.id)
    db.add(legacy)
    await db.flush()
    member = LegacyMember(legacy_id=legacy.id, user_id=user.id, role="creator")
    db.add(member)
    await db.flush()
    return legacy


@pytest.mark.asyncio
class TestCreateLinkRequest:
    async def test_creates_pending_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Shared Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = await _make_legacy_with_member(
            db_session, test_user, person, "Legacy A"
        )
        legacy_b = await _make_legacy_with_member(
            db_session, test_user_2, person, "Legacy B"
        )

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        assert link.status == "pending"
        assert link.requester_legacy_id == legacy_a.id
        assert link.target_legacy_id == legacy_b.id

    async def test_cannot_link_to_self(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy = await _make_legacy_with_member(db_session, test_user, person)

        with pytest.raises(Exception, match="Cannot link a legacy to itself"):
            await create_link_request(
                db=db_session,
                user_id=test_user.id,
                requester_legacy_id=legacy.id,
                target_legacy_id=legacy.id,
                person_id=person.id,
            )

    async def test_duplicate_link_rejected(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        with pytest.raises(Exception, match="link already exists"):
            await create_link_request(
                db=db_session,
                user_id=test_user.id,
                requester_legacy_id=legacy_a.id,
                target_legacy_id=legacy_b.id,
                person_id=person.id,
            )

    async def test_mismatched_person_rejected(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person_a = Person(canonical_name="Person A")
        person_b = Person(canonical_name="Person B")
        db_session.add(person_a)
        db_session.add(person_b)
        await db_session.flush()

        legacy_a = await _make_legacy_with_member(
            db_session, test_user, person_a, "Legacy A"
        )
        legacy_b = await _make_legacy_with_member(
            db_session, test_user_2, person_b, "Legacy B"
        )

        with pytest.raises(Exception, match="same person"):
            await create_link_request(
                db=db_session,
                user_id=test_user.id,
                requester_legacy_id=legacy_a.id,
                target_legacy_id=legacy_b.id,
                person_id=person_a.id,
            )

    async def test_non_member_cannot_create_request(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        with pytest.raises(Exception):
            await create_link_request(
                db=db_session,
                user_id=test_user_2.id,
                requester_legacy_id=legacy_a.id,  # test_user_2 is not a member of legacy_a
                target_legacy_id=legacy_b.id,
                person_id=person.id,
            )


@pytest.mark.asyncio
class TestRespondToLink:
    async def test_accept_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        updated = await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )
        assert updated.status == "active"
        assert updated.responded_by == test_user_2.id
        assert updated.responded_at is not None

    async def test_reject_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        updated = await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="reject"
        )
        assert updated.status == "rejected"

    async def test_cannot_respond_to_active_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        with pytest.raises(Exception, match="Cannot respond"):
            await respond_to_link(
                db=db_session, user_id=test_user_2.id, link_id=link.id, action="reject"
            )

    async def test_invalid_action_rejected(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        with pytest.raises(Exception, match="Invalid action"):
            await respond_to_link(
                db=db_session, user_id=test_user_2.id, link_id=link.id, action="maybe"
            )

    async def test_requester_cannot_accept_own_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        # test_user is not an admin of legacy_b (target), so should be rejected
        with pytest.raises(Exception):
            await respond_to_link(
                db=db_session, user_id=test_user.id, link_id=link.id, action="accept"
            )


@pytest.mark.asyncio
class TestRevokeLink:
    async def test_revoke_active_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        revoked = await revoke_link(
            db=db_session, user_id=test_user.id, link_id=link.id
        )
        assert revoked.status == "revoked"
        assert revoked.revoked_by == test_user.id
        assert revoked.revoked_at is not None

    async def test_target_can_revoke_active_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        # test_user_2 (target side) can also revoke
        revoked = await revoke_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id
        )
        assert revoked.status == "revoked"

    async def test_cannot_revoke_pending_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        with pytest.raises(Exception, match="only revoke active"):
            await revoke_link(db=db_session, user_id=test_user.id, link_id=link.id)

    async def test_link_not_found(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        with pytest.raises(Exception, match="Link not found"):
            await revoke_link(db=db_session, user_id=test_user.id, link_id=uuid4())


@pytest.mark.asyncio
class TestUpdateShareMode:
    async def test_requester_can_update_share_mode(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        updated = await update_share_mode(
            db=db_session, user_id=test_user.id, link_id=link.id, mode="all"
        )
        assert updated.requester_share_mode == "all"
        assert updated.target_share_mode == "selective"  # unchanged

    async def test_target_can_update_share_mode(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        updated = await update_share_mode(
            db=db_session, user_id=test_user_2.id, link_id=link.id, mode="all"
        )
        assert updated.target_share_mode == "all"
        assert updated.requester_share_mode == "selective"  # unchanged

    async def test_cannot_update_share_mode_on_pending_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        with pytest.raises(Exception, match="active links"):
            await update_share_mode(
                db=db_session, user_id=test_user.id, link_id=link.id, mode="all"
            )


@pytest.mark.asyncio
class TestShareResource:
    async def test_share_story(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        story_id = uuid4()
        share = await share_resource(
            db=db_session,
            user_id=test_user.id,
            link_id=link.id,
            resource_type="story",
            resource_id=story_id,
        )
        assert share.resource_type == "story"
        assert share.resource_id == story_id
        assert share.source_legacy_id == legacy_a.id
        assert share.shared_by == test_user.id

    async def test_target_side_can_share(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        media_id = uuid4()
        share = await share_resource(
            db=db_session,
            user_id=test_user_2.id,
            link_id=link.id,
            resource_type="media",
            resource_id=media_id,
        )
        assert share.source_legacy_id == legacy_b.id

    async def test_cannot_share_on_pending_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        with pytest.raises(Exception, match="active links"):
            await share_resource(
                db=db_session,
                user_id=test_user.id,
                link_id=link.id,
                resource_type="story",
                resource_id=uuid4(),
            )


@pytest.mark.asyncio
class TestListLinks:
    async def test_list_links_for_user(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        links = await list_links_for_user(db=db_session, user_id=test_user.id)
        assert len(links) == 1

    async def test_both_sides_see_link(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        links_user1 = await list_links_for_user(db=db_session, user_id=test_user.id)
        links_user2 = await list_links_for_user(db=db_session, user_id=test_user_2.id)
        assert len(links_user1) == 1
        assert len(links_user2) == 1
        assert links_user1[0].id == links_user2[0].id

    async def test_user_with_no_admin_legacies_gets_empty_list(
        self, db_session: AsyncSession, test_user_2: User
    ) -> None:
        links = await list_links_for_user(db=db_session, user_id=test_user_2.id)
        assert links == []


@pytest.mark.asyncio
class TestGetLinkDetail:
    async def test_get_link_detail_authorized(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        fetched = await get_link_detail(
            db=db_session, user_id=test_user.id, link_id=link.id
        )
        assert fetched.id == link.id

    async def test_get_link_detail_unauthorized(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )

        # Create a third user with no relation to the link
        third_user = User(
            email="third@example.com",
            google_id="google_third",
            name="Third User",
        )
        db_session.add(third_user)
        await db_session.flush()

        with pytest.raises(Exception, match="Not authorized"):
            await get_link_detail(db=db_session, user_id=third_user.id, link_id=link.id)

    async def test_get_link_not_found(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        with pytest.raises(Exception, match="Link not found"):
            await get_link_detail(db=db_session, user_id=test_user.id, link_id=uuid4())


@pytest.mark.asyncio
class TestUnshareResource:
    async def test_unshare(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        story_id = uuid4()
        share = await share_resource(
            db=db_session,
            user_id=test_user.id,
            link_id=link.id,
            resource_type="story",
            resource_id=story_id,
        )

        await unshare_resource(
            db=db_session, user_id=test_user.id, link_id=link.id, share_id=share.id
        )

        shares = await list_shares(db=db_session, user_id=test_user.id, link_id=link.id)
        assert len(shares) == 0

    async def test_cannot_unshare_others_resource(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        story_id = uuid4()
        share = await share_resource(
            db=db_session,
            user_id=test_user.id,  # test_user shares from legacy_a
            link_id=link.id,
            resource_type="story",
            resource_id=story_id,
        )

        # test_user_2 should not be able to unshare test_user's resource
        with pytest.raises(Exception):
            await unshare_resource(
                db=db_session,
                user_id=test_user_2.id,  # test_user_2 is not admin of legacy_a
                link_id=link.id,
                share_id=share.id,
            )

    async def test_unshare_not_found(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        with pytest.raises(Exception, match="Share not found"):
            await unshare_resource(
                db=db_session, user_id=test_user.id, link_id=link.id, share_id=uuid4()
            )


@pytest.mark.asyncio
class TestListShares:
    async def test_list_shares_empty(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        shares = await list_shares(db=db_session, user_id=test_user.id, link_id=link.id)
        assert shares == []

    async def test_list_shares_returns_all(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ) -> None:
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()
        legacy_a = await _make_legacy_with_member(db_session, test_user, person, "A")
        legacy_b = await _make_legacy_with_member(db_session, test_user_2, person, "B")

        link = await create_link_request(
            db=db_session,
            user_id=test_user.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            person_id=person.id,
        )
        await respond_to_link(
            db=db_session, user_id=test_user_2.id, link_id=link.id, action="accept"
        )

        await share_resource(
            db=db_session,
            user_id=test_user.id,
            link_id=link.id,
            resource_type="story",
            resource_id=uuid4(),
        )
        await share_resource(
            db=db_session,
            user_id=test_user.id,
            link_id=link.id,
            resource_type="media",
            resource_id=uuid4(),
        )

        shares = await list_shares(db=db_session, user_id=test_user.id, link_id=link.id)
        assert len(shares) == 2
