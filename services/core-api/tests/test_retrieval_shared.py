"""Tests for linked-legacy chunk retrieval logic.

These tests exercise ``get_linked_legacy_filters``, the helper function that
determines *which* chunks from linked legacies to include during RAG retrieval.
The helper is intentionally free of pgvector / vector-search logic so it can
run against the in-memory SQLite engine used by the test suite.
"""

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.legacy_link import LegacyLink, LegacyLinkShare
from app.models.person import Person
from app.models.user import User
from app.services.retrieval import get_linked_legacy_filters


# ---------------------------------------------------------------------------
# Shared test helpers
# ---------------------------------------------------------------------------


async def _make_legacy(
    db: AsyncSession,
    user: User,
    name: str = "Test Legacy",
) -> Legacy:
    """Create a legacy with *user* as creator member."""
    person = Person(canonical_name=name)
    db.add(person)
    await db.flush()

    legacy = Legacy(name=name, created_by=user.id, person_id=person.id)
    db.add(legacy)
    await db.flush()

    member = LegacyMember(legacy_id=legacy.id, user_id=user.id, role="creator")
    db.add(member)
    await db.flush()

    return legacy


async def _activate_link(
    db: AsyncSession,
    requester_legacy: Legacy,
    target_legacy: Legacy,
    requester_user: User,
    target_user: User,
    requester_share_mode: str = "selective",
    target_share_mode: str = "selective",
) -> LegacyLink:
    """Create an *active* LegacyLink between two legacies."""
    # Both legacies need the same person
    person = Person(canonical_name="Shared Person")
    db.add(person)
    await db.flush()

    # Set person_id on legacies (they were created without it in _make_legacy above;
    # for these tests we override to a shared person)
    requester_legacy.person_id = person.id
    target_legacy.person_id = person.id
    await db.flush()

    link = LegacyLink(
        person_id=person.id,
        requester_legacy_id=requester_legacy.id,
        target_legacy_id=target_legacy.id,
        status="active",
        requester_share_mode=requester_share_mode,
        target_share_mode=target_share_mode,
        requested_by=requester_user.id,
        responded_by=target_user.id,
    )
    db.add(link)
    await db.flush()
    return link


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetLinkedLegacyFilters:
    """Tests for ``get_linked_legacy_filters``."""

    async def test_no_links_returns_empty(
        self,
        db_session: AsyncSession,
        test_user: User,
    ) -> None:
        """A legacy with no active links should return an empty filter list."""
        legacy = await _make_legacy(db_session, test_user, "Solo Legacy")
        filters = await get_linked_legacy_filters(db_session, legacy.id)
        assert filters == []

    async def test_pending_link_not_included(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """Pending (unaccepted) links must be ignored."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        person = Person(canonical_name="Shared")
        db_session.add(person)
        await db_session.flush()
        legacy_a.person_id = person.id
        legacy_b.person_id = person.id

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            status="pending",
            requested_by=test_user.id,
        )
        db_session.add(link)
        await db_session.flush()

        filters = await get_linked_legacy_filters(db_session, legacy_a.id)
        assert filters == []

    async def test_revoked_link_not_included(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """Revoked links must be ignored."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        person = Person(canonical_name="Shared")
        db_session.add(person)
        await db_session.flush()
        legacy_a.person_id = person.id
        legacy_b.person_id = person.id

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            status="revoked",
            requested_by=test_user.id,
        )
        db_session.add(link)
        await db_session.flush()

        filters = await get_linked_legacy_filters(db_session, legacy_a.id)
        assert filters == []

    # ------------------------------------------------------------------
    # "all" share mode
    # ------------------------------------------------------------------

    async def test_target_all_share_mode_as_requester(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """When querying from the *requester* side and the *target* uses
        share_mode ``all``, we should get a filter with share_mode ``all``
        pointing to the target legacy."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            requester_share_mode="selective",
            target_share_mode="all",  # target shares everything with requester
        )

        filters = await get_linked_legacy_filters(db_session, legacy_a.id)

        assert len(filters) == 1
        f = filters[0]
        assert f.legacy_id == legacy_b.id
        assert f.share_mode == "all"
        assert f.story_ids == []

    async def test_requester_all_share_mode_as_target(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """When querying from the *target* side and the *requester* uses
        share_mode ``all``, we should get a filter with share_mode ``all``
        pointing to the requester legacy."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            requester_share_mode="all",  # requester shares everything with target
            target_share_mode="selective",
        )

        filters = await get_linked_legacy_filters(db_session, legacy_b.id)

        assert len(filters) == 1
        f = filters[0]
        assert f.legacy_id == legacy_a.id
        assert f.share_mode == "all"
        assert f.story_ids == []

    # ------------------------------------------------------------------
    # "selective" share mode
    # ------------------------------------------------------------------

    async def test_selective_with_no_shares_omitted(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """A selective link with no shared stories should produce *no* filter
        entry (nothing to include)."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            requester_share_mode="selective",
            target_share_mode="selective",
        )

        filters = await get_linked_legacy_filters(db_session, legacy_a.id)
        assert filters == []

    async def test_selective_with_shared_stories(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """A selective link with shared stories should include the correct
        story IDs in the filter."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        link = await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            target_share_mode="selective",
        )

        story1 = uuid4()
        story2 = uuid4()

        # legacy_b shares two stories with legacy_a
        share1 = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story1,
            shared_by=test_user_2.id,
        )
        share2 = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story2,
            shared_by=test_user_2.id,
        )
        db_session.add(share1)
        db_session.add(share2)
        await db_session.flush()

        # Query from legacy_a's perspective
        filters = await get_linked_legacy_filters(db_session, legacy_a.id)

        assert len(filters) == 1
        f = filters[0]
        assert f.legacy_id == legacy_b.id
        assert f.share_mode == "selective"
        assert set(f.story_ids) == {story1, story2}

    async def test_selective_media_shares_not_included(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """Media shares on a selective link must NOT appear in story_ids."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        link = await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            target_share_mode="selective",
        )

        # Only share a media resource (no story)
        media_share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="media",
            resource_id=uuid4(),
            shared_by=test_user_2.id,
        )
        db_session.add(media_share)
        await db_session.flush()

        # No story shares → no filter entry
        filters = await get_linked_legacy_filters(db_session, legacy_a.id)
        assert filters == []

    async def test_selective_only_counts_linked_legacy_shares(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """Shares originating from *our own* legacy must not be included in
        the filter (we only care about what the *linked* legacy shares with us)."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        link = await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            target_share_mode="selective",
        )

        # legacy_a shares a story *outward* to legacy_b
        # (source_legacy_id = legacy_a.id — this is NOT what we want to include
        # when querying from legacy_a's perspective)
        share_from_a = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_a.id,
            resource_type="story",
            resource_id=uuid4(),
            shared_by=test_user.id,
        )
        db_session.add(share_from_a)
        await db_session.flush()

        # legacy_b has NOT shared any stories back; filter list should be empty
        filters = await get_linked_legacy_filters(db_session, legacy_a.id)
        assert filters == []

    # ------------------------------------------------------------------
    # Multiple links
    # ------------------------------------------------------------------

    async def test_multiple_links_all_returned(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """A legacy linked to two others should yield two filter entries."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")
        legacy_c = await _make_legacy(db_session, test_user_2, "C")

        await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            target_share_mode="all",
        )
        await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_c,
            requester_user=test_user,
            target_user=test_user_2,
            target_share_mode="all",
        )

        filters = await get_linked_legacy_filters(db_session, legacy_a.id)

        assert len(filters) == 2
        linked_ids = {f.legacy_id for f in filters}
        assert linked_ids == {legacy_b.id, legacy_c.id}

    async def test_bidirectional_link_seen_from_both_sides(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ) -> None:
        """The same link should be visible when querying from either side,
        with each side seeing the other's share_mode."""
        legacy_a = await _make_legacy(db_session, test_user, "A")
        legacy_b = await _make_legacy(db_session, test_user_2, "B")

        await _activate_link(
            db_session,
            requester_legacy=legacy_a,
            target_legacy=legacy_b,
            requester_user=test_user,
            target_user=test_user_2,
            requester_share_mode="all",
            target_share_mode="selective",
        )

        # From legacy_a: we see target's (legacy_b's) share_mode → "selective"
        # No stories shared by legacy_b → empty
        filters_a = await get_linked_legacy_filters(db_session, legacy_a.id)
        assert filters_a == []  # selective with no shares → omitted

        # From legacy_b: we see requester's (legacy_a's) share_mode → "all"
        filters_b = await get_linked_legacy_filters(db_session, legacy_b.id)
        assert len(filters_b) == 1
        assert filters_b[0].legacy_id == legacy_a.id
        assert filters_b[0].share_mode == "all"
