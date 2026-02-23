"""Tests for shared stories from linked legacies."""

import pytest

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import StoryLegacy
from app.models.legacy import Legacy, LegacyMember
from app.models.legacy_link import LegacyLink, LegacyLinkShare
from app.models.person import Person
from app.models.story import Story
from app.models.user import User
from app.services.story import get_shared_story_ids, list_legacy_stories


async def _setup_linked_legacies(db: AsyncSession, user1: User, user2: User) -> tuple:
    """Create two linked legacies with the same person."""
    person = Person(canonical_name="Shared Person")
    db.add(person)
    await db.flush()

    legacy_a = Legacy(name="Legacy A", created_by=user1.id, person_id=person.id)
    legacy_b = Legacy(
        name="Legacy B",
        created_by=user2.id,
        person_id=person.id,
        visibility="public",
    )
    db.add_all([legacy_a, legacy_b])
    await db.flush()

    member_a = LegacyMember(legacy_id=legacy_a.id, user_id=user1.id, role="creator")
    member_b = LegacyMember(legacy_id=legacy_b.id, user_id=user2.id, role="creator")
    db.add_all([member_a, member_b])
    await db.flush()

    link = LegacyLink(
        person_id=person.id,
        requester_legacy_id=legacy_a.id,
        target_legacy_id=legacy_b.id,
        requested_by=user1.id,
        status="active",
    )
    db.add(link)
    await db.flush()

    return person, legacy_a, legacy_b, link


@pytest.mark.asyncio
class TestGetSharedStoryIds:
    async def test_selective_mode_returns_shared_stories(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        # Create a story in legacy_b
        story = Story(
            title="Shared Story",
            content="Story content.",
            author_id=test_user_2.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_b.id))
        await db_session.flush()

        # Share it selectively
        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story.id,
            shared_by=test_user_2.id,
        )
        db_session.add(share)
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy_a.id)
        assert story.id in story_ids
        assert story.id in source_map

    async def test_all_mode_returns_all_stories(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        # Set share mode to "all" for legacy_b (target side)
        link.target_share_mode = "all"
        await db_session.flush()

        # Create stories in legacy_b
        story1 = Story(
            title="Story 1",
            content="Content 1.",
            author_id=test_user_2.id,
            visibility="public",
        )
        story2 = Story(
            title="Story 2",
            content="Content 2.",
            author_id=test_user_2.id,
            visibility="public",
        )
        db_session.add_all([story1, story2])
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story1.id, legacy_id=legacy_b.id))
        db_session.add(StoryLegacy(story_id=story2.id, legacy_id=legacy_b.id))
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy_a.id)
        assert story1.id in story_ids
        assert story2.id in story_ids

    async def test_pending_link_returns_nothing(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(name="A", created_by=test_user.id, person_id=person.id)
        legacy_b = Legacy(name="B", created_by=test_user_2.id, person_id=person.id)
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            requested_by=test_user.id,
            status="pending",  # Not active!
        )
        db_session.add(link)
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy_a.id)
        assert len(story_ids) == 0

    async def test_revoked_link_returns_nothing(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        person = Person(canonical_name="Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(name="A", created_by=test_user.id, person_id=person.id)
        legacy_b = Legacy(name="B", created_by=test_user_2.id, person_id=person.id)
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        link = LegacyLink(
            person_id=person.id,
            requester_legacy_id=legacy_a.id,
            target_legacy_id=legacy_b.id,
            requested_by=test_user.id,
            status="revoked",
        )
        db_session.add(link)
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy_a.id)
        assert len(story_ids) == 0

    async def test_source_name_uses_legacy_name_for_public_legacy(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Public other-legacy should use its real name in the source map."""
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )
        # legacy_b is created with visibility="public" in _setup_linked_legacies

        story = Story(
            title="Public Shared",
            content="Content.",
            author_id=test_user_2.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_b.id))
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story.id,
            shared_by=test_user_2.id,
        )
        db_session.add(share)
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy_a.id)
        assert source_map[story.id] == "Legacy B"

    async def test_source_name_is_anonymous_for_private_legacy(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Private other-legacy should use 'another legacy' in the source map."""
        person = Person(canonical_name="Private Person")
        db_session.add(person)
        await db_session.flush()

        legacy_a = Legacy(name="Legacy A", created_by=test_user.id, person_id=person.id)
        # legacy_b is private (default)
        legacy_b = Legacy(
            name="Secret Legacy",
            created_by=test_user_2.id,
            person_id=person.id,
            visibility="private",
        )
        db_session.add_all([legacy_a, legacy_b])
        await db_session.flush()

        db_session.add(
            LegacyMember(legacy_id=legacy_a.id, user_id=test_user.id, role="creator")
        )
        db_session.add(
            LegacyMember(legacy_id=legacy_b.id, user_id=test_user_2.id, role="creator")
        )
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

        story = Story(
            title="Private Legacy Story",
            content="Content.",
            author_id=test_user_2.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_b.id))
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story.id,
            shared_by=test_user_2.id,
        )
        db_session.add(share)
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy_a.id)
        assert story.id in story_ids
        assert source_map[story.id] == "another legacy"

    async def test_no_links_returns_empty(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Legacy with no links should return empty sets."""
        person = Person(canonical_name="Isolated Person")
        db_session.add(person)
        await db_session.flush()

        legacy = Legacy(
            name="Isolated Legacy", created_by=test_user.id, person_id=person.id
        )
        db_session.add(legacy)
        await db_session.commit()

        story_ids, source_map = await get_shared_story_ids(db_session, legacy.id)
        assert len(story_ids) == 0
        assert len(source_map) == 0

    async def test_target_side_also_gets_shared_stories(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """The target legacy should also receive stories shared by the requester."""
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        # Share a story from legacy_a to legacy_b (requester shares to target)
        link.requester_share_mode = "selective"
        await db_session.flush()

        story = Story(
            title="Requester Story",
            content="Content.",
            author_id=test_user.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_a.id))
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_a.id,
            resource_type="story",
            resource_id=story.id,
            shared_by=test_user.id,
        )
        db_session.add(share)
        await db_session.commit()

        # legacy_b is the *target* — it should see legacy_a's shared story
        story_ids, source_map = await get_shared_story_ids(db_session, legacy_b.id)
        assert story.id in story_ids


@pytest.mark.asyncio
class TestListLegacyStoriesWithSharing:
    async def test_shared_stories_appear_in_list(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Shared public stories should appear when listing a legacy's stories."""
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        # Add test_user as member of legacy_a
        # (already done in _setup_linked_legacies via member_a)

        story = Story(
            title="Shared Story",
            content="Content.",
            author_id=test_user_2.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_b.id))
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story.id,
            shared_by=test_user_2.id,
        )
        db_session.add(share)
        await db_session.commit()

        results = await list_legacy_stories(
            db_session, test_user.id, legacy_id=legacy_a.id
        )

        story_ids = [r.id for r in results]
        assert story.id in story_ids

        shared = next(r for r in results if r.id == story.id)
        assert shared.shared_from is not None

    async def test_private_shared_stories_are_excluded(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Private stories shared via a link must NOT appear in the list."""
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        story = Story(
            title="Private Shared Story",
            content="Content.",
            author_id=test_user_2.id,
            visibility="private",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_b.id))
        await db_session.flush()

        share = LegacyLinkShare(
            legacy_link_id=link.id,
            source_legacy_id=legacy_b.id,
            resource_type="story",
            resource_id=story.id,
            shared_by=test_user_2.id,
        )
        db_session.add(share)
        await db_session.commit()

        results = await list_legacy_stories(
            db_session, test_user.id, legacy_id=legacy_a.id
        )
        story_ids = [r.id for r in results]
        assert story.id not in story_ids

    async def test_own_stories_not_duplicated(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Stories that already belong to the legacy should not appear twice."""
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        # Create a story directly in legacy_a
        story = Story(
            title="Own Story",
            content="Content.",
            author_id=test_user.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_a.id))
        await db_session.flush()

        # Also associate the same story with legacy_b so it shows up in "all" mode
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_b.id))
        await db_session.flush()

        link.target_share_mode = "all"
        await db_session.commit()

        results = await list_legacy_stories(
            db_session, test_user.id, legacy_id=legacy_a.id
        )
        ids = [r.id for r in results]
        assert ids.count(story.id) == 1

    async def test_own_stories_have_no_shared_from(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Own stories of the legacy should never carry a shared_from label."""
        person, legacy_a, legacy_b, link = await _setup_linked_legacies(
            db_session, test_user, test_user_2
        )

        story = Story(
            title="Direct Story",
            content="Content.",
            author_id=test_user.id,
            visibility="public",
        )
        db_session.add(story)
        await db_session.flush()
        db_session.add(StoryLegacy(story_id=story.id, legacy_id=legacy_a.id))
        await db_session.commit()

        results = await list_legacy_stories(
            db_session, test_user.id, legacy_id=legacy_a.id
        )
        own = next(r for r in results if r.id == story.id)
        assert own.shared_from is None
